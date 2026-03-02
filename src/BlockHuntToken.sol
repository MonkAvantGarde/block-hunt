// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

// ─────────────────────────────────────────────────────────────────────────────
// NOTE ON INHERITANCE:
//
// VRFConsumerBaseV2Plus extends ConfirmedOwner, which provides onlyOwner.
// We therefore do NOT import Ownable separately — doing so would cause a
// conflict. All onlyOwner modifiers work exactly as before, sourced from
// ConfirmedOwner inside the VRF base contract.
// ─────────────────────────────────────────────────────────────────────────────

interface IBlockHuntTreasury {
    function receiveMintFunds() external payable;
    function claimPayout(address winner) external;
    function sacrificePayout(address winner) external;
}

interface IBlockHuntMint {
    function isWindowOpen() external view returns (bool);
    function recordMint(address minter, uint256 quantity) external;
}

interface IBlockHuntCountdown {
    function startCountdown(address holder) external;
    function syncReset() external;
}

contract BlockHuntToken is ERC1155, ERC2981, VRFConsumerBaseV2Plus, ReentrancyGuard, Pausable {

    uint256 public constant TIER_ORIGIN   = 1;
    uint256 public constant TIER_WILLFUL  = 2;
    uint256 public constant TIER_CHAOTIC  = 3;
    uint256 public constant TIER_ORDERED  = 4;
    uint256 public constant TIER_REMEMBER = 5;
    uint256 public constant TIER_RESTLESS = 6;
    uint256 public constant TIER_INERT    = 7;

    uint256 public constant MINT_PRICE         = 0.00025 ether;
    uint256 public constant DAILY_CAP          = 50_000;
    uint256 public constant COUNTDOWN_DURATION = 7 days;
    uint256 public constant MINT_REQUEST_TTL   = 1 hours;

    mapping(uint256 => uint256) public combineRatio;

    address public mintWindowContract;
    address public treasuryContract;
    address public forgeContract;
    address public countdownContract;

    uint256 public currentWindowDay;
    uint256 public windowDayMinted;
    uint256[8] public tierTotalSupply;

    bool    public countdownActive;
    address public countdownHolder;
    uint256 public countdownStartTime;

    // ── VRF config ────────────────────────────────────────────────────────────
    bool    public vrfEnabled;
    uint256 public vrfSubscriptionId;
    bytes32 public vrfKeyHash;
    uint32  public vrfCallbackGasLimit;

    // ── Mint VRF pending state ────────────────────────────────────────────────

    struct MintRequest {
        address player;       // who is minting
        uint256 quantity;     // how many blocks were allocated (cap-adjusted)
        uint256 amountPaid;   // ETH held by this contract pending delivery
        uint256 requestedAt;  // timestamp of the request — used for timeout
        uint256 windowDay;    // daily window at request time (for cap accounting)
    }

    // requestId (Chainlink) → MintRequest
    mapping(uint256 => MintRequest) public vrfMintRequests;

    // player → list of their pending requestIds (so they can find requests to cancel)
    mapping(address => uint256[]) public pendingRequestsByPlayer;

    // ── Pseudo-random nonce (vrfEnabled = false path only) ────────────────────
    uint256 private _nonce;

    // ── Events ────────────────────────────────────────────────────────────────
    event BlockMinted(address indexed to, uint256 quantity);
    event BlocksCombined(address indexed by, uint256 indexed fromTier, uint256 indexed toTier);
    event BlocksForged(address indexed by, uint256 indexed fromTier, bool success);
    event CountdownTriggered(address indexed holder);
    event OriginClaimed(address indexed holder);
    event OriginSacrificed(address indexed holder);
    event DefaultSacrificeExecuted(address indexed holder, address indexed executor);

    // VRF mint lifecycle events — used by frontend to drive player-facing state
    event MintRequested(address indexed player, uint256 indexed requestId, uint256 quantity);
    event MintFulfilled(address indexed player, uint256 indexed requestId, uint256 quantity);
    event MintCancelled(address indexed player, uint256 indexed requestId, uint256 refundAmount);

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(
        string memory uri_,
        address royaltyReceiver_,
        uint96  royaltyFee_,
        address vrfCoordinator_
    )
        ERC1155(uri_)
        VRFConsumerBaseV2Plus(vrfCoordinator_)
    {
        _setDefaultRoyalty(royaltyReceiver_, royaltyFee_);
        combineRatio[7] = 20;
        combineRatio[6] = 20;
        combineRatio[5] = 30;
        combineRatio[4] = 30;
        combineRatio[3] = 50;
        combineRatio[2] = 100;
    }

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyMintWindow() {
        require(msg.sender == mintWindowContract, "Only mint window contract");
        _;
    }

    modifier onlyForge() {
        require(msg.sender == forgeContract, "Only forge contract");
        _;
    }

    modifier notCountdown() {
        require(!countdownActive, "Countdown is active");
        _;
    }

    // ── Admin setters ─────────────────────────────────────────────────────────

    function setMintWindowContract(address addr) external onlyOwner { mintWindowContract = addr; }
    function setTreasuryContract(address addr)   external onlyOwner { treasuryContract   = addr; }
    function setForgeContract(address addr)      external onlyOwner { forgeContract       = addr; }
    function setCountdownContract(address addr)  external onlyOwner { countdownContract   = addr; }
    function setURI(string memory newuri)        external onlyOwner { _setURI(newuri); }
    function setRoyalty(address receiver, uint96 fee) external onlyOwner { _setDefaultRoyalty(receiver, fee); }
    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /**
     * @notice Configure VRF parameters. Must be called before enabling VRF.
     * @param subId          Chainlink VRF V2.5 subscription ID
     * @param keyHash        Key hash for the gas lane (e.g. 30 gwei lane on Base Sepolia)
     * @param callbackGasLimit Gas limit for fulfillRandomWords callback
     */
    function setVrfConfig(
        uint256 subId,
        bytes32 keyHash,
        uint32  callbackGasLimit
    ) external onlyOwner {
        vrfSubscriptionId    = subId;
        vrfKeyHash           = keyHash;
        vrfCallbackGasLimit  = callbackGasLimit;
    }

    /**
     * @notice Enable or disable VRF for minting.
     *         When false (default): synchronous pseudo-random path.
     *         When true:            async Chainlink VRF path.
     */
    function setVrfEnabled(bool enabled) external onlyOwner {
        vrfEnabled = enabled;
    }

    // ── Contract must accept ETH (holds pending mint payments) ────────────────
    receive() external payable {}

    // ── CORE GAME ACTIONS ─────────────────────────────────────────────────────

    /**
     * @notice Mint blocks. Behaviour depends on vrfEnabled.
     *
     * VRF path (vrfEnabled = true):
     *   - Validates inputs and cap space.
     *   - Reserves cap space immediately (prevents cap overrun from simultaneous requests).
     *   - ETH is held by this contract until the VRF callback delivers blocks.
     *   - Emits MintRequested. Blocks are NOT minted yet.
     *   - If VRF does not respond within MINT_REQUEST_TTL (1 hour), player can call
     *     cancelMintRequest() to reclaim ETH and release reserved cap space.
     *
     * Pseudo-random path (vrfEnabled = false, default):
     *   - Identical to pre-VRF behaviour. Resolves in a single transaction.
     */
    function mint(uint256 quantity) external payable nonReentrant whenNotPaused notCountdown {
        require(mintWindowContract != address(0), "Mint not configured");
        require(IBlockHuntMint(mintWindowContract).isWindowOpen(), "Window closed");
        require(quantity > 0 && quantity <= 500, "Invalid quantity");
        require(msg.value >= MINT_PRICE * quantity, "Insufficient payment");

        uint256 dayRemaining = DAILY_CAP - windowDayMinted;
        require(dayRemaining > 0, "Daily cap reached");
        uint256 allocated = quantity > dayRemaining ? dayRemaining : quantity;

        uint256 totalCost = MINT_PRICE * allocated;

        // Refund excess payment immediately regardless of VRF path
        if (msg.value > totalCost) {
            (bool refunded, ) = payable(msg.sender).call{value: msg.value - totalCost}("");
            require(refunded, "Refund failed");
        }

        // Reserve cap space at request time (both paths)
        windowDayMinted += allocated;

        if (vrfEnabled) {
            _mintVRF(allocated, totalCost);
        } else {
            _mintPseudoRandom(allocated, totalCost);
        }
    }

    // ── VRF MINT PATH ─────────────────────────────────────────────────────────

    /**
     * @dev Sends VRF request and stores pending MintRequest.
     *      ETH is held by this contract until fulfillRandomWords() fires.
     */
    function _mintVRF(uint256 allocated, uint256 totalCost) internal {
        uint256 requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash:             vrfKeyHash,
                subId:               vrfSubscriptionId,
                requestConfirmations: 3,
                callbackGasLimit:    vrfCallbackGasLimit,
                numWords:            1,
                extraArgs:           VRFV2PlusClient._argsToBytes(
                                         VRFV2PlusClient.ExtraArgsV1({ nativePayment: false })
                                     )
            })
        );

        vrfMintRequests[requestId] = MintRequest({
            player:      msg.sender,
            quantity:    allocated,
            amountPaid:  totalCost,
            requestedAt: block.timestamp,
            windowDay:   currentWindowDay
        });

        pendingRequestsByPlayer[msg.sender].push(requestId);

        emit MintRequested(msg.sender, requestId, allocated);
    }

    /**
     * @dev Chainlink VRF callback. Resolves the pending mint.
     *      Derives one tier result per block from a single random word using
     *      keccak256(randomWord, index) — safe because the seed is VRF-secured.
     */
    function fulfillRandomWords(
        uint256 requestId,
        uint256[] calldata randomWords
    ) internal override {
        MintRequest memory req = vrfMintRequests[requestId];

        // Guard: if request was cancelled before callback arrived, do nothing
        if (req.player == address(0)) return;

        delete vrfMintRequests[requestId];
        _removePendingRequest(req.player, requestId);

        uint256 allocated = req.quantity;
        uint256 seed      = randomWords[0];

        uint256[] memory ids     = new uint256[](allocated);
        uint256[] memory amounts = new uint256[](allocated);

        for (uint256 i = 0; i < allocated; i++) {
            uint256 derived = uint256(keccak256(abi.encodePacked(seed, i)));
            uint256 tier    = _tierFromRandom(derived);
            ids[i]          = tier;
            amounts[i]      = 1;
            tierTotalSupply[tier]++;
        }

        // Forward ETH to treasury now that blocks are being delivered
        IBlockHuntTreasury(treasuryContract).receiveMintFunds{value: req.amountPaid}();

        _mintBatch(req.player, ids, amounts, "");
        IBlockHuntMint(mintWindowContract).recordMint(req.player, allocated);

        emit BlockMinted(req.player, allocated);
        emit MintFulfilled(req.player, requestId, allocated);

        _checkCountdownTrigger(req.player);
    }

    /**
     * @notice Cancel a pending mint request after the 1-hour timeout has elapsed.
     *         Refunds ETH in full. Releases reserved daily cap space.
     *         Only callable by the player who made the request.
     * @param requestId The VRF requestId to cancel (visible in MintRequested event)
     */
    function cancelMintRequest(uint256 requestId) external nonReentrant {
        MintRequest memory req = vrfMintRequests[requestId];

        require(req.player != address(0),               "Request not found");
        require(req.player == msg.sender,               "Not your request");
        require(
            block.timestamp >= req.requestedAt + MINT_REQUEST_TTL,
            "Too early to cancel: request is within the 1 hour window"
        );

        delete vrfMintRequests[requestId];
        _removePendingRequest(msg.sender, requestId);

        // Release cap space that was reserved at request time
        windowDayMinted -= req.quantity;

        // Refund ETH
        (bool sent, ) = payable(msg.sender).call{value: req.amountPaid}("");
        require(sent, "Refund failed");

        emit MintCancelled(msg.sender, requestId, req.amountPaid);
    }

    /**
     * @notice Returns all pending VRF requestIds for a given player.
     *         Used by the frontend to display pending mint state.
     */
    function getPendingRequests(address player) external view returns (uint256[] memory) {
        return pendingRequestsByPlayer[player];
    }

    // ── PSEUDO-RANDOM MINT PATH (vrfEnabled = false) ──────────────────────────

    function _mintPseudoRandom(uint256 allocated, uint256 totalCost) internal {
        IBlockHuntTreasury(treasuryContract).receiveMintFunds{value: totalCost}();

        uint256[] memory ids     = new uint256[](allocated);
        uint256[] memory amounts = new uint256[](allocated);

        for (uint256 i = 0; i < allocated; i++) {
            uint256 tier = _rollTier(i);
            ids[i]       = tier;
            amounts[i]   = 1;
            tierTotalSupply[tier]++;
        }

        _mintBatch(msg.sender, ids, amounts, "");
        IBlockHuntMint(mintWindowContract).recordMint(msg.sender, allocated);
        emit BlockMinted(msg.sender, allocated);
        _checkCountdownTrigger(msg.sender);
    }

    // ── COMBINE ───────────────────────────────────────────────────────────────

    function combine(uint256 fromTier) external nonReentrant whenNotPaused {
        require(fromTier >= 2 && fromTier <= 7, "Invalid tier");
        uint256 ratio = combineRatio[fromTier];
        require(balanceOf(msg.sender, fromTier) >= ratio, "Insufficient blocks");

        uint256 toTier = fromTier - 1;
        _burn(msg.sender, fromTier, ratio);
        tierTotalSupply[fromTier] -= ratio;
        _mint(msg.sender, toTier, 1, "");
        tierTotalSupply[toTier]++;

        emit BlocksCombined(msg.sender, fromTier, toTier);
        _checkCountdownTrigger(msg.sender);
    }

    function combineMany(uint256[] calldata fromTiers) external nonReentrant whenNotPaused {
        for (uint256 i = 0; i < fromTiers.length; i++) {
            uint256 fromTier = fromTiers[i];
            require(fromTier >= 2 && fromTier <= 7, "Invalid tier");
            uint256 ratio = combineRatio[fromTier];
            require(balanceOf(msg.sender, fromTier) >= ratio, "Insufficient blocks");
            uint256 toTier = fromTier - 1;
            _burn(msg.sender, fromTier, ratio);
            tierTotalSupply[fromTier] -= ratio;
            _mint(msg.sender, toTier, 1, "");
            tierTotalSupply[toTier]++;
            emit BlocksCombined(msg.sender, fromTier, toTier);
        }
        _checkCountdownTrigger(msg.sender);
    }

    // ── FORGE (called by BlockHuntForge) ──────────────────────────────────────

    function executeForge(address player, uint256 fromTier, uint256 burnCount, bool success)
        external onlyForge nonReentrant
    {
        require(fromTier >= 2 && fromTier <= 7, "Invalid tier");
        require(burnCount >= 10 && burnCount <= 99, "Invalid burn count");
        require(balanceOf(player, fromTier) >= burnCount, "Insufficient blocks");

        uint256 toTier = fromTier - 1;
        _burn(player, fromTier, burnCount);
        tierTotalSupply[fromTier] -= burnCount;

        if (success) {
            _mint(player, toTier, 1, "");
            tierTotalSupply[toTier]++;
        }

        emit BlocksForged(player, fromTier, success);
        if (success) _checkCountdownTrigger(player);
    }

    // ── ENDGAME ───────────────────────────────────────────────────────────────

    /**
     * @notice Holder actively chooses to claim 100% of the treasury.
     *         Only callable after the full 7-day countdown has expired.
     *         Must be called by the countdown holder themselves.
     */
    function claimTreasury() external nonReentrant {
        require(countdownActive, "No countdown active");
        require(msg.sender == countdownHolder, "Not the countdown holder");
        require(
            block.timestamp >= countdownStartTime + COUNTDOWN_DURATION,
            "Countdown still running"
        );
        _verifyHoldsAllTiers(msg.sender);

        for (uint256 tier = 2; tier <= 7; tier++) {
            uint256 bal = balanceOf(msg.sender, tier);
            _burn(msg.sender, tier, bal);
            tierTotalSupply[tier] -= bal;
        }

        IBlockHuntTreasury(treasuryContract).claimPayout(msg.sender);
        emit OriginClaimed(msg.sender);

        _finaliseEndgame();
    }

    /**
     * @notice Holder actively chooses to sacrifice.
     *         Receives The Origin NFT. Treasury splits 50/50 — holder gets half,
     *         other half seeds Season 2.
     *         Only callable after the full 7-day countdown has expired.
     *         Must be called by the countdown holder themselves.
     */
    function sacrifice() external nonReentrant {
        require(countdownActive, "No countdown active");
        require(msg.sender == countdownHolder, "Not the countdown holder");
        require(
            block.timestamp >= countdownStartTime + COUNTDOWN_DURATION,
            "Countdown still running"
        );
        _verifyHoldsAllTiers(msg.sender);

        for (uint256 tier = 2; tier <= 7; tier++) {
            uint256 bal = balanceOf(msg.sender, tier);
            _burn(msg.sender, tier, bal);
            tierTotalSupply[tier] -= bal;
        }

        _mint(msg.sender, TIER_ORIGIN, 1, "");
        tierTotalSupply[TIER_ORIGIN]++;

        IBlockHuntTreasury(treasuryContract).sacrificePayout(msg.sender);
        emit OriginSacrificed(msg.sender);

        _finaliseEndgame();
    }

    /**
     * @notice Executes Sacrifice automatically on behalf of the holder if they
     *         took no action after the 7-day countdown expired.
     *         Callable by anyone — the Gelato keeper calls this automatically at zero.
     */
    function executeDefaultOnExpiry() external nonReentrant {
        require(countdownActive, "No countdown active");
        require(
            block.timestamp >= countdownStartTime + COUNTDOWN_DURATION,
            "Countdown still running"
        );

        address holder = countdownHolder;
        _verifyHoldsAllTiers(holder);

        for (uint256 tier = 2; tier <= 7; tier++) {
            uint256 bal = balanceOf(holder, tier);
            _burn(holder, tier, bal);
            tierTotalSupply[tier] -= bal;
        }

        _mint(holder, TIER_ORIGIN, 1, "");
        tierTotalSupply[TIER_ORIGIN]++;

        IBlockHuntTreasury(treasuryContract).sacrificePayout(holder);
        emit OriginSacrificed(holder);
        emit DefaultSacrificeExecuted(holder, msg.sender);

        _finaliseEndgame();
    }

    /**
     * @notice Allows a player who already holds all 6 tiers to activate their
     *         countdown without needing to mint, combine, or forge first.
     */
    function claimHolderStatus() external {
        require(!countdownActive, "Countdown already active");
        _checkCountdownTrigger(msg.sender);
        require(countdownActive, "Does not hold all 6 tiers");
    }

    // ── INTERNAL ──────────────────────────────────────────────────────────────

    function _finaliseEndgame() internal {
        countdownActive    = false;
        countdownHolder    = address(0);
        countdownStartTime = 0;

        if (countdownContract != address(0)) {
            IBlockHuntCountdown(countdownContract).syncReset();
        }
    }

    function _checkCountdownTrigger(address player) internal {
        if (countdownActive) return;
        for (uint256 tier = 2; tier <= 7; tier++) {
            if (balanceOf(player, tier) == 0) return;
        }
        countdownActive    = true;
        countdownHolder    = player;
        countdownStartTime = block.timestamp;

        if (countdownContract != address(0)) {
            IBlockHuntCountdown(countdownContract).startCountdown(player);
        }

        emit CountdownTriggered(player);
    }

    function _verifyHoldsAllTiers(address player) internal view {
        for (uint256 tier = 2; tier <= 7; tier++) {
            require(balanceOf(player, tier) > 0, "Must hold all 6 tiers");
        }
    }

    /**
     * @dev Pseudo-random tier roll. Used only when vrfEnabled = false.
     *      NOT safe for mainnet — susceptible to free-look attacks.
     *      Replaced by VRF-derived path in fulfillRandomWords().
     */
    function _rollTier(uint256 salt) internal returns (uint256) {
        _nonce++;
        uint256 rand = uint256(keccak256(abi.encodePacked(
            block.prevrandao, block.timestamp, msg.sender, _nonce, salt
        ))) % 100000;
        return _tierFromRandom(rand);
    }

    /**
     * @dev Maps a random number (mod 100000) to a tier.
     *      Shared by both the pseudo-random and VRF paths.
     *      Probabilities match the GDD exactly.
     */
    function _tierFromRandom(uint256 rand) internal pure returns (uint256) {
        rand = rand % 100000;
        if (rand < 1)     return TIER_ORIGIN;    //  0.001%
        if (rand < 50)    return TIER_WILLFUL;   //  0.049%
        if (rand < 300)   return TIER_CHAOTIC;   //  0.250%
        if (rand < 1500)  return TIER_ORDERED;   //  1.200%
        if (rand < 6000)  return TIER_REMEMBER;  //  4.500%
        if (rand < 20000) return TIER_RESTLESS;  // 14.000%
        return TIER_INERT;                       // 80.000%
    }

    /**
     * @dev Removes a requestId from a player's pendingRequestsByPlayer array.
     *      Uses swap-and-pop for gas efficiency.
     */
    function _removePendingRequest(address player, uint256 requestId) internal {
        uint256[] storage pending = pendingRequestsByPlayer[player];
        uint256 len = pending.length;
        for (uint256 i = 0; i < len; i++) {
            if (pending[i] == requestId) {
                pending[i] = pending[len - 1];
                pending.pop();
                return;
            }
        }
    }

    // ── VIEW HELPERS ──────────────────────────────────────────────────────────

    function balancesOf(address player) external view returns (uint256[8] memory) {
        uint256[8] memory bals;
        for (uint256 tier = 1; tier <= 7; tier++) {
            bals[tier] = balanceOf(player, tier);
        }
        return bals;
    }

    function hasAllTiers(address player) external view returns (bool) {
        for (uint256 tier = 2; tier <= 7; tier++) {
            if (balanceOf(player, tier) == 0) return false;
        }
        return true;
    }

    function resetDailyWindow(uint256 newDay) external onlyMintWindow {
        currentWindowDay = newDay;
        windowDayMinted  = 0;
    }

    function supportsInterface(bytes4 interfaceId)
        public view virtual override(ERC1155, ERC2981) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // ── TEST ONLY — remove before mainnet ─────────────────────────────────────

    bool public testMintEnabled = true;

    function mintForTest(address player, uint256 tier, uint256 amount) external {
        require(testMintEnabled, "Test mint disabled");
        require(tier >= 1 && tier <= 7, "Invalid tier");
        _mint(player, tier, amount, "");
        tierTotalSupply[tier] += amount;
        _checkCountdownTrigger(player);
    }

    function disableTestMint() external onlyOwner {
        testMintEnabled = false;
    }

    // ── Migration support ─────────────────────────────────────────────────────

    address public migrationContract;

    function setMigrationContract(address addr) external onlyOwner {
        require(migrationContract == address(0), "Already set");
        migrationContract = addr;
    }

    function burnForMigration(
        address player,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external {
        require(msg.sender == migrationContract, "Only migration contract");
        _burnBatch(player, ids, amounts);
        for (uint256 i = 0; i < ids.length; i++) {
            tierTotalSupply[ids[i]] -= amounts[i];
        }
    }

    function mintMigrationStarters(
        address player,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external {
        require(msg.sender == migrationContract, "Only migration contract");
        _mintBatch(player, ids, amounts, "");
        for (uint256 i = 0; i < ids.length; i++) {
            tierTotalSupply[ids[i]] += amounts[i];
        }
    }
}
