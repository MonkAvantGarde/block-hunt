// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IBlockHuntTokenRewards {
    function dailyEligible(uint256 day, address player) external view returns (bool);
    function dailyMinterCount(uint256 day) external view returns (uint256);
    function rewardMint(address to, uint32 quantity) external;
}

contract BlockHuntRewards is Ownable, ReentrancyGuard {

    address public tokenContract;
    uint256 public currentSeason;
    uint256 public vaultBalance;

    // ── Tier Race Bounties ──────────────────────────────────────────────────
    mapping(uint256 => mapping(uint8 => mapping(uint8 => address))) public tierBountyWinner;
    mapping(uint256 => mapping(uint8 => mapping(uint8 => uint256))) public tierBountyAmount;
    mapping(uint256 => mapping(uint8 => mapping(uint8 => bool))) public tierBountyClaimed;

    // ── Daily Lottery ───────────────────────────────────────────────────────
    mapping(uint256 => mapping(uint32 => mapping(address => bool))) public dailyEligible;
    mapping(uint256 => mapping(uint32 => bool)) public lotteryPaid;

    // ── Daily Top 3 Leaderboard ─────────────────────────────────────────────
    mapping(uint256 => mapping(uint32 => bool)) public leaderboardPaid;
    uint256[3] public leaderboardAmounts;

    // ── Streak Bonus ────────────────────────────────────────────────────────
    mapping(uint256 => mapping(address => uint16)) public streakDay;
    mapping(uint256 => mapping(address => uint32)) public lastMintDay;

    struct StreakMilestone {
        uint16 daysRequired;
        uint16 slotsTotal;
        uint16 slotsClaimed;
        uint16 blockReward;
    }
    StreakMilestone[] public streakMilestones;
    mapping(uint256 => mapping(address => mapping(uint8 => bool))) public streakClaimed;

    // ── Referral ────────────────────────────────────────────────────────────
    mapping(address => address) public referrerOf;
    mapping(address => uint256) public feeAccrued;
    mapping(address => uint256) public totalMintedByPlayer;
    mapping(address => bool) public referralPaid;
    mapping(address => uint256) public snapshotAmount;
    uint256 public referralAmount;
    uint256 public referralThreshold = 50;
    bool public referralsActive;

    // ── Events ──────────────────────────────────────────────────────────────
    event VaultFunded(address indexed from, uint256 amount);
    event VaultWithdrawn(address indexed to, uint256 amount);
    event TierBountySet(uint256 season, uint8 batch, uint8 tier, uint256 amount);
    event TierBountyWon(uint256 season, uint8 batch, uint8 tier, address indexed winner);
    event TierBountyClaimed(uint256 season, uint8 batch, uint8 tier, address indexed winner, uint256 amount);
    event LotteryDistributed(uint256 season, uint32 day, address indexed winner, uint256 amount);
    event LeaderboardDistributed(uint256 season, uint32 day, address[3] winners, uint256[3] amounts);
    event StreakMilestoneSet(uint8 index, uint16 daysRequired, uint16 slotsTotal, uint16 blockReward);
    event StreakClaimed(uint256 season, address indexed player, uint8 milestoneIndex, uint16 blocks);
    event ReferrerLinked(address indexed referee, address indexed referrer);
    event ReferralThresholdCrossed(address indexed referee, uint256 snapshotAmount);
    event ReferralClaimed(address indexed referrer, address indexed referee, uint256 amount);
    event ReferralsToggled(bool active);
    event OnMintRecorded(address indexed player, uint256 feeAmount);
    event SeasonAdvanced(uint256 newSeason);

    constructor() Ownable(msg.sender) {
        currentSeason = 1;
    }

    modifier onlyToken() {
        require(msg.sender == tokenContract, "Only token");
        _;
    }

    // ── Owner: wiring ───────────────────────────────────────────────────────

    function setTokenContract(address addr) external onlyOwner {
        tokenContract = addr;
    }

    // ── Owner: vault ────────────────────────────────────────────────────────

    function fund() external payable {
        require(msg.value > 0, "No ETH");
        vaultBalance += msg.value;
        emit VaultFunded(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        require(amount <= vaultBalance, "Insufficient vault");
        vaultBalance -= amount;
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "Transfer failed");
        emit VaultWithdrawn(msg.sender, amount);
    }

    // ── Owner: config ───────────────────────────────────────────────────────

    function setTierBounty(uint8 batch, uint8 tier, uint256 amount) external onlyOwner {
        tierBountyAmount[currentSeason][batch][tier] = amount;
        emit TierBountySet(currentSeason, batch, tier, amount);
    }

    function setLeaderboardAmounts(uint256[3] calldata amounts) external onlyOwner {
        leaderboardAmounts = amounts;
    }

    function setStreakMilestone(uint8 index, uint16 daysReq, uint16 slots, uint16 blockReward) external onlyOwner {
        if (index >= streakMilestones.length) {
            streakMilestones.push(StreakMilestone(daysReq, slots, 0, blockReward));
        } else {
            streakMilestones[index] = StreakMilestone(daysReq, slots, streakMilestones[index].slotsClaimed, blockReward);
        }
        emit StreakMilestoneSet(index, daysReq, slots, blockReward);
    }

    function setReferralAmount(uint256 amount) external onlyOwner {
        referralAmount = amount;
    }

    function setReferralsActive(bool active) external onlyOwner {
        referralsActive = active;
        emit ReferralsToggled(active);
    }

    function advanceSeason() external onlyOwner {
        currentSeason += 1;
        emit SeasonAdvanced(currentSeason);
    }

    // ── Token hooks ─────────────────────────────────────────────────────────

    function onMint(address player, uint256 feeAmount, uint8 /*batch*/) external onlyToken {
        uint32 today = uint32(block.timestamp / 1 days);
        uint256 season = currentSeason;

        dailyEligible[season][today][player] = true;

        if (referrerOf[player] != address(0)) {
            feeAccrued[player] += feeAmount;
            if (totalMintedByPlayer[player] >= referralThreshold && snapshotAmount[player] == 0) {
                uint256 payout = referralAmount < feeAccrued[player] ? referralAmount : feeAccrued[player];
                snapshotAmount[player] = payout;
                emit ReferralThresholdCrossed(player, payout);
            }
        }

        uint32 last = lastMintDay[season][player];
        if (last != today) {
            if (last + 1 == today) streakDay[season][player] += 1;
            else                   streakDay[season][player] = 1;
            lastMintDay[season][player] = today;
        }

        emit OnMintRecorded(player, feeAmount);
    }

    function recordTierDrop(address player, uint8 tier, uint8 batch) external onlyToken {
        uint256 season = currentSeason;
        totalMintedByPlayer[player] += 1;

        if (tierBountyWinner[season][batch][tier] == address(0) &&
            tierBountyAmount[season][batch][tier] > 0) {
            tierBountyWinner[season][batch][tier] = player;
            emit TierBountyWon(season, batch, tier, player);
        }
    }

    // ── Player: claims ──────────────────────────────────────────────────────

    function claimBounty(uint8 batch, uint8 tier) external nonReentrant {
        uint256 season = currentSeason;
        require(tierBountyWinner[season][batch][tier] == msg.sender, "Not winner");
        require(!tierBountyClaimed[season][batch][tier], "Already claimed");
        uint256 amount = tierBountyAmount[season][batch][tier];
        require(amount > 0, "No bounty");
        require(amount <= vaultBalance, "Insufficient vault");

        tierBountyClaimed[season][batch][tier] = true;
        vaultBalance -= amount;
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "Transfer failed");
        emit TierBountyClaimed(season, batch, tier, msg.sender, amount);
    }

    function claimStreak(uint8 milestoneIndex) external nonReentrant {
        uint256 season = currentSeason;
        require(milestoneIndex < streakMilestones.length, "Invalid milestone");
        StreakMilestone storage m = streakMilestones[milestoneIndex];
        require(streakDay[season][msg.sender] >= m.daysRequired, "Streak too short");
        require(!streakClaimed[season][msg.sender][milestoneIndex], "Already claimed");
        require(m.slotsClaimed < m.slotsTotal, "Slots exhausted");

        streakClaimed[season][msg.sender][milestoneIndex] = true;
        m.slotsClaimed += 1;

        IBlockHuntTokenRewards(tokenContract).rewardMint(msg.sender, m.blockReward);
        emit StreakClaimed(season, msg.sender, milestoneIndex, m.blockReward);
    }

    function setReferrer(address referrer) external {
        require(referrerOf[msg.sender] == address(0), "Already set");
        require(referrer != msg.sender, "Self-referral");
        require(referrer != address(0), "Zero address");
        require(referralsActive, "Referrals paused");
        referrerOf[msg.sender] = referrer;
        emit ReferrerLinked(msg.sender, referrer);
    }

    function claimReferral(address referee) external nonReentrant {
        require(referrerOf[referee] == msg.sender, "Not referrer");
        require(snapshotAmount[referee] > 0, "Below threshold");
        require(!referralPaid[referee], "Already claimed");

        referralPaid[referee] = true;
        uint256 amount = snapshotAmount[referee];
        require(amount <= vaultBalance, "Insufficient vault");
        vaultBalance -= amount;
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "Transfer failed");
        emit ReferralClaimed(msg.sender, referee, amount);
    }

    // ── Owner: distributions ────────────────────────────────────────────────

    function distributeLottery(uint32 day, address winner, uint256 amount) external onlyOwner nonReentrant {
        uint256 season = currentSeason;
        require(!lotteryPaid[season][day], "Already distributed");
        require(dailyEligible[season][day][winner], "Winner not eligible");
        require(amount <= vaultBalance, "Insufficient vault");

        lotteryPaid[season][day] = true;
        vaultBalance -= amount;
        (bool sent, ) = payable(winner).call{value: amount}("");
        require(sent, "Transfer failed");
        emit LotteryDistributed(season, day, winner, amount);
    }

    function distributeLeaderboard(uint32 day, address[3] calldata winners) external onlyOwner nonReentrant {
        uint256 season = currentSeason;
        require(!leaderboardPaid[season][day], "Already distributed");

        uint256 total;
        for (uint256 i = 0; i < 3; i++) {
            require(dailyEligible[season][day][winners[i]], "Winner not eligible");
            total += leaderboardAmounts[i];
        }
        require(total <= vaultBalance, "Insufficient vault");

        leaderboardPaid[season][day] = true;
        vaultBalance -= total;

        for (uint256 i = 0; i < 3; i++) {
            (bool sent, ) = payable(winners[i]).call{value: leaderboardAmounts[i]}("");
            require(sent, "Transfer failed");
        }
        emit LeaderboardDistributed(season, day, winners, leaderboardAmounts);
    }

    // ── Views ───────────────────────────────────────────────────────────────

    function getStreakMilestoneCount() external view returns (uint256) {
        return streakMilestones.length;
    }

    receive() external payable {}
}
