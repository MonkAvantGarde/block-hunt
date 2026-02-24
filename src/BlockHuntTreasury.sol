// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract BlockHuntTreasury is Ownable, ReentrancyGuard {

    address public tokenContract;
    address public creatorWallet;

    uint256 public creatorFeeBps = 500;
    uint256 public constant MAX_CREATOR_FEE = 1000;

    uint256 public season;
    uint256 public totalDeposited;
    uint256 public totalPaidOut;
    uint256 public nextSeasonSeed;

    event FundsReceived(address indexed from, uint256 amount, uint256 creatorFee);
    event TreasuryClaimed(address indexed winner, uint256 amount, uint256 season);
    event TreasurySacrificed(address indexed winner, uint256 winnerAmount, uint256 seedAmount, uint256 season);
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
    require(tokenContract == address(0), "Already set");
    tokenContract = addr;
    }
    function setCreatorWallet(address addr) external onlyOwner {
        require(addr != address(0), "Invalid address");
        creatorWallet = addr;
    }
    function setCreatorFee(uint256 bps) external onlyOwner {
        require(bps <= MAX_CREATOR_FEE, "Exceeds max fee");
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

    function sacrificePayout(address winner) external onlyTokenContract nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "Empty treasury");

        uint256 winnerShare = balance / 2;
        uint256 seedShare = balance - winnerShare;

        totalPaidOut += winnerShare;
        nextSeasonSeed = seedShare;

        (bool sent, ) = payable(winner).call{value: winnerShare}("");
        require(sent, "Payout failed");

        emit TreasurySacrificed(winner, winnerShare, seedShare, season);
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

    function emergencyWithdraw(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid address");
        (bool sent, ) = payable(to).call{value: amount}("");
        require(sent, "Transfer failed");
    }

    receive() external payable {}
}
