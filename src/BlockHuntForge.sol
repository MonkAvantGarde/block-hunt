// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

// ─────────────────────────────────────────────────────────────────────────────
// NOTE: VRFConsumerBaseV2Plus inherits ConfirmedOwner, which provides
// onlyOwner and owner(). Do NOT also import Ownable — they conflict.
// ─────────────────────────────────────────────────────────────────────────────

error InvalidTierForForge();

interface IBlockHuntTokenForge {
    function burnForForge(address player, uint256 fromTier, uint256 burnCount) external;
    function resolveForge(address player, uint256 fromTier, bool success) external;
    function forgeRefund(address to, uint256 tier, uint256 amount) external;
    function balanceOf(address account, uint256 id) external view returns (uint256);
}

interface IBlockHuntCountdownForge {
    function setPendingForgeBurns(address player, uint8 tier, uint256 burnCount) external;
    function clearPendingForgeBurns(address player, uint8 tier, uint256 burnCount) external;
}

contract BlockHuntForge is VRFConsumerBaseV2Plus, ReentrancyGuard {

    // ── State ─────────────────────────────────────────────────────────────────

    address public tokenContract;
    address public countdownContract;
    bool    public vrfEnabled;
    uint256 public forgeFee    = 0;       // per attempt (scales with batch size)
    uint256 public requestNonce;          // pseudo-random mode only
    uint256 public forgeRequestTTL = 10 minutes;

    // ── VRF configuration ─────────────────────────────────────────────────────
    //
    // Callback gas scales with attempt count (same pattern as Token mint VRF):
    //   totalGas = vrfCallbackBaseGas + (attemptCount × VRF_GAS_PER_ATTEMPT)
    //
    // Per-attempt gas budget covers: keccak derivation, ratio lookup, success
    // check, external call to token.resolveForge() (which does a conditional
    // mint, supply update, event, and countdown check on success).
    //
    // vrfCallbackBaseGas: overhead for storage reads, event, request cleanup.
    // VRF_GAS_PER_ATTEMPT: per-attempt budget. resolveForge on success costs
    //   ~55k (mint + supply + event + countdown check). On failure ~25k (event only).
    //   65k gives comfortable headroom for worst case (all succeed + countdown).
    // VRF_GAS_MAX: Chainlink coordinator maximum on Base.

    uint256 public vrfSubscriptionId;
    bytes32 public vrfKeyHash;
    uint32  public vrfCallbackBaseGas      = 100_000;
    uint32  public constant VRF_GAS_PER_ATTEMPT = 65_000;
    uint32  public constant VRF_GAS_MAX         = 2_500_000;
    uint16  public vrfRequestConfirmations = 3;

    // ── Request storage ───────────────────────────────────────────────────────
    //
    // Single forge uses ForgeRequest (backward compatible with existing tests).
    // Batch forge uses BatchForgeRequest + per-attempt storage.
    //
    // Both VRF and pseudo-random paths support batching.

    struct ForgeRequest {
        address player;      // 20 bytes
        uint8   fromTier;    // 1
        uint16  burnCount;   // 2
        bool    resolved;    // 1
        bool    success;     // 1
        // 25 bytes — fits in 1 slot
        uint40  requestedAt; // 5 bytes — slot 2 (for cancel TTL)
    }

    // [NEW] Batch forge request — one VRF word resolves N attempts
    struct BatchForgeRequest {
        address player;
        uint256 attemptCount;
        bool    resolved;
    }

    // [NEW] Individual attempt within a batch — stored separately for gas efficiency
    struct ForgeAttempt {
        uint8  fromTier;
        uint16 burnCount;
    }

    // Single-forge storage (pseudo-random path, backward compat)
    mapping(uint256 => ForgeRequest) public forgeRequests;

    // Single-forge VRF storage
    mapping(uint256 => ForgeRequest) public vrfForgeRequests;

    // [NEW] Batch-forge VRF storage
    mapping(uint256 => BatchForgeRequest) public vrfBatchRequests;
    // requestId → attemptIndex → attempt details
    mapping(uint256 => mapping(uint256 => ForgeAttempt)) public batchAttempts;

    // [NEW] Batch-forge pseudo-random storage
    mapping(uint256 => BatchForgeRequest) public batchRequests;

    // ── Events ────────────────────────────────────────────────────────────────

    event ForgeRequested(uint256 indexed requestId, address indexed player, uint256 fromTier, uint256 burnCount);
    event ForgeResolved(uint256 indexed requestId, address indexed player, uint256 fromTier, bool success);
    // [NEW] Batch events
    event BatchForgeRequested(uint256 indexed requestId, address indexed player, uint256 attemptCount);
    event BatchForgeResolved(uint256 indexed requestId, address indexed player, uint256 successes, uint256 failures);
    event ForgeCancelled(uint256 indexed requestId, address indexed player);

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address vrfCoordinator) VRFConsumerBaseV2Plus(vrfCoordinator) {}

    // ── Owner configuration ───────────────────────────────────────────────────

    function setTokenContract(address addr) external onlyOwner {
        tokenContract = addr;
    }

    function setCountdownContract(address addr) external onlyOwner {
        countdownContract = addr;
    }

    function setForgeRequestTTL(uint256 _ttl) external onlyOwner {
        require(_ttl >= 5 minutes && _ttl <= 1 hours, "TTL out of range");
        forgeRequestTTL = _ttl;
    }

    function setForgeFee(uint256 fee) external onlyOwner {
        forgeFee = fee;
    }

    function setVrfEnabled(bool enabled) external onlyOwner {
        vrfEnabled = enabled;
    }

    function setVrfConfig(
        uint256 subId,
        bytes32 keyHash,
        uint32  baseGas
    ) external onlyOwner {
        vrfSubscriptionId    = subId;
        vrfKeyHash           = keyHash;
        vrfCallbackBaseGas   = baseGas;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SINGLE FORGE — one attempt, one VRF word
    // Kept for backward compatibility and simple UX.
    // ═════════════════════════════════════════════════════════════════════════

    function forge(uint256 fromTier, uint256 burnCount) external payable nonReentrant {
        require(tokenContract != address(0), "Token contract not set");
        require(fromTier >= 3 && fromTier <= 7, "Invalid tier");
        uint256 ratio = _combineRatioForTier(fromTier);
        require(burnCount >= 1 && burnCount <= ratio, "Burn count out of range");
        require(msg.value >= forgeFee, "Insufficient forge fee");
        require(
            IBlockHuntTokenForge(tokenContract).balanceOf(msg.sender, fromTier) >= burnCount,
            "Insufficient blocks"
        );

        // Burn immediately — prevents VRF callback failure if player transfers
        IBlockHuntTokenForge(tokenContract).burnForForge(msg.sender, fromTier, burnCount);

        if (vrfEnabled) {
            _singleForgeVRF(fromTier, burnCount);
        } else {
            _singleForgePseudoRandom(fromTier, burnCount);
        }
    }

    function _singleForgeVRF(uint256 fromTier, uint256 burnCount) internal {
        require(vrfSubscriptionId != 0, "VRF subscription not configured");
        require(vrfKeyHash != bytes32(0), "VRF key hash not configured");

        uint256 requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash:             vrfKeyHash,
                subId:               vrfSubscriptionId,
                requestConfirmations: vrfRequestConfirmations,
                callbackGasLimit:    _gasLimitForAttempts(1),
                numWords:            1,
                extraArgs:           VRFV2PlusClient._argsToBytes(
                                         VRFV2PlusClient.ExtraArgsV1({ nativePayment: false })
                                     )
            })
        );

        vrfForgeRequests[requestId] = ForgeRequest({
            player:      msg.sender,
            fromTier:    uint8(fromTier),
            burnCount:   uint16(burnCount),
            resolved:    false,
            success:     false,
            requestedAt: uint40(block.timestamp)
        });

        if (countdownContract != address(0)) {
            IBlockHuntCountdownForge(countdownContract).setPendingForgeBurns(
                msg.sender, uint8(fromTier), burnCount
            );
        }

        emit ForgeRequested(requestId, msg.sender, fromTier, burnCount);
    }

    function _singleForgePseudoRandom(uint256 fromTier, uint256 burnCount) internal {
        requestNonce++;

        forgeRequests[requestNonce] = ForgeRequest({
            player:      msg.sender,
            fromTier:    uint8(fromTier),
            burnCount:   uint16(burnCount),
            resolved:    false,
            success:     false,
            requestedAt: uint40(block.timestamp)
        });

        uint256 ratio = _combineRatioForTier(fromTier);
        uint256 successChance = (burnCount * 10_000) / ratio;
        bool success = _pseudoRandom(msg.sender, fromTier, burnCount, requestNonce) < successChance;

        IBlockHuntTokenForge(tokenContract).resolveForge(msg.sender, fromTier, success);

        emit ForgeRequested(requestNonce, msg.sender, fromTier, burnCount);
        emit ForgeResolved(requestNonce, msg.sender, fromTier, success);

        delete forgeRequests[requestNonce];
    }

    // ═════════════════════════════════════════════════════════════════════════
    // BATCH FORGE — N attempts, one VRF word, per-attempt derivation
    //
    // Same optimisation pattern as the Token mint VRF path:
    //   - One VRF request (1 random word) regardless of attempt count
    //   - Per-attempt randomness: keccak256(seed, attemptIndex)
    //   - Gas limit scales with attempt count
    //   - All blocks burned upfront (cannot fail on callback)
    //
    // Use case: player has 200 T7 blocks and wants to try 10 forges at once
    // (burning 10 blocks each = 50% chance per attempt).
    //
    // Frontend: builds an array of (fromTier, burnCount) pairs and submits
    // in one transaction. Much cheaper in LINK (1 request vs 10) and much
    // faster (1 callback resolves all attempts).
    //
    // Cap: 20 attempts per batch. At 65k gas per attempt + 100k base,
    // that's 1.4M gas — well within the 2.5M Chainlink max.
    // ═════════════════════════════════════════════════════════════════════════

    function forgeBatch(
        uint256[] calldata fromTiers,
        uint256[] calldata burnCounts
    ) external payable nonReentrant {
        require(tokenContract != address(0), "Token contract not set");
        uint256 count = fromTiers.length;
        require(count == burnCounts.length, "Array length mismatch");
        require(count >= 1 && count <= 20, "1-20 attempts per batch");
        require(msg.value >= forgeFee * count, "Insufficient forge fee");

        // Validate all attempts and burn all blocks upfront
        for (uint256 i = 0; i < count; i++) {
            uint256 fromTier  = fromTiers[i];
            uint256 burnCount = burnCounts[i];

            require(fromTier >= 3 && fromTier <= 7, "Invalid tier");
            uint256 ratio = _combineRatioForTier(fromTier);
            require(burnCount >= 1 && burnCount <= ratio, "Burn count out of range");
            require(
                IBlockHuntTokenForge(tokenContract).balanceOf(msg.sender, fromTier) >= burnCount,
                "Insufficient blocks"
            );

            // Burn immediately — committed regardless of VRF outcome
            IBlockHuntTokenForge(tokenContract).burnForForge(msg.sender, fromTier, burnCount);
        }

        if (vrfEnabled) {
            _batchForgeVRF(fromTiers, burnCounts, count);
        } else {
            _batchForgePseudoRandom(fromTiers, burnCounts, count);
        }
    }

    function _batchForgeVRF(
        uint256[] calldata fromTiers,
        uint256[] calldata burnCounts,
        uint256 count
    ) internal {
        require(vrfSubscriptionId != 0, "VRF subscription not configured");
        require(vrfKeyHash != bytes32(0), "VRF key hash not configured");

        uint256 requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash:             vrfKeyHash,
                subId:               vrfSubscriptionId,
                requestConfirmations: vrfRequestConfirmations,
                callbackGasLimit:    _gasLimitForAttempts(count),
                numWords:            1,
                extraArgs:           VRFV2PlusClient._argsToBytes(
                                         VRFV2PlusClient.ExtraArgsV1({ nativePayment: false })
                                     )
            })
        );

        // Store batch header
        vrfBatchRequests[requestId] = BatchForgeRequest({
            player:       msg.sender,
            attemptCount: count,
            resolved:     false
        });

        // Store individual attempts + notify countdown
        for (uint256 i = 0; i < count; i++) {
            batchAttempts[requestId][i] = ForgeAttempt({
                fromTier:  uint8(fromTiers[i]),
                burnCount: uint16(burnCounts[i])
            });
            if (countdownContract != address(0)) {
                IBlockHuntCountdownForge(countdownContract).setPendingForgeBurns(
                    msg.sender, uint8(fromTiers[i]), burnCounts[i]
                );
            }
        }

        emit BatchForgeRequested(requestId, msg.sender, count);
    }

    function _batchForgePseudoRandom(
        uint256[] calldata fromTiers,
        uint256[] calldata burnCounts,
        uint256 count
    ) internal {
        requestNonce++;
        uint256 nonce = requestNonce;

        batchRequests[nonce] = BatchForgeRequest({
            player:       msg.sender,
            attemptCount: count,
            resolved:     false
        });

        uint256 successes;
        for (uint256 i = 0; i < count; i++) {
            uint256 fromTier  = fromTiers[i];
            uint256 burnCount = burnCounts[i];

            batchAttempts[nonce][i] = ForgeAttempt({
                fromTier:  uint8(fromTier),
                burnCount: uint16(burnCount)
            });

            uint256 ratio = _combineRatioForTier(fromTier);
            uint256 successChance = (burnCount * 10_000) / ratio;
            uint256 rand = uint256(keccak256(abi.encodePacked(
                block.prevrandao, block.timestamp, msg.sender, nonce, i
            ))) % 10_000;
            bool success = rand < successChance;

            IBlockHuntTokenForge(tokenContract).resolveForge(msg.sender, fromTier, success);
            emit ForgeResolved(nonce, msg.sender, fromTier, success);

            if (success) successes++;
        }

        emit BatchForgeRequested(nonce, msg.sender, count);
        emit BatchForgeResolved(nonce, msg.sender, successes, count - successes);

        // Cleanup batch storage
        for (uint256 i = 0; i < count; i++) {
            delete batchAttempts[nonce][i];
        }
        delete batchRequests[nonce];
    }

    // ═════════════════════════════════════════════════════════════════════════
    // CANCEL — refund after TTL expires (VRF never came back)
    // ═════════════════════════════════════════════════════════════════════════

    function cancelForgeRequest(uint256 requestId) external nonReentrant {
        ForgeRequest storage r = vrfForgeRequests[requestId];
        require(r.player == msg.sender, "Not requester");
        require(!r.resolved, "Already resolved");
        require(block.timestamp >= uint256(r.requestedAt) + forgeRequestTTL, "TTL not reached");

        IBlockHuntTokenForge(tokenContract).forgeRefund(msg.sender, r.fromTier, r.burnCount);

        if (countdownContract != address(0)) {
            IBlockHuntCountdownForge(countdownContract).clearPendingForgeBurns(
                msg.sender, r.fromTier, r.burnCount
            );
        }

        emit ForgeCancelled(requestId, msg.sender);
        delete vrfForgeRequests[requestId];
    }

    // ═════════════════════════════════════════════════════════════════════════
    // VRF CALLBACK — handles both single and batch forge requests
    // ═════════════════════════════════════════════════════════════════════════

    function fulfillRandomWords(
        uint256 requestId,
        uint256[] calldata randomWords
    ) internal override {

        // ── Try single-forge request first ──────────────────────────────────
        ForgeRequest storage singleReq = vrfForgeRequests[requestId];
        if (singleReq.player != address(0)) {
            require(!singleReq.resolved, "Already resolved");

            address player = singleReq.player;
            uint8 fromTier = singleReq.fromTier;
            uint16 burnCount = singleReq.burnCount;

            uint256 ratio = _combineRatioForTier(fromTier);
            uint256 successChance = (uint256(burnCount) * 10_000) / ratio;
            bool success = (randomWords[0] % 10_000) < successChance;

            IBlockHuntTokenForge(tokenContract).resolveForge(player, fromTier, success);

            if (countdownContract != address(0)) {
                IBlockHuntCountdownForge(countdownContract).clearPendingForgeBurns(
                    player, fromTier, burnCount
                );
            }

            emit ForgeResolved(requestId, player, fromTier, success);
            delete vrfForgeRequests[requestId];
            return;
        }

        // ── Try batch-forge request ─────────────────────────────────────────
        BatchForgeRequest storage batchReq = vrfBatchRequests[requestId];
        require(batchReq.player != address(0), "Unknown request");
        require(!batchReq.resolved,             "Already resolved");

        address batchPlayer = batchReq.player;
        uint256 seed = randomWords[0];
        uint256 count = batchReq.attemptCount;
        uint256 successes;

        for (uint256 i = 0; i < count; i++) {
            ForgeAttempt memory attempt = batchAttempts[requestId][i];

            uint256 derived = uint256(keccak256(abi.encodePacked(seed, i)));
            uint256 ratio = _combineRatioForTier(attempt.fromTier);
            uint256 successChance = (uint256(attempt.burnCount) * 10_000) / ratio;
            bool success = (derived % 10_000) < successChance;

            IBlockHuntTokenForge(tokenContract).resolveForge(batchPlayer, attempt.fromTier, success);

            if (countdownContract != address(0)) {
                IBlockHuntCountdownForge(countdownContract).clearPendingForgeBurns(
                    batchPlayer, attempt.fromTier, attempt.burnCount
                );
            }

            emit ForgeResolved(requestId, batchPlayer, attempt.fromTier, success);

            if (success) successes++;
        }

        emit BatchForgeResolved(requestId, batchPlayer, successes, count - successes);

        // Cleanup storage
        for (uint256 i = 0; i < count; i++) {
            delete batchAttempts[requestId][i];
        }
        delete vrfBatchRequests[requestId];
    }

    // ── Gas limit scaling ─────────────────────────────────────────────────────
    //
    // Same pattern as Token._gasLimitForQuantity():
    //   total = base overhead + (attempts × per-attempt budget), capped at chain max.
    //
    // Examples (base = 100,000, per-attempt = 65,000):
    //   1  attempt  →  165,000
    //   5  attempts →  425,000
    //   10 attempts →  750,000
    //   20 attempts → 1,400,000

    function _gasLimitForAttempts(uint256 attempts) internal view returns (uint32) {
        uint256 computed = uint256(vrfCallbackBaseGas) + attempts * uint256(VRF_GAS_PER_ATTEMPT);
        return computed > uint256(VRF_GAS_MAX) ? VRF_GAS_MAX : uint32(computed);
    }

    // ── Probability helpers ───────────────────────────────────────────────────

    function _combineRatioForTier(uint256 fromTier) internal pure returns (uint256) {
        if (fromTier == 7) return 21;
        if (fromTier == 6) return 19;
        if (fromTier == 5) return 17;
        if (fromTier == 4) return 15;
        if (fromTier == 3) return 13;
        revert InvalidTierForForge();
    }

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
        ))) % 10_000;
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function withdrawFees(address to) external onlyOwner {
        (bool sent, ) = payable(to).call{value: address(this).balance}("");
        require(sent, "Transfer failed");
    }

    receive() external payable {}
}
