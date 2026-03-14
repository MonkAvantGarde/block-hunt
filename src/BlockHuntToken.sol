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
    function currentBatch() external view returns (uint256);
    function windowCapForBatch(uint256 batch) external pure returns (uint256);
}

interface IBlockHuntCountdown {
    function startCountdown(address holder) external;
    function syncReset() external;
}

// [NEW] Escrow handles all sacrifice fund distribution
interface IBlockHuntEscrow {
    function initiateSacrifice(address winner) external;
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
    function mintPriceForBatch(uint256 batch) public pure returns (uint256) {
        if (batch == 1) return 0.00008 ether;
        if (batch == 2) return 0.00016 ether;
        if (batch == 3) return 0.00032 ether;
        if (batch == 4) return 0.00080 ether;
        if (batch == 5) return 0.00160 ether;
        if (batch == 6) return 0.00200 ether;
        return 0.00200 ether;
    }

    function currentMintPrice() public view returns (uint256) {
        if (mintWindowContract == address(0)) return mintPriceForBatch(1);
        uint256 batch = IBlockHuntMint(mintWindowContract).currentBatch();
        return mintPriceForBatch(batch);
    }

    uint256 public constant COUNTDOWN_DURATION = 7 days;
    uint256 public constant MINT_REQUEST_TTL   = 1 hours;

    mapping(uint256 => uint256) public combineRatio;

    address public mintWindowContract;
    address public treasuryContract;
    address public forgeContract;
    address public countdownContract;
    address public escrowContract;    // [NEW] holds sacrifice funds

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
    uint32  public vrfCallbackGasLimit = 150_000;
    uint32  public constant VRF_GAS_PER_BLOCK = 3_000;
    uint32  public constant VRF_GAS_MAX = 2_500_000;

    // ── Mint VRF pending state ────────────────────────────────────────────────
    struct MintRequest {
        address player;
        uint256 quantity;
        uint256 amountPaid;
        uint256 requestedAt;
        uint256 windowDay;
    }

    mapping(uint256 => MintRequest) public vrfMintRequests;
    mapping(address => uint256[]) public pendingRequestsByPlayer;

    // ── Pseudo-random nonce (vrfEnabled = false path only) ────────────────────
    uint256 private _nonce;

    // ── Events ────────────────────────────────────────────────────────────────
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
        // [FIX M7] combineRatio[2] REMOVED — T2→T1 combine is not possible.
        // The Origin is sacrifice-only. combineRatio[2] was set to 100 previously
        // but had no valid use case and could mislead the frontend.
        combineRatio[7] = 20;
        combineRatio[6] = 20;
        combineRatio[5] = 30;
        combineRatio[4] = 30;
        combineRatio[3] = 50;
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

    // ── Contract must accept ETH (holds pending mint payments) ────────────────
    receive() external payable {}

    // ── CORE GAME ACTIONS ─────────────────────────────────────────────────────

    function mint(uint256 quantity) external payable nonReentrant whenNotPaused notCountdown {
        require(mintWindowContract != address(0), "Mint not configured");
        require(IBlockHuntMint(mintWindowContract).isWindowOpen(), "Window closed");
        require(quantity > 0 && quantity <= 500, "Invalid quantity");
        uint256 mintPrice = currentMintPrice();
        require(msg.value >= mintPrice * quantity, "Insufficient payment");

        // [FIX H1] Read cap dynamically from MintWindow instead of hardcoded constant.
        // This ensures Batches 3–6 use their intended higher window caps.
        uint256 windowCap = IBlockHuntMint(mintWindowContract).windowCapForBatch(
            IBlockHuntMint(mintWindowContract).currentBatch()
        );
        uint256 dayRemaining = windowCap - windowDayMinted;
        require(dayRemaining > 0, "Window cap reached");
        uint256 allocated = quantity > dayRemaining ? dayRemaining : quantity;

        uint256 totalCost = mintPrice * allocated;

        if (msg.value > totalCost) {
            (bool refunded, ) = payable(msg.sender).call{value: msg.value - totalCost}("");
            require(refunded, "Refund failed");
        }

        windowDayMinted += allocated;

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
                requestConfirmations: 3,
                callbackGasLimit:    _gasLimitForQuantity(allocated),
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

    function fulfillRandomWords(
        uint256 requestId,
        uint256[] calldata randomWords
    ) internal override {
        MintRequest memory req = vrfMintRequests[requestId];

        if (req.player == address(0)) return;

        delete vrfMintRequests[requestId];
        _removePendingRequest(req.player, requestId);

        uint256 allocated = req.quantity;
        uint256 seed      = randomWords[0];
        uint256 batch     = IBlockHuntMint(mintWindowContract).currentBatch();

        uint256[8] memory tierCounts;
        for (uint256 i = 0; i < allocated; i++) {
            uint256 derived = uint256(keccak256(abi.encodePacked(seed, i)));
            uint256 tier    = _tierFromRandom(derived, batch);
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
        IBlockHuntMint(mintWindowContract).recordMint(req.player, allocated);

        emit BlockMinted(req.player, allocated);
        emit MintFulfilled(req.player, requestId, allocated);

        _checkCountdownTrigger(req.player);
    }

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

        windowDayMinted -= req.quantity;

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

        // Step 1: roll tiers and tally into buckets
        uint256[8] memory tierCounts;
        for (uint256 i = 0; i < allocated; i++) {
            uint256 tier = _rollTier(i);
            tierCounts[tier]++;
        }

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

        // Treasury sends 100% ETH to Escrow; Escrow handles the 50/40/10 split
        IBlockHuntTreasury(treasuryContract).sacrificePayout(msg.sender);
        IBlockHuntEscrow(escrowContract).initiateSacrifice(msg.sender);

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
        IBlockHuntEscrow(escrowContract).initiateSacrifice(holder);
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
            IBlockHuntCountdown(countdownContract).startCountdown(player);
        }

        emit CountdownTriggered(player);
    }

    function _verifyHoldsAllTiers(address player) internal view {
        for (uint256 tier = 2; tier <= 7; tier++) {
            require(balanceOf(player, tier) > 0, "Must hold all 6 tiers");
        }
    }

    function _gasLimitForQuantity(uint256 quantity) internal view returns (uint32) {
        uint256 computed = uint256(vrfCallbackGasLimit) + quantity * uint256(VRF_GAS_PER_BLOCK);
        return computed > uint256(VRF_GAS_MAX) ? VRF_GAS_MAX : uint32(computed);
    }

    function _rollTier(uint256 salt) internal returns (uint256) {
        _nonce++;
        uint256 rand = uint256(keccak256(abi.encodePacked(
            block.prevrandao, block.timestamp, msg.sender, _nonce, salt
        ))) % 100000;
        uint256 batch = IBlockHuntMint(mintWindowContract).currentBatch();
        return _tierFromRandom(rand, batch);
    }

    function _tierFromRandom(uint256 rand, uint256 batch) internal pure returns (uint256) {
        rand = rand % 100000;

        if (batch <= 2) {
            if (rand < 5)     return TIER_WILLFUL;
            if (rand < 55)    return TIER_CHAOTIC;
            if (rand < 355)   return TIER_ORDERED;
            if (rand < 2355)  return TIER_REMEMBER;
            if (rand < 12355) return TIER_RESTLESS;
            return TIER_INERT;
        } else if (batch <= 4) {
            if (rand < 30)    return TIER_WILLFUL;
            if (rand < 230)   return TIER_CHAOTIC;
            if (rand < 1230)  return TIER_ORDERED;
            if (rand < 5230)  return TIER_REMEMBER;
            if (rand < 19230) return TIER_RESTLESS;
            return TIER_INERT;
        } else {
            if (rand < 150)   return TIER_WILLFUL;
            if (rand < 950)   return TIER_CHAOTIC;
            if (rand < 3950)  return TIER_ORDERED;
            if (rand < 11950) return TIER_REMEMBER;
            if (rand < 29950) return TIER_RESTLESS;
            return TIER_INERT;
        }
    }

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
