// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IBlockHuntToken {
    function hasAllTiers(address player) external view returns (bool);
}

contract BlockHuntCountdown is Ownable {

    uint256 public constant COUNTDOWN_DURATION = 7 days;

    address public tokenContract;

    uint256 public countdownStartTime;
    address public currentHolder;
    bool public isActive;

    uint256 public votesBurn;
    uint256 public votesClaim;
    mapping(address => bool) public hasVoted;

    uint256 public season;

    event CountdownStarted(address indexed holder, uint256 startTime, uint256 endTime);
    event VoteCast(address indexed voter, bool burnVote);
    event CountdownReset(address indexed formerHolder);

    constructor() Ownable(msg.sender) {
        season = 1;
    }

    function setTokenContract(address addr) external onlyOwner { tokenContract = addr; }

    function startCountdown(address holder) external {
        require(msg.sender == tokenContract, "Only token contract");
        require(!isActive, "Countdown already active");

        isActive = true;
        currentHolder = holder;
        countdownStartTime = block.timestamp;
        votesBurn = 0;
        votesClaim = 0;

        emit CountdownStarted(holder, block.timestamp, block.timestamp + COUNTDOWN_DURATION);
    }

    function checkHolderStatus() external {
        if (!isActive) return;
        bool stillHolds = IBlockHuntToken(tokenContract).hasAllTiers(currentHolder);
        if (!stillHolds) {
            address former = currentHolder;
            _resetCountdown();
            emit CountdownReset(former);
        }
    }

    function _resetCountdown() internal {
        isActive = false;
        currentHolder = address(0);
        countdownStartTime = 0;
        votesBurn = 0;
        votesClaim = 0;
    }

    function castVote(bool burnVote) external {
        require(isActive, "No active countdown");
        require(!hasVoted[msg.sender], "Already voted");
        hasVoted[msg.sender] = true;
        if (burnVote) {
            votesBurn++;
        } else {
            votesClaim++;
        }
        emit VoteCast(msg.sender, burnVote);
    }

    function timeRemaining() external view returns (uint256) {
        if (!isActive) return 0;
        uint256 endTime = countdownStartTime + COUNTDOWN_DURATION;
        if (block.timestamp >= endTime) return 0;
        return endTime - block.timestamp;
    }

    function hasExpired() external view returns (bool) {
        if (!isActive) return false;
        return block.timestamp >= countdownStartTime + COUNTDOWN_DURATION;
    }

    function getCountdownInfo() external view returns (
        bool active,
        address holder,
        uint256 startTime,
        uint256 endTime,
        uint256 remaining,
        uint256 burnVotes,
        uint256 claimVotes
    ) {
        active = isActive;
        holder = currentHolder;
        startTime = countdownStartTime;
        endTime = isActive ? countdownStartTime + COUNTDOWN_DURATION : 0;
        remaining = this.timeRemaining();
        burnVotes = votesBurn;
        claimVotes = votesClaim;
    }
}