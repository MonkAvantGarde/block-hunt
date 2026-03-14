// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IBlockHuntTokenMint {
    function resetDailyWindow(uint256 newDay) external;
}

contract BlockHuntMintWindow is Ownable {

    uint256 public constant WINDOW_DURATION = 3 hours;
    uint256 public constant TOTAL_BATCHES   = 6;

    // Minimum time between window opens. Three windows/day at 10:00, 18:00,
    // and 02:00 UTC = 8/8/8 hours apart. 4-hour guard gives 1-hour buffer
    // against the shortest real gap (5 hours after a 3-hour window).
    uint256 public constant MIN_WINDOW_GAP = 4 hours;

    function batchSupply(uint256 batch) public pure returns (uint256) {
        if (batch == 1) return 500_000;
        if (batch == 2) return 500_000;
        if (batch == 3) return 1_000_000;
        if (batch == 4) return 2_000_000;
        if (batch == 5) return 4_000_000;
        if (batch == 6) return 2_000_000;
        return 2_000_000;
    }

    function windowCapForBatch(uint256 batch) public pure returns (uint256) {
        if (batch <= 2) return 16_666;
        if (batch == 3) return 33_333;
        if (batch == 4) return 66_666;
        if (batch == 5) return 133_333;
        return 66_666;
    }

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
    }

    function setTokenContract(address addr) external onlyOwner { tokenContract = addr; }
    function setPerUserDayCap(uint256 cap) external onlyOwner { perUserDayCap = cap; }
    function disableTestMode() external onlyOwner { testModeEnabled = false; }

    /**
     * @notice Opens a new mint window. Settles the previous window if needed.
     *
     * [CHANGED] Removed onlyOwner — now permissionless with a time guard.
     * A Gelato keeper calls this every 12 hours on schedule. If the keeper
     * is down, any community member can call it instead.
     *
     * Guard: at least MIN_WINDOW_GAP (12 hours) since the last window opened.
     * First window (currentDay == 0) has no time guard so deployment works.
     */
    function openWindow() external {
        // Time guard: prevent windows from being opened too frequently
        if (currentDay > 0) {
            require(
                block.timestamp >= windows[currentDay].openAt + MIN_WINDOW_GAP,
                "Too early for next window"
            );
        }

        // Settle previous window if still open
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

    /**
     * @notice Owner-only: force open a mint window, bypassing time guard.
     * @dev Only works when testModeEnabled is true. Will be disabled before mainnet
     *      along with mintForTest. Respects all other window logic (duration, caps, etc).
     */
    function forceOpenWindow() external onlyOwner {
        require(testModeEnabled, "Test mode disabled");

        // Settle previous window if still open
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

    /**
     * @notice Explicitly settle a window after it has expired.
     *
     * [CHANGED] Removed onlyOwner — permissionless but only works after the
     * window's closeAt time has passed. Useful for triggering rollover
     * accounting without waiting for the next openWindow() call.
     *
     * Not strictly necessary (openWindow auto-settles), but keeps state clean.
     */
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
        if (currentBatch >= TOTAL_BATCHES) return;
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

    /**
     * [FIX H2] Added per-user cap enforcement. Previously perUserDayCap was
     * tracked in userDayMints but never checked — a single wallet could mint
     * the entire window allocation via repeated 500-block transactions.
     */
    function recordMint(address player, uint256 quantity) external {
        require(msg.sender == tokenContract, "Only token contract");

        // [FIX H2] Enforce per-user window cap
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
