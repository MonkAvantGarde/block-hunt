// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IBlockHuntTokenCountdown {
    function hasAllTiers(address player) external view returns (bool);
      // SESSION 3: called when this contract disqualifies a holder mid-countdown
    function resetExpiredHolder() external;
}

contract BlockHuntCountdown is Ownable {

    uint256 public constant COUNTDOWN_DURATION = 7 days;

    address public tokenContract;

    uint256 public countdownStartTime;
    address public currentHolder;
    bool    public isActive;

    uint256 public votesBurn;
    uint256 public votesClaim;
    mapping(address => bool) public hasVoted;

    uint256 public season;

    event CountdownStarted(address indexed holder, uint256 startTime, uint256 endTime);
    event CountdownEnded(address indexed formerHolder);
    event VoteCast(address indexed voter, bool burnVote);
    event CountdownReset(address indexed formerHolder);

    constructor() Ownable(msg.sender) {
        season = 1;
    }

    function setTokenContract(address addr) external onlyOwner { tokenContract = addr; }

    /**
     * @notice Called by BlockHuntToken when a player triggers the countdown.
     *         Records the holder and start time for the community vote UI.
     */
    function startCountdown(address holder) external {
        require(msg.sender == tokenContract, "Only token contract");
        require(!isActive, "Countdown already active");

        isActive           = true;
        currentHolder      = holder;
        countdownStartTime = block.timestamp;
        votesBurn          = 0;
        votesClaim         = 0;

        emit CountdownStarted(holder, block.timestamp, block.timestamp + COUNTDOWN_DURATION);
    }

    /**
     * @notice Called by BlockHuntToken after any endgame execution
     *         (claim, sacrifice, or default sacrifice).
     *         Resets this contract's state so it accurately reflects reality.
     *         Fixes the pre-existing bug where isActive stayed true permanently
     *         after the game ended.
     */
    function syncReset() external {
        require(msg.sender == tokenContract, "Only token contract");
        address former = currentHolder;
        _resetCountdown();
        emit CountdownEnded(former);
    }

    /**
     * @notice Called by anyone (typically Gelato keeper) to check whether the
     *         countdown holder has sold or transferred their tiers below the threshold.
     *         If they no longer qualify, resets the countdown so a new holder can start.
     */
    function checkHolderStatus() external {
        if (!isActive) return;
        bool stillHolds = IBlockHuntTokenCountdown(tokenContract).hasAllTiers(currentHolder);
        if (!stillHolds) {
            address former = currentHolder;
            _resetCountdown();
            // SESSION 3: also reset Token's side — without this, token.countdownActive
            // stays true permanently, blocking any new countdown from ever starting.
            IBlockHuntTokenCountdown(tokenContract).resetExpiredHolder();
            emit CountdownReset(former);
        }
    }

    /**
     * @notice Community vote — any wallet can vote once per countdown.
     *         Social signal only. Does not restrict the holder's choice.
     * @param burnVote true = vote for Sacrifice, false = vote for Claim
     */
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

    // ── VIEW HELPERS ──────────────────────────────────────────────────

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
        bool    active,
        address holder,
        uint256 startTime,
        uint256 endTime,
        uint256 remaining,
        uint256 burnVotes,
        uint256 claimVotes
    ) {
        active     = isActive;
        holder     = currentHolder;
        startTime  = countdownStartTime;
        endTime    = isActive ? countdownStartTime + COUNTDOWN_DURATION : 0;
        remaining  = this.timeRemaining();
        burnVotes  = votesBurn;
        claimVotes = votesClaim;
    }

    // ── INTERNAL ──────────────────────────────────────────────────────

    function _resetCountdown() internal {
        isActive           = false;
        currentHolder      = address(0);
        countdownStartTime = 0;
        votesBurn          = 0;
        votesClaim         = 0;
    }
}
