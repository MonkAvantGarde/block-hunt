// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║          THE BLOCK HUNT — COUNTDOWN CONTRACT                 ║
 * ║                                                              ║
 * ║  Pure game logic: countdown timer, takeover, community vote. ║
 * ║  No ETH flows through this contract.                         ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

interface IBlockHuntTokenCountdown {
    function hasAllTiers(address player) external view returns (bool);
    function balancesOf(address player) external view returns (uint256[8] memory);
    function balanceOf(address account, uint256 id) external view returns (uint256);
    function resetExpiredHolder() external;
    function updateCountdownHolder(address newHolder) external;
}

contract BlockHuntCountdown is Ownable {

    // ── Configurable durations (test-mode setters below) ──────────────────
    uint256 public countdownDuration = 7 days;
    uint256 public safePeriod = 1 days;

    address public tokenContract;
    address public keeper;

    modifier onlyOwnerOrKeeper() {
        require(msg.sender == owner() || msg.sender == keeper, "Not authorized");
        _;
    }

    uint256 public countdownStartTime;
    address public currentHolder;
    bool    public isActive;

    // ── Cumulative defense (NEW-A fix + SH-1) ────────────────────────────
    uint256 public holderSince;
    mapping(address => uint256) public cumulativeDefenseTime;
    uint256 public constant REQUIRED_DEFENSE = 7 days;

    uint256 public votesBurn;
    uint256 public votesClaim;
    uint256 public countdownRound;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    uint256 public currentSeason;

    // ── Season-indexed progression (§1.8, SH-10) ─────────────────────────
    mapping(uint256 => address[]) internal _seasonPlayers;
    mapping(uint256 => mapping(address => uint256)) public seasonScore;
    mapping(uint256 => mapping(address => bool)) public isSeasonPlayer;

    event SeasonAdvanced(uint256 newSeason);
    event PlayerRecorded(uint256 season, address indexed player, uint256 totalScore);

    // ── Takeover mechanic ─────────────────────────────────────────────────
    uint256 public takeoverCount;

    bool public testModeEnabled = true;

    // ── Scoring weights — compressed exponential based on tier economic cost
    uint256 public constant WEIGHT_T2 = 10000;
    uint256 public constant WEIGHT_T3 = 2000;
    uint256 public constant WEIGHT_T4 = 500;
    uint256 public constant WEIGHT_T5 = 100;
    uint256 public constant WEIGHT_T6 = 20;
    uint256 public constant WEIGHT_T7 = 1;

    // ── For backward compat with frontend — keep holderScore/lastChallengeTime
    uint256 public holderScore;
    uint256 public lastChallengeTime;

    // ── Events ────────────────────────────────────────────────────────────
    event CountdownStarted(address indexed holder, uint256 startTime, uint256 endTime);
    event CountdownEnded(address indexed formerHolder);
    event VoteCast(address indexed voter, bool burnVote);
    event CountdownReset(address indexed formerHolder);
    event CountdownTakeover(address indexed newHolder, address indexed prevHolder, uint256 takeoverCount);
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
        currentSeason = 1;
    }

    function setTokenContract(address addr) external onlyOwner { tokenContract = addr; }

    event KeeperUpdated(address indexed keeper);

    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
        emit KeeperUpdated(_keeper);
    }

    // ── Test-mode setters ─────────────────────────────────────────────────

    function setSafePeriod(uint256 _safePeriod) external onlyOwner {
        require(testModeEnabled, "Test mode disabled");
        safePeriod = _safePeriod;
    }

    function setCountdownDuration(uint256 _duration) external onlyOwner {
        require(testModeEnabled, "Test mode disabled");
        countdownDuration = _duration;
    }

    function adminStartCountdown(address holder) external onlyOwner {
        require(testModeEnabled, "Test mode disabled");
        require(!isActive, "Countdown already active");
        require(tokenContract != address(0), "Token not set");

        isActive           = true;
        currentHolder      = holder;
        countdownStartTime = block.timestamp;
        holderSince        = block.timestamp;
        holderScore        = calculateScore(holder);
        lastChallengeTime  = block.timestamp;
        votesBurn          = 0;
        votesClaim         = 0;

        IBlockHuntTokenCountdown(tokenContract).updateCountdownHolder(holder);

        emit CountdownStarted(holder, block.timestamp, block.timestamp + countdownDuration);
    }

    function disableTestMode() external onlyOwner {
        testModeEnabled = false;
    }

    // ── SCORING ───────────────────────────────────────────────────────────

    function calculateScore(address player) public view returns (uint256) {
        uint256[8] memory bals = IBlockHuntTokenCountdown(tokenContract).balancesOf(player);
        return bals[2] * WEIGHT_T2
             + bals[3] * WEIGHT_T3
             + bals[4] * WEIGHT_T4
             + bals[5] * WEIGHT_T5
             + bals[6] * WEIGHT_T6
             + bals[7] * WEIGHT_T7;
    }

    // ── Ranking: primary = distinct tiers, tiebreaker = weighted score ───

    function _countDistinctTiers(address player) internal view returns (uint256) {
        IBlockHuntTokenCountdown token = IBlockHuntTokenCountdown(tokenContract);
        uint256 count;
        for (uint256 t = 2; t <= 7; t++) {
            if (token.balanceOf(player, t) > 0) count++;
        }
        return count;
    }

    function _ranksAbove(address challenger, address holder) internal view returns (bool) {
        uint256 cTiers = _countDistinctTiers(challenger);
        uint256 hTiers = _countDistinctTiers(holder);
        if (cTiers > hTiers) return true;
        if (cTiers < hTiers) return false;
        return calculateScore(challenger) > calculateScore(holder);
    }

    // ── Called by BlockHuntToken when a player triggers the countdown ──────

    function startCountdown(address holder) external {
        require(msg.sender == tokenContract, "Only token contract");
        require(!isActive, "Countdown already active");

        isActive           = true;
        currentHolder      = holder;
        countdownStartTime = block.timestamp;
        holderSince        = block.timestamp;
        votesBurn          = 0;
        votesClaim         = 0;
        holderScore        = calculateScore(holder);
        lastChallengeTime  = block.timestamp;

        emit CountdownStarted(holder, block.timestamp, block.timestamp + countdownDuration);
    }

    // ── TAKEOVER (v2.1: rank-based) ───────────────────────────────────────

    /**
     * @notice Challenge the current countdown holder. Challenger must hold
     *         all 6 tiers AND rank above the holder (primary: distinct tiers,
     *         tiebreaker: total blocks held). 24-hour safe period after each
     *         trigger/takeover.
     */
    function challengeCountdown() external {
        require(isActive, "No active countdown");
        require(msg.sender != currentHolder, "Holder cannot self-challenge");

        IBlockHuntTokenCountdown token = IBlockHuntTokenCountdown(tokenContract);
        require(token.hasAllTiers(msg.sender), "Must hold all 6 tiers");

        require(
            block.timestamp >= lastChallengeTime + safePeriod,
            "Challenge cooldown active"
        );

        require(_ranksAbove(msg.sender, currentHolder), "Must rank above holder");

        address oldHolder = currentHolder;
        uint256 challengerScore = calculateScore(msg.sender);
        uint256 oldScore = calculateScore(oldHolder);

        // Bank cumulative defense time for the outgoing holder
        if (holderSince > 0) {
            cumulativeDefenseTime[oldHolder] += block.timestamp - holderSince;
        }

        currentHolder      = msg.sender;
        holderScore        = challengerScore;
        holderSince        = block.timestamp;
        lastChallengeTime  = block.timestamp;
        countdownStartTime = block.timestamp;
        takeoverCount++;

        // Sync Token state
        token.updateCountdownHolder(msg.sender);

        emit CountdownTakeover(msg.sender, oldHolder, takeoverCount);
        emit CountdownChallenged(msg.sender, challengerScore, oldHolder, oldScore, true);
        emit CountdownShifted(msg.sender, oldHolder, challengerScore, block.timestamp);
    }

    function syncReset() external {
        require(msg.sender == tokenContract, "Only token contract");
        address former = currentHolder;
        _resetCountdown();
        emit CountdownEnded(former);
    }

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

    // ── VIEW HELPERS ──────────────────────────────────────────────────────

    function timeRemaining() external view returns (uint256) {
        if (!isActive) return 0;
        uint256 endTime = countdownStartTime + countdownDuration;
        if (block.timestamp >= endTime) return 0;
        return endTime - block.timestamp;
    }

    function hasExpired() external view returns (bool) {
        if (!isActive) return false;
        return block.timestamp >= countdownStartTime + countdownDuration;
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
        endTime    = isActive ? countdownStartTime + countdownDuration : 0;
        remaining  = this.timeRemaining();
        burnVotes  = votesBurn;
        claimVotes = votesClaim;
    }

    // ── Season-indexed progression ──────────────────────────────────────

    modifier onlyToken() {
        require(msg.sender == tokenContract, "Only token contract");
        _;
    }

    function recordProgression(address player, uint256 points) external onlyToken {
        uint256 s = currentSeason;
        if (!isSeasonPlayer[s][player]) {
            isSeasonPlayer[s][player] = true;
            _seasonPlayers[s].push(player);
        }
        seasonScore[s][player] += points;
        emit PlayerRecorded(s, player, seasonScore[s][player]);
    }

    function totalPlayers() external view returns (uint256) {
        return _seasonPlayers[currentSeason].length;
    }

    function getPlayers(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory addrs, uint256[] memory scores)
    {
        uint256 s = currentSeason;
        address[] storage all = _seasonPlayers[s];
        uint256 n = all.length;
        if (offset >= n) return (new address[](0), new uint256[](0));
        uint256 end = offset + limit > n ? n : offset + limit;
        uint256 len = end - offset;
        addrs = new address[](len);
        scores = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            addrs[i]  = all[offset + i];
            scores[i] = seasonScore[s][addrs[i]];
        }
    }

    function advanceSeason() external onlyOwner {
        currentSeason += 1;
        emit SeasonAdvanced(currentSeason);
    }

    // ── INTERNAL ──────────────────────────────────────────────────────────

    function _resetCountdown() internal {
        isActive           = false;
        currentHolder      = address(0);
        countdownStartTime = 0;
        holderSince        = 0;
        votesBurn          = 0;
        votesClaim         = 0;
        holderScore        = 0;
        lastChallengeTime  = 0;
        takeoverCount      = 0;
        countdownRound++;
    }

    // ── Cumulative defense view ──────────────────────────────────────────

    function canClaim(address player) public view returns (bool) {
        if (player != currentHolder) return false;
        if (holderSince == 0) return false;
        uint256 elapsed = block.timestamp - holderSince;
        return cumulativeDefenseTime[player] + elapsed >= REQUIRED_DEFENSE;
    }
}
