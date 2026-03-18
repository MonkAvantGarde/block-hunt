# SPEC_AUDIT — Comprehensive Contract Audit
> **Purpose:** Full security and logic audit of all Block Hunt contracts
> **When to run:** AFTER all development changes are complete and all tests pass
> **Do NOT make changes during this audit — report only**

---

## Instructions

Read every source file. Run every test. Then work through each section below systematically. For each finding, classify as:

- **CRITICAL** — Funds at risk, game breakable, must fix before any deployment
- **HIGH** — Significant logic error or security weakness, fix before mainnet
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
test/BlockHunt.t.sol
script/Deploy.s.sol
```

For each contract report:
- Lines of code
- External dependencies (OpenZeppelin, Chainlink, etc.)
- Compiler version / pragma

---

## Section 2 — Access Control Audit

For every function across all 8 contracts:

1. **Who can call it?** (anyone, owner, specific contract, token holder)
2. **Is the access control correct?** Should this function be more restricted or less restricted?
3. **Can the owner do anything that harms players?** List every owner-only function and assess damage potential.
4. **Are there any functions missing access control that should have it?**

Specific checks:
- Can anyone other than the Countdown contract call `updateCountdownHolder` on Token?
- Can anyone other than the Token contract call `startCountdown` on Countdown?
- Can anyone other than the owner call `openWindow` or `forceOpenWindow`?
- Who can call `challengeCountdown`? Is this correctly open to any player?
- Who can call `cancelMintRequest`? Should this be player-only (their own request) or owner-callable for any request?
- Can the owner pause and then drain funds while paused?
- Can the owner change critical parameters mid-game in ways that harm players?

---

## Section 3 — Fund Flow Audit

Trace every path that moves ETH:

### Inflow
1. Player calls `mint()` → ETH goes where? Trace the exact flow.
2. What percentage goes to treasury vs creator fee? Verify the math.
3. Can ETH get stuck in any contract with no way to withdraw?

### Outflow — Claim path
4. Winner calls `claimTreasury()` → What exactly happens? Who gets what?
5. Are there any rounding errors in the payout calculation?
6. Can `claimTreasury` be called multiple times (double-spend)?

### Outflow — Sacrifice path
7. Winner calls `sacrifice()` → Trace the 50/40/10 split exactly.
8. 50% to winner — verified?
9. 40% to community pool via Escrow — how does it get there?
10. 10% to Season 2 seed via Escrow — how does it get there?
11. Can `sacrifice` be called multiple times?

### Outflow — Escrow
12. How do leaderboard entitlements get set? Who calls `setLeaderboardEntitlements`?
13. Can a keeper set wrong entitlements? What's the damage?
14. What happens to unclaimed rewards after 30 days?
15. Can `sweepUnclaimedRewards` be called before 30 days?
16. Can `releaseSeason2Seed` be called prematurely?

### Outflow — Creator fee
17. Where does the creator fee go? Can the destination be changed?
18. Is the 10% cap enforced in code?

### ETH accounting
19. Sum all possible outflows. Does total outflow ever exceed total inflow? (It must not.)
20. Can any contract hold ETH that is permanently unrecoverable?
21. After a complete game cycle (mint → claim or sacrifice → all payouts), is the treasury balance exactly zero?

---

## Section 4 — Countdown & Challenge Audit

This is the newest and most complex code. Audit thoroughly.

### Basic countdown flow
1. Player collects all 6 tiers → calls `claimHolderStatus` on Token → Token calls `countdown.startCountdown()`. Trace this path. Any way it fails silently?
2. 7 days pass → holder calls `claimTreasury` or `sacrifice`. What checks are performed?
3. What if nobody claims or sacrifices after 7 days? Does `executeDefaultOnExpiry` handle this?

### Challenge mechanic
4. **Score calculation:** Verify `calculateScore` reads correct tier IDs (T2=2 through T7=7). Verify T1 is excluded. Test with known values.
5. **Challenge flow:** Trace `challengeCountdown()` end-to-end:
   - Does it correctly verify all 6 tiers?
   - Does it correctly enforce the 24-hour cooldown?
   - Does it recalculate BOTH scores live (not from storage)?
   - Does it update Countdown state correctly?
   - Does it call `token.updateCountdownHolder()` to sync Token state?
   - After a successful challenge, does Token's `countdownHolder` and `countdownStartTime` match?
6. **Can a challenge leave state inconsistent?** What if `updateCountdownHolder` reverts after Countdown state is already updated? Is this atomic?
7. **What if the challenger loses a tier between the `hasAllTiers` check and the score calculation?** (In same transaction this is impossible, but verify.)
8. **Can challengeCountdown be called via a smart contract?** If so, can a contract use flash loans or atomic transactions to temporarily hold tiers, challenge, and return them? Assess risk.
9. **Cooldown boundary:** What happens at exactly `lastChallengeTime + 24 hours`? Is it `>=` or `>`?
10. **Can the holder challenge themselves through a second wallet?** (Score would be different — is this a problem?)

### Countdown reset interactions
11. Holder loses a tier → keeper calls `checkHolderStatus` → countdown resets. Does this correctly clear challenge state (holderScore, lastChallengeTime)?
12. After a reset, can the SAME player immediately re-trigger the countdown?
13. After a challenge shifts the holder, does `checkHolderStatus` correctly check the NEW holder's tiers?

### Scoring edge cases
14. What if a player has MAX_UINT256 of a tier? Can the score overflow?
15. What is the maximum possible score? Does it fit in uint256? (It does, but verify.)
16. Can scoring weights be changed after deployment? (They should not be — they're constants.)

---

## Section 5 — VRF Audit

### Mint VRF
1. What happens if VRF callback never arrives? (Stuck forever? TTL expiry + cancel?)
2. What happens if VRF callback arrives but runs out of gas? (This happened at 500k limit.)
3. Current callback gas limit is 2,500,000. VRF_GAS_MAX is 2,500,000. Is this enough for 500 blocks at 3,000 gas each? (500 × 3,000 = 1,500,000 + 150,000 base = 1,650,000 — yes, fits.)
4. Can a player have multiple pending VRF requests simultaneously?
5. Can `cancelMintRequest` be called by anyone for any player, or only for their own request?
6. After cancellation, is the player's ETH refunded? Where does it go?
7. Can the VRF callback be replayed (called twice for the same request)?

### Forge VRF
8. Same questions as above but for forge VRF flow.
9. What happens if a forge VRF callback arrives after the player has sold/transferred the blocks being forged?
10. Are the blocks burned BEFORE the VRF request (committed) or AFTER (on callback)? Which is safer?

### VRF manipulation
11. Can a VRF coordinator or keeper manipulate the random result?
12. Is `requestConfirmations` set high enough? What is it?
13. Can a miner/validator influence the outcome?

---

## Section 6 — Reentrancy Audit

For every external call in every contract:

1. Does the function follow checks-effects-interactions pattern?
2. Are there any callbacks (e.g., ERC-1155 `onERC1155Received`) that could re-enter?
3. Is there a reentrancy guard where needed?
4. Specifically check:
   - `claimTreasury` — sends ETH, then what? Can recipient re-enter?
   - `sacrifice` — sends ETH to multiple destinations. Order of operations?
   - `challengeCountdown` — calls `updateCountdownHolder` on Token. Can this re-enter Countdown?
   - VRF callbacks — can the callback re-enter mint or forge?
   - `claimLeaderboardReward` on Escrow — sends ETH, can recipient re-enter to claim twice?

---

## Section 7 — Integer Overflow / Underflow

Solidity 0.8+ has built-in overflow checks, but verify:

1. Any use of `unchecked` blocks? If so, are they safe?
2. Any multiplication that could overflow BEFORE the checked operation catches it?
3. Specifically: `calculateScore` multiplies balances by weights. Can this overflow?
4. Mint pricing calculations — quantity × price. Can this overflow for max quantity (500)?
5. Treasury percentage calculations — any rounding errors that accumulate?

---

## Section 8 — Denial of Service Vectors

1. Can any player prevent other players from minting? (e.g., filling the daily cap with one wallet)
2. Can any player prevent the countdown from being challenged? (e.g., griefing the cooldown)
3. Can any player prevent `claimTreasury` or `sacrifice` from executing?
4. Can the keeper be blocked from calling `openWindow`, `checkHolderStatus`, or `executeDefaultOnExpiry`?
5. Can a malicious ERC-1155 receiver contract block transfers and break the game?
6. Can gas costs for any function exceed block gas limit at scale? (e.g., `executeDefaultOnExpiry` with 100 recipients)
7. What happens if the subgraph goes down? Which on-chain functions depend on off-chain data?

---

## Section 9 — Game Invariants

Verify these invariants hold in ALL code paths:

1. **T1 is never mintable via VRF.** No code path produces T1 from a mint or forge.
2. **T1 is only obtainable via sacrifice.** Verify.
3. **A player needs T2-T7 to trigger countdown.** T1 is not required. Verify.
4. **Creator fee never exceeds 10%.** Hard cap enforced in contract. Verify.
5. **Royalty never exceeds 10%.** Hard cap enforced. Verify.
6. **Daily mint cap is enforced.** A player cannot mint more than the cap in one window.
7. **Window duration is exactly 3 hours.** Verify.
8. **Countdown is exactly 7 days.** Verify. Including after a challenge reset.
9. **Challenge cooldown is exactly 24 hours.** Verify.
10. **Score excludes T1.** Verify calculateScore doesn't include TIER_ORIGIN.
11. **Challenger must have strictly higher score.** Equal is not enough. Verify.
12. **Only the Countdown contract can call updateCountdownHolder.** Verify.
13. **testMintEnabled/testModeEnabled can only be disabled, never re-enabled.** Verify for all contracts.
14. **Combine ratios are correct:** 20:1 (T7→T6, T6→T5), 30:1 (T5→T4, T4→T3), 50:1 (T3→T2). Verify in code.
15. **T2→T1 combine is disabled.** Verify no code path allows it.
16. **Forge cannot produce T1.** Verify.
17. **Cap reservation at request time.** Daily cap space is reserved when mint request is made, not when VRF fulfills. Verify.

---

## Section 10 — Cross-Contract Consistency

1. **Token ↔ Countdown sync:** After a challenge, does Token's state perfectly match Countdown's state? Check: countdownHolder, countdownStartTime, isActive.
2. **Token ↔ Treasury:** Does the treasury receive exactly the right amount on every mint? Trace wei-level math.
3. **Token ↔ MintWindow:** Does the window state on Token match MintWindow? Can they get out of sync?
4. **Token ↔ Forge:** After a forge, are blocks burned correctly? Can a forge produce blocks that Token doesn't track?
5. **Token ↔ Escrow:** After a sacrifice, does Escrow receive exactly the right amounts?
6. **Countdown ↔ Token on reset:** When `checkHolderStatus` triggers a reset, do both contracts end up in the same state?
7. **Are there any race conditions?** Two transactions in the same block interacting in unexpected ways.

---

## Section 11 — Deploy Script Audit

Read `script/Deploy.s.sol`:

1. Does it wire ALL contracts correctly?
2. Is the order of operations correct? (Some setters may depend on others being set first.)
3. Does it set VRF config on both Token and Forge?
4. Does it add both as VRF consumers? (This is done on Chainlink dashboard, not in script — flag if missing.)
5. Does it call `forceOpenWindow()` or `openWindow()` at the end?
6. Are there any wiring steps the script MISSES that must be done manually?

---

## Section 12 — Gas Optimization Review

Not critical for security, but flag any obvious waste:

1. Any storage reads that could be cached in memory?
2. Any loops that could be eliminated?
3. `calculateScore` — is it efficient? 6 balance reads + 6 multiplications + 5 additions. Can it use `balancesOf` (1 external call) instead of 6 `balanceOf` calls?
4. `challengeCountdown` — how much gas does a successful challenge cost? A failed challenge?
5. Are events indexed appropriately for subgraph efficiency?

---

## Section 13 — Testnet-to-Mainnet Transition Checklist

List everything that must change between testnet and mainnet:

1. `disableTestMint()` called on Token
2. `disableTestMode()` called on MintWindow (and any other contracts with test mode)
3. `emergencyWithdraw` removed or gated
4. Gnosis Safe multisig deployed, ownership transferred
5. `creatorWallet` updated to cold wallet
6. VRF subscription funded with enough LINK for expected volume
7. Keeper bots configured and tested
8. All contract addresses verified on BaseScan
9. Subgraph deployed to decentralized network
10. What else? Flag anything the code reveals.

---

## Section 14 — Documentation Consistency

Check the following documents against the actual contract code:

1. Do the tier names and IDs in the code match the GDD?
2. Do the combine ratios in the code match the GDD and STATUS.md?
3. Do the forge probabilities in the code match the documented ratios?
4. Do the pricing tables in the code match STATUS.md?
5. Does the 10% creator fee in the code match documentation (CHAT_RULES says 5% — is this stale)?
6. Does the TRANSPARENCY.md accurately describe what the owner can and cannot do, given the current code?
7. Are there any functions in the code that documentation says don't exist, or vice versa?

---

## Output Format

Produce the final report as:

```
# Block Hunt — Contract Audit Report
## Date: [date]
## Contracts audited: [list with line counts]
## Tests: [count, all passing?]

### CRITICAL FINDINGS
[numbered list — each with: description, affected contract, 
affected function, recommended fix]

### HIGH FINDINGS
[same format]

### MEDIUM FINDINGS
[same format]

### LOW FINDINGS
[same format]

### INFO / OBSERVATIONS
[same format]

### INVARIANT CHECK RESULTS
[all 17 invariants — PASS or FAIL with details]

### FUND FLOW VERIFICATION
[summary of all ETH paths — any leaks?]

### GAS REPORT
[key function gas costs]

### TESTNET-TO-MAINNET CHECKLIST
[complete list]
```

Save this report as `AUDIT_REPORT.md` in the project root.
