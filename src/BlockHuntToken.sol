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
    function sacrificePayout(address winner) external returns (uint256 amount);
}

interface IBlockHuntMint {
    function isWindowOpen() external view returns (bool);
    function recordMint(address minter, uint256 quantity) external;
    function currentBatch() external view returns (uint256);
    function windowCapForBatch(uint256 batch) external view returns (uint256);
    function batchPrice(uint256 batch) external view returns (uint256);
}

interface IBlockHuntCountdown {
    function startCountdown(address holder) external;
    function syncReset() external;
    function recordProgression(address player, uint256 points) external;
    function eliminatePlayer(address player) external;
    function countdownDuration() external view returns (uint256);
}

// [NEW] Escrow handles all sacrifice fund distribution
interface IBlockHuntEscrow {
    function initiateSacrifice(address winner, uint256 amount) external;
}

contract BlockHuntToken is ERC1155, ERC2981, VRFConsumerBaseV2Plus, ReentrancyGuard, Pausable {

    uint256 public constant TIER_ORIGIN   = 1;
    uint256 public constant TIER_WILLFUL  = 2;
    uint256 public constant TIER_CHAOTIC  = 3;
    uint256 public constant TIER_ORDERED  = 4;
    uint256 public constant TIER_REMEMBER = 5;
    uint256 public constant TIER_RESTLESS = 6;
    uint256 public constant TIER_INERT    = 7;

    // [FIX H1] DAILY_CAP constant REMOVED — cap is now read dynamically from
    // MintWindow via windowCapForBatch(currentBatch). This ensures Batches 3–6
    // can mint at their intended higher caps (50k, 100k, 200k, 100k per window).

    // ── Per-batch mint pricing ────────────────────────────────────────────────
    mapping(uint256 => uint256) public mintPriceForBatch;

    function setMintPrice(uint256 batch, uint256 price) external onlyOwner {
        require(testMintEnabled, "Test mode disabled");
        require(batch >= 1 && batch <= 10, "Invalid batch");
        mintPriceForBatch[batch] = price;
    }

    function currentMintPrice() public view returns (uint256) {
        if (mintWindowContract == address(0)) return mintPriceForBatch[1];
        uint256 batch = IBlockHuntMint(mintWindowContract).currentBatch();
        // Prefer MintWindow price; fall back to local mapping for backward compat
        uint256 price = IBlockHuntMint(mintWindowContract).batchPrice(batch);
        return price > 0 ? price : mintPriceForBatch[batch];
    }

    uint256 public mintRequestTTL = 10 minutes;

    mapping(uint256 => uint256) public combineRatio;

    address public mintWindowContract;
    address public treasuryContract;
    address public forgeContract;
    address public countdownContract;
    address public escrowContract;    // [NEW] holds sacrifice funds
    address public rewardsContract;

    uint256 public currentWindowDay;
    uint256[8] public tierTotalSupply;

    mapping(uint256 => mapping(address => bool)) public dailyEligible;
    mapping(uint256 => uint256) public dailyMinterCount;

    bool    public countdownActive;
    address public countdownHolder;
    uint256 public countdownStartTime;

    // ── VRF config ────────────────────────────────────────────────────────────
    bool    public vrfEnabled;
    uint256 public vrfSubscriptionId;
    bytes32 public vrfKeyHash;
    uint32  public vrfCallbackGasLimit = 150_000;
    uint16  public vrfRequestConfirmations = 1;
    uint32  public vrfGasPerBlock = 28_000;
    uint32  public vrfGasMax      = 15_000_000;

    // ── Mint VRF pending state ────────────────────────────────────────────────
    struct MintRequest {
        address player;        // slot 1 (20)
        uint32  quantity;      // slot 1 (4)
        bool    fulfilled;     // slot 1 (1)
        bool    claimed;       // slot 1 (1)
        uint128 amountPaid;    // slot 2 (16)
        uint64  requestedAt;   // slot 2 (8)
        uint256 seed;          // slot 3
    }

    uint32 public lazyRevealThreshold;

    mapping(uint256 => MintRequest) public vrfMintRequests;
    mapping(address => uint256[]) public pendingRequestsByPlayer;
    mapping(uint256 => uint256) private pendingIndexPlusOne;

    // ── Pseudo-random nonce (vrfEnabled = false path only) ────────────────────
    uint256 private _nonce;

    // ── Continuous rarity formula ──────────────────────────────────────────────
    uint256 public constant DENOM = 10_000_000_000; // 10 billion = 100%
    uint256 public constant SCALE = 100_000;        // supply divisor (100K)

    uint256 public constant T6_THRESHOLD = 2_000_000_000; // 20% fixed
    uint256 public constant T5_THRESHOLD = 200_000_000;   // 2% fixed

    uint256 public t4Coeff = 960_000;   // linear
    uint256 public t3Coeff = 128_000;   // linear
    uint256 public t2Coeff = 6_997;     // quadratic (MEDIUM difficulty)

    uint256 public totalMinted; // cumulative — NEVER decremented

    // ── Events ────────────────────────────────────────────────────────────────
    event RarityCoefficientsUpdated(uint256 t4Coeff, uint256 t3Coeff, uint256 t2Coeff);
    event BlockMinted(address indexed to, uint256 quantity);
    event BlocksCombined(address indexed by, uint256 indexed fromTier, uint256 indexed toTier);
    event BlocksForged(address indexed by, uint256 indexed fromTier, bool success);
    event CountdownTriggered(address indexed holder);
    event CountdownHolderReset(address indexed formerHolder);
    event CountdownHolderUpdated(address indexed newHolder, uint256 timestamp);
    event OriginClaimed(address indexed holder);
    event OriginSacrificed(address indexed holder);
    event DefaultSacrificeExecuted(address indexed holder, address indexed executor);

    event MintRequested(address indexed player, uint256 indexed requestId, uint256 quantity);
    event MintFulfilled(address indexed player, uint256 indexed requestId, uint256 quantity);
    event MintCancelled(address indexed player, uint256 indexed requestId, uint256 refundAmount);
    event RecordMintFailed(address indexed player, uint32 quantity);
    event RecordProgressionFailed(address indexed player, uint32 quantity);
    event CountdownCheckFailed();
    event RewardMinted(address indexed to, uint32 quantity);
    event LazyRevealThresholdUpdated(uint32 newThreshold);

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

        // Mint prices per batch (adjustable via setMintPrice while testMintEnabled)
        // Prices now sourced from MintWindow.batchPrice(); these are fallback defaults
        mintPriceForBatch[1] = 0.00008 ether;
        mintPriceForBatch[2] = 0.00012 ether;
        mintPriceForBatch[3] = 0.00020 ether;
        mintPriceForBatch[4] = 0.00032 ether;
        mintPriceForBatch[5] = 0.00056 ether;
        mintPriceForBatch[6] = 0.00100 ether;
        mintPriceForBatch[7] = 0.00180 ether;
        mintPriceForBatch[8] = 0.00320 ether;
        mintPriceForBatch[9] = 0.00520 ether;
        mintPriceForBatch[10] = 0.00800 ether;

        // [FIX M7] combineRatio[2] REMOVED — T2→T1 combine is not possible.
        // The Origin is sacrifice-only. combineRatio[2] was set to 100 previously
        // but had no valid use case and could mislead the frontend.
        combineRatio[7] = 21;
        combineRatio[6] = 19;
        combineRatio[5] = 17;
        combineRatio[4] = 15;
        combineRatio[3] = 13;
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

    modifier onlyCountdown() {
        require(msg.sender == countdownContract, "Only countdown contract");
        _;
    }

    modifier notCountdown() {
        require(!countdownActive, "Countdown is active");
        _;
    }

    // ── Admin setters ─────────────────────────────────────────────────────────

    function setMintWindowContract(address addr) external onlyOwner {
        require(mintWindowContract == address(0) || testMintEnabled, "Already set");
        mintWindowContract = addr;
    }
    function setTreasuryContract(address addr) external onlyOwner {
        require(treasuryContract == address(0) || testMintEnabled, "Already set");
        treasuryContract = addr;
    }
    function setForgeContract(address addr) external onlyOwner {
        require(forgeContract == address(0) || testMintEnabled, "Already set");
        forgeContract = addr;
    }
    function setCountdownContract(address addr) external onlyOwner {
        require(countdownContract == address(0) || testMintEnabled, "Already set");
        countdownContract = addr;
    }
    function setEscrowContract(address addr) external onlyOwner {
        require(escrowContract == address(0) || testMintEnabled, "Already set");
        escrowContract = addr;
    }

    function setRewardsContract(address addr) external onlyOwner {
        rewardsContract = addr;
    }
    function setURI(string memory newuri)        external onlyOwner { _setURI(newuri); }
    function setRoyalty(address receiver, uint96 fee) external onlyOwner {
        require(fee <= 1000, "Exceeds 10% cap");
        _setDefaultRoyalty(receiver, fee);
    }
    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function setVrfConfig(
        uint256 subId,
        bytes32 keyHash,
        uint32  callbackGasLimit
    ) external onlyOwner {
        vrfSubscriptionId    = subId;
        vrfKeyHash           = keyHash;
        vrfCallbackGasLimit  = callbackGasLimit;
    }

    function setVrfEnabled(bool enabled) external onlyOwner {
        vrfEnabled = enabled;
    }

    event VrfGasParamsUpdated(uint32 gasPerBlock, uint32 gasMax);
    event MintRequestTTLUpdated(uint256 newTTL);

    function setVrfGasParams(uint32 _gasPerBlock, uint32 _gasMax) external onlyOwner {
        require(_gasPerBlock >= 10_000 && _gasPerBlock <= 100_000, "gasPerBlock out of range");
        require(_gasMax >= 500_000 && _gasMax <= 30_000_000, "gasMax out of range");
        vrfGasPerBlock = _gasPerBlock;
        vrfGasMax      = _gasMax;
        emit VrfGasParamsUpdated(_gasPerBlock, _gasMax);
    }

    function setMintRequestTTL(uint256 _ttl) external onlyOwner {
        require(_ttl >= 5 minutes && _ttl <= 1 hours, "TTL out of range");
        mintRequestTTL = _ttl;
        emit MintRequestTTLUpdated(_ttl);
    }

    function setLazyRevealThreshold(uint32 _threshold) external onlyOwner {
        require(_threshold == 0 || _threshold >= 50, "Threshold must be 0 or >=50");
        lazyRevealThreshold = _threshold;
        emit LazyRevealThresholdUpdated(_threshold);
    }

    // ── Contract must accept ETH (holds pending mint payments) ────────────────
    receive() external payable {}

    // ── CORE GAME ACTIONS ─────────────────────────────────────────────────────

    function mint(uint256 quantity) external payable nonReentrant whenNotPaused {
        require(mintWindowContract != address(0), "Mint not configured");
        require(IBlockHuntMint(mintWindowContract).isWindowOpen(), "Window closed");
        require(quantity > 0 && quantity <= 500, "Invalid quantity");
        uint256 mintPrice = currentMintPrice();
        require(msg.value >= mintPrice * quantity, "Insufficient payment");

        uint256 allocated = quantity;
        uint256 totalCost = mintPrice * allocated;

        if (msg.value > totalCost) {
            (bool refunded, ) = payable(msg.sender).call{value: msg.value - totalCost}("");
            require(refunded, "Refund failed");
        }

        if (vrfEnabled) {
            _mintVRF(allocated, totalCost);
        } else {
            _mintPseudoRandom(allocated, totalCost);
        }
    }

    // ── VRF MINT PATH ─────────────────────────────────────────────────────────

    function _mintVRF(uint256 allocated, uint256 totalCost) internal {
        uint256 requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash:             vrfKeyHash,
                subId:               vrfSubscriptionId,
                requestConfirmations: vrfRequestConfirmations,
                callbackGasLimit:    _gasLimitForQuantity(allocated),
                numWords:            1,
                extraArgs:           VRFV2PlusClient._argsToBytes(
                                         VRFV2PlusClient.ExtraArgsV1({ nativePayment: false })
                                     )
            })
        );

        vrfMintRequests[requestId] = MintRequest({
            player:      msg.sender,
            quantity:    uint32(allocated),
            fulfilled:   false,
            claimed:     false,
            amountPaid:  uint128(totalCost),
            requestedAt: uint64(block.timestamp),
            seed:        0
        });

        pendingRequestsByPlayer[msg.sender].push(requestId);
        pendingIndexPlusOne[requestId] = pendingRequestsByPlayer[msg.sender].length;

        emit MintRequested(msg.sender, requestId, allocated);
    }

    function fulfillRandomWords(
        uint256 requestId,
        uint256[] calldata randomWords
    ) internal override {
        MintRequest storage req = vrfMintRequests[requestId];
        if (req.player == address(0)) return;

        uint32 threshold = lazyRevealThreshold;
        if (threshold == 0 || req.quantity <= threshold) {
            _executeMint(requestId, randomWords[0]);
            delete vrfMintRequests[requestId];
        } else {
            req.seed = randomWords[0];
            req.fulfilled = true;
            emit MintFulfilled(req.player, requestId, req.quantity);
        }
    }

    function claimMint(uint256 requestId) external nonReentrant whenNotPaused {
        MintRequest storage req = vrfMintRequests[requestId];
        require(req.fulfilled && !req.claimed, "Not claimable");
        req.claimed = true;
        _executeMint(requestId, req.seed);
        delete vrfMintRequests[requestId];
    }

    function _executeMint(uint256 requestId, uint256 seed) internal {
        MintRequest memory req = vrfMintRequests[requestId];
        _removePendingRequest(req.player, requestId);

        uint256 allocated = req.quantity;
        totalMinted += allocated;

        (uint256 t2T, uint256 t3T, uint256 t4T) = _getTierThresholds();
        uint256[8] memory tierCounts;
        for (uint256 i = 0; i < allocated; i++) {
            uint256 derived = uint256(keccak256(abi.encodePacked(seed, i)));
            uint256 tier    = _assignTierCached(derived, t2T, t3T, t4T);
            tierCounts[tier]++;
        }

        for (uint256 t = 2; t <= 7; t++) {
            if (tierCounts[t] > 0) tierTotalSupply[t] += tierCounts[t];
        }

        uint256 uniqueCount;
        for (uint256 t = 2; t <= 7; t++) {
            if (tierCounts[t] > 0) uniqueCount++;
        }
        uint256[] memory ids     = new uint256[](uniqueCount);
        uint256[] memory amounts = new uint256[](uniqueCount);
        uint256 idx;
        for (uint256 t = 2; t <= 7; t++) {
            if (tierCounts[t] > 0) {
                ids[idx]     = t;
                amounts[idx] = tierCounts[t];
                idx++;
            }
        }

        IBlockHuntTreasury(treasuryContract).receiveMintFunds{value: req.amountPaid}();

        _mintBatch(req.player, ids, amounts, "");

        try IBlockHuntMint(mintWindowContract).recordMint(req.player, allocated) {}
        catch { emit RecordMintFailed(req.player, uint32(allocated)); }

        if (countdownContract != address(0)) {
            try IBlockHuntCountdown(countdownContract).recordProgression(req.player, allocated) {}
            catch { emit RecordProgressionFailed(req.player, uint32(allocated)); }
        }

        uint256 today = block.timestamp / 86400;
        if (!dailyEligible[today][req.player]) {
            dailyEligible[today][req.player] = true;
            dailyMinterCount[today]++;
        }

        emit BlockMinted(req.player, allocated);
        emit MintFulfilled(req.player, requestId, allocated);

        _checkCountdownTrigger(req.player);
    }

    function cancelMintRequest(uint256 requestId) external nonReentrant {
        MintRequest memory req = vrfMintRequests[requestId];

        require(req.player != address(0),               "Request not found");
        require(req.player == msg.sender,               "Not your request");
        if (req.fulfilled) {
            require(!req.claimed, "Already claimed");
        }
        require(
            block.timestamp >= uint256(req.requestedAt) + mintRequestTTL,
            "Too early to cancel"
        );

        delete vrfMintRequests[requestId];
        _removePendingRequest(msg.sender, requestId);

        (bool sent, ) = payable(msg.sender).call{value: req.amountPaid}("");
        require(sent, "Refund failed");

        emit MintCancelled(msg.sender, requestId, req.amountPaid);
    }

    function getPendingRequests(address player) external view returns (uint256[] memory) {
        return pendingRequestsByPlayer[player];
    }

    // ── PSEUDO-RANDOM MINT PATH (vrfEnabled = false) ──────────────────────────

    // [FIX H5] Applied same tier-aggregation optimisation as VRF callback path.
    // Previous version created a 500-element array for a 500-block mint.
    // Now tallies tiers into a [8] bucket array first, then builds a compact
    // mintBatch with at most 6 entries. Cuts gas by ~70% on large mints.
    function _mintPseudoRandom(uint256 allocated, uint256 totalCost) internal {
        IBlockHuntTreasury(treasuryContract).receiveMintFunds{value: totalCost}();

        totalMinted += allocated;

        // Step 1: roll tiers and tally into buckets (cached thresholds + single nonce write)
        (uint256 t2T, uint256 t3T, uint256 t4T) = _getTierThresholds();
        uint256 nonceStart = _nonce;
        uint256[8] memory tierCounts;
        for (uint256 i = 0; i < allocated; i++) {
            uint256 rand = uint256(keccak256(abi.encodePacked(
                block.prevrandao, block.timestamp, msg.sender, nonceStart + i + 1, i
            )));
            uint256 tier = _assignTierCached(rand, t2T, t3T, t4T);
            tierCounts[tier]++;
        }
        _nonce = nonceStart + allocated;

        // Step 2: update tierTotalSupply
        for (uint256 t = 2; t <= 7; t++) {
            if (tierCounts[t] > 0) tierTotalSupply[t] += tierCounts[t];
        }

        // Step 3: build compact mintBatch arrays (max 6 entries)
        uint256 uniqueCount;
        for (uint256 t = 2; t <= 7; t++) {
            if (tierCounts[t] > 0) uniqueCount++;
        }
        uint256[] memory ids     = new uint256[](uniqueCount);
        uint256[] memory amounts = new uint256[](uniqueCount);
        uint256 idx;
        for (uint256 t = 2; t <= 7; t++) {
            if (tierCounts[t] > 0) {
                ids[idx]     = t;
                amounts[idx] = tierCounts[t];
                idx++;
            }
        }

        _mintBatch(msg.sender, ids, amounts, "");
        IBlockHuntMint(mintWindowContract).recordMint(msg.sender, allocated);

        uint256 today = block.timestamp / 86400;
        if (!dailyEligible[today][msg.sender]) {
            dailyEligible[today][msg.sender] = true;
            dailyMinterCount[today]++;
        }

        emit BlockMinted(msg.sender, allocated);
        _checkCountdownTrigger(msg.sender);
    }

    // ── COMBINE ───────────────────────────────────────────────────────────────

    // [FIX C1] Changed fromTier >= 2 to fromTier >= 3.
    // T2→T1 combine is NOT possible — The Origin is sacrifice-only.
    // Without this fix, anyone with 100 Tier-2 blocks could mint The Origin
    // via combine, completely bypassing the endgame sacrifice mechanic.
    function combine(uint256 fromTier) external nonReentrant whenNotPaused {
        require(fromTier >= 3 && fromTier <= 7, "Invalid tier");
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

    // [FIX C1] Same fix applied here — fromTier >= 3.
    function combineMany(uint256[] calldata fromTiers) external nonReentrant whenNotPaused {
        require(fromTiers.length > 0 && fromTiers.length <= 50, "Invalid length");
        for (uint256 i = 0; i < fromTiers.length; i++) {
            uint256 fromTier = fromTiers[i];
            require(fromTier >= 3 && fromTier <= 7, "Invalid tier");
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

    // [FIX H3] Forge is now a two-step process to prevent VRF callback failures:
    //
    //   Step 1: burnForForge()  — Forge calls this at request time. Blocks are
    //           burned immediately. If the player transfers blocks between
    //           request and callback, the burn has already happened so the
    //           callback cannot revert.
    //
    //   Step 2: resolveForge()  — Forge calls this at callback time (VRF) or
    //           immediately (pseudo-random). If success, mints the upgrade.
    //           If fail, nothing happens — blocks are already gone.
    //
    // Old executeForge() is REMOVED — it did both burn and mint in one call,
    // which meant the VRF callback could revert if blocks were transferred
    // between request and callback, wasting LINK and leaving the request
    // permanently unresolved.

    function burnForForge(address player, uint256 tier, uint256 burnCount)
        external onlyForge
    {
        require(tier >= 3 && tier <= 7, "Invalid tier");
        require(burnCount >= 1, "Invalid burn count");
        require(balanceOf(player, tier) >= burnCount, "Insufficient blocks");
        _burn(player, tier, burnCount);
        tierTotalSupply[tier] -= burnCount;
    }

    function forgeRefund(address to, uint256 tier, uint256 amount) external onlyForge {
        _mint(to, tier, amount, "");
        tierTotalSupply[tier] += amount;
    }

    function rewardMint(address to, uint32 quantity) external {
        require(msg.sender == rewardsContract, "Only rewards");
        require(quantity > 0, "Zero quantity");
        _mint(to, 6, quantity, "");
        tierTotalSupply[6] += quantity;
        emit RewardMinted(to, quantity);
    }

    function resolveForge(address player, uint256 fromTier, bool success)
        external onlyForge nonReentrant
    {
        if (success) {
            uint256 toTier = fromTier - 1;
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
     */
    function claimTreasury() external nonReentrant {
        require(countdownActive, "No countdown active");
        require(msg.sender == countdownHolder, "Not the countdown holder");
        require(
            block.timestamp >= countdownStartTime + _countdownDuration(),
            "Countdown still running"
        );
        _verifyHoldsAllTiers(msg.sender);
        _burnOnePerTier(msg.sender);

        IBlockHuntTreasury(treasuryContract).claimPayout(msg.sender);
        emit OriginClaimed(msg.sender);

        _finaliseEndgame();
    }

    /**
     * @notice Holder actively chooses to sacrifice.
     *         Receives The Origin NFT. Treasury funds go to Escrow:
     *           50% -> winner immediately (via Escrow)
     *           40% -> community pool (held in Escrow, keeper sets entitlements)
     *           10% -> Season 2 seed (held in Escrow until address confirmed)
     *
     * [REDESIGN] No players/amounts params. The winner never controls who
     * receives the community pool. Entitlements are set by the keeper via
     * escrow.setLeaderboardEntitlements() after querying the subgraph.
     */
    function sacrifice() external nonReentrant {
        require(countdownActive, "No countdown active");
        require(msg.sender == countdownHolder, "Not the countdown holder");
        require(
            block.timestamp >= countdownStartTime + _countdownDuration(),
            "Countdown still running"
        );
        _verifyHoldsAllTiers(msg.sender);
        _burnOnePerTier(msg.sender);

        _mint(msg.sender, TIER_ORIGIN, 1, "");
        tierTotalSupply[TIER_ORIGIN]++;

        uint256 sacrificeAmount = IBlockHuntTreasury(treasuryContract).sacrificePayout(msg.sender);
        IBlockHuntEscrow(escrowContract).initiateSacrifice(msg.sender, sacrificeAmount);

        emit OriginSacrificed(msg.sender);

        _finaliseEndgame();
    }

    /**
     * @notice Executes Sacrifice automatically if the holder takes no action
     *         after the 7-day countdown expires.
     *         Callable by anyone — the Gelato keeper calls this at expiry.
     *
     * [REDESIGN] No players/amounts params. Same flow as active sacrifice.
     */
    function executeDefaultOnExpiry() external nonReentrant {
        require(countdownActive, "No countdown active");
        uint256 expiry = countdownStartTime + _countdownDuration();
        require(block.timestamp >= expiry, "Countdown still running");

        if (block.timestamp < expiry + 15 minutes) {
            require(msg.sender == countdownHolder, "Holder grace period active");
        }

        address holder = countdownHolder;
        _verifyHoldsAllTiers(holder);
        _burnOnePerTier(holder);

        _mint(holder, TIER_ORIGIN, 1, "");
        tierTotalSupply[TIER_ORIGIN]++;

        uint256 sacrificeAmount = IBlockHuntTreasury(treasuryContract).sacrificePayout(holder);
        IBlockHuntEscrow(escrowContract).initiateSacrifice(holder, sacrificeAmount);
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

    // ── COUNTDOWN RESET (called by Countdown contract) ────────────────────────

    function resetExpiredHolder() external onlyCountdown {
        if (!countdownActive) return;
        address former = countdownHolder;
        countdownActive    = false;
        countdownHolder    = address(0);
        countdownStartTime = 0;
        emit CountdownHolderReset(former);
    }

    /**
     * @notice Called by the Countdown contract to update the countdown holder
     *         when a successful challenge shifts the countdown to a new player.
     * @dev Only callable by the registered Countdown contract.
     *      Resets countdownStartTime to block.timestamp (full 7-day reset).
     *      Does NOT change countdownActive — countdown remains active.
     */
    function updateCountdownHolder(address newHolder) external onlyCountdown {
        require(countdownActive, "No active countdown");
        countdownHolder    = newHolder;
        countdownStartTime = block.timestamp;
        emit CountdownHolderUpdated(newHolder, block.timestamp);
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
            try IBlockHuntCountdown(countdownContract).startCountdown(player) {}
            catch { emit CountdownCheckFailed(); }
        }

        emit CountdownTriggered(player);
    }

    function _burnOnePerTier(address player) internal {
        uint256[] memory ids = new uint256[](6);
        uint256[] memory amounts = new uint256[](6);
        for (uint256 i = 0; i < 6; i++) {
            ids[i]     = i + 2;
            amounts[i] = 1;
            tierTotalSupply[i + 2] -= 1;
        }
        _burnBatch(player, ids, amounts);

        if (countdownContract != address(0)) {
            try IBlockHuntCountdown(countdownContract).eliminatePlayer(player) {}
            catch {}
        }
    }

    function _countdownDuration() internal view returns (uint256) {
        if (countdownContract == address(0)) return 7 days;
        return IBlockHuntCountdown(countdownContract).countdownDuration();
    }

    function _verifyHoldsAllTiers(address player) internal view {
        for (uint256 tier = 2; tier <= 7; tier++) {
            require(balanceOf(player, tier) > 0, "Must hold all 6 tiers");
        }
    }

    function _gasLimitForQuantity(uint256 quantity) internal view returns (uint32) {
        uint256 computed = uint256(vrfCallbackGasLimit) + quantity * uint256(vrfGasPerBlock);
        return computed > uint256(vrfGasMax) ? vrfGasMax : uint32(computed);
    }

    function _rollTier(uint256 salt) internal returns (uint256) {
        _nonce++;
        uint256 rand = uint256(keccak256(abi.encodePacked(
            block.prevrandao, block.timestamp, msg.sender, _nonce, salt
        )));
        return _assignTier(rand);
    }

    // ── Continuous rarity: T6/T5 fixed, T4/T3 linear, T2 quadratic ────────
    function _getTierThresholds() internal view returns (
        uint256 t2T, uint256 t3T, uint256 t4T
    ) {
        uint256 s = totalMinted / SCALE; // totalMinted / 100K

        t4T = t4Coeff * s;         // linear
        t3T = t3Coeff * s;         // linear
        t2T = t2Coeff * s * s;     // QUADRATIC (s²)

        // Safety cap: rare tiers cannot exceed 50% total
        uint256 totalRare = t2T + t3T + t4T + T5_THRESHOLD + T6_THRESHOLD;
        if (totalRare > DENOM / 2) {
            uint256 dynTotal = t2T + t3T + t4T;
            uint256 maxDyn = DENOM / 2 - T5_THRESHOLD - T6_THRESHOLD;
            t4T = t4T * maxDyn / dynTotal;
            t3T = t3T * maxDyn / dynTotal;
            t2T = t2T * maxDyn / dynTotal;
        }
    }

    function _assignTier(uint256 randomWord) internal view returns (uint256) {
        (uint256 t2T, uint256 t3T, uint256 t4T) = _getTierThresholds();
        return _assignTierCached(randomWord, t2T, t3T, t4T);
    }

    function _assignTierCached(
        uint256 randomWord, uint256 t2T, uint256 t3T, uint256 t4T
    ) internal pure returns (uint256) {
        uint256 roll = randomWord % DENOM;

        if (roll < t2T) return TIER_WILLFUL;
        roll -= t2T;
        if (roll < t3T) return TIER_CHAOTIC;
        roll -= t3T;
        if (roll < t4T) return TIER_ORDERED;
        roll -= t4T;
        if (roll < T5_THRESHOLD) return TIER_REMEMBER;
        roll -= T5_THRESHOLD;
        if (roll < T6_THRESHOLD) return TIER_RESTLESS;
        return TIER_INERT;
    }

    function setRarityCoefficients(
        uint256 _t4Coeff, uint256 _t3Coeff, uint256 _t2Coeff
    ) external onlyOwner {
        require(testMintEnabled, "Test mode disabled");
        t4Coeff = _t4Coeff;
        t3Coeff = _t3Coeff;
        t2Coeff = _t2Coeff;
        emit RarityCoefficientsUpdated(_t4Coeff, _t3Coeff, _t2Coeff);
    }

    function _removePendingRequest(address player, uint256 requestId) internal {
        uint256 idxPlusOne = pendingIndexPlusOne[requestId];
        if (idxPlusOne == 0) return;
        uint256 idx = idxPlusOne - 1;
        uint256[] storage arr = pendingRequestsByPlayer[player];
        uint256 last = arr.length - 1;
        if (idx != last) {
            uint256 moved = arr[last];
            arr[idx] = moved;
            pendingIndexPlusOne[moved] = idx + 1;
        }
        arr.pop();
        delete pendingIndexPlusOne[requestId];
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
    }

    function supportsInterface(bytes4 interfaceId)
        public view virtual override(ERC1155, ERC2981) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // ── TEST ONLY — remove before mainnet ─────────────────────────────────────

    bool public testMintEnabled = true;

    // [FIX C2] Added onlyOwner. Previously anyone could call this and free-mint
    // unlimited blocks of any tier. On testnet this allows any wallet that reads
    // the contract to win the game trivially.
    function mintForTest(address player, uint256 tier, uint256 amount) external onlyOwner {
        require(testMintEnabled, "Test mint disabled");
        require(tier >= 2 && tier <= 7, "Invalid tier");
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
        require(migrationContract == address(0) || testMintEnabled, "Already set");
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
