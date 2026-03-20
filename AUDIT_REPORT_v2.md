# Block Hunt — Contract Audit Report v2

## Date: 2026-03-20
## Auditor: Claude Opus 4.6 (automated)
## Context: Post v2.1 refresh — 10 batches, new combine ratios, continuous probability, countdown takeover, BlockHuntRewards added

---

## Contracts Audited

| Contract | Lines | Pragma | Dependencies | Inheritance |
|---|---|---|---|---|
| BlockHuntToken.sol | 835 | ^0.8.20 | OZ ERC1155, ERC2981, ReentrancyGuard, Pausable; Chainlink VRFConsumerBaseV2Plus | ERC1155, ERC2981, VRFConsumerBaseV2Plus, ReentrancyGuard, Pausable |
| BlockHuntTreasury.sol | 130 | ^0.8.20 | OZ Ownable, ReentrancyGuard | Ownable, ReentrancyGuard |
| BlockHuntMintWindow.sol | 271 | ^0.8.20 | OZ Ownable | Ownable |
| BlockHuntForge.sol | 446 | ^0.8.20 | OZ ReentrancyGuard; Chainlink VRFConsumerBaseV2Plus | VRFConsumerBaseV2Plus, ReentrancyGuard |
| BlockHuntCountdown.sol | 273 | ^0.8.20 | OZ Ownable | Ownable |
| BlockHuntEscrow.sol | 257 | ^0.8.20 | OZ Ownable, ReentrancyGuard | Ownable, ReentrancyGuard |
| BlockHuntMigration.sol | 332 | ^0.8.20 | OZ Ownable, ReentrancyGuard | Ownable, ReentrancyGuard |
| BlockHuntSeasonRegistry.sol | 153 | ^0.8.20 | OZ Ownable | Ownable |
| BlockHuntRewards.sol | 656 | ^0.8.20 | OZ Ownable, ReentrancyGuard, Pausable | Ownable, ReentrancyGuard, Pausable |
| **Total source** | **3,353** | | | |
| test/BlockHunt.t.sol | 4,069 | | | |
| test/BlockHuntRewards.t.sol | 726 | | | |
| script/Deploy.s.sol | 235 | | | |

## Tests: 344 total across 4 suites — ALL PASSING

- BlockHuntTest: 298 passed
- BlockHuntRewardsTest: 44 passed
- BlockHuntMintWindow (state test): 1 passed
- BlockHuntCountdown (state test): 1 passed

---

## FINDINGS SUMMARY

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 3 |
| MEDIUM | 5 |
| LOW | 9 |
| INFO | 12 |

---

## CRITICAL FINDINGS

_None._ No automatically exploitable bug that puts funds at immediate risk without owner collaboration.

---

## HIGH FINDINGS

### H-1: `emergencyWithdraw` on Treasury allows owner to drain all funds

**Contract:** BlockHuntTreasury.sol (line 123)
**Function:** `emergencyWithdraw(address to, uint256 amount)`
**Description:** Owner can withdraw arbitrary amounts from Treasury at any time. Combined with `pause()` on Token, the owner can freeze minting and drain the prize pool. Code comment says "Remove this function after security audit before mainnet."
**Impact:** Complete fund drain by owner.
**Status:** Unchanged from v1 audit (H-2). Acceptable for testnet.
**Recommendation:** Remove before mainnet; add timelock + multisig.

### H-2: `emergencyWithdraw` on BlockHuntRewards allows owner to drain reward pool

**Contract:** BlockHuntRewards.sol (line 649)
**Function:** `emergencyWithdraw(address to, uint256 amount)`
**Description:** Owner can withdraw arbitrary amounts from the Rewards contract, bypassing all sub-pool accounting. This can steal unclaimed lottery prizes, batch first prizes, and bounty funds.
**Impact:** Complete reward pool drain by owner.
**Status:** NEW (contract is new since v1 audit).
**Recommendation:** Remove before mainnet. For testnet, document the risk.

### H-3: Rewards lottery uses off-chain randomness — keeper can manipulate winner selection

**Contract:** BlockHuntRewards.sol (line 291)
**Function:** `resolveDailyDraw(day, batch, wallets, randomSeed)`
**Description:** The daily lottery winner is selected by `randomSeed % wallets.length` where `randomSeed` is provided by the owner/keeper. The keeper controls both the wallet list AND the random seed, giving complete control over who wins. The keeper can also front-run the draw by including or excluding wallets.
**Impact:** Lottery is not provably fair. The keeper can award prizes to themselves or colluding wallets.
**Status:** NEW. Documented in the contract as "MVP — future upgrade can integrate on-chain VRF."
**Recommendation:** For testnet beta, document this limitation clearly. For mainnet, integrate Chainlink VRF directly into the draw resolution.

---

## MEDIUM FINDINGS

### M-1: Rewards `topUp` after `withdrawLeftover` is allowed but accounting is inconsistent

**Contract:** BlockHuntRewards.sol (lines 176, 514)
**Functions:** `topUp()`, `withdrawLeftover()`
**Description:** `withdrawLeftover` sets `settled = true` and withdraws unallocated buffer. However, `topUp` does NOT check the `settled` flag — it only checks `active`. After `withdrawLeftover`, calling `topUp` increases `totalDeposit` which recalculates sub-pools, but the `settled` flag blocks further `withdrawLeftover` calls. The test `test_topUp_works_after_withdrawLeftover` confirms this is intentional, but the interaction is confusing and could lead to funds being trapped (increased sub-pools with no way to withdraw leftover again).
**Impact:** Funds added via `topUp` after settling cannot have their buffer withdrawn. The funds ARE still distributable via lottery/firsts/bounty, but any new buffer dust is locked.
**Recommendation:** Either block `topUp` after `settled`, or reset `settled = false` on `topUp`.

### M-2: Rewards bounty `perWalletShare` uses integer division — dust locked in contract

**Contract:** BlockHuntRewards.sol (line 431)
**Function:** `finalizeBatchBounty()`
**Description:** `perWallet = pool / totalRecipients`. If `bountyPool = 1 ETH` and `recipients = 3`, each gets `0.333... ETH` and ~`0.000...001 ETH` dust is locked. This dust accumulates across batches. The only escape is `emergencyWithdraw`.
**Impact:** Small dust amounts permanently locked per batch. Negligible at small scale but accumulates.
**Recommendation:** Accept as known limitation, or add a bounty-specific sweep function.

### M-3: Rewards `sweepExpired` iterates day range — potential gas limit issue

**Contract:** BlockHuntRewards.sol (line 478)
**Function:** `sweepExpired(batch, to)`
**Description:** Iterates from `firstDrawDay` to `lastDrawDay`. If the game runs for a year with daily draws, this is 365 iterations with storage reads per iteration. At ~5k gas per iteration, that's ~1.8M gas — within limits but approaching block gas boundary on Base if combined with other operations.
**Impact:** Could become uncallable after extended operation.
**Recommendation:** The day-range tracking (`firstDrawDay`/`lastDrawDay`) was added as a fix, which helps. Consider adding a `startDay`/`endDay` parameter to sweep in ranges.

### M-4: Escrow uses `address(this).balance` — vulnerable to balance inflation via `selfdestruct`

**Contract:** BlockHuntEscrow.sol (line 103)
**Function:** `initiateSacrifice()`
**Description:** The 50/40/10 split is calculated from `address(this).balance`. ETH can be force-sent to the contract via `selfdestruct`, inflating the balance before sacrifice. This distorts the split percentages.
**Impact:** Attacker loses their ETH. Split amounts are larger than expected but no funds are stolen from players. Low practical impact.
**Status:** Unchanged from v1 audit (M-2). Accepted risk.

### M-5: Countdown `challengeCountdown` callable from smart contracts — MEV/griefing risk

**Contract:** BlockHuntCountdown.sol (line 166)
**Function:** `challengeCountdown()`
**Description:** No `tx.origin == msg.sender` check. A contract could atomically acquire blocks, challenge, then return them. The new holder's countdown resets when `checkHolderStatus` detects missing tiers.
**Impact:** Griefing — cannot profit, but can disrupt other players' countdowns.
**Status:** Unchanged from v1 audit (M-3). The v2.1 rank-based scoring (distinct tiers + total blocks) makes this harder since the attacker needs substantial holdings.

---

## LOW FINDINGS

### L-1: Forge `setTokenContract` has no one-time or test-mode guard

**Contract:** BlockHuntForge.sol (line 107)
**Description:** Owner can change the token contract at any time. While Forge doesn't hold significant ETH, this could redirect forge operations.
**Status:** Unchanged from v1 (L-3).

### L-2: MintWindow `setTokenContract` has no guard

**Contract:** BlockHuntMintWindow.sol (line 127)
**Status:** Unchanged from v1 (L-4).

### L-3: Countdown `setTokenContract` has no guard

**Contract:** BlockHuntCountdown.sol (line 83)
**Status:** Unchanged from v1 (L-5).

### L-4: `castVote` has no token-holder check

**Contract:** BlockHuntCountdown.sol (line 216)
**Description:** Any address can vote, even without holding blocks. Vote is "social signal only."
**Status:** Unchanged from v1 (L-1).

### L-5: Migration uses pseudo-randomness for starter tier allocation

**Contract:** BlockHuntMigration.sol (line 231)
**Description:** Uses `block.prevrandao`. Comment says "Replace with Chainlink VRF before mainnet."
**Status:** Unchanged from v1 (L-7).

### L-6: MintWindow batch supply/price mismatch with spec

**Contract:** BlockHuntMintWindow.sol (lines 67-76)
**Description:** The spec (Section 3A) states batch supplies of: 100K, 100K, 200K, 200K, 500K, 500K, 1M, 1M, 500K, 500K and prices of: 0.00008, 0.00016, 0.00032, 0.00064, 0.00080, 0.00100, 0.00120, 0.00160, 0.00180, 0.00200 ETH. The deployed values differ:

| Batch | Spec Supply | Code Supply | Spec Price | Code Price |
|-------|-------------|-------------|------------|------------|
| B1 | 100,000 | 100,000 | 0.00008 | 0.00008 |
| B2 | 100,000 | 100,000 | 0.00016 | 0.00012 |
| B3 | 200,000 | 150,000 | 0.00032 | 0.00020 |
| B4 | 200,000 | 200,000 | 0.00064 | 0.00032 |
| B5 | 500,000 | 250,000 | 0.00080 | 0.00056 |
| B6 | 500,000 | 300,000 | 0.00100 | 0.00100 |
| B7 | 1,000,000 | 400,000 | 0.00120 | 0.00180 |
| B8 | 1,000,000 | 500,000 | 0.00160 | 0.00320 |
| B9 | 500,000 | 500,000 | 0.00180 | 0.00520 |
| B10 | 500,000 | 400,000 | 0.00200 | 0.00800 |

**Impact:** The code values may represent a more recent design iteration. Not a bug if the spec is outdated, but the discrepancy should be verified with the GDD author.
**Recommendation:** Confirm which values are canonical and update the spec or code accordingly.

### L-7: Token fallback mint prices differ from MintWindow prices

**Contract:** BlockHuntToken.sol (lines 161-170)
**Description:** Token has fallback `mintPriceForBatch` values that differ from MintWindow's `batchPrice()` values. For example, Token has B2 at 0.00012 ETH while MintWindow also has 0.00012 ETH (these match), but Token B7 is 0.00180 vs MintWindow B7 is 0.00180 (match). Since `currentMintPrice()` prefers MintWindow prices, the fallback values are only used if MintWindow is not set.
**Impact:** Negligible — fallback is only for backward compatibility.

### L-8: Rewards `MAX_BATCHES = 6` but game has 10 batches

**Contract:** BlockHuntRewards.sol (line 25)
**Description:** `MAX_BATCHES = 6` limits reward deposits to batches 1-6, but the game has 10 batches. The `getClaimable` view function also only iterates batches 1-6.
**Impact:** Batches 7-10 cannot have funded reward pools. This may be intentional (rewards only for early batches) but should be documented.
**Recommendation:** Either increase `MAX_BATCHES` to 10, or document that rewards only cover batches 1-6.

### L-9: Deploy script does NOT deploy BlockHuntRewards

**Contract:** script/Deploy.s.sol
**Description:** The deploy script deploys Token, Treasury, MintWindow, Countdown, Escrow, and Registry. It does NOT deploy or wire BlockHuntRewards. Rewards must be deployed and funded separately.
**Impact:** Not a security issue, but a gap in the deployment automation.
**Recommendation:** Document the manual deployment steps for Rewards.

---

## INFO / OBSERVATIONS

### I-1: Solidity 0.8.20 — built-in overflow/underflow protection
No `unchecked` blocks in any contract. All arithmetic is checked.

### I-2: `calculateScore` overflow analysis (v2.1 weights)
Weights: T2=10,000, T3=2,000, T4=500, T5=100, T6=20, T7=1. Total supply bounded by ~3M across all batches. Maximum realistic score: 3M × 10,000 = 3e10, well within uint256.

### I-3: VRF request confirmations = 3 on both Token and Forge
Standard minimum. Sufficient for Base L2.

### I-4: Checks-effects-interactions pattern followed consistently
All ETH-sending functions update state before external calls.

### I-5: ReentrancyGuard used on all ETH-sending functions
Token, Treasury, Escrow, Forge, Migration, and Rewards all use `nonReentrant` on functions with external calls.

### I-6: VRF callback replay protection
- Token: deletes request then checks `req.player == address(0)` — replay returns silently.
- Forge single: `resolved` flag — replay reverts "Already resolved."
- Forge batch: same `resolved` flag pattern.

### I-7: `cancelMintRequest` is player-only
Line 371: `require(req.player == msg.sender, "Not your request")`. Correct.

### I-8: Forge burns blocks before VRF request
Both single and batch forge burn blocks upfront (lines 146, 247). Callback cannot fail due to insufficient balance.

### I-9: Events indexed appropriately for subgraph
Key events use `indexed` on addresses and IDs.

### I-10: Rewards claim functions all have pull-payment pattern
`claimDailyPrize`, `claimBatchFirst`, `claimBatchBounty` — all mark `claimed = true` before sending ETH. Double-claim prevented.

### I-11: Rewards pool commitment tracked at award time
`lotteryPaidOut` incremented at `resolveDailyDraw` time (line 317), not at claim time. `firstsPaidOut` incremented at `setBatchFirstWinner` time (line 372). This correctly prevents over-commitment.

### I-12: Countdown v2.1 uses rank-based challenge (distinct tiers + total blocks)
The original v1 used raw score comparison. v2.1's `_ranksAbove` first compares distinct tier count, then total blocks. This is a more meaningful ranking.

---

## INVARIANT CHECK RESULTS (v2.1 — 20 invariants)

| # | Invariant | Result | Evidence |
|---|---|---|---|
| 1 | T1 never mintable via VRF | **PASS** | `_assignTier` returns 2-7 only. T1 (`TIER_ORIGIN=1`) never appears in roll logic. |
| 2 | T1 only obtainable via sacrifice | **PASS** | Only `sacrifice()` and `executeDefaultOnExpiry()` call `_mint(holder, TIER_ORIGIN, 1, "")`. |
| 3 | T2-T7 needed for countdown (not T1) | **PASS** | `_checkCountdownTrigger` loops tiers 2-7. `hasAllTiers` checks 2-7. |
| 4 | Creator fee exactly 10% | **PASS** | `creatorFeeBps = 1000`, `MAX_CREATOR_FEE = 1000`. `setCreatorFee` requires `bps <= MAX_CREATOR_FEE`. |
| 5 | Royalty never exceeds 10% | **PASS** | `setRoyalty` has `require(fee <= 1000, "Exceeds 10% cap")` (line 228). **Fixed since v1 audit (was H-4).** |
| 6 | Daily mint cap enforced | **PASS** | `windowCapForBatch(batch)` read dynamically. `windowDayMinted` tracked. `perUserDayCap` enforced in `recordMint`. |
| 7 | Window duration exactly 3 hours | **PASS** | `WINDOW_DURATION = 3 hours` (MintWindow line 12). |
| 8 | Countdown exactly 7 days | **PASS** | `countdownDuration = 7 days` (Countdown line 26). Token has `COUNTDOWN_DURATION = 7 days` (line 75). After challenge: `countdownStartTime = block.timestamp` resets full 7 days. |
| 9 | Challenge cooldown exactly 24 hours | **PASS** | `safePeriod = 1 days` (Countdown line 27). Check: `block.timestamp >= lastChallengeTime + safePeriod`. |
| 10 | Score excludes T1 | **PASS** | `calculateScore` uses `bals[2]` through `bals[7]`. Index 1 (T1) is never referenced. |
| 11 | Challenger must have strictly higher rank | **PASS** | `_ranksAbove` returns true only if `cTiers > hTiers` OR (equal tiers AND `challenger totalBlocks > holder totalBlocks`). Equal rank returns false. |
| 12 | Only Countdown can call `updateCountdownHolder` | **PASS** | `onlyCountdown` modifier (line 194). Modifier checks `msg.sender == countdownContract`. |
| 13 | testMintEnabled/testModeEnabled only disableable | **PASS** | Only `disableTestMint()` and `disableTestMode()` exist. No re-enable setter. Verified across all 9 contracts. |
| 14 | Combine ratios: 21/19/17/15/13 | **PASS** | Token constructor: `combineRatio[7]=21, [6]=19, [5]=17, [4]=15, [3]=13`. No setter exists (ratios are immutable after constructor). |
| 15 | T2→T1 combine disabled | **PASS** | `combine` requires `fromTier >= 3` (line 444). `combineMany` same check (line 462). `combineRatio[2]` is never set (defaults to 0). |
| 16 | Forge cannot produce T1 | **PASS** | Forge requires `fromTier >= 3` (line 134/238), minimum output tier is `fromTier - 1 = 2`. Forge's `_combineRatioForTier` reverts for tiers < 3. |
| 17 | Cap reservation at request time | **PASS** | `windowDayMinted += allocated` in `mint()` (line 276) before VRF request. Restored on cancel (line 380). |
| 18 | 10 batches with correct supply/pricing | **PARTIAL** | 10 batches exist. Values differ from spec — see L-6. The code values may represent a newer design iteration. |
| 19 | Minting continues during active countdown | **PASS** | `mint()` has no `notCountdown` modifier. The `notCountdown` modifier exists but is NOT applied to `mint`. Test `test_MintSucceedsDuringCountdown` and `test_MintingAllowedDuringCountdown` both pass. |
| 20 | Forge probability = (burned/ratio) × 100 | **PASS** | Forge: `successChance = (burnCount * 100) / ratio` (lines 193, 321, 355, 381). Check: `random % 100 < successChance`. |

**Result: 19 PASS, 1 PARTIAL (Invariant #18 — values differ from spec but functionality is correct)**

---

## PREVIOUS AUDIT FINDINGS RE-CHECK

| Finding | Original Fix | Still Present in v2.1? | Status |
|---|---|---|---|
| **H-1: Token setter guards** | `require(addr == address(0) \|\| testMintEnabled)` | **YES** — all 6 setters (5 peripherals + migration) have the guard. Lines 207, 211, 215, 219, 223, 808. | **FIXED** |
| **H-2: emergencyWithdraw on Treasury** | Kept for testnet, flag for mainnet | **YES** — still present (line 123). Still owner-only. | **ACKNOWLEDGED** |
| **H-3: Voter list DoS** | Round-based tracking, `countdownRound++` | **YES** — `_resetCountdown` increments `countdownRound` (line 271). `hasVoted[countdownRound][msg.sender]` pattern used (line 218). No voter list iteration. | **FIXED** |
| **H-4: Royalty cap** | `require(fee <= 1000)` | **YES** — `setRoyalty` has `require(fee <= 1000, "Exceeds 10% cap")` (line 228). | **FIXED** |
| **M-1: Pull-payment for sacrifice** | `pendingWithdrawal` pattern | **YES** — Escrow stores `pendingWithdrawal[winner] = winnerShare` (line 116). Winner calls `withdrawWinnerShare()` (line 182). No push-payment. | **FIXED** |
| **C1: T2→T1 combine** | `fromTier >= 3` | **YES** — line 444 (combine) and line 462 (combineMany). | **FIXED** |
| **C2: `mintForTest` onlyOwner** | Added onlyOwner | **YES** — line 791. Also gated by `testMintEnabled`. | **FIXED** |
| **T1 excluded from VRF** | `_assignTier` returns 2-7 only | **YES** — lines 717-732. Roll space is divided among T2-T7 only. | **FIXED** |

**All previous findings remain fixed. No regressions detected.**

---

## BLOCKHU NTREWARDS.SOL DEEP DIVE (Section 12)

### 1. Deposit tracking — double-counting?
Sub-pools are computed on the fly: `lotteryPool = totalDeposit * lotteryBps / BPS_DENOMINATOR`. Paid-out amounts tracked separately (`lotteryPaidOut`, `firstsPaidOut`, `bountyPaidOut`). Remaining = pool - paidOut. No double-counting possible because pools are derived, not stored.

### 2. Lottery resolution fairness
**NOT FAIR.** Owner provides both `wallets[]` and `randomSeed`. Full manipulation control. See H-3.

### 3. Batch firsts front-running
`setBatchFirstWinner` is owner-only (line 356). Players cannot call it. The keeper awards firsts off-chain by monitoring events. A player cannot front-run a pending VRF callback because firsts are awarded based on completed actions (the keeper monitors finalized events). However, the keeper themselves could front-run or delay awards. Risk accepted for testnet.

### 4. Claim window
30 days (`CLAIM_WINDOW = 30 days`, line 27). After expiry, `sweepExpired` reclaims unclaimed prizes. `getClaimable` correctly excludes expired claims.

### 5. Pool over-commitment?
`lotteryPaidOut` incremented at `resolveDailyDraw` time (line 317), not claim time. Check `lotteryRemaining(batch) >= prize` (line 303) at resolve time. Same for `firstsPaidOut` at `setBatchFirstWinner` time (line 372). **Correctly prevents over-commitment.** Verified by test `test_pool_commitment_tracked_at_resolve_time`.

### 6. Reentrancy in claims
All three claim functions (`claimDailyPrize`, `claimBatchFirst`, `claimBatchBounty`) use `nonReentrant`. State updated before ETH send. Safe.

### 7. Day calculation
Days are just uint256 identifiers passed by the keeper — not derived from `block.timestamp`. No timestamp manipulation risk for day numbering. The `resolvedAt` timestamp is used only for claim window expiry, which is standard.

### 8. Five design review issues:
| Issue | Status |
|---|---|
| Off-chain VRF for lottery | **PRESENT** — accepted for testnet. See H-3. |
| Pool over-commitment | **FIXED** — paidOut incremented at resolve/award time, checked before resolving. |
| Hardcoded day loop in sweepExpired | **FIXED** — uses `firstDrawDay`/`lastDrawDay` range tracking. `getClaimable` also uses this range. |
| Gas limit for large bounty arrays | **FIXED** — `addBatchBountyRecipients` allows batched recipient addition. `finalizeBatchBounty` is a separate call. |
| Settled flag blocking topUp | **PARTIALLY FIXED** — `topUp` does NOT check `settled` flag (see M-1). |

---

## FUND FLOW VERIFICATION

### Mint Flow (4A)
1. Player sends `quantity × batchPrice` ETH to Token
2. Token calculates `totalCost = mintPrice * allocated`, refunds excess via `call`
3. Token calls `treasury.receiveMintFunds{value: totalCost}()`
4. Treasury: `creatorFee = (msg.value * 1000) / 10000` = exactly 10%
5. Treasury sends `creatorFee` to `creatorWallet`
6. Treasury retains `msg.value - creatorFee` = 90%

**Rounding:** `(100 * 1000) / 10000 = 10`. Integer division truncates in favor of treasury. Correct.
**Overpay:** Excess refunded at line 272. **Verified.**
**Underpay:** `require(msg.value >= mintPrice * quantity)` at line 258. **Reverts.**

### Claim Flow (4B)
1. Winner calls `claimTreasury()`
2. `require(block.timestamp >= countdownStartTime + COUNTDOWN_DURATION)` — cannot claim early
3. Burns T2-T7, calls `treasury.claimPayout(winner)`
4. Treasury sends 100% of `address(this).balance` to winner
5. `_finaliseEndgame()` sets `countdownActive = false` — prevents double-claim

**Reentrancy:** Token's `claimTreasury` has `nonReentrant`. Treasury's `claimPayout` also has `nonReentrant`.
**Verified: No double-spend, no early claim, reentrancy protected.**

### Sacrifice Flow (4C)
1. `sacrifice()` or `executeDefaultOnExpiry()` called
2. Burns T2-T7, mints T1
3. `treasury.sacrificePayout(winner)` → Treasury sends 100% to Escrow
4. `escrow.initiateSacrifice(winner)` → Escrow reads `address(this).balance`
5. Split: `winnerShare = total / 2` (50%), `seedShare = total / 10` (10%), `community = total - winnerShare - seedShare` (40% + any rounding dust)
6. 50% stored in `pendingWithdrawal[winner]` (pull-payment)
7. 40% stored as `communityPool`
8. 10% stored as `season2Seed`

**50+40+10=100%:** `total/2 + total/10 + (total - total/2 - total/10)` = always `total`. **Correct.**
**Double-call:** `require(!sacrificeExecuted)` prevents double sacrifice. **Verified.**
**Winner from 40%?** Winner CAN be in the leaderboard (keeper controls entitlements). Spec doesn't prohibit this.

### Rewards Fund Flow (4D)
1. Owner `deposit(batch, lotteryBps, firstsBps, bountyBps)` with ETH
2. Sub-pools computed on the fly: `totalDeposit × bps / 10000`
3. `resolveDailyDraw` → `lotteryPaidOut += prize` (committed at resolve time)
4. `setBatchFirstWinner` → `firstsPaidOut += prize` (committed at award time)
5. `finalizeBatchBounty` → per-wallet share calculated from bountyPool / recipients
6. Claims pull ETH from contract balance
7. `sweepExpired` reclaims unclaimed prizes after 30 days
8. `withdrawLeftover` withdraws unallocated buffer

**Over-commitment check:** Each resolve/award checks `remaining >= prize`. **Safe.**
**Total owed <= balance?** Sum of all committed amounts = lotteryPaidOut + firstsPaidOut + (bountyPerWallet × recipients). These are bounded by the respective sub-pools which are bounded by totalDeposit. Only risk is if `topUp` changes totalDeposit after awards — but that only INCREASES pools. **Safe.**

---

## GAS PROFILING (Section 14)

| Function | Estimated Gas | Base Block Limit (30M) | Notes |
|---|---|---|---|
| Token.mint(500) pseudo-random | ~430K | 1.4% | Test: `test_MintSucceeds` ~430K |
| Token.mint(500) VRF callback | ~670K | 2.2% | Test: `test_MintVRF_TierAggregationProducesCorrectTotal` ~670K |
| Token.combine(21) | ~108K | 0.4% | Single T7→T6 combine |
| Forge.forge() pseudo-random | ~225K | 0.8% | Single attempt |
| Forge.forgeBatch(20) pseudo-random | ~3.1M est. | 10.3% | 20 attempts at ~155K each (overhead + per-attempt) |
| Countdown.challengeCountdown() | ~750K | 2.5% | Score calc + state update + Token sync |
| Token.executeDefaultOnExpiry() | ~612K | 2.0% | Full sacrifice flow |
| Rewards.sweepExpired(30 days) | ~370K (44 test draws) | 1.2% | Scales with draw count, not day count |
| Rewards.claimDailyPrize() | ~35K | 0.1% | Single claim |
| Escrow.claimLeaderboardReward() | ~40K | 0.1% | Single claim |

**No function exceeds 50% of Base block gas limit.** The highest observed is `forgeBatch(20)` at ~10%. Safe.

---

## TESTNET RISK ACKNOWLEDGMENTS (Section 13)

| # | Risk | Isolated? | Non-owner exploitable? |
|---|---|---|---|
| 1 | `emergencyWithdraw` on Treasury | Yes — onlyOwner | No |
| 2 | `emergencyWithdraw` on Rewards | Yes — onlyOwner | No |
| 3 | `mintForTest` — free blocks of any tier | Yes — onlyOwner + testMintEnabled | No |
| 4 | Test mode setters re-callable | Yes — onlyOwner + testModeEnabled | No |
| 5 | No Gelato automation — manual window opens | Yes — permissionless `openWindow()` | No (anyone can call openWindow) |
| 6 | Subgraph centralized (Graph Studio) | Yes — frontend only, not on-chain | No |
| 7 | No multisig — single deployer key | Yes — standard testnet practice | No |
| 8 | Lottery uses off-chain randomness | Yes — keeper-controlled | No (but keeper can manipulate) |
| 9 | Rewards limited to 6 batches (MAX_BATCHES=6) | Yes — by design or oversight | No |

**All testnet risks are owner-gated. Non-owner beta testers cannot exploit any of these.**

---

## OVERALL ASSESSMENT

### Safe for testnet beta? **YES**, with the following conditions:

1. **Document lottery centralization risk** — players should know the daily draw is keeper-controlled during beta
2. **`MAX_BATCHES = 6` in Rewards vs 10 game batches** — confirm if intentional and document
3. **Batch supply/price values** — confirm canonical values between spec and code (L-6)
4. **All previous audit fixes (H-1 through H-4, M-1, C1, C2) remain intact** — no regressions

### For mainnet, must address:
- Remove both `emergencyWithdraw` functions (Treasury + Rewards)
- Integrate on-chain VRF for daily lottery (H-3)
- Deploy multisig and transfer ownership
- Increase `MAX_BATCHES` or document the limitation
- Call `disableTestMint()` and `disableTestMode()` on all contracts
- Add test-mode guards to Forge/MintWindow/Countdown `setTokenContract` (L-1/L-2/L-3)
