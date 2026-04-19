// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║      THE BLOCK HUNT — MINT WINDOW (Always-Open + Cooldown) ║
 * ║                                                              ║
 * ║  Minting is always open. Per-player rate limiting via:       ║
 * ║    - Cycle cap (500): 3h cooldown after hitting cap          ║
 * ║    - Daily cap (5000): hard stop until 24h period expires    ║
 * ║                                                              ║
 * ║  All values configurable for testnet tuning.                 ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
contract BlockHuntMintWindow is Ownable {

    // ── Configurable rate limits ──────────────────────────────────────────
    uint256 public cooldownDuration = 3 hours;
    uint256 public perCycleCap = 500;
    uint256 public dailyCap = 5000;
    uint256 public dailyPeriod = 24 hours;

    // ── Batch structure (unchanged from previous version) ─────────────────
    struct BatchConfig {
        uint256 supply;
        uint256 price;      // in wei
        uint256 windowCap;  // legacy field, kept for storage compat
    }

    uint256 public batchCount = 10;
    BatchConfig[] public batchConfigs;

    struct Batch {
        uint256 id;
        uint256 startDay;
        uint256 totalMinted;
    }

    mapping(uint256 => Batch) public batches;
    uint256 public currentBatch;

    // ── Per-player cooldown state ─────────────────────────────────────────
    struct PlayerMintState {
        uint256 cycleMints;       // mints in current cycle (resets after cooldown)
        uint256 cooldownUntil;    // timestamp when cooldown expires (0 = none)
        uint256 dailyMints;       // mints in current 24h period
        uint256 dailyPeriodStart; // timestamp when current 24h period began
        uint256 cycleStartedAt;   // timestamp of first mint in current cycle (auto-reset)
    }

    mapping(address => PlayerMintState) public playerState;

    // ── Linked contracts ──────────────────────────────────────────────────
    address public tokenContract;
    address public keeper;
    bool public testModeEnabled = true;

    // ── Events ────────────────────────────────────────────────────────────
    event BatchAdvanced(uint256 indexed newBatch, uint256 timestamp);
    event BatchConfigUpdated(uint256 indexed batchIndex, uint256 supply, uint256 price, uint256 windowCap);
    event AllBatchConfigsUpdated(uint256 batchCount);
    event KeeperUpdated(address indexed keeper);
    event CooldownStarted(address indexed player, uint256 until);
    event DailyCapReached(address indexed player, uint256 resetsAt);

    // ── Modifiers ─────────────────────────────────────────────────────────
    modifier onlyOwnerOrKeeper() {
        require(msg.sender == owner() || msg.sender == keeper, "Not authorized");
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────
    constructor() Ownable(msg.sender) {
        currentBatch = 1;
        batches[1] = Batch({ id: 1, startDay: 1, totalMinted: 0 });

        // 10 batches — 25% geometric growth
        batchConfigs.push(BatchConfig(100_000,  0.00008 ether,  0));  // B1
        batchConfigs.push(BatchConfig(125_000,  0.00012 ether,  0));  // B2
        batchConfigs.push(BatchConfig(156_000,  0.00020 ether,  0));  // B3
        batchConfigs.push(BatchConfig(195_000,  0.00032 ether,  0));  // B4
        batchConfigs.push(BatchConfig(244_000,  0.00056 ether,  0));  // B5
        batchConfigs.push(BatchConfig(305_000,  0.00100 ether,  0));  // B6
        batchConfigs.push(BatchConfig(381_000,  0.00180 ether,  0));  // B7
        batchConfigs.push(BatchConfig(477_000,  0.00320 ether,  0));  // B8
        batchConfigs.push(BatchConfig(596_000,  0.00520 ether,  0));  // B9
        batchConfigs.push(BatchConfig(745_000,  0.00800 ether,  0));  // B10
    }

    // ── Admin setters ─────────────────────────────────────────────────────

    function setTokenContract(address addr) external onlyOwner {
        tokenContract = addr;
    }

    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
        emit KeeperUpdated(_keeper);
    }

    function setCooldownDuration(uint256 _duration) external onlyOwner {
        require(_duration >= 1 minutes && _duration <= 24 hours, "Duration out of range");
        cooldownDuration = _duration;
    }

    function setPerCycleCap(uint256 _cap) external onlyOwner {
        require(_cap >= 1 && _cap <= 10_000, "Cap out of range");
        perCycleCap = _cap;
    }

    function setDailyCap(uint256 _cap) external onlyOwner {
        require(_cap >= 1 && _cap <= 1_000_000, "Cap out of range");
        dailyCap = _cap;
    }

    function setDailyPeriod(uint256 _period) external onlyOwner {
        require(_period >= 1 hours && _period <= 7 days, "Duration out of range");
        dailyPeriod = _period;
    }

    function disableTestMode() external onlyOwner {
        testModeEnabled = false;
    }

    // ── Batch config reads ────────────────────────────────────────────────

    function batchSupply(uint256 batch) public view returns (uint256) {
        require(batch >= 1 && batch <= batchCount, "Invalid batch");
        return batchConfigs[batch - 1].supply;
    }

    function batchPrice(uint256 batch) public view returns (uint256) {
        require(batch >= 1 && batch <= batchCount, "Invalid batch");
        return batchConfigs[batch - 1].price;
    }

    /// @notice Returns max uint256 — disables Token's internal window cap check.
    ///         Per-player rate limiting is handled by recordMint() instead.
    function windowCapForBatch(uint256 batch) public view returns (uint256) {
        require(batch >= 1 && batch <= batchCount, "Invalid batch");
        return type(uint256).max;
    }

    // ── Batch config setters (test mode) ──────────────────────────────────

    function setBatchConfig(
        uint256 batchIndex, uint256 supply, uint256 price, uint256 windowCap
    ) external onlyOwner {
        require(testModeEnabled, "Test mode disabled");
        require(batchIndex < batchCount, "Invalid batch");
        batchConfigs[batchIndex] = BatchConfig(supply, price, windowCap);
        emit BatchConfigUpdated(batchIndex, supply, price, windowCap);
    }

    function setAllBatchConfigs(
        uint256[] calldata supplies,
        uint256[] calldata prices,
        uint256[] calldata windowCaps
    ) external onlyOwner {
        require(testModeEnabled, "Test mode disabled");
        require(
            supplies.length == prices.length && prices.length == windowCaps.length,
            "Length mismatch"
        );
        delete batchConfigs;
        batchCount = supplies.length;
        for (uint256 i = 0; i < supplies.length; i++) {
            batchConfigs.push(BatchConfig(supplies[i], prices[i], windowCaps[i]));
        }
        emit AllBatchConfigsUpdated(batchCount);
    }

    // ── Always-open mint gate (Token compat) ──────────────────────────────

    /// @notice Always returns true. Minting is always open.
    ///         Per-player rate limiting happens in recordMint().
    function isWindowOpen() external pure returns (bool) {
        return true;
    }

    // ── Per-player mint info (frontend reads this) ────────────────────────

    function canPlayerMint(address player) external view returns (bool) {
        PlayerMintState storage s = playerState[player];

        // Check cycle cooldown (skip if cooldown expired)
        if (s.cooldownUntil > 0 && block.timestamp < s.cooldownUntil) return false;

        // Check daily cap (skip if period expired)
        if (s.dailyPeriodStart > 0 && block.timestamp < s.dailyPeriodStart + dailyPeriod) {
            if (s.dailyMints >= dailyCap) return false;
        }

        return true;
    }

    function playerMintInfo(address player) external view returns (
        bool    canMint,
        uint256 mintedThisCycle,
        uint256 cycleCap,
        uint256 cooldownUntil,
        uint256 mintsRemaining,
        uint256 playerDailyMints,
        uint256 dailyCapValue,
        uint256 dailyResetsAt
    ) {
        PlayerMintState storage s = playerState[player];

        bool onCooldown = s.cooldownUntil > 0 && block.timestamp < s.cooldownUntil;
        bool dailyExpired = s.dailyPeriodStart == 0 || block.timestamp >= s.dailyPeriodStart + dailyPeriod;
        bool cooldownExpired = s.cooldownUntil > 0 && block.timestamp >= s.cooldownUntil;

        // Effective cycle mints (0 if cooldown expired)
        uint256 effectiveCycleMints = (cooldownExpired || s.cooldownUntil == 0) && !onCooldown
            ? 0  // cycle resets when cooldown expires
            : s.cycleMints;
        // But if never been on cooldown and has mints, show actual
        if (s.cooldownUntil == 0) effectiveCycleMints = s.cycleMints;

        uint256 effectiveDailyMints = dailyExpired ? 0 : s.dailyMints;
        bool dailyCapHit = !dailyExpired && effectiveDailyMints >= dailyCap;

        canMint = !onCooldown && !dailyCapHit;
        mintedThisCycle = effectiveCycleMints;
        cycleCap = perCycleCap;
        cooldownUntil = onCooldown ? s.cooldownUntil : 0;

        uint256 cycleRemaining = perCycleCap > effectiveCycleMints ? perCycleCap - effectiveCycleMints : 0;
        uint256 dailyRemaining = dailyCap > effectiveDailyMints ? dailyCap - effectiveDailyMints : 0;
        mintsRemaining = cycleRemaining < dailyRemaining ? cycleRemaining : dailyRemaining;
        if (onCooldown || dailyCapHit) mintsRemaining = 0;

        playerDailyMints = effectiveDailyMints;
        dailyCapValue = dailyCap;
        dailyResetsAt = (!dailyExpired && s.dailyPeriodStart > 0)
            ? s.dailyPeriodStart + dailyPeriod
            : 0;
    }

    // ── Record mint (called by Token contract) ────────────────────────────

    function recordMint(address player, uint256 quantity) external {
        require(msg.sender == tokenContract, "Only token contract");

        PlayerMintState storage s = playerState[player];

        // 1. Reset daily period if expired (or first mint ever)
        if (s.dailyPeriodStart == 0 || block.timestamp >= s.dailyPeriodStart + dailyPeriod) {
            s.dailyPeriodStart = block.timestamp;
            s.dailyMints = 0;
            s.cycleMints = 0;
            s.cooldownUntil = 0;
            s.cycleStartedAt = 0;
        }

        // 2. Auto-reset cycle after cooldownDuration of inactivity
        if (s.cycleStartedAt > 0 && block.timestamp >= s.cycleStartedAt + cooldownDuration) {
            s.cycleMints = 0;
            s.cooldownUntil = 0;
            s.cycleStartedAt = 0;
        }

        // 3. Reset cycle if cooldown has expired (cap-triggered cooldown)
        if (s.cooldownUntil > 0 && block.timestamp >= s.cooldownUntil) {
            s.cycleMints = 0;
            s.cooldownUntil = 0;
            s.cycleStartedAt = 0;
        }

        // 4. Reject if still on cooldown
        require(s.cooldownUntil == 0, "Player on cooldown");

        // 5. Start cycle timer on first mint of a new cycle
        if (s.cycleStartedAt == 0) {
            s.cycleStartedAt = block.timestamp;
        }

        // 4. Enforce daily cap
        require(s.dailyMints + quantity <= dailyCap, "Daily mint cap reached");

        // 5. Enforce cycle cap
        require(s.cycleMints + quantity <= perCycleCap, "Cycle mint cap reached");

        // 6. Update counters
        s.cycleMints += quantity;
        s.dailyMints += quantity;
        batches[currentBatch].totalMinted += quantity;

        // 7. Trigger cooldown if cycle cap reached
        if (s.cycleMints >= perCycleCap) {
            s.cooldownUntil = block.timestamp + cooldownDuration;
            emit CooldownStarted(player, s.cooldownUntil);
        }

        // 8. Check daily cap
        if (s.dailyMints >= dailyCap) {
            emit DailyCapReached(player, s.dailyPeriodStart + dailyPeriod);
        }

        // 9. Batch advancement
        _checkBatchAdvancement();
    }

    function unreserveMint(address player, uint256 quantity) external {
        require(msg.sender == tokenContract, "Only token contract");
        PlayerMintState storage s = playerState[player];
        s.cycleMints = s.cycleMints >= quantity ? s.cycleMints - quantity : 0;
        s.dailyMints = s.dailyMints >= quantity ? s.dailyMints - quantity : 0;
        if (s.cycleMints < perCycleCap && s.cooldownUntil > 0) {
            s.cooldownUntil = 0;
        }
    }

    // ── Batch advancement ─────────────────────────────────────────────────

    function _checkBatchAdvancement() internal {
        if (currentBatch >= batchCount) return;
        Batch storage batch = batches[currentBatch];
        if (batch.totalMinted >= batchSupply(currentBatch)) {
            currentBatch++;
            batches[currentBatch] = Batch({
                id:          currentBatch,
                startDay:    0,
                totalMinted: 0
            });
            emit BatchAdvanced(currentBatch, block.timestamp);
        }
    }

    // ── Legacy compat: getWindowInfo (Token/frontend may still call) ──────

    function getWindowInfo() external view returns (
        bool isOpen,
        uint256 day,
        uint256 openAt,
        uint256 closeAt,
        uint256 allocated,
        uint256 minted,
        uint256 remaining,
        uint256 rollover
    ) {
        isOpen = true;
        day = 0;
        openAt = 0;
        closeAt = 0;
        allocated = 0;
        minted = batches[currentBatch].totalMinted;
        remaining = 0;
        rollover = 0;
    }

    // ── Legacy compat: perUserDayCap (returns dailyCap) ───────────────────

    function perUserDayCap() external view returns (uint256) {
        return dailyCap;
    }

    // ── Legacy compat: currentDay (returns UTC day number) ─────────────────

    function currentDay() external view returns (uint256) {
        return block.timestamp / 86400;
    }

    // ── Legacy compat: userDayMints (returns player's daily mints) ────────

    function userDayMints(uint256, address player) external view returns (uint256) {
        PlayerMintState storage s = playerState[player];
        if (s.dailyPeriodStart == 0 || block.timestamp >= s.dailyPeriodStart + dailyPeriod) {
            return 0;
        }
        return s.dailyMints;
    }
}
