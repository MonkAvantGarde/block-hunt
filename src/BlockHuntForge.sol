// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

// ─────────────────────────────────────────────────────────────────────────────
// NOTE: VRFConsumerBaseV2Plus inherits ConfirmedOwner, which provides
// onlyOwner and owner(). Do NOT also import Ownable — they conflict.
// ─────────────────────────────────────────────────────────────────────────────

interface IBlockHuntTokenForge {
    function executeForge(address player, uint256 fromTier, uint256 burnCount, bool success) external;
    function balanceOf(address account, uint256 id) external view returns (uint256);
}

contract BlockHuntForge is VRFConsumerBaseV2Plus, ReentrancyGuard {

    // ── State ─────────────────────────────────────────────────────────────────

    address public tokenContract;
    bool    public vrfEnabled;
    uint256 public forgeFee    = 0;
    uint256 public requestNonce;          // used only in pseudo-random (testnet) mode

    // ── VRF configuration ─────────────────────────────────────────────────────
    //
    // Base Sepolia VRF V2.5 coordinator: 0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE
    // Base Sepolia key hash (30 gwei lane): 0x9e9e46732b32662b9adc6f3abdf6c5e926a666d174a4d6b8e39c4cca76a38897
    //
    // Before enabling VRF on testnet:
    //   1. Create a VRF V2.5 subscription at vrf.chain.link
    //   2. Fund subscription with LINK
    //   3. Add this contract address as a consumer on the subscription
    //   4. Call setVrfConfig() with your subId and keyHash
    //   5. Call setVrfEnabled(true)

    uint256 public vrfSubscriptionId;
    bytes32 public vrfKeyHash;
    uint32  public vrfCallbackGasLimit    = 200_000;
    uint16  public vrfRequestConfirmations = 3;

    // ── Request storage ───────────────────────────────────────────────────────

    struct ForgeRequest {
        address player;
        uint256 fromTier;
        uint256 burnCount;
        bool    resolved;
    }

    // Pseudo-random path: keyed by requestNonce
    mapping(uint256 => ForgeRequest) public forgeRequests;

    // VRF path: keyed by Chainlink requestId (different namespace)
    mapping(uint256 => ForgeRequest) public vrfForgeRequests;

    // ── Events ────────────────────────────────────────────────────────────────

    event ForgeRequested(uint256 indexed requestId, address indexed player, uint256 fromTier, uint256 burnCount);
    event ForgeResolved(uint256 indexed requestId, address indexed player, uint256 fromTier, bool success);

    // ── Constructor ───────────────────────────────────────────────────────────

    // vrfCoordinator must be set at deploy time — pass the real coordinator on
    // testnet/mainnet, or a MockVRFCoordinator in tests.
    constructor(address vrfCoordinator) VRFConsumerBaseV2Plus(vrfCoordinator) {}

    // ── Owner configuration ───────────────────────────────────────────────────

    function setTokenContract(address addr) external onlyOwner {
        tokenContract = addr;
    }

    function setForgeFee(uint256 fee) external onlyOwner {
        forgeFee = fee;
    }

    function setVrfEnabled(bool enabled) external onlyOwner {
        vrfEnabled = enabled;
    }

    /// @notice Configure VRF parameters. Must be called before enabling VRF.
    /// @param subId     Your Chainlink VRF subscription ID
    /// @param keyHash   Gas lane key hash for the desired confirmation speed
    /// @param gasLimit  Callback gas limit — 200,000 is safe for this contract
    function setVrfConfig(
        uint256 subId,
        bytes32 keyHash,
        uint32  gasLimit
    ) external onlyOwner {
        vrfSubscriptionId    = subId;
        vrfKeyHash           = keyHash;
        vrfCallbackGasLimit  = gasLimit;
    }

    // ── Core forge function ───────────────────────────────────────────────────

    /// @notice Attempt to forge burnCount blocks of fromTier into one block of
    ///         (fromTier - 1). Success probability equals burnCount percent.
    ///         Blocks are burned immediately in all cases — the forge fee is the
    ///         cost of the attempt, win or lose.
    ///
    ///         VRF mode (vrfEnabled = true):
    ///           Transaction 1 — this call. Blocks burned. VRF request sent.
    ///                           ForgeRequested event emitted with Chainlink requestId.
    ///           Transaction 2 — Chainlink callback fires fulfillRandomWords().
    ///                           Result resolved. ForgeResolved event emitted.
    ///
    ///         Pseudo-random mode (vrfEnabled = false, testnet only):
    ///           Single transaction. Result resolved immediately.
    ///           Uses block.prevrandao — manipulable, NOT safe for mainnet.

    function forge(uint256 fromTier, uint256 burnCount) external payable nonReentrant {
        require(tokenContract != address(0), "Token contract not set");
        require(fromTier >= 2 && fromTier <= 7, "Invalid tier");
        require(burnCount >= 10 && burnCount <= 99, "Burn count must be 10-99");
        require(msg.value >= forgeFee, "Insufficient forge fee");
        require(
            IBlockHuntTokenForge(tokenContract).balanceOf(msg.sender, fromTier) >= burnCount,
            "Insufficient blocks"
        );

        if (vrfEnabled) {
            _forgeWithVRF(fromTier, burnCount);
        } else {
            _forgeWithPseudoRandom(fromTier, burnCount);
        }
    }

    // ── VRF path ──────────────────────────────────────────────────────────────

    function _forgeWithVRF(uint256 fromTier, uint256 burnCount) internal {
        require(vrfSubscriptionId != 0, "VRF subscription not configured");
        require(vrfKeyHash != bytes32(0), "VRF key hash not configured");

        uint256 requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash:             vrfKeyHash,
                subId:               vrfSubscriptionId,
                requestConfirmations: vrfRequestConfirmations,
                callbackGasLimit:    vrfCallbackGasLimit,
                numWords:            1,
                extraArgs:           VRFV2PlusClient._argsToBytes(
                                         VRFV2PlusClient.ExtraArgsV1({ nativePayment: false })
                                     )
            })
        );

        vrfForgeRequests[requestId] = ForgeRequest({
            player:    msg.sender,
            fromTier:  fromTier,
            burnCount: burnCount,
            resolved:  false
        });

        emit ForgeRequested(requestId, msg.sender, fromTier, burnCount);
    }

    /// @dev Called by the Chainlink VRF coordinator (via rawFulfillRandomWords).
    ///      Resolves the pending forge request for requestId.
    function fulfillRandomWords(
        uint256 requestId,
        uint256[] calldata randomWords
    ) internal override {
        ForgeRequest storage request = vrfForgeRequests[requestId];

        require(request.player != address(0), "Unknown request");
        require(!request.resolved,            "Already resolved");

        request.resolved = true;

        // burnCount is the success percentage: burn 75 = 75% chance.
        // A random number 0–99 that is strictly less than burnCount = success.
        bool success = (randomWords[0] % 100) < request.burnCount;

        IBlockHuntTokenForge(tokenContract).executeForge(
            request.player,
            request.fromTier,
            request.burnCount,
            success
        );

        emit ForgeResolved(requestId, request.player, request.fromTier, success);
    }

    // ── Pseudo-random path (testnet / vrfEnabled = false) ─────────────────────

    function _forgeWithPseudoRandom(uint256 fromTier, uint256 burnCount) internal {
        requestNonce++;

        forgeRequests[requestNonce] = ForgeRequest({
            player:    msg.sender,
            fromTier:  fromTier,
            burnCount: burnCount,
            resolved:  false
        });

        bool success = _pseudoRandom(msg.sender, fromTier, burnCount, requestNonce) < burnCount;
        forgeRequests[requestNonce].resolved = true;

        IBlockHuntTokenForge(tokenContract).executeForge(
            msg.sender,
            fromTier,
            burnCount,
            success
        );

        emit ForgeRequested(requestNonce, msg.sender, fromTier, burnCount);
        emit ForgeResolved(requestNonce, msg.sender, fromTier, success);
    }

    /// @dev NOT safe for mainnet. Used only when vrfEnabled = false.
    function _pseudoRandom(
        address player,
        uint256 fromTier,
        uint256 burnCount,
        uint256 nonce
    ) internal view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(
            block.prevrandao,
            block.timestamp,
            player,
            fromTier,
            burnCount,
            nonce
        ))) % 100;
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function withdrawFees(address to) external onlyOwner {
        (bool sent, ) = payable(to).call{value: address(this).balance}("");
        require(sent, "Transfer failed");
    }

    receive() external payable {}
}
