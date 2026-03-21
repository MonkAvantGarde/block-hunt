# Rewards System — Complete Guide
> Last updated: 2026-03-20
> Covers: every component, data source, interaction, refresh rate, and implementation status

---

## Architecture Overview

```
RewardsPanel (container)
  │
  ├── useRewardsData() hook ─── 12 contract reads + 1 subgraph query
  │
  ├── RewardsOverview ──── 5 summary cards (click to drill in)
  │     ├── Daily Streak card
  │     ├── Today's Lottery card (live countdown)
  │     ├── Milestones card
  │     ├── Batch Bounty card
  │     └── Hall of Fame card (full-width)
  │
  ├── StreakDetail ──── streak count, 7-day timeline, tier table
  ├── MilestoneDetail ── badge grid (minting / forging / collection)
  ├── LotteryDetail ──── prize, odds, live countdown, recent draws, [CLAIM]
  ├── BountyDetail ───── progress bar, eligibility, [CLAIM BOUNTY]
  ├── HallOfFameDetail ─ legends, tier discovery, batch firsts, [CLAIM]
  │
  └── ClaimModal ──── confirm → wallet sign → pending → success/error
```

---

## Data Engine: `useRewardsData(address, blocks, currentBatch)`

### Contract Reads (via wagmi `useReadContract` / `useReadContracts`)

| # | Contract | Function | Args | Refetch | What it provides |
|---|----------|----------|------|---------|-----------------|
| 1 | REWARDS | `dailyPrize(batch)` | current batch | 120s | Today's lottery prize (ETH) |
| 2 | REWARDS | `lotteryPool(batch)` | current batch | 120s | Total lottery sub-pool (ETH) |
| 3 | REWARDS | `batchConfigs(batch)` | current batch | 120s | Batch funding config (totalDeposit, bps splits, active, settled) |
| 4 | REWARDS | `bountyPool(batch)` | current batch | 120s | Bounty sub-pool (ETH) |
| 5 | REWARDS | `batchBounties(batch)` | current batch | 120s | Bounty distribution state (recipients, perWalletShare, distributed) |
| 6 | REWARDS | `firstsPool(batch)` | current batch | 120s | Firsts achievement sub-pool (ETH) |
| 7 | REWARDS | `batchFirsts(batch, id)` × 26 | batch 1 (ids 0-12) + current batch (ids 0-12) | 120s | Per-achievement winner, prize, claimed status |
| 8 | REWARDS | `getClaimable(wallet)` | connected address | 120s | All pending claims for this wallet |
| 9 | WINDOW | `currentDay()` | — | 60s | Current window day number (for draw lookups) |
| 10 | WINDOW | `getWindowInfo()` | — | 30s | Window close time (for countdown) |
| 11-13 | REWARDS | `dailyDraws(day)` × 3 | day-1, day-2, day-3 | 120s | Last 3 draw results |

### Subgraph Query

**Endpoint:** `https://api.studio.thegraph.com/query/1744131/blok-hunt/v2.1.0`
**Refresh:** Every 120 seconds

```graphql
{
  player(id: "0x...") {
    totalMints totalCombines totalForges totalForgeSuccesses tiersUnlocked
  }
  playerActivities(where: { player: "0x..." }, orderBy: date, orderDirection: desc, first: 90) {
    date hasMint hasCombine hasForge
  }
  seasonStat(id: "season-1") {
    totalMinted uniquePlayers
  }
  allPlayers: players(first: 1000, where: { totalMints_gt: "0" }) {
    id
  }
}
```

### Computed Values

| Value | Formula |
|-------|---------|
| `streak` | Count consecutive days backwards from today/yesterday in playerActivities dates |
| `currentStreakTier` | Highest STREAK_TIER where streak >= tier.days |
| `milestones` | Compare player.totalMints/totalForges/tiersHeld against MILESTONE_DEFS thresholds |
| `mintedToday` | playerActivities has today's date with hasMint=true |
| `rewardsPool` | lotteryPool + firstsPool + bountyPool (all ETH, from contract) |
| `defaultFirstPrize` | firstsPool / 13 |
| `uniquePlayers` | seasonStat.uniquePlayers OR allPlayers.length (fallback for subgraph bug) |
| `drawCountdown` | Live-ticking client-side from windowCloseAt timestamp |

---

## Component-by-Component Detail

### 1. RewardsOverview (Dashboard)

**Layout:** 2-column grid, 5 cards + full-width Hall of Fame

| Card | What it shows | Data source | Status |
|------|--------------|-------------|--------|
| **Daily Streak** | Streak count (large number) + tier name + next tier progress bar | streak, currentStreakTier, nextStreakTier | REAL |
| **Today's Lottery** | Prize amount + wallet count + eligible dot + live countdown | dailyPrize, uniquePlayers, mintedToday, windowCloseAt | REAL |
| **Milestones** | Last 2 earned badges + next badge + earned/in-progress counts | milestones computed data | REAL |
| **Batch Bounty** | Progress bar (minted/total) + bounty amount + eligible status | bounty.minted/total/bountyAmount/userEligible | REAL |
| **Hall of Fame** | First 2 legend winners + unclaimed legend count + batch firsts available | hallOfFame.legends, batchFirsts, batchTierDiscovery | REAL |

**Interaction:** Click any card → navigates to that detail view.

---

### 2. StreakDetail

**What the user sees:**

```
┌──────────────────────────────────────┐
│  7                                   │
│  DAY STREAK                          │
│  COMMITTED ✦                         │
│  NEXT: DEDICATED (14 days)           │
│  ██████░░░░░░ 50%                    │
├──────────────────────────────────────┤
│  SUN  MON  TUE  WED  THU  FRI TODAY │
│   ✓    ✓    ✓    ✗    ✓    ✓    ◆   │
├──────────────────────────────────────┤
│  ACTIVE      3 days   ✓ EARNED      │
│  COMMITTED   7 days   ◆ CURRENT     │
│  DEDICATED  14 days   ○ LOCKED      │
│  RELENTLESS 30 days   ○ LOCKED      │
│  LEGENDARY  60 days   ○ LOCKED      │
└──────────────────────────────────────┘
```

| Data point | Source | Status |
|-----------|--------|--------|
| Streak count | `calcStreak()` on playerActivities dates | REAL |
| Current tier | Matched from STREAK_TIERS thresholds | COMPUTED |
| Next tier + progress | Next tier from array, progress = streak/nextTier.days | COMPUTED |
| 7-day timeline | Last 7 UTC days vs activityDateSet | REAL |
| Tier table (5 rows) | STREAK_TIERS vs streak count | COMPUTED |

**Interactions:** None (display only). **No claims** — streaks are recognition, not claimable rewards.

---

### 3. MilestoneDetail

**What the user sees:**

```
┌──────────────────────────────────────┐
│  [OVERALL]  [BATCH 2 — disabled]     │
├──────────────────────────────────────┤
│  ⬡ MINTING                          │
│  [NOVICE ✓] [BRONZE ✓] [SILVER ◇]   │
│  [GOLD ○]   [DIAMOND ○] [OBSIDIAN ○]│
│  150 / 500 ██████░░░░                │
├──────────────────────────────────────┤
│  ⚡ FORGING                          │
│  [FIRST SPARK ✓] [TINKERER ○] ...   │
├──────────────────────────────────────┤
│  ◆ COLLECTION                        │
│  [COLLECTOR ✓] [HUNTER ○] ...        │
└──────────────────────────────────────┘
```

| Category | Badges | Threshold source | Progress source | Status |
|----------|--------|-----------------|-----------------|--------|
| MINTING | NOVICE(10), BRONZE(100), SILVER(500), GOLD(1000), DIAMOND(5000), OBSIDIAN(10000) | Hardcoded MILESTONE_DEFS | subgraph player.totalMints | REAL |
| FORGING | FIRST SPARK(1), TINKERER(5), SMITH(20), FORGEMASTER(50), LEGENDARY(100) | Hardcoded MILESTONE_DEFS | subgraph player.totalForges | REAL |
| COLLECTION | COLLECTOR(2), HUNTER(3), SEEKER(4), CONTENDER(5), COUNTDOWN THREAT(6) | Hardcoded MILESTONE_DEFS | on-chain balances (tiers 2-7 with qty > 0) | REAL |

**Interactions:** None (display only). "BATCH 2" tab exists but is disabled — NOT WIRED.

---

### 4. LotteryDetail

**What the user sees:**

```
┌──────────────────────────────────────┐
│         TODAY'S PRIZE                │
│         0.02 Ξ                       │
│         ~$50 AT CURRENT RATE         │
├──────────────────────────────────────┤
│  2 WALLETS │ 50.0% ODDS │ 02:14:33  │
├──────────────────────────────────────┤
│  ✓ YOU MINTED TODAY — YOU'RE IN      │
├──────────────────────────────────────┤
│  YESTERDAY'S WINNER                  │
│  ★ 0x20b3...0c57  +0.02 Ξ           │
├──────────────────────────────────────┤
│  RECENT DRAWS                        │
│  MAR 18  0x20b3...0c57  2 wallets  0.02 Ξ [CLAIM] │
│  MAR 17  0xd382...8332  2 wallets  0.02 Ξ         │
└──────────────────────────────────────┘
```

| Data point | Source | Status |
|-----------|--------|--------|
| Prize amount | Contract: `dailyPrize(batch)` | REAL |
| "~$50 AT CURRENT RATE" | Hardcoded string | HARDCODED |
| Wallet count | Subgraph: allPlayers count (fallback from uniquePlayers) | REAL |
| Your odds | Computed: `100 / wallets` | COMPUTED |
| Countdown (DRAW IN) | Contract: `getWindowInfo().closeAt` → live tick every 1s | REAL + CLIENT-SIDE TICK |
| Eligibility | Subgraph: playerActivities today.hasMint | REAL |
| Yesterday's winner | Contract: `dailyDraws(currentDay - 1)` | REAL |
| Recent draws (3 rows) | Contract: `dailyDraws(day-1, day-2, day-3)` | REAL |

**Interactions:**
- **[CLAIM] button** — appears on draws where `isYou && !claimed`. Opens ClaimModal with `claimType: 'lottery'`.

---

### 5. BountyDetail

**What the user sees:**

```
┌──────────────────────────────────────┐
│  BATCH 1 BOUNTY                      │
│  EVERYONE WHO MINTED SHARES THE PRIZE│
│                              0.05 Ξ  │
├──────────────────────────────────────┤
│  BATCH 1 PROGRESS                    │
│  239 / 50,000                        │
│  ██░░░░░░░░░░░░ 0.5%                │
│  49,761 BLOCKS REMAINING             │
├──────────────────────────────────────┤
│  ~2 ELIGIBLE │ ~0.02500 Ξ PER WALLET │
├──────────────────────────────────────┤
│  ✓ YOU MINTED IN BATCH 1 — ELIGIBLE  │
│                        [CLAIM BOUNTY] │  ← only if distributed
└──────────────────────────────────────┘
```

| Data point | Source | Status |
|-----------|--------|--------|
| Batch number | `currentBatch` from MintWindow | REAL |
| Bounty amount | Contract: `bountyPool(batch)` | REAL |
| Minted / total | Subgraph: seasonStat.totalMinted / hardcoded BATCH_SUPPLY_TARGETS | MIXED (minted=REAL, target=HARDCODED) |
| Eligible wallets | Subgraph: uniquePlayers (or allPlayers fallback) | REAL |
| Per wallet estimate | Computed: bountyPool / uniquePlayers (or batchBounties.perWalletShare if set) | COMPUTED |
| User eligible | Subgraph: player.totalMints > 0 | REAL |
| Distributed flag | Contract: `batchBounties(batch).distributed` | REAL |
| Completed batches | Hardcoded empty array `[]` | NOT WIRED |

**Interactions:**
- **[CLAIM BOUNTY]** — appears only when `distributed && userEligible && claimable.bounty includes this batch`. Opens ClaimModal with `claimType: 'bounty'`.

---

### 6. HallOfFameDetail

**What the user sees:**

```
┌──────────────────────────────────────┐
│  LEGENDS — ALL TIME                  │
│  ONCE CLAIMED, FOREVER YOURS         │
│                                      │
│  ★ THE PIONEER — First Mint          │
│    0x20b3...0c57 (YOU)     [CLAIM]   │
│  ★ THE FIRST SPARK — First Forge     │
│    UNCLAIMED               AVAILABLE │
│  ★ THE THOUSAND — First 1,000 Mints  │
│    UNCLAIMED               AVAILABLE │
│  ★ THE FIRST THREAT — First 6 Tiers  │
│    UNCLAIMED               AVAILABLE │
├──────────────────────────────────────┤
│  TIER DISCOVERY — ALL TIME           │
│  6  FIRST RESTLESS REVEAL   0x20b3.. │
│  5  FIRST REMEMBERED REVEAL UNCLAIMED│
│  4  FIRST ORDERED REVEAL    UNCLAIMED│
│  3  FIRST CHAOTIC REVEAL    UNCLAIMED│
│  2  FIRST WILLFUL REVEAL    UNCLAIMED│
├──────────────────────────────────────┤
│  BATCH 1 FIRSTS — ETH BONUS + TITLE │
│  1  BATCH 1 PIONEER     0x20b3 +0.02│
│  2  BATCH 1 COMBINER    UNCLAIMED   │
│  ... (8 general achievements)        │
├──────────────────────────────────────┤
│  BATCH 1 TIER DISCOVERY              │
│  T6  FIRST RESTLESS IN BATCH 1  ... │
│  T5  FIRST REMEMBERED IN BATCH 1 ...│
│  ... (5 tier discoveries)            │
└──────────────────────────────────────┘
```

**Achievement ID mapping (13 per batch):**

| ID | Title | Description | Section |
|----|-------|-------------|---------|
| 0 | PIONEER | First Mint | General + Legend |
| 1 | COMBINER | First Combine | General |
| 2 | SMITH | First Forge | General + Legend |
| 3 | CENTURION | First 100 Mints | General |
| 4 | RESTLESS REVEAL | First T6 Reveal | Tier Discovery |
| 5 | REMEMBERED REVEAL | First T5 Reveal | Tier Discovery |
| 6 | ORDERED REVEAL | First T4 Reveal | Tier Discovery |
| 7 | CHAOTIC REVEAL | First T3 Reveal | Tier Discovery |
| 8 | WILLFUL REVEAL | First T2 Reveal | Tier Discovery |
| 9 | FIVE HUNDRED | First 500 Mints | General |
| 10 | THE THOUSAND | First 1,000 Mints | General + Legend |
| 11 | CONTENDER | First 5 Tiers Held | General |
| 12 | COUNTDOWN THREAT | First 6 Tiers Held | General + Legend |

**Legends** are batch 1 achievements [0, 2, 10, 12] displayed as all-time firsts.
**Tier Discovery** is batch 1 achievements [4-8] displayed as all-time firsts.
**Batch Firsts** and **Batch Tier Discovery** are the current batch's achievements.

| Data point | Source | Status |
|-----------|--------|--------|
| Winner address | Contract: `batchFirsts(batch, achievementId).winner` | REAL |
| Prize amount | Contract: `batchFirsts(batch, achievementId).prize` or `defaultFirstPrize` | REAL |
| Claimed status | Contract: `batchFirsts(batch, achievementId).claimed` | REAL |
| (YOU) tag | Computed: winner.toLowerCase() === connectedAddress.toLowerCase() | COMPUTED |

**Interactions:**
- **[CLAIM] button** — appears on each row where `isYou && !claimed`. Opens ClaimModal with `claimType: 'batchFirst'`.

---

### 7. ClaimModal

**State machine:**

```
idle → [CONFIRM CLAIM clicked] → confirming (wallet prompt)
                                      ↓
                                  pending (tx submitted, waiting for confirmation)
                                      ↓
                                ┌── success → [DONE] → close modal, refetch claimable
                                └── error → [RETRY] or [CLOSE]
```

**Contract writes:**

| Claim Type | Function Called | Arguments | Gas Limit |
|------------|---------------|-----------|-----------|
| `lottery` | `claimDailyPrize(day)` | day number (uint256) | 300,000 |
| `batchFirst` | `claimBatchFirst(batch, achievementId)` | batch + achievement ID | 300,000 |
| `bounty` | `claimBatchBounty(batch)` | batch number | 300,000 |

**After success:** Calls `refetchClaimable()` to re-read `getClaimable(wallet)` from the contract, updating all claim button visibility across the app.

---

## Refresh Cadence Summary

| Data | How often | Mechanism |
|------|-----------|-----------|
| Contract reads (lottery, bounty, firsts, pools) | Every 120s | wagmi `refetchInterval` |
| Window info (for countdown) | Every 30s | wagmi `refetchInterval` |
| Current day | Every 60s | wagmi `refetchInterval` |
| Subgraph (streak, milestones, players) | Every 120s | `setInterval` in useEffect |
| Countdown display | Every 1s | Client-side `useCountdown()` hook |
| Claimable rewards | Every 120s + on claim success | wagmi `refetchInterval` + manual `refetch()` |

---

## Implementation Status Matrix

| Feature | Status | Notes |
|---------|--------|-------|
| Streak count + tiers | **REAL** | Subgraph playerActivities → consecutive date count |
| 7-day timeline | **REAL** | Subgraph activity dates vs last 7 UTC days |
| Milestone badges (3 categories) | **REAL** | Subgraph player stats + on-chain balances |
| Lottery prize display | **REAL** | Contract: `dailyPrize(batch)` |
| Lottery wallet count | **REAL** | Subgraph allPlayers fallback (uniquePlayers is bugged) |
| Lottery live countdown | **REAL** | Contract `getWindowInfo().closeAt` + client-side 1s tick |
| Lottery eligibility | **REAL** | Subgraph: today's activity.hasMint |
| Lottery recent draws | **REAL** | Contract: `dailyDraws(day)` × 3 |
| Lottery claim | **REAL** | Contract write: `claimDailyPrize(day)`, gas 300k |
| Bounty progress bar | **MIXED** | Minted = REAL (subgraph), target = HARDCODED array |
| Bounty eligibility | **REAL** | Subgraph: totalMints > 0 |
| Bounty claim | **REAL** | Contract write: `claimBatchBounty(batch)`, gas 300k |
| Bounty completed batches | **NOT WIRED** | Hardcoded empty `[]` |
| Hall of Fame legends | **REAL** | Contract: `batchFirsts(1, [0,2,10,12])` |
| Hall of Fame tier discovery | **REAL** | Contract: `batchFirsts(1, [4-8])` |
| Batch firsts (current) | **REAL** | Contract: `batchFirsts(batch, [0-12])` |
| Batch first claim | **REAL** | Contract write: `claimBatchFirst(batch, id)`, gas 300k |
| Rewards pool total | **REAL** | Sum of lotteryPool + firstsPool + bountyPool |
| Milestone "BATCH 2" tab | **NOT WIRED** | Tab exists, no switch logic |
| "$50 AT CURRENT RATE" | **HARDCODED** | Static string in LotteryDetail |
| "EST. GAS: ~0.0001 Ξ" | **HARDCODED** | Static string in ClaimModal |

---

## Hardcoded Constants

| Constant | Location | Value |
|----------|----------|-------|
| STREAK_TIERS | useRewardsData.js | ACTIVE(3d), COMMITTED(7d), DEDICATED(14d), RELENTLESS(30d), LEGENDARY(60d) |
| MILESTONE_DEFS | useRewardsData.js | 3 categories × 5-6 badges with count thresholds |
| ACHIEVEMENT_META | useRewardsData.js | 13 achievement names/descriptions (IDs 0-12) |
| BATCH_SUPPLY_TARGETS | useRewardsData.js | [0, 50K, 100K, 150K, 200K, 250K, 300K, 350K, 400K, 450K, 500K] |
| LEGEND_IDS | useRewardsData.js | [0, 2, 10, 12] |
| TIER_DISCOVERY_IDS | useRewardsData.js | [4, 5, 6, 7, 8] |
| Gas limit (all claims) | ClaimModal.jsx | 300,000 |

---

## Contract Addresses

```
REWARDS:  0xEfD6e50be55b8eA31019eCFd44b72D77C5bd840d  (Base Sepolia)
WINDOW:   0x7934276Bfcf25C8358dFf5a0C012056b97679087  (Base Sepolia)
```

---

## Known Issues

1. **Subgraph `uniquePlayers` is 0** — the subgraph handler doesn't increment this field. Workaround: fallback query counts `allPlayers` entities with totalMints > 0.
2. **Completed batches history** — `bounty.completedBatches` is always `[]`. Needs subgraph query for historical batch bounties.
3. **"BATCH 2" milestone tab** — UI element exists but tab switching is not implemented.
4. **"~$50 AT CURRENT RATE"** — hardcoded, not connected to any price feed.
