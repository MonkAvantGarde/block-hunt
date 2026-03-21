// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IBlockHuntTokenMint {
    function resetDailyWindow(uint256 newDay) external;
}

contract BlockHuntMintWindow is Ownable {

    uint256 public constant WINDOW_DURATION = 3 hours;
    uint256 public constant MIN_WINDOW_GAP = 4 hours;

    // ── Configurable batch structure ──────────────────────────────────────
    struct BatchConfig {
        uint256 supply;
        uint256 price;      // in wei
        uint256 windowCap;
    }

    uint256 public batchCount = 10;
    BatchConfig[] public batchConfigs;

    event BatchConfigUpdated(uint256 indexed batchIndex, uint256 supply, uint256 price, uint256 windowCap);
    event AllBatchConfigsUpdated(uint256 batchCount);
    event KeeperUpdated(address indexed keeper);
    event WindowCapReset();

    // ── Keeper role ─────────────────────────────────────────────────────

    address public keeper;

    modifier onlyOwnerOrKeeper() {
        require(msg.sender == owner() || msg.sender == keeper, "Not authorized");
        _;
    }

    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
        emit KeeperUpdated(_keeper);
    }

    // ── Existing state ────────────────────────────────────────────────────

    address public tokenContract;

    struct Window {
        uint256 day;
        uint256 openAt;
        uint256 closeAt;
        uint256 allocated;
        uint256 minted;
        bool settled;
    }

    struct Batch {
        uint256 id;
        uint256 startDay;
        uint256 totalMinted;
    }

    mapping(uint256 => Window) public windows;
    mapping(uint256 => Batch) public batches;
    mapping(uint256 => mapping(address => uint256)) public userDayMints;

    uint256 public currentDay;
    uint256 public rolloverSupply;
    uint256 public currentBatch;
    uint256 public perUserDayCap = 500;

    bool public testModeEnabled = true;

    event WindowOpened(uint256 indexed day, uint256 openAt, uint256 closeAt, uint256 allocated);
    event WindowClosed(uint256 indexed day, uint256 minted, uint256 rollover);
    event BatchAdvanced(uint256 indexed newBatch, uint256 day);

    constructor() Ownable(msg.sender) {
        currentBatch = 1;
        batches[1] = Batch({ id: 1, startDay: 1, totalMinted: 0 });

        // Initialize 10 batches — 25% geometric growth, total 3,324,000
        // Window cap = batchSupply / 3 (three windows per day), rounded to nearest 1K
        batchConfigs.push(BatchConfig(100_000,  0.00008 ether,  33_000));  // B1
        batchConfigs.push(BatchConfig(125_000,  0.00012 ether,  42_000));  // B2
        batchConfigs.push(BatchConfig(156_000,  0.00020 ether,  52_000));  // B3
        batchConfigs.push(BatchConfig(195_000,  0.00032 ether,  65_000));  // B4
        batchConfigs.push(BatchConfig(244_000,  0.00056 ether,  81_000));  // B5
        batchConfigs.push(BatchConfig(305_000,  0.00100 ether, 102_000));  // B6
        batchConfigs.push(BatchConfig(381_000,  0.00180 ether, 127_000));  // B7
        batchConfigs.push(BatchConfig(477_000,  0.00320 ether, 159_000));  // B8
        batchConfigs.push(BatchConfig(596_000,  0.00520 ether, 199_000));  // B9
        batchConfigs.push(BatchConfig(745_000,  0.00800 ether, 248_000));  // B10
    }

    // ── Config read functions (replace old hardcoded functions) ────────────

    function batchSupply(uint256 batch) public view returns (uint256) {
        require(batch >= 1 && batch <= batchCount, "Invalid batch");
        return batchConfigs[batch - 1].supply;
    }

    function windowCapForBatch(uint256 batch) public view returns (uint256) {
        require(batch >= 1 && batch <= batchCount, "Invalid batch");
        return batchConfigs[batch - 1].windowCap;
    }

    function batchPrice(uint256 batch) public view returns (uint256) {
        require(batch >= 1 && batch <= batchCount, "Invalid batch");
        return batchConfigs[batch - 1].price;
    }

    // ── Config setters (test mode only) ───────────────────────────────────

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

    // ── Admin ─────────────────────────────────────────────────────────────

    function setTokenContract(address addr) external onlyOwner { tokenContract = addr; }
    function setPerUserDayCap(uint256 cap) external onlyOwner { perUserDayCap = cap; }
    function disableTestMode() external onlyOwner { testModeEnabled = false; }

    function resetWindowCap() external onlyOwner {
        rolloverSupply = 0;
        emit WindowCapReset();
    }

    // ── Window management ─────────────────────────────────────────────────

    function openWindow() external onlyOwnerOrKeeper {
        if (currentDay > 0) {
            require(
                block.timestamp >= windows[currentDay].openAt + MIN_WINDOW_GAP,
                "Too early for next window"
            );
        }

        Window storage prev = windows[currentDay];
        if (prev.openAt > 0 && !prev.settled) {
            _closeWindow(currentDay);
        }

        currentDay++;
        uint256 allocated = windowCapForBatch(currentBatch) + rolloverSupply;
        rolloverSupply = 0;

        windows[currentDay] = Window({
            day: currentDay,
            openAt: block.timestamp,
            closeAt: block.timestamp + WINDOW_DURATION,
            allocated: allocated,
            minted: 0,
            settled: false
        });

        if (tokenContract != address(0)) {
            IBlockHuntTokenMint(tokenContract).resetDailyWindow(currentDay);
        }

        _checkBatchAdvancement();
        emit WindowOpened(currentDay, block.timestamp, block.timestamp + WINDOW_DURATION, allocated);
    }

    function forceOpenWindow() external onlyOwner {
        require(testModeEnabled, "Test mode disabled");

        Window storage prev = windows[currentDay];
        if (prev.openAt > 0 && !prev.settled) {
            _closeWindow(currentDay);
        }

        currentDay++;
        uint256 allocated = windowCapForBatch(currentBatch) + rolloverSupply;
        rolloverSupply = 0;

        windows[currentDay] = Window({
            day: currentDay,
            openAt: block.timestamp,
            closeAt: block.timestamp + WINDOW_DURATION,
            allocated: allocated,
            minted: 0,
            settled: false
        });

        if (tokenContract != address(0)) {
            IBlockHuntTokenMint(tokenContract).resetDailyWindow(currentDay);
        }

        _checkBatchAdvancement();
        emit WindowOpened(currentDay, block.timestamp, block.timestamp + WINDOW_DURATION, allocated);
    }

    function closeWindow() external {
        Window storage w = windows[currentDay];
        require(w.openAt > 0, "No window exists");
        require(block.timestamp > w.closeAt, "Window still active");
        _closeWindow(currentDay);
    }

    function _closeWindow(uint256 day) internal {
        Window storage w = windows[day];
        require(!w.settled, "Already settled");
        w.settled = true;
        uint256 unused = w.allocated > w.minted ? w.allocated - w.minted : 0;
        rolloverSupply += unused;
        emit WindowClosed(day, w.minted, unused);
    }

    function _checkBatchAdvancement() internal {
        if (currentBatch >= batchCount) return;
        Batch storage batch = batches[currentBatch];
        if (batch.totalMinted >= batchSupply(currentBatch)) {
            currentBatch++;
            batches[currentBatch] = Batch({
                id:          currentBatch,
                startDay:    currentDay,
                totalMinted: 0
            });
            emit BatchAdvanced(currentBatch, currentDay);
        }
    }

    function isWindowOpen() external view returns (bool) {
        Window storage w = windows[currentDay];
        return (
            w.openAt > 0 &&
            block.timestamp >= w.openAt &&
            block.timestamp <= w.closeAt &&
            !w.settled &&
            w.minted < w.allocated
        );
    }

    function recordMint(address player, uint256 quantity) external {
        require(msg.sender == tokenContract, "Only token contract");
        require(
            userDayMints[currentDay][player] + quantity <= perUserDayCap,
            "Per-user window cap reached"
        );

        Window storage w = windows[currentDay];
        w.minted += quantity;
        batches[currentBatch].totalMinted += quantity;
        userDayMints[currentDay][player] += quantity;
        _checkBatchAdvancement();
    }

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
        Window storage w = windows[currentDay];
        isOpen = this.isWindowOpen();
        day = currentDay;
        openAt = w.openAt;
        closeAt = w.closeAt;
        allocated = w.allocated;
        minted = w.minted;
        remaining = allocated > minted ? allocated - minted : 0;
        rollover = rolloverSupply;
    }
}
