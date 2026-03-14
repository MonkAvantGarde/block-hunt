// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║          THE BLOCK HUNT — COUNTDOWN CONTRACT                 ║
 * ║                                                              ║
 * ║  Pure game logic: 7-day timer, community vote, holder check. ║
 * ║  No ETH flows through this contract.                         ║
 * ║                                                              ║
 * ║  Financial logic (50/40/10 split, claims, sweep) lives in    ║
 * ║  BlockHuntEscrow — a separate, dedicated custodial contract. ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

interface IBlockHuntTokenCountdown {
    function hasAllTiers(address player) external view returns (bool);
    function balancesOf(address player) external view returns (uint256[8] memory);
    function resetExpiredHolder() external;
    function updateCountdownHolder(address newHolder) external;
}

contract BlockHuntCountdown is Ownable {

    uint256 public constant COUNTDOWN_DURATION = 7 days;

    address public tokenContract;

    uint256 public countdownStartTime;
    address public currentHolder;
    bool    public isActive;

    uint256 public votesBurn;
    uint256 public votesClaim;
    uint256 public countdownRound;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    uint256 public season;

    // ── Challenge mechanic ───────────────────────────────────────────────────
    uint256 public holderScore;
    uint256 public lastChallengeTime;
    uint256 public constant CHALLENGE_COOLDOWN = 24 hours;

    // Scoring weights — compressed exponential based on tier economic cost
    uint256 public constant WEIGHT_T2 = 10000;
    uint256 public constant WEIGHT_T3 = 2000;
    uint256 public constant WEIGHT_T4 = 500;
    uint256 public constant WEIGHT_T5 = 100;
    uint256 public constant WEIGHT_T6 = 20;
    uint256 public constant WEIGHT_T7 = 1;

    // ── Events ──────────────────────────────────────────────────────────────
    event CountdownStarted(address indexed holder, uint256 startTime, uint256 endTime);
    event CountdownEnded(address indexed formerHolder);
    event VoteCast(address indexed voter, bool burnVote);
    event CountdownReset(address indexed formerHolder);
    event CountdownChallenged(
        address indexed challenger,
        uint256 challengerScore,
        address indexed previousHolder,
        uint256 previousHolderScore,
        bool success
    );
    event CountdownShifted(
        address indexed newHolder,
        address indexed previousHolder,
        uint256 newScore,
        uint256 timestamp
    );

    constructor() Ownable(msg.sender) {
        season = 1;
    }

    function setTokenContract(address addr) external onlyOwner { tokenContract = addr; }

    // ── SCORING ──────────────────────────────────────────────────────────────

    /**
     * @notice Calculate a player's weighted score based on tier balances.
     * @dev Reads balances from Token contract. T1 (Origin) excluded.
     *      Score = (T2 × 10,000) + (T3 × 2,000) + (T4 × 500) + (T5 × 100) + (T6 × 20) + (T7 × 1)
     */
    function calculateScore(address player) public view returns (uint256) {
        uint256[8] memory bals = IBlockHuntTokenCountdown(tokenContract).balancesOf(player);
        return bals[2] * WEIGHT_T2
             + bals[3] * WEIGHT_T3
             + bals[4] * WEIGHT_T4
             + bals[5] * WEIGHT_T5
             + bals[6] * WEIGHT_T6
             + bals[7] * WEIGHT_T7;
    }

    // ── Called by BlockHuntToken when a player triggers the countdown ─────────

    function startCountdown(address holder) external {
        require(msg.sender == tokenContract, "Only token contract");
        require(!isActive, "Countdown already active");

        isActive           = true;
        currentHolder      = holder;
        countdownStartTime = block.timestamp;
        votesBurn          = 0;
        votesClaim         = 0;
        holderScore        = calculateScore(holder);
        lastChallengeTime  = block.timestamp;

        emit CountdownStarted(holder, block.timestamp, block.timestamp + COUNTDOWN_DURATION);
    }

    // ── CHALLENGE ─────────────────────────────────────────────────────────────

    /**
     * @notice Challenge the current countdown holder. If the challenger holds
     *         all 6 tiers AND has a strictly higher live score, the countdown
     *         resets to 7 days under the challenger.
     */
    function challengeCountdown() external {
        require(isActive, "No active countdown");
        require(msg.sender != currentHolder, "Holder cannot self-challenge");

        IBlockHuntTokenCountdown token = IBlockHuntTokenCountdown(tokenContract);
        require(token.hasAllTiers(msg.sender), "Must hold all 6 tiers");

        require(
            block.timestamp >= lastChallengeTime + CHALLENGE_COOLDOWN,
            "Challenge cooldown active"
        );

        uint256 challengerScore = calculateScore(msg.sender);
        uint256 currentHolderScore = calculateScore(currentHolder);
        require(challengerScore > currentHolderScore, "Score not high enough");

        address oldHolder = currentHolder;
        uint256 oldScore = currentHolderScore;

        // Update Countdown state
        currentHolder     = msg.sender;
        holderScore       = challengerScore;
        lastChallengeTime = block.timestamp;
        countdownStartTime = block.timestamp;

        // Sync Token state — updates countdownHolder + countdownStartTime on Token
        token.updateCountdownHolder(msg.sender);

        emit CountdownChallenged(msg.sender, challengerScore, oldHolder, oldScore, true);
        emit CountdownShifted(msg.sender, oldHolder, challengerScore, block.timestamp);
    }

    /**
     * @notice Called by BlockHuntToken after any endgame execution
     *         (claim, sacrifice, or default sacrifice).
     *         Resets this contract's state so it accurately reflects reality.
     */
    function syncReset() external {
        require(msg.sender == tokenContract, "Only token contract");
        address former = currentHolder;
        _resetCountdown();
        emit CountdownEnded(former);
    }

    /**
     * @notice Called by anyone (typically Gelato keeper) to check whether the
     *         countdown holder still qualifies. If they transferred away a
     *         required tier, resets the countdown so a new holder can start.
     */
    function checkHolderStatus() external {
        if (!isActive) return;
        bool stillHolds = IBlockHuntTokenCountdown(tokenContract).hasAllTiers(currentHolder);
        if (!stillHolds) {
            address former = currentHolder;
            _resetCountdown();
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
        require(!hasVoted[countdownRound][msg.sender], "Already voted");
        hasVoted[countdownRound][msg.sender] = true;
        if (burnVote) {
            votesBurn++;
        } else {
            votesClaim++;
        }
        emit VoteCast(msg.sender, burnVote);
    }

    // ── VIEW HELPERS ────────────────────────────────────────────────────────

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

    // ── INTERNAL ────────────────────────────────────────────────────────────

    function _resetCountdown() internal {
        isActive           = false;
        currentHolder      = address(0);
        countdownStartTime = 0;
        votesBurn          = 0;
        votesClaim         = 0;
        holderScore        = 0;
        lastChallengeTime  = 0;
        countdownRound++;
    }
}
