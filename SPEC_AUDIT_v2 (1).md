# SPEC_AUDIT_v2 — Comprehensive Pre-Beta Contract Audit
> **Purpose:** Full security and logic audit of all Blok-Hunt contracts post v2.1
> **When to run:** AFTER all development is complete and all tests pass
> **Context:** This is a refresh of the original SPEC_AUDIT. Since then: v2.1 mechanics deployed (10 batches, new combine ratios, continuous probability, countdown takeover), BlockHuntRewards.sol added, full redeployment completed.
> **Do NOT make changes during this audit — report only**

---

## Instructions

Read every source file in `src/`. Run `forge test`. Then work through each section below systematically. For each finding, classify as:

- **CRITICAL** — Funds at risk, game breakable, must fix before any deployment
- **HIGH** — Significant logic error or security weakness, fix before beta
- **MEDIUM** — Edge case or inconsistency that could cause problems at scale
- **LOW** — Code quality, gas optimization, or minor issue
- **INFO** — Observation, not a bug

Produce a final report at the end with all findings organized by severity.

---

## Section 1 — File Inventory

Read all source files and list:
```
src/BlockHuntToken.sol
src/BlockHuntTreasury.sol
src/BlockHuntMintWindow.sol
src/BlockHuntForge.sol
src/BlockHuntCountdown.sol
src/BlockHuntEscrow.sol
src/BlockHuntMigration.sol
src/BlockHuntSeasonRegistry.sol
src/BlockHuntRewards.sol
test/BlockHunt.t.sol
script/Deploy.s.sol
```

For each contract report:
- Lines of code
- External dependencies (OpenZeppelin, Chainlink, etc.)
- Compiler version / pragma
- Inheritance chain

---

## Section 2 — Access Control Audit

For every function across ALL 9 contracts:

1. **Who can call it?** (anyone, owner, specific contract, token holder)
2. **Is the restriction correct?** (e.g., should `mintForTest` be onlyOwner? Is it?)
3. **Can the restriction be bypassed?** (e.g., via delegatecall, proxy, flash loan)
4. **Are there functions that SHOULD be restricted but aren't?**

Specifically verify:
- `mintForTest` — must be onlyOwner AND gated by testMintEnabled
- `disableTestMint` — one-way, can never be re-enabled
- All 5 Token admin setters — must have `require(addr == address(0) || testMintEnabled)` guard
- `emergencyWithdraw` on Treasury — must be onlyOwner (acceptable for testnet, flag for mainnet removal)
- `claimHolderStatus` — callable by anyone (intentional first-to-call race)
- `challengeCountdown` — callable by anyone who holds all 6 tiers with higher score
- BlockHuntRewards: `resolveRandomMinterLottery` — who can call? Is it permissionless or owner-only?
- BlockHuntRewards: `awardBatchFirst` — who can call? Can it be gamed?
- BlockHuntRewards: `topUp` — owner only? Can it be called after `withdrawLeftover`?

---

## Section 3 — v2.1 Mechanics Verification

### 3A — 10-Batch Structure
1. Verify there are exactly 10 batches defined in MintWindow
2. Verify batch supply sizes match the GDD: 100K, 100K, 200K, 200K, 500K, 500K, 1M, 1M, 500K, 500K
3. Verify batch prices: 0.00008, 0.00016, 0.00032, 0.00064, 0.00080, 0.00100, 0.00120, 0.00160, 0.00180, 0.00200 ETH
4. Verify batch advancement is supply-based (advances when fully minted, not on a timer)
5. What happens when all 10 batches are exhausted? Does minting stop cleanly?

### 3B — Combine Ratios (v2.1: 21/19/17/15/13)
1. Verify combine ratios in code: T7→T6=21, T6→T5=19, T5→T4=17, T4→T3=15, T3→T2=13
2. Verify T2→T1 combine is disabled (The Origin is sacrifice-only)
3. Can a player combine with exactly 0 blocks? Does it revert cleanly?
4. Can a player combine with MORE than the ratio? (e.g., 25 when ratio is 21)
5. Does combine correctly burn source blocks and mint target blocks?

### 3C — Continuous Probability Formula
1. Verify T6 and T5 probabilities are FIXED (not batch-dependent). What are the fixed values?
2. Verify T4 and T3 use LINEAR interpolation across batches. What are the start/end values?
3. Verify T2 uses QUADRATIC formula with coefficient 6997. What is the exact formula in code?
4. Verify T1 (The Origin) has 0% probability — it NEVER appears in VRF rolls
5. Verify all probabilities sum to ≤100% for every batch
6. Test boundary: what probability does T2 have in Batch 1? In Batch 10?
7. Can the probability function overflow or return unexpected values for any batch?

### 3D — Countdown Takeover Mechanic
1. Verify: any player holding all 6 tiers (T2-T7) with STRICTLY higher score can challenge
2. Verify scoring weights: T2=10,000, T3=2,000, T4=500, T5=100, T6=20, T7=1
3. Verify T1 is EXCLUDED from score calculation
4. Verify 24-hour safe period — no challenges within first 24 hours of a countdown
5. Verify full 7-day reset on successful challenge
6. Can a challenger challenge themselves?
7. Can a challenger challenge with EQUAL score (should fail — must be strictly higher)?
8. What happens if the current holder sells/transfers blocks during countdown? Does checkHolderStatus correctly detect they no longer hold all 6?
9. Can `checkHolderStatus` be called by anyone? (It should be permissionless for keeper use)
10. Maximum possible score: does it fit in uint256? (T2_weight × max_supply + ... — verify no overflow)

### 3E — Open Minting During Countdown
1. Verify minting continues during an active countdown (v2.1 change — minting was previously disabled)
2. Does this create any issues with batch advancement during countdown?
3. Can a player mint blocks that change the leaderboard during a countdown?

---

## Section 4 — Fund Flow Audit

Trace every wei through the system. For each flow:

### 4A — Mint Flow
1. Player pays `quantity × batchPrice` ETH
2. 90% goes to Treasury. Verify.
3. 10% goes to creator wallet. Verify.
4. Does the 90/10 split use integer division? Any rounding dust? Where does dust go?
5. Can a player overpay? What happens to excess ETH?
6. Can a player underpay? Does it revert?

### 4B — Claim Flow (winner takes 100%)
1. Winner calls `claimTreasury`. Treasury sends 100% balance to winner.
2. Is there a reentrancy guard?
3. Can claim be called twice?
4. Can claim be called during countdown (before it expires)?
5. What happens if Treasury has 0 ETH?

### 4C — Sacrifice Flow (50/40/10 split)
1. 50% to winner — via pull-payment (pendingWithdrawal). Verify.
2. 40% to Escrow for top-100 leaderboard pool. Verify.
3. 10% stored as Season 2 seed. Verify it's stored, not sent.
4. Does 50+40+10 = 100% exactly? Any rounding dust?
5. Can the winner also claim from the 40% leaderboard pool?
6. Can `withdrawWinnerShare` be called by non-winner? By winner twice?
7. Can `executeDefaultOnExpiry` be called by anyone? (Should be permissionless for keeper)
8. What happens if Escrow already has ETH from a previous season?

### 4D — Rewards Fund Flow
1. Owner calls `topUp` with ETH. Where is it stored?
2. Daily lottery winner calls `claim`. Verify they receive correct amount.
3. Batch first winner calls `claim`. Verify correct amount.
4. Batch milestone bounty: when batch sells out, how is the bounty distributed?
5. Can over-commitment happen? (lottery + firsts + bounty > deposited ETH)
6. `sweepExpired` — who can call? What does it reclaim? Does it work with large day ranges?
7. `withdrawLeftover` — when can it be called? Does it block future `topUp`?

---

## Section 5 — VRF Audit

### 5A — Mint VRF
1. What happens if VRF callback never arrives? Is there a TTL + cancel mechanism?
2. Current callback gas limit is 2,500,000. Is this enough for max mint quantity (500 blocks)?
3. Can a player have multiple pending VRF requests simultaneously?
4. Can `cancelMintRequest` be called by anyone, or only by the request owner?
5. After cancellation, is the player's ETH refunded?
6. Can the VRF callback be replayed (called twice for same request)?
7. Is `requestConfirmations` set appropriately?

### 5B — Forge VRF
1. Same questions as 5A but for forge flow
2. Are blocks burned BEFORE VRF request (committed) or AFTER callback?
3. What happens if a player transfers/sells blocks between forge request and VRF callback?
4. Verify forge probability calculation: `successChance = (blocksBurned * 100) / combineRatio`
5. Verify the success check against VRF random: `randomWord % 100 < successChance`
6. Edge case: what if player burns exactly the combine ratio? 100% success via forge — but they should just combine. Does it still work correctly?

### 5C — Rewards VRF (if applicable)
1. How is the Daily Minter Lottery winner selected? On-chain VRF or off-chain?
2. If off-chain: is there a manipulation vector?
3. If on-chain: is the VRF callback gas limit sufficient?

---

## Section 6 — Reentrancy Audit

For every external call in every contract:

1. Does the function follow checks-effects-interactions pattern?
2. Are there any ERC-1155 callbacks (`onERC1155Received`) that could re-enter?
3. Is there a reentrancy guard where needed?

Specifically check:
- `claimTreasury` — sends ETH, can recipient re-enter?
- `sacrifice` / `executeSacrifice` — sends ETH to multiple destinations
- `withdrawWinnerShare` — pull payment, can recipient re-enter to claim twice?
- `challengeCountdown` — calls `updateCountdownHolder` on Token, can this re-enter Countdown?
- VRF callbacks — can callback re-enter mint or forge?
- `claimLeaderboardReward` on Escrow — sends ETH, can recipient re-enter?
- BlockHuntRewards `claim` — sends ETH, can it be re-entered?

---

## Section 7 — Integer Overflow / Underflow

Solidity 0.8+ has built-in overflow checks, but verify:

1. Any use of `unchecked` blocks? If so, are they safe?
2. `calculateScore` — multiplies balances by weights (T2=10,000). Can this overflow with max supply?
3. Mint pricing: `quantity × price`. Can this overflow for max quantity (500) × max price (0.002 ETH)?
4. Treasury percentage calculations — any rounding errors that accumulate?
5. Continuous probability formula for T2 (quadratic with coefficient 6997) — can intermediate calculations overflow?
6. BlockHuntRewards: any arithmetic that could overflow with large deposit amounts or many claimants?

---

## Section 8 — Denial of Service Vectors

1. Can any player prevent others from minting? (e.g., filling daily cap with one wallet)
2. Can any player prevent countdown from being challenged? (cooldown griefing)
3. Can the keeper be blocked from calling `openWindow`, `checkHolderStatus`, `executeDefaultOnExpiry`?
4. Can a malicious ERC-1155 receiver contract block transfers?
5. Can gas costs for `executeDefaultOnExpiry` with 100 recipients exceed block gas limit?
6. What happens if the subgraph goes down? Which on-chain functions depend on off-chain data?
7. BlockHuntRewards: can `sweepExpired` with large day ranges (1-365) exceed gas limits?
8. Can batch milestone bounty distribution to thousands of wallets exceed gas limits?
9. Voter list DoS — verify the round-based tracking fix is correctly implemented (was H-3 in original audit)

---

## Section 9 — Game Invariants (v2.1 Updated)

Verify these invariants hold in ALL code paths:

1. **T1 is never mintable via VRF.** No code path produces T1 from a mint or forge.
2. **T1 is only obtainable via sacrifice.** Verify.
3. **A player needs T2-T7 to trigger countdown.** T1 is NOT required. Verify.
4. **Creator fee is exactly 10%.** Hard cap enforced. Verify.
5. **Royalty never exceeds 10%.** Hard cap enforced (H-4 fix). Verify.
6. **Daily mint cap is enforced.** Per-window cap × number of windows = daily cap.
7. **Window duration is exactly 3 hours.** Verify.
8. **Countdown is exactly 7 days.** Including after challenge reset. Verify.
9. **Challenge cooldown is exactly 24 hours.** Verify.
10. **Score excludes T1.** `calculateScore` must not include TIER_ORIGIN.
11. **Challenger must have strictly higher score.** Equal is NOT enough. Verify.
12. **Only Countdown contract can call `updateCountdownHolder` on Token.** Verify.
13. **`testMintEnabled` / `testModeEnabled` can only be disabled, never re-enabled.** Verify for all contracts.
14. **Combine ratios are correct (v2.1):** 21 (T7→T6), 19 (T6→T5), 17 (T5→T4), 15 (T4→T3), 13 (T3→T2). Verify.
15. **T2→T1 combine is disabled.** No code path allows it.
16. **Forge cannot produce T1.** Verify.
17. **Cap reservation at request time.** Daily cap space reserved on mint request, not on VRF fulfillment.
18. **10 batches exist with correct supply and pricing.** Verify against GDD v2.0.
19. **Minting continues during active countdown.** (v2.1 change) Verify.
20. **Forge probability anchored to combine ratio per tier.** `success% = (burned / ratio) * 100`. Verify.

---

## Section 10 — Cross-Contract Consistency

1. **Token ↔ Countdown:** After a challenge, does Token's state match Countdown's state? (countdownHolder, startTime, isActive)
2. **Token ↔ Treasury:** Does Treasury receive exactly the right amount on every mint?
3. **Token ↔ MintWindow:** Does window state match? Can they desync?
4. **Token ↔ Forge:** After forge, are blocks burned correctly? Can forge produce blocks Token doesn't track?
5. **Token ↔ Escrow:** After sacrifice, does Escrow receive exactly the right amounts?
6. **Countdown ↔ Token:** When holder changes via challenge, does Token update its countdownHolder?
7. **Forge ↔ Token:** Does Forge read combine ratios from Token (or its own copy)? Are they guaranteed consistent?
8. **MintWindow ↔ Token:** Can MintWindow advance batches independently of Token's batch awareness?
9. **Rewards ↔ Token:** How does Rewards know about minting activity? Is it wired correctly?
10. **Rewards ↔ MintWindow:** How does Rewards know when a batch sells out for milestone bounty?

---

## Section 11 — Previous Audit Findings Re-Check

The original audit (SPEC_AUDIT v1) found 0 critical, 4 high, 5 medium. Verify ALL fixes are still in place after v2.1 changes:

| Finding | Fix Applied | Still Present? |
|---------|------------|----------------|
| H-1: Token setter guards | `require(addr == address(0) \|\| testMintEnabled)` | Verify |
| H-2: emergencyWithdraw | Still present (acceptable for testnet) | Verify it's owner-only |
| H-3: Voter list DoS | Round-based tracking, `countdownRound++` on reset | Verify |
| H-4: Royalty cap | `require(fee <= 1000)` | Verify |
| M-1: Pull-payment for sacrifice | `pendingWithdrawal` pattern for winner's 50% | Verify |

Also verify the earlier code review findings (pre-audit) are still fixed:
- C1: T2→T1 combine disabled
- C2: `mintForTest` has onlyOwner
- T1 excluded from VRF roll (was 0.001% bug)

---

## Section 12 — BlockHuntRewards.sol Deep Dive

This contract is new since the last audit. Give it full attention:

1. **Deposit tracking:** Can deposited ETH be double-counted across reward types?
2. **Lottery resolution:** Is the winner selection fair and unmanipulable?
3. **Batch firsts:** Can a player claim "first" by front-running a pending VRF callback?
4. **Claim window:** Is there a deadline? What happens to unclaimed rewards?
5. **Pool accounting:** At any point, can `totalOwed > address(this).balance`?
6. **Reentrancy in claim():** ETH sent to claimant — can they re-enter?
7. **Day calculation:** How are "days" tracked? Block timestamp manipulation risk?
8. **The 5 issues found during design review — verify fixes:**
   - Off-chain VRF for lottery (accepted for testnet — flag for mainnet)
   - Pool over-commitment in lottery and batch firsts (lotteryPaidOut and firstsPaidOut should increment at resolve/award time, not claim time)
   - Hardcoded day loop in sweepExpired and getClaimable (was 1-365 — verify fix)
   - Gas limit for large bounty recipient arrays
   - Settled flag blocking topUp after withdrawLeftover

---

## Section 13 — Testnet-Specific Risks

These are acceptable for testnet beta but must be flagged:

1. `emergencyWithdraw` exists — owner can drain Treasury
2. `mintForTest` exists — owner can mint free blocks of any tier
3. Test mode setters are re-callable — owner can change contract wiring
4. No Gelato automation yet — windows must be manually opened
5. Subgraph is centralized (Graph Studio, not decentralized network)
6. No multisig — single deployer key controls everything
7. VRF lottery may use off-chain randomness

For each: confirm the risk is documented and isolated. None of these should be exploitable by non-owner beta testers.

---

## Section 14 — Gas Profiling

For the following functions, estimate gas cost at scale:

1. `mint(500)` — max quantity, worst case tier distribution
2. `combine()` with max ratio (21 for T7→T6)
3. `forge()` — VRF request + callback
4. `challengeCountdown()` — score calculation + state update
5. `executeDefaultOnExpiry()` with 100 leaderboard recipients
6. `sweepExpired()` with 30 days of unclaimed rewards
7. `claimLeaderboardReward()` from Escrow

Flag anything that exceeds 50% of Base's block gas limit.

---

## Output Format

Produce a final report with:

1. **Summary:** Total findings by severity
2. **Findings table:** ID, severity, contract, function, description, recommendation
3. **Invariant results:** 20/20 table with PASS/FAIL for each
4. **Fund flow verification:** Confirm all ETH paths sum correctly
5. **Previous findings re-check:** All still fixed? Any regressions?
6. **Gas profiling results**
7. **Testnet risk acknowledgments**
8. **Overall assessment:** Safe for testnet beta? Yes/No with conditions.

---

## Claude Code Prompt

```
Read all source files in src/ directory.
Read test/BlockHunt.t.sol.
Run forge test and confirm all tests pass.
Then read SPEC_AUDIT_v2.md and work through every section systematically.

DO NOT make any code changes. Report only.

Produce the final audit report as AUDIT_REPORT_v2.md in the project root.

Project: /Users/bhuri/Desktop/block-hunt
```
