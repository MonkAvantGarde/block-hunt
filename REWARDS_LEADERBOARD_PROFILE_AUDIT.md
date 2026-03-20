# Rewards / Leaderboard / Profile — Data Audit
> **Date:** March 19, 2026
> **Overall:** ~65% real data, ~35% mock/placeholder

---

## Summary

| Section | Real | Mock | Mixed |
|---------|------|------|-------|
| **Rewards Panel** — Streak | 100% | — | — |
| **Rewards Panel** — Milestones | 100% | — | — |
| **Rewards Panel** — Lottery | 30% | 70% | — |
| **Rewards Panel** — Bounty | — | — | 50/50 |
| **Rewards Panel** — Hall of Fame | 0% | 100% | — |
| **Rewards Panel** — Pool Display | 0% | 100% | — |
| **Leaderboard** | 95% | 5% | — |
| **Profile** | 90% | 10% | — |

---

## REWARDS PANEL

### Files
- `panels/RewardsPanel.jsx` — main panel with 6 detail views
- `hooks/useRewardsData.js` — data fetching (subgraph + mock)
- `components/rewards/RewardsOverview.jsx` — overview cards
- `components/rewards/StreakDetail.jsx` — streak deep-dive
- `components/rewards/MilestoneDetail.jsx` — badge grid
- `components/rewards/LotteryDetail.jsx` — daily lottery
- `components/rewards/BountyDetail.jsx` — batch bounty
- `components/rewards/HallOfFameDetail.jsx` — legendary firsts
- `components/rewards/ClaimModal.jsx` — claim action (not wired)

### Subgraph Endpoint
`https://api.studio.thegraph.com/query/1744131/blok-hunt/version/latest`
Refreshes every 2 minutes.

---

### 1. Streak (StreakDetail.jsx) — ALL REAL

| Data Point | Display | Source | Status |
|-----------|---------|--------|--------|
| Streak count | Large number + "DAYS" | Subgraph `playerActivities` → consecutive day count | REAL |
| Current tier | "DEDICATED", "RELENTLESS" etc. | Calculated from streak vs STREAK_TIERS thresholds (3/7/14/30/60) | REAL |
| Next tier | Progress bar + "NEXT: X (N days)" | Next tier from STREAK_TIERS | REAL |
| 7-day timeline | SUN-SAT with done/today/missed symbols | Subgraph activity dates | REAL |
| Tier table | 5 rows with earned/current/locked badges | Compared against streak count | REAL |

### 2. Milestones (MilestoneDetail.jsx) — ALL REAL

| Data Point | Display | Source | Status |
|-----------|---------|--------|--------|
| Minting badges | NOVICE(10), BRONZE(100)...OBSIDIAN(10000) | Subgraph `player.totalMints` | REAL |
| Forging badges | FIRST SPARK(1), TINKERER(5)...LEGENDARY(100) | Subgraph `player.totalForges` | REAL |
| Collection badges | COLLECTOR(2)...COUNTDOWN THREAT(6) | On-chain `balances` (tiers held count) | REAL |
| Progress bars | Current/required for next badge | Calculated from above | REAL |
| Tab: "BATCH 2" | Disabled tab | Hardcoded, not functional | MOCK |

### 3. Lottery (LotteryDetail.jsx) — MOSTLY MOCK

| Data Point | Display | Source | Status |
|-----------|---------|--------|--------|
| Daily prize | "0.02 Ξ" | Hardcoded `lottery.prize = 0.02` | MOCK |
| Est. value | "~$50 AT CURRENT RATE" | Hardcoded text | MOCK |
| Wallet count | Dynamic number | Subgraph `seasonStat.uniquePlayers` | REAL |
| Your odds | "X.X%" | Calculated: `100 / wallets` | REAL |
| Draw countdown | "04:22:18" | Hardcoded static string | MOCK |
| Eligibility | Green/red indicator | Subgraph: user has activity today | REAL |
| Yesterday's winner | "0x7a3f...8b2c" | Hardcoded mock address | MOCK |
| Yesterday's date | "MAR 15, 2026" | Hardcoded | MOCK |
| Recent draws table | 3 rows | Hardcoded mock data | MOCK |

**To make real:** Call `dailyDraws(day)`, `dailyPrize(batch)`, `lotteryPool(batch)` on REWARDS contract.

### 4. Bounty (BountyDetail.jsx) — MIXED

| Data Point | Display | Source | Status |
|-----------|---------|--------|--------|
| Batch number | "BATCH 2 BOUNTY" | Hardcoded `bounty.currentBatch = 2` | MOCK |
| Minted count | Dynamic number | Subgraph `seasonStat.totalMinted` | REAL |
| Total target | "500,000" | Hardcoded `bounty.total = 500000` | MOCK |
| Progress bar | Percentage fill | Calculated from mixed data | MIXED |
| Bounty amount | "0.20 Ξ" | Hardcoded `bounty.bountyAmount = 0.20` | MOCK |
| Eligible wallets | Dynamic number | Subgraph `seasonStat.uniquePlayers` | REAL |
| Per-wallet estimate | Calculated | `0.20 / uniquePlayers` | MIXED |
| User eligibility | Green/red | `totalMints > 0` from subgraph | REAL |
| Completed batches | "BATCH 1 — CLAIMED" | Hardcoded mock array | MOCK |

**To make real:** Call `batchConfigs(batch)`, `batchBounties(batch)`, `bountyPool(batch)` on REWARDS contract.

### 5. Hall of Fame (HallOfFameDetail.jsx) — ALL MOCK

| Data Point | Display | Source | Status |
|-----------|---------|--------|--------|
| Legends (4 items) | THE PIONEER, THE FIRST SPARK, etc. | Hardcoded mock objects | MOCK |
| Tier Discovery (6 rows) | "FIRST RESTLESS REVEAL" etc. | Hardcoded mock objects | MOCK |
| Batch Firsts (4 items) | "BATCH 2 PIONEER" etc. + prize amounts | Hardcoded mock objects | MOCK |
| Batch Tier Discovery | Per-tier discovery per batch | Hardcoded mock objects | MOCK |
| Wallet addresses | "0x20b3...0c57" etc. | Hardcoded mock addresses | MOCK |
| (YOU) tags | Highlight for connected wallet | Compared against mock `isYou` flag | MOCK |
| Prize amounts | "0.02 Ξ" | Hardcoded | MOCK |
| Claimed status | Checkmarks | Hardcoded flags | MOCK |

**To make real:** Call `batchFirsts(batch, achievementId)`, `getClaimable(wallet)` on REWARDS contract. Legends may need subgraph entity.

### 6. Rewards Pool Display — MOCK

| Data Point | Display | Source | Status |
|-----------|---------|--------|--------|
| Pool amount | "0.5000 Ξ" | Hardcoded `rewardsPool = 0.5` in useRewardsData | MOCK |

**To make real:** Sum of `lotteryPool + firstsPool + bountyPool` per active batch from REWARDS contract.

### 7. Claim Modal (ClaimModal.jsx) — NOT WIRED

| Data Point | Display | Source | Status |
|-----------|---------|--------|--------|
| Reward name | Passed via prop | Mock data | MOCK |
| Amount | Passed via prop | Mock data | MOCK |
| Est. gas | "~0.0001 Ξ" | Hardcoded | MOCK |
| CONFIRM CLAIM button | Action | **Not wired to any contract call** | NOT FUNCTIONAL |

**To make real:** Wire `useWriteContract` for `claimDailyPrize()`, `claimBatchFirst()`, `claimBatchBounty()`.

---

## LEADERBOARD MODAL

### File: `components/Modals.jsx` (lines 366-541)

### Data Source: Subgraph query (real)

| Data Point | Display | Source | Status |
|-----------|---------|--------|--------|
| Season total minted | Number | Subgraph `seasonStat.totalMinted` | REAL |
| Season total burned | Number | Subgraph `seasonStat.totalBurned` | REAL |
| Season players | Number | Subgraph `seasonStat.uniquePlayers` | REAL |
| Prize Pool | "live ↗" link text | Hardcoded text (not actual value) | MOCK |
| Player rank | "#N" | Array position from query sort | REAL |
| Player address | "0x1234...cdef" + (YOU) tag | Subgraph `player.id` | REAL |
| Tiers held | 6 colored dots + "N/6" | Subgraph `tier2Balance...tier7Balance` | REAL |
| Progression score | Formatted number | Subgraph `player.progressionScore` | REAL |
| Total mints | Number | Subgraph `player.totalMints` | REAL |
| Distance alert | "N AWAY" badge (if tiers >= 5) | Calculated: `6 - tiersUnlocked` | REAL |
| Pagination | "LOAD MORE" / "ALL N SHOWN" | Page-based fetch, 100 per page | REAL |

**One gap:** Prize Pool in header shows "live ↗" text instead of actual ETH value.

---

## PROFILE MODAL

### File: `components/Modals.jsx` (lines 556-658)

### Data Source: On-chain reads via `useGameState()`

| Data Point | Display | Source | Status |
|-----------|---------|--------|--------|
| Wallet address | "0xd382...8332" + COPY button | `connectedAddress` prop | REAL |
| Season badge | "SEASON 1" | Hardcoded | REAL (correct for now) |
| Total blocks | Sum of all tiers | `balances[1..7]` from chain | REAL |
| Tiers held | "N / 6" | Count of tiers 2-7 with balance > 0 | REAL |
| Holdings per tier | T7-T1 rows with counts | `balances[t]` per tier | REAL |
| Holdings card styling | Colored/dimmed | `qty > 0` conditional | REAL |
| Activity history | "Coming at mainnet launch" | Placeholder text | NOT IMPLEMENTED |
| BaseScan link | "VIEW ON BASESCAN ↗" | Dynamic: `sepolia.basescan.org/address/{addr}` | REAL |

---

## REWARDS CONTRACT (not yet wired)

**Address:** `0xEfD6e50be55b8eA31019eCFd44b72D77C5bd840d`
**ABI:** Defined in `abis/index.js` (lines 294-400)

### Available Read Functions (unused)

| Function | Returns | Would replace |
|----------|---------|---------------|
| `lotteryPool(batch)` | uint256 | Lottery prize mock |
| `dailyPrize(batch)` | uint256 | "0.02 Ξ" hardcoded |
| `dailyDraws(day)` | winner, prize, claimed | Yesterday's winner mock |
| `batchConfigs(batch)` | totalDeposit, lotteryBps, active | Bounty amount mock |
| `batchBounties(batch)` | recipients, perWallet | Per-wallet estimate |
| `batchFirsts(batch, id)` | winner, prize, claimed | Hall of Fame mocks |
| `getClaimable(wallet)` | Full claimable struct | All claim UI |

### Available Write Functions (unused)

| Function | Purpose |
|----------|---------|
| `claimDailyPrize(day)` | Claim lottery win |
| `claimBatchFirst(batch, id)` | Claim batch first achievement |
| `claimBatchBounty(batch)` | Claim bounty distribution |

---

## WHAT NEEDS TO HAPPEN

### To make Rewards fully real:

1. **Wire REWARDS contract reads** in `useRewardsData.js`:
   - Replace lottery mock with `dailyPrize()`, `dailyDraws()`, `lotteryPool()`
   - Replace bounty mock with `batchConfigs()`, `batchBounties()`, `bountyPool()`
   - Replace rewardsPool with sum of sub-pools
   - Hall of Fame needs `batchFirsts()` + potentially subgraph entities for legends

2. **Wire claim functions** in `ClaimModal.jsx`:
   - `useWriteContract` for the 3 claim functions
   - Success/error handling
   - Balance refresh after claim

3. **Fix lottery countdown** — needs to calculate from on-chain window timing, not hardcoded string

4. **Fix leaderboard Prize Pool** — show actual value instead of "live ↗"

5. **Profile activity history** — wire to subgraph `playerActivities` query (data exists, just not displayed)

---

## SUBGRAPH AUDIT

### Current State

The subgraph indexes **only** the BlockHuntToken contract. It has 3 entities (Player, PlayerActivity, SeasonStat) and handles 5 events.

### CRITICAL: Address Mismatch

| Contract | Subgraph Address | Correct Address | Status |
|----------|------------------|-----------------|--------|
| TOKEN | `0x5A5335f138950C127...` (OLD) | `0x669aa2605E66565EFe...` | **WRONG** |
| FORGE | Not indexed | `0x94d283a21386f1c5b...` | **MISSING** |
| REWARDS | Not indexed | `0xEfD6e50be55b8eA31...` | **MISSING** |

**The subgraph is indexing the old Token contract.** All leaderboard/streak data in the frontend is stale — it reflects the previous deployment, not current on-chain state.

### What the Subgraph Currently Tracks

| Feature | Entity | Events Handled | Status |
|---------|--------|----------------|--------|
| Tier balances (T1-T7) | Player | TransferSingle, TransferBatch | Working (wrong address) |
| Total mints | Player | MintFulfilled | Working (wrong address) |
| Total combines | Player | BlocksCombined | Working (wrong address) |
| Forge counts | Player | BlocksForged | Working (wrong address) |
| Progression score | Player | Recalculated on every event | Working (wrong address) |
| Daily activity | PlayerActivity | Recorded on mint/combine/forge | Working (wrong address) |
| Season stats | SeasonStat | Updated on mint/burn | Working (wrong address) |

### What the Subgraph is Missing

| Feature | Needed For | Entities Required | Events to Handle |
|---------|-----------|-------------------|------------------|
| Forge request details | Forge panel history | `ForgeRequest` | ForgeRequested, ForgeResolved |
| Batch forge details | Batch forge tracking | (extend ForgeRequest) | BatchForgeRequested, BatchForgeResolved |
| Daily lottery draws | Lottery detail view | `DailyDraw` | DailyDrawResolved, DailyPrizeClaimed |
| Batch firsts | Hall of Fame | `BatchFirst` | BatchFirstAwarded, BatchFirstClaimed |
| Batch bounties | Bounty detail view | `BatchBounty` | BatchBountySet, BatchBountyClaimed |
| Reward pool config | Rewards overview | `BatchRewardConfig` | BatchFunded, BatchRatiosUpdated |

### Schema Additions Needed

```graphql
type ForgeRequest @entity {
  id: ID!                    # "{requestId}"
  requestId: BigInt!
  player: Player!
  fromTier: Int!
  burnCount: BigInt!
  resolved: Boolean!
  success: Boolean
  createdAt: BigInt!
  resolvedAt: BigInt
}

type DailyDraw @entity {
  id: ID!                    # "draw-{day}"
  day: BigInt!
  batch: Int!
  winner: Player!
  prize: BigInt!
  resolvedAt: BigInt!
  claimed: Boolean!
}

type BatchFirst @entity {
  id: ID!                    # "{batch}-{achievementId}"
  batch: Int!
  achievementId: Int!
  winner: Player!
  prize: BigInt!
  awardedAt: BigInt!
  claimed: Boolean!
}

type BatchBounty @entity {
  id: ID!                    # "bounty-{batch}"
  batch: Int!
  totalRecipients: BigInt!
  perWalletShare: BigInt!
  setAt: BigInt!
  distributed: Boolean!
}

type BatchRewardConfig @entity {
  id: ID!                    # "config-{batch}"
  batch: Int!
  totalDeposit: BigInt!
  lotteryBps: Int!
  firstsBps: Int!
  bountyBps: Int!
  active: Boolean!
}
```

---

## PHASED FIX PLAN

### Phase 0 — Subgraph Emergency Fix (blocks everything else)

**Problem:** Subgraph points to old Token address. All leaderboard/streak data is stale.

**Tasks:**
1. Update `subgraph.yaml` Token address to `0x669aa2605E66565EFe874dBb8cAB9450c75E7A00`
2. Update `startBlock` to the new Token's deployment block
3. Copy new Token ABI to `subgraph/abis/BlockHuntToken.json`
4. Run `graph codegen && graph build`
5. Deploy: `graph deploy --studio blok-hunt`

**Result:** Leaderboard, streak, milestones, and season stats will show correct data from the new contracts.

**Risk:** Low — same schema, same handlers, just a new address.

---

### Phase 1 — Add Forge Datasource to Subgraph

**Problem:** Forge events not indexed. No detailed forge history.

**Tasks:**
1. Add BlockHuntForge ABI to `subgraph/abis/`
2. Add new datasource in `subgraph.yaml` for Forge at `0x94d283a21386f1c5b051cE0ac5b9AD878182827c`
3. Add `ForgeRequest` entity to schema
4. Add handlers: `handleForgeRequested`, `handleForgeResolved`, `handleBatchForgeRequested`, `handleBatchForgeResolved`
5. Build and deploy subgraph

**Result:** Detailed forge history available via subgraph. Frontend could show forge history in profile.

**Risk:** Low — additive only, no changes to existing entities.

---

### Phase 2 — Add Rewards Datasource to Subgraph

**Problem:** Rewards contract events not indexed. Lottery, bounty, hall of fame all mock.

**Tasks:**
1. Add BlockHuntRewards ABI to `subgraph/abis/`
2. Add new datasource in `subgraph.yaml` for Rewards at `0xEfD6e50be55b8eA31019eCFd44b72D77C5bd840d`
3. Add entities: `DailyDraw`, `BatchFirst`, `BatchBounty`, `BatchRewardConfig`
4. Add handlers for all 8 Rewards events
5. Build and deploy subgraph

**Result:** All reward data indexed and queryable. Foundation for Phases 3-5.

**Risk:** Low — additive only.

---

### Phase 3 — Wire Rewards Contract Reads into Frontend

**Problem:** useRewardsData.js uses hardcoded mock objects for lottery, bounty, hall of fame.

**Tasks:**
1. Import `REWARDS_ABI` and `CONTRACTS` in `useRewardsData.js`
2. Add `useReadContract` calls for:
   - `dailyPrize(currentBatch)` → lottery prize
   - `lotteryPool(currentBatch)` → total lottery pool
   - `batchConfigs(currentBatch)` → bounty config
   - `bountyPool(currentBatch)` → bounty pool
3. Replace lottery mock object with contract reads + subgraph DailyDraw queries
4. Replace bounty mock object with contract reads + subgraph BatchBounty queries
5. Replace rewardsPool hardcoded value with sum of sub-pools
6. Calculate lottery countdown from on-chain window timing (not static string)

**Result:** Lottery, Bounty, and Rewards Pool show real on-chain data.

**Depends on:** Phase 2 (subgraph has DailyDraw/BatchBounty entities)

---

### Phase 4 — Wire Hall of Fame

**Problem:** All legendary firsts, tier discoveries, and batch firsts are hardcoded mock data.

**Tasks:**
1. Query subgraph for `BatchFirst` entities → replace `hallOfFame.batchFirsts` mock
2. Query subgraph for first player to hold each tier → replace `hallOfFame.tierDiscovery` mock
3. Query subgraph for legendary achievements (first mint, first forge, first 1000, first 6 tiers) → replace `hallOfFame.legends` mock
4. Update HallOfFameDetail.jsx to use real data
5. Handle "(YOU)" tags by comparing against connected wallet

**Result:** Hall of Fame shows real achievements.

**Depends on:** Phase 2 (subgraph has BatchFirst entities). Note: "Legends" (first mint ever, first forge ever) may need a new subgraph entity or can be derived from existing Player entity sorting.

---

### Phase 5 — Wire Claim Functions

**Problem:** ClaimModal CONFIRM button does nothing. No contract writes wired.

**Tasks:**
1. In ClaimModal.jsx, add `useWriteContract` hook
2. Wire 3 claim functions based on reward type:
   - `claimDailyPrize(day)` for lottery wins
   - `claimBatchFirst(batch, achievementId)` for batch first achievements
   - `claimBatchBounty(batch)` for bounty distributions
3. Add gas limit overrides (learned from forge gas issue)
4. Handle success state (show confirmation, refresh data)
5. Handle error state (show error, allow retry)
6. After successful claim, refetch rewards data

**Result:** Players can claim earned rewards from the UI.

**Depends on:** Phases 3-4 (real data needed to know what's claimable)

---

### Phase 6 — Profile Activity History + Leaderboard Prize Pool

**Problem:** Profile says "coming at mainnet launch". Leaderboard shows "live ↗" instead of prize pool value.

**Tasks:**
1. Query subgraph `playerActivities` in Profile modal → show recent activity list
2. Pass `prizePool` prop to Leaderboard modal → show actual ETH value
3. Format activity as: "Minted 50 blocks", "Combined T7→T6", "Forged T5 (success)" etc.

**Result:** Profile shows real activity. Leaderboard shows real prize pool.

**Depends on:** Phase 0 (correct subgraph address)

---

### Phase Summary

| Phase | Scope | Effort | Depends On | Impact |
|-------|-------|--------|-----------|--------|
| **0** | Fix subgraph Token address | 15 min | Nothing | Fixes ALL leaderboard/streak data |
| **1** | Add Forge to subgraph | 1 hr | Phase 0 | Forge history available |
| **2** | Add Rewards to subgraph | 2 hrs | Phase 0 | Foundation for reward UI |
| **3** | Wire reward contract reads | 2 hrs | Phase 2 | Lottery + Bounty show real data |
| **4** | Wire Hall of Fame | 1.5 hrs | Phase 2 | Real achievements displayed |
| **5** | Wire claim functions | 1.5 hrs | Phases 3-4 | Players can claim rewards |
| **6** | Profile history + leaderboard fix | 1 hr | Phase 0 | Polish |

**Total estimated:** ~9-10 hours across all phases


