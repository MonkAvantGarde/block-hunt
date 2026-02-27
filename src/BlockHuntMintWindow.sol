// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IBlockHuntTokenMint {
    function resetDailyWindow(uint256 newDay) external;
}

contract BlockHuntMintWindow is Ownable {

    uint256 public constant BASE_DAILY_CAP  = 50_000;
    uint256 public constant WINDOW_DURATION = 8 hours;

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
        uint256 endDay;
        uint256 totalMinted;
    }

    mapping(uint256 => Window) public windows;
    mapping(uint256 => Batch) public batches;
    mapping(uint256 => mapping(address => uint256)) public userDayMints;

    uint256 public currentDay;
    uint256 public rolloverSupply;
    uint256 public currentBatch;
    uint256 public perUserDayCap = 500;

    uint256 public constant BATCH_DURATION_DAYS = 30;
    uint256 public constant TOTAL_BATCHES = 6;

    event WindowOpened(uint256 indexed day, uint256 openAt, uint256 closeAt, uint256 allocated);
    event WindowClosed(uint256 indexed day, uint256 minted, uint256 rollover);
    event BatchAdvanced(uint256 indexed newBatch, uint256 day);

    constructor() Ownable(msg.sender) {
        currentBatch = 1;
        batches[1] = Batch({ id: 1, startDay: 1, endDay: 30, totalMinted: 0 });
    }

    function setTokenContract(address addr) external onlyOwner { tokenContract = addr; }
    function setPerUserDayCap(uint256 cap) external onlyOwner { perUserDayCap = cap; }

    function openWindow() external onlyOwner {
        Window storage prev = windows[currentDay];
        if (prev.openAt > 0 && !prev.settled) {
            _closeWindow(currentDay);
        }

        currentDay++;
        uint256 allocated = BASE_DAILY_CAP + rolloverSupply;
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

    function closeWindow() external onlyOwner {
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
        Batch storage batch = batches[currentBatch];
        if (currentDay > batch.endDay && currentBatch < TOTAL_BATCHES) {
            currentBatch++;
            batches[currentBatch] = Batch({
                id: currentBatch,
                startDay: currentDay,
                endDay: currentDay + BATCH_DURATION_DAYS - 1,
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
        Window storage w = windows[currentDay];
        w.minted += quantity;
        batches[currentBatch].totalMinted += quantity;
        userDayMints[currentDay][player] += quantity;
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