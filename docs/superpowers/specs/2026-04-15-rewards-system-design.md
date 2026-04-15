# Block Hunt — Rewards System Design Spec

**Date:** 2026-04-15
**Depends on:** `2026-04-13-final-testnet-redeploy-design.md` (security hardening section SH-3, SH-10)
**Source:** `REWARD_SYSTEM_FINAL.md` v2.0 (approved mechanics) — this spec turns mechanics into a concrete implementation design
**Target:** Base Sepolia (testnet), then mainnet

---

## Overview

A single new `BlockHuntRewards.sol` contract holds the reward vault and exposes five reward mechanics. All off-chain logic (daily lottery winner pick, leaderboard winners) is performed by the **owner** — no keeper, no automation. Owner submits one transaction per day to distribute daily prizes. On-chain state enforces eligibility and prevents amount tampering.

### Design principles

- **Owner-trusted, on-chain enforced.** Owner picks daily winners; contract refuses any winner not in the on-chain eligibility set for that day.
- **Trustless for deterministic rewards.** Tier bounties and referrals resolve purely from on-chain state; owner cannot override.
- **Pull for eligibility-based, push for owner-selected.** Players claim what they earn; owner pushes lottery/leaderboard.
- **Treasury-positive by construction.** Referral bonuses capped at creator fee earned from the referee. Reward blocks minted at T6 (no cost to treasury, no LINK).
- **Season-indexed.** Every mutable mapping uses `mapping(uint256 season => ...)` to match the redeploy's season reset pattern (SH-10).

---

## Contract surface — `BlockHuntRewards.sol`

### State

```solidity
// Vault
uint256 public vaultBalance;

// Wiring
address public tokenContract;
address public countdownContract;
address public owner;
uint256 public currentSeason;

// Tier Race Bounties — per (batch, tier)
mapping(uint256 => mapping(uint8 => mapping(uint8 => address))) public tierBountyWinner;
// season => batch => tier => winner
mapping(uint256 => mapping(uint8 => mapping(uint8 => uint256))) public tierBountyAmount;
// season => batch => tier => wei

// Daily Lottery
mapping(uint256 => mapping(uint32 => mapping(address => bool))) public dailyEligible;
// season => dayIndex => player => eligible
mapping(uint256 => mapping(uint32 => bool)) public lotteryPaid;
// season => dayIndex => paid

// Daily Top 3 Leaderboard
mapping(uint256 => mapping(uint32 => bool)) public leaderboardPaid;
// season => dayIndex => paid
uint256[3] public leaderboardAmounts; // [1st, 2nd, 3rd] — current config

// Streak Bonus
mapping(uint256 => mapping(address => uint16)) public streakDay;
// season => player => consecutive days
mapping(uint256 => mapping(address => uint32)) public lastMintDay;
// season => player => UTC day number

struct StreakMilestone {
    uint16 daysRequired;
    uint16 slotsTotal;
    uint16 slotsClaimed;
    uint16 blockReward;   // T6 block count to mint
}
StreakMilestone[] public streakMilestones;
mapping(uint256 => mapping(address => mapping(uint8 => bool))) public streakClaimed;
// season => player => milestoneIndex => claimed

// Referral
mapping(address => address) public referrerOf;             // referee => referrer (lifetime, not season-scoped)
mapping(address => uint256) public feeAccrued;             // referee => cumulative fee generated
mapping(address => uint256) public totalMinted;            // referee => total blocks minted
mapping(address => bool)    public referralPaid;           // referee => already paid to referrer
mapping(address => uint256) public snapshotAmount;         // referee => frozen payout at threshold crossing
uint256 public referralAmount;                             // current configurable baseline
uint256 public referralThreshold = 50;                     // blocks required
bool    public referralsActive;
```

### Events

```solidity
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
```

### Owner functions

```solidity
function fund() external payable;                                            // adds to vaultBalance
function withdraw(uint256 amount) external onlyOwner;                         // escape hatch

function setTierBounty(uint8 batch, uint8 tier, uint256 amount) external onlyOwner;
function setLeaderboardAmounts(uint256[3] calldata amounts) external onlyOwner;
function setStreakMilestone(uint8 index, uint16 daysReq, uint16 slots, uint16 blockReward) external onlyOwner;
function setReferralAmount(uint256 amount) external onlyOwner;
function setReferralsActive(bool active) external onlyOwner;

function distributeLottery(uint32 day, address winner, uint256 amount) external onlyOwner;
function distributeLeaderboard(uint32 day, address[3] calldata winners) external onlyOwner;

function advanceSeason() external onlyOwner;   // zeros streak/score-dependent reads for new season
```

### Token-only hooks

```solidity
function onMint(address player, uint256 feeAmount, uint8 /*batch*/) external onlyToken;
function recordTierDrop(address player, uint8 tier, uint8 batch) external onlyToken;
```

### Player functions

```solidity
function setReferrer(address referrer) external;          // one-time, must be called before first mint contribution
function claimBounty(uint8 batch, uint8 tier) external;
function claimStreak(uint8 milestoneIndex) external;
function claimReferral(address referee) external;
```

---

## Reward processing — full table

| # | Reward | Scope | Who calls | Verification (on-chain) | Payout mechanism | Amount cap |
|---|--------|-------|-----------|-------------------------|------------------|-----------|
| 1 | **Tier Race Bounty** | Per season, per batch, per tier | Player claims | `tierBountyWinner[s][b][t] == msg.sender` — set once in `recordTierDrop` by Token when a tier first drops in that batch | Pull: ETH from vault | Owner-set per (batch,tier) |
| 2 | **Daily Lottery** | Per day (UTC) | Owner distributes | `dailyEligible[s][day][winner] == true` (written by `onMint` hook on every mint) — owner cannot pick a non-minter | Push: ETH transfer | Owner passes at distribution time |
| 3 | **Streak Bonus** | Milestone days, FCFS slots | Player claims | `streakDay[s][msg.sender] >= milestone.daysRequired && !claimed && slotsClaimed < slotsTotal` | Pull: `token.rewardMint(player, qty)` — guaranteed T6, no VRF | Owner-set per milestone |
| 4 | **Daily Top 3 Leaderboard** | Per day (UTC) | Owner distributes | `dailyEligible[s][day][winners[i]] == true` for all 3 — owner cannot pick non-minters | Push: 3× ETH transfer in one tx | `leaderboardAmounts[3]` current config |
| 5 | **Referral Bonus** | Lifetime (not season-scoped), one-shot per referee | Referee links via `setReferrer`; referrer claims after referee crosses threshold | `referrerOf[referee] == msg.sender && totalMinted[referee] >= referralThreshold && !referralPaid[referee] && (referralsActive || alreadyLinked)` | Pull: ETH from vault | `min(snapshotAmount[referee], feeAccrued[referee])` — snapshotted at threshold crossing |

---

## Data flow — Token → Rewards

Token's `fulfillRandomWords` adds two external calls (both wrapped in try/catch per SH-3):

```solidity
// 1. Record per-mint events (rewards-wide)
try IBlockHuntRewards(rewardsContract).onMint(req.player, req.amountPaid, currentBatch) {}
catch { emit RewardsOnMintFailed(req.player, req.amountPaid); }

// 2. Record tier drops (for tier bounty first-winner tracking)
for (uint256 i = 0; i < tiersAssigned.length; i++) {
    try IBlockHuntRewards(rewardsContract).recordTierDrop(req.player, tiersAssigned[i], currentBatch) {}
    catch { emit RewardsTierDropFailed(req.player, tiersAssigned[i]); }
}
```

`onMint` is the single load-bearing call. Inside Rewards, it fans out to:

```solidity
function onMint(address player, uint256 feeAmount, uint8 /*batch*/) external onlyToken {
    uint32 today = uint32(block.timestamp / 1 days);
    uint256 season = currentSeason;

    // (a) Daily lottery + leaderboard eligibility
    dailyEligible[season][today][player] = true;

    // (b) Referral fee accrual + threshold crossing snapshot
    if (referrerOf[player] != address(0)) {
        feeAccrued[player] += feeAmount;
        // totalMinted is incremented per block in recordTierDrop (has the count)
        // If referee crosses threshold this mint, snapshot the payout:
        if (totalMinted[player] >= referralThreshold && snapshotAmount[player] == 0) {
            uint256 payout = referralAmount < feeAccrued[player] ? referralAmount : feeAccrued[player];
            snapshotAmount[player] = payout;
            emit ReferralThresholdCrossed(player, payout);
        }
    }

    // (c) Streak counter
    uint32 last = lastMintDay[season][player];
    if (last != today) {
        if (last + 1 == today) streakDay[season][player] += 1;
        else                   streakDay[season][player] = 1;
        lastMintDay[season][player] = today;
    }

    emit OnMintRecorded(player, feeAmount);
}
```

`recordTierDrop` handles per-tier state:

```solidity
function recordTierDrop(address player, uint8 tier, uint8 batch) external onlyToken {
    uint256 season = currentSeason;

    // Total minted counter (for referral threshold)
    totalMinted[player] += 1;

    // Tier bounty — first player to mint this tier in this batch wins
    if (tierBountyWinner[season][batch][tier] == address(0) &&
        tierBountyAmount[season][batch][tier] > 0) {
        tierBountyWinner[season][batch][tier] = player;
        emit TierBountyWon(season, batch, tier, player);
    }
}
```

---

## Reward-minted blocks — `token.rewardMint`

New function on `BlockHuntToken.sol` added as part of this spec:

```solidity
function rewardMint(address to, uint32 quantity) external {
    require(msg.sender == rewardsContract, "Only rewards");
    // Guaranteed T6, no VRF, no payment
    _mint(to, 6, quantity, "");
    tierTotalSupply[6] += quantity;
    emit RewardMinted(to, quantity);
}
```

**Gas cost is owner's effective expense** — reward blocks do not draw from treasury, do not pay creator fee, and do not trigger mint window recording (since they're gifts, not mints).

---

## Referral flow — detailed

**Step 1 — Arrival.** Bob clicks `blockhunt.xyz/?ref=0xAlice`. Frontend stashes `pendingReferrer` in localStorage, shows banner.

**Step 2 — Link (first mint path).** Bob connects wallet. Frontend reads `rewards.referrerOf(Bob) == 0 && referralsActive`. If true, mint modal shows:

> Step 1 of 2: Link referrer (~$0.01 gas, one-time)
> Step 2 of 2: Mint blocks

Bob signs `rewards.setReferrer(0xAlice)`:

```solidity
function setReferrer(address referrer) external {
    require(referrerOf[msg.sender] == address(0), "Already set");
    require(referrer != msg.sender, "Self-referral");
    require(referrer != address(0), "Zero address");
    require(referralsActive, "Referrals paused");
    referrerOf[msg.sender] = referrer;
    emit ReferrerLinked(msg.sender, referrer);
}
```

**Step 3 — Mint.** Bob calls `token.mint(quantity)`. Token has no referral knowledge — cleanliness preserved. VRF callback fires `rewards.onMint(Bob, feeAmount, batch)` and `recordTierDrop` per block.

**Step 4 — Accrual.** Every subsequent mint, Rewards increments `feeAccrued[Bob]` and `totalMinted[Bob]`.

**Step 5 — Threshold crossing.** When `totalMinted[Bob]` first reaches 50, `snapshotAmount[Bob] = min(referralAmount, feeAccrued[Bob])` is frozen. Emits `ReferralThresholdCrossed`.

**Step 6 — Claim.** Alice's rewards page shows "Bob: ready — $X available." She clicks:

```solidity
function claimReferral(address referee) external {
    require(referrerOf[referee] == msg.sender, "Not referrer");
    require(snapshotAmount[referee] > 0, "Below threshold");
    require(!referralPaid[referee], "Already claimed");
    // soft freeze — pre-linked pairs stay claimable even if referrals toggled off
    referralPaid[referee] = true;
    uint256 amount = snapshotAmount[referee];
    vaultBalance -= amount;
    payable(msg.sender).sendValue(amount);
    emit ReferralClaimed(msg.sender, referee, amount);
}
```

**Soft freeze semantics:** when `referralsActive == false`, new `setReferrer` calls revert. Pending claims on already-linked pairs still work (soft freeze). This honors prior commitments.

---

## Frontend — Rewards page (5 rows)

Builds on §2.1 of the redeploy spec. Five rows, each with eligibility-scoped claim buttons:

### Row 1 — Tier Race
```
T6 → $5   T5 → $20   T4 → $50   T3 → $150   T2 → $1,000
[CLAIMED by 0xABC…]  [YOU WON · CLAIM $20]  [OPEN]  [OPEN]  [OPEN]
```
Claim button visible only when `tierBountyWinner[season][currentBatch][tier] == connectedWallet && tierBountyAmount > 0`.

### Row 2 — Today's Lottery
```
Prize: $75   Drawing in: 03:47:21
Yesterday's winner: 0xABC… ($75)
```
No claim button — owner pushes. Players just see prize + countdown.

### Row 3 — Streak Bonus
```
Your streak: 6 days  (last mint: today ✓)
3d: 10 blocks (84/100)   5d: 25 blocks (52/75)   7d: 50 blocks (34/50) [CLAIM]
14d: 100 blocks (12/30)   21d: 150 blocks (5/15)   30d: 250 blocks (2/10)
```
Claim visible when `streakDay[s][player] >= milestone.daysRequired && !claimed && slotsClaimed < slotsTotal`.

### Row 4 — Daily Top 3
```
🥇 0xABC… $45   🥈 0xDEF… $19   🥉 0xGHI… $11
(updates live — current game score rankings)
```
Pulled from Countdown's season-indexed leaderboard reads. Sorted client-side.

### Row 5 — Refer a Friend
```
Your link: blockhunt.xyz/?ref=0xYou [copy]
Reward: $5 per friend who mints 50+ blocks
Your referrals: 3 active · 1 ready to claim
  · Bob:   47/50 blocks  (pending)
  · Carol: 62/50 blocks  [CLAIM $5]
  · Dave:  12/50 blocks  (pending)
```
Per-referee claim buttons when `snapshotAmount[referee] > 0 && !paid`.

---

## Daily owner workflow

Owner runs a simple off-chain script once per day (manual or semi-automated, not a keeper):

1. Read subgraph or `dailyEligible` mapping for the prior day's minters
2. Read game score from Countdown for each
3. Pick lottery winner (weighted random client-side) and top 3 by game score
4. Submit one tx: `distributeLottery(day, winner, amount)` + `distributeLeaderboard(day, [a,b,c])`

Contract refuses any winner not in `dailyEligible` — owner's script can be verified against on-chain state at any time. Random seed for lottery is picked off-chain; documented as owner-trusted for this pool size (see `bug_priority_verdict.md` BUG-7 reframe).

---

## Security integrations (from bug_priority_verdict.md)

| Item | Integration |
|------|-------------|
| **BUG-7 reframe** | `dailyEligible[season][day][player]` snapshot enforced in both `distributeLottery` and `distributeLeaderboard`. Owner cannot fabricate winners. |
| **BUG-12 analog** | Referral payout `snapshotAmount[referee]` frozen at threshold crossing, not recomputed at claim. Owner amount changes never retroactively reduce owed rewards. |
| **NEW-F pattern** | All mutable state (`dailyEligible`, `streakDay`, `lastMintDay`, `tierBounty*`, `lotteryPaid`, `leaderboardPaid`, `streakClaimed`) is `mapping(uint256 season => ...)`. `advanceSeason()` zeros them naturally. Referral state is intentionally NOT season-scoped (lifetime tracking). |
| **SH-3** | Token wraps `rewards.onMint` and `rewards.recordTierDrop` in try/catch inside `fulfillRandomWords`. Reward failures never revert the callback. |

---

## Out of scope (this spec)

- Game score formula lives in Countdown (`progressionScore`) per redeploy §1.8 — Rewards reads it, does not compute
- Welcome blocks (optional per REWARD_SYSTEM_FINAL.md) — deferred; can be added later as an owner-gated `grantWelcomeBlocks(addr[])` that pulls from the same `rewardMint` path
- Automated daily distribution (keeper/cron) — explicitly rejected, owner does it manually
- Social share prompts on rare mints — separate spec (next brainstorm)

---

## Deploy + wiring sequence

Folds into the redeploy sequence from the redeploy spec — Rewards deploys between Countdown and Forge:

```
1. Deploy Treasury, MintWindow, Countdown
2. Deploy Rewards  ← NEW
3. Deploy Forge, Token, Escrow, Migration, SeasonRegistry

4. Wire cross-references:
   Token → Rewards (for onMint, recordTierDrop, rewardMint callback)
   Rewards → Token (for rewardMint)
   Rewards → Countdown (for leaderboard reads)
   Rewards.onlyToken ← Token address
   Token.rewardsContract ← Rewards address

5. Post-deploy config:
   - rewards.fund{value: X ether}()
   - rewards.setTierBounty(batch=1, tier=6, 0.002 ether)   // etc per tier
   - rewards.setLeaderboardAmounts([...])
   - rewards.setStreakMilestone(0, 3, 100, 10)              // 3d, 100 slots, 10 T6 blocks
   - rewards.setStreakMilestone(1, 5, 75, 25)
   - rewards.setStreakMilestone(2, 7, 50, 50)
   - rewards.setStreakMilestone(3, 14, 30, 100)
   - rewards.setStreakMilestone(4, 21, 15, 150)
   - rewards.setStreakMilestone(5, 30, 10, 250)
   - rewards.setReferralAmount(0.002 ether)                 // ~$5 equivalent
   - rewards.setReferralsActive(true)

6. Frontend:
   - Add Rewards address + ABI to wagmi.js
   - Build 5-row rewards page
   - Add referral link detection + setReferrer flow to mint modal
   - Add streak counter to profile header
```

---

## Testing checklist

- [ ] `setReferrer` rejects self, zero, duplicate, paused
- [ ] `onMint` streak increment: consecutive day, gap, same-day no-op
- [ ] `onMint` fee accrual only when referrer set
- [ ] Referral threshold snapshot fires exactly once at 50 blocks
- [ ] `claimReferral` paid once, cap is `min(snapshot, feeAccrued)` at snapshot time
- [ ] Soft freeze: pending pair claim still works after `setReferralsActive(false)`
- [ ] Tier bounty first-winner is set exactly once per (batch, tier)
- [ ] `claimBounty` refuses non-winners, refuses after claim
- [ ] `distributeLottery` refuses non-eligible winner
- [ ] `distributeLeaderboard` refuses if any of 3 is non-eligible
- [ ] `distributeLottery` / `distributeLeaderboard` refuses duplicate day
- [ ] Streak claim: FCFS slot decrement, refuses after slots exhausted
- [ ] Streak claim mints correct T6 count via `rewardMint`
- [ ] `rewardMint` onlyRewards, no treasury draw, no creator fee, no window record
- [ ] `advanceSeason` zeros streak and daily state without touching referral state
- [ ] `onMint` and `recordTierDrop` try/catch verified: failure emits event, VRF callback still succeeds
- [ ] Vault accounting: fund + withdraw + all claim paths balance to `vaultBalance`
- [ ] Invariant: `sum(all payouts) <= sum(all fund() deposits) + any rewardMint block value`

---

*This spec depends on the redeploy spec's security hardening (SH-3, SH-10). It MUST ship in the same deploy batch as the redeploy — standalone deploy would leave Token without the try/catch wrapper around `rewards.onMint`, re-opening the NEW-B class of bugs.*
