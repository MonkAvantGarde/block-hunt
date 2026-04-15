// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract BlockHuntTreasury is Ownable, ReentrancyGuard {

    address public tokenContract;
    address public creatorWallet;
    address public escrowContract;   // [CHANGED] was countdownContract — receives 100% on sacrifice

    bool public testModeEnabled = true;

    uint256 public creatorFeeBps = 2000;
    uint256 public constant MIN_CREATOR_FEE = 500;   // 5% floor
    uint256 public constant MAX_CREATOR_FEE = 3000;

    uint256 public season;
    uint256 public totalDeposited;
    uint256 public totalPaidOut;
    uint256 public nextSeasonSeed;

    event CreatorFeeUpdated(uint256 oldBps, uint256 newBps);
    event FundsReceived(address indexed from, uint256 amount, uint256 creatorFee);
    event TreasuryClaimed(address indexed winner, uint256 amount, uint256 season);
    // [CHANGED] totalAmount now goes to Escrow (was Countdown)
    event TreasurySacrificed(address indexed winner, uint256 totalAmount, uint256 season);
    event SeasonReset(uint256 newSeason, uint256 seedAmount);

    constructor(address creatorWallet_) Ownable(msg.sender) {
        creatorWallet = creatorWallet_;
        season = 1;
    }

    modifier onlyTokenContract() {
        require(msg.sender == tokenContract, "Only token contract");
        _;
    }

    function setTokenContract(address addr) external onlyOwner {
        require(tokenContract == address(0) || testModeEnabled, "Already set");
        tokenContract = addr;
    }

    function disableTestMode() external onlyOwner {
        testModeEnabled = false;
    }

    // [CHANGED] was setCountdownContract — now points to Escrow
    function setEscrowContract(address addr) external onlyOwner {
        require(addr != address(0), "Invalid address");
        escrowContract = addr;
    }

    function setCreatorWallet(address addr) external onlyOwner {
        require(addr != address(0), "Invalid address");
        creatorWallet = addr;
    }

    function setCreatorFee(uint256 bps) external onlyOwner {
        require(bps >= MIN_CREATOR_FEE, "Below minimum");
        require(bps <= MAX_CREATOR_FEE, "Exceeds max");
        emit CreatorFeeUpdated(creatorFeeBps, bps);
        creatorFeeBps = bps;
    }

    function receiveMintFunds() external payable onlyTokenContract {
        require(msg.value > 0, "No funds sent");

        uint256 creatorFee = (msg.value * creatorFeeBps) / 10000;
        uint256 treasuryAmount = msg.value - creatorFee;

        if (creatorFee > 0 && creatorWallet != address(0)) {
            (bool paid, ) = payable(creatorWallet).call{value: creatorFee}("");
            require(paid, "Creator fee failed");
        }

        totalDeposited += treasuryAmount;
        emit FundsReceived(msg.sender, treasuryAmount, creatorFee);
    }

    function claimPayout(address winner) external onlyTokenContract nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "Empty treasury");
        totalPaidOut += balance;
        (bool sent, ) = payable(winner).call{value: balance}("");
        require(sent, "Payout failed");
        emit TreasuryClaimed(winner, balance, season);
    }

    /**
     * @notice Transfers the full treasury balance to BlockHuntEscrow, which
     *         performs the 50/40/10 split: 50% to winner immediately, 40% held
     *         as the community leaderboard pool, 10% held as Season 2 seed.
     *         Called by BlockHuntToken during sacrifice execution.
     */
    function sacrificePayout(address winner) external onlyTokenContract nonReentrant {
        require(escrowContract != address(0), "Escrow contract not set");
        uint256 balance = address(this).balance;
        require(balance > 0, "Empty treasury");

        totalPaidOut += balance;

        // [CHANGED] Send to Escrow (was Countdown)
        (bool sent, ) = payable(escrowContract).call{value: balance}("");
        require(sent, "Transfer to escrow failed");

        emit TreasurySacrificed(winner, balance, season);
    }

    function startNextSeason() external onlyOwner {
        season++;
        uint256 seed = nextSeasonSeed;
        nextSeasonSeed = 0;
        totalDeposited = seed;
        totalPaidOut = 0;
        emit SeasonReset(season, seed);
    }

    function treasuryBalance() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {}
}
