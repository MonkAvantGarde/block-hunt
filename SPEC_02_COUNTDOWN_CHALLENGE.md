# SPEC 02 — BlockHuntCountdown.sol Challenge Mechanic
> **Purpose:** Add countdown challenge system where a player with all 6 tiers AND a higher score can take over the countdown from the current holder
> **Priority:** Do this after SPEC 01 (MintWindow changes)
> **After implementation:** Run `forge test` and fix any failures

---

## Step 1 — Read Before Changing

Read these files first and understand the current implementation:
```
src/BlockHuntCountdown.sol
src/BlockHuntToken.sol (look for balancesOf, balanceOf, hasAllTiers or similar)
test/BlockHunt.t.sol (search for "Countdown" related tests)
```

Report:
- Current `claimHolderStatus()` implementation
- Current `claimTreasury()` and `sacrifice()` implementation
- How the contract checks if a player holds all 6 tiers
- What state variables exist for countdown tracking
- What events are emitted

---

## Step 2 — New State Variables

Add these to BlockHuntCountdown.sol:

```solidity
// Challenge mechanic
uint256 public holderScore;           // Current holder's score at time of claim/challenge
uint256 public lastChallengeTime;     // Timestamp of last successful claim or challenge
uint256 public constant CHALLENGE_COOLDOWN = 24 hours;  // Safe period after each claim/challenge

// Scoring weights — compressed exponential based on tier economic cost
uint256 public constant WEIGHT_T2 = 10000;
uint256 public constant WEIGHT_T3 = 2000;
uint256 public constant WEIGHT_T4 = 500;
uint256 public constant WEIGHT_T5 = 100;
uint256 public constant WEIGHT_T6 = 20;
uint256 public constant WEIGHT_T7 = 1;
```

**Note:** Check what tier ID constants already exist in the contract or Token contract (e.g., `TIER_INERT`, `TIER_RESTLESS`, etc.). Use those same constants for consistency. From the BaseScan Read tab, these exist on the Token contract:
- TIER_ORIGIN (T1)
- TIER_WILLFUL (T2)
- TIER_CHAOTIC (T3)
- TIER_ORDERED (T4)
- TIER_REMEMBER (T5)
- TIER_RESTLESS (T6)
- TIER_INERT (T7)

The Countdown contract may need to read tier IDs from the Token contract, or define its own matching constants.

---

## Step 3 — New Function: `calculateScore(address player)`

```solidity
/**
 * @notice Calculate a player's weighted score based on their tier balances.
 * @dev Reads balances directly from the Token contract. View function, no gas cost to call.
 * @param player The address to calculate score for.
 * @return score The weighted score.
 *
 * Score formula:
 *   (T2 balance × 10,000) + (T3 balance × 2,000) + (T4 balance × 500) +
 *   (T5 balance × 100) + (T6 balance × 20) + (T7 balance × 1)
 *
 * T1 (The Origin) is NOT included in scoring. It is sacrifice-only and
 * should not influence countdown competition.
 */
function calculateScore(address player) public view returns (uint256) {
    // Read balances from Token contract for tiers T2-T7
    // Multiply each by its weight
    // Return the sum
}
```

**Important:** Check how the Token contract exposes balances. It has `balancesOf(address)` which likely returns all tier balances in one call. Use that if available to minimize external calls. If it returns an array, make sure the index-to-tier mapping is correct.

---

## Step 4 — Modify: `claimHolderStatus()`

The existing function verifies the caller holds all 6 tiers and starts the countdown.

**Add to the existing logic:**
1. After the existing "holds all 6 tiers" check passes
2. Calculate the caller's score via `calculateScore(msg.sender)`
3. Store the score in `holderScore`
4. Set `lastChallengeTime = block.timestamp`
5. The countdown start time and duration logic stays as-is

**Do NOT change:**
- The tier holding check
- The countdown duration (7 days)
- Any existing event emissions (but add to them — see Events section)

---

## Step 5 — New Function: `challengeCountdown()`

```solidity
/**
 * @notice Challenge the current countdown holder. If the challenger has all 6 tiers
 *         AND a higher score, the countdown resets to 7 days under the challenger.
 * @dev Requires:
 *   - Countdown is currently active
 *   - Caller is not the current holder
 *   - Caller holds all 6 mintable tiers (T2-T7)
 *   - At least 24 hours have passed since the last successful claim or challenge
 *   - Challenger's score is strictly greater than holder's CURRENT score
 *
 * Note: The holder's score is recalculated live, not read from storage.
 * This means if the holder has gained or lost blocks since claiming,
 * their score reflects their current state.
 */
function challengeCountdown() external {
    // 1. Require countdown is active
    require(countdownActive, "No active countdown");

    // 2. Require caller is not current holder
    require(msg.sender != countdownHolder, "Holder cannot challenge self");

    // 3. Require caller holds all 6 mintable tiers (T2-T7)
    //    Use the same check that claimHolderStatus uses.
    //    NOTE: The check is for tiers T2-T7 (the 6 mintable tiers), NOT T1.

    // 4. Require 24-hour cooldown has passed
    require(
        block.timestamp >= lastChallengeTime + CHALLENGE_COOLDOWN,
        "Challenge cooldown active"
    );

    // 5. Calculate both scores LIVE
    uint256 challengerScore = calculateScore(msg.sender);
    uint256 currentHolderScore = calculateScore(countdownHolder);

    // 6. Challenger must have strictly higher score
    require(challengerScore > currentHolderScore, "Score not high enough");

    // 7. Store old holder for event
    address oldHolder = countdownHolder;
    uint256 oldScore = currentHolderScore;

    // 8. Transfer countdown to challenger
    countdownHolder = msg.sender;
    holderScore = challengerScore;
    lastChallengeTime = block.timestamp;

    // 9. FULL RESET — countdown restarts at 7 days
    countdownStartTime = block.timestamp;

    // 10. Emit events
    emit CountdownChallenged(msg.sender, challengerScore, oldHolder, oldScore, true);
    emit CountdownShifted(msg.sender, oldHolder, challengerScore, block.timestamp);
}
```

**Design decisions baked into this:**
- **Full 7-day reset on successful challenge.** Each new holder earns a fresh 7 days.
- **24-hour cooldown is on the POSITION, not on individual challengers.** After a successful challenge, nobody (including different players) can challenge again for 24 hours.
- **Holder's score is recalculated live.** If the holder forged and lost blocks, their score drops. If they minted more, it rises. This creates strategic risk for the holder — forging during countdown is a gamble.
- **Failed challenges should not change state.** If the require fails, the transaction simply reverts. No cooldown penalty for failed attempts. The 24-hour cooldown only resets on SUCCESSFUL challenges.

---

## Step 6 — Modify: `claimTreasury()` and `sacrifice()`

Add a check to ensure the countdown has actually expired:

```solidity
// Add to both claimTreasury() and sacrifice():
require(
    block.timestamp >= countdownStartTime + COUNTDOWN_DURATION,
    "Countdown still active"
);
```

**Check if this already exists.** It probably does. If so, no change needed — the `countdownStartTime` reset in `challengeCountdown()` naturally extends the deadline.

---

## Step 7 — New Events

Add these events to the contract:

```solidity
/// @notice Emitted when a player challenges the countdown holder
event CountdownChallenged(
    address indexed challenger,
    uint256 challengerScore,
    address indexed oldHolder,
    uint256 oldHolderScore,
    bool success
);

/// @notice Emitted when the countdown successfully shifts to a new holder
event CountdownShifted(
    address indexed newHolder,
    address indexed oldHolder,
    uint256 newScore,
    uint256 timestamp
);
```

**Also update the existing `claimHolderStatus` event** (if one exists) to include the score:
```solidity
event CountdownStarted(address indexed holder, uint256 score, uint256 timestamp);
```

Check what events already exist and extend them rather than duplicating. Keep existing event signatures if other parts of the system (subgraph, frontend) depend on them — add new events alongside.

---

## Step 8 — Update Tests

### Modified existing tests
- Any test that checks `claimHolderStatus` behavior should still pass. The function gains score tracking but existing checks shouldn't break.
- Any test that checks `claimTreasury` or `sacrifice` timing should still pass if the countdown expiry check already exists.

### New test cases (add all of these)

**Score calculation:**
1. `testCalculateScoreEmpty` — Player with no blocks has score 0.
2. `testCalculateScoreT7Only` — Player with 1000 T7 has score 1000.
3. `testCalculateScoreAllTiers` — Player with known balances across all tiers returns correct weighted sum.
4. `testCalculateScoreExcludesT1` — T1 balance does not affect score.
5. `testCalculateScoreUpdatesWithBalance` — Score changes when player's balances change (mint more, combine, etc).

**Claiming with score:**
6. `testClaimHolderStatusRecordsScore` — After claiming, `holderScore` matches `calculateScore(holder)`.
7. `testClaimHolderStatusSetsLastChallengeTime` — `lastChallengeTime` is set to block.timestamp.

**Challenge — success cases:**
8. `testChallengeSucceedsWithHigherScore` — Challenger with higher score takes over. Verify:
   - `countdownHolder` is now the challenger
   - `holderScore` is the challenger's score
   - `countdownStartTime` is reset (fresh 7 days)
   - `lastChallengeTime` is updated
   - Correct events emitted
9. `testChallengeCausesFullCountdownReset` — After successful challenge, the new holder has a full 7 days, not the remaining time from the old holder.
10. `testMultipleSequentialChallenges` — Holder A claimed, wait 24hrs, B challenges successfully, wait 24hrs, C challenges B successfully. Verify correct state after each.

**Challenge — failure/revert cases:**
11. `testChallengeRevertsNoActiveCountdown` — No countdown active, challenge reverts.
12. `testChallengeRevertsHolderSelf` — Current holder tries to challenge themselves, reverts.
13. `testChallengeRevertsWithoutAllTiers` — Challenger missing one tier, reverts.
14. `testChallengeRevertsDuringCooldown` — Challenge attempted within 24 hours of last claim/challenge, reverts.
15. `testChallengeRevertsLowerScore` — Challenger has lower score than holder, reverts.
16. `testChallengeRevertsEqualScore` — Challenger has exactly equal score, reverts (must be strictly greater).

**Edge cases:**
17. `testHolderScoreRecalculatedLive` — Holder claims, then mints more blocks (score increases). Challenger's score was higher than original claim score but lower than current holder score. Challenge should fail because holder's score is recalculated live.
18. `testHolderScoreDropsAfterForge` — Holder claims, then loses blocks via forge. Challenger with lower score than original claim can now succeed because holder's live score dropped.
19. `testChallengeAfterExactly24Hours` — Challenge at exactly `lastChallengeTime + 24 hours`. Should succeed (boundary test).
20. `testClaimTreasuryAfterChallenge` — Challenge succeeds, new holder waits full 7 days, claims treasury. Should work.
21. `testSacrificeAfterChallenge` — Same as above but with sacrifice.
22. `testOldHolderCannotClaimAfterChallenge` — After challenge shifts holder, old holder cannot claim treasury even if they still have all tiers.

---

## Step 9 — Verify

Run full test suite:
```bash
forge test
```

Report:
- How many tests existed before
- How many were modified
- How many new tests added
- Final test count and pass/fail status
- Any existing tests that broke and how they were fixed

---

## Context

### Scoring weights rationale
```
T2 = 10,000    (rarest mintable tier, ~1 in 20,000 blocks in Batch 1)
T3 = 2,000     (1 in 2,000 blocks)
T4 = 500       (1 in 333 blocks)
T5 = 100       (1 in 50 blocks)
T6 = 20        (1 in 10 blocks)
T7 = 1         (most common, ~87.6%)
```

At these weights:
- 10,000 T7 blocks = 1 T2 in point value (costs ~$2,000 in Batch 1 to mint)
- A solo whale with 2×T2 has ~20,000 point lead — a guild needs significant resources to overcome
- But volume-based catching up IS viable — prevents any single player from being untouchable

### What NOT to change
- claimHolderStatus tier-holding check — keep existing logic, just add score tracking
- claimTreasury/sacrifice payout logic — leave fund flows untouched
- Token contract — do NOT modify BlockHuntToken.sol
- Forge contract — do NOT modify BlockHuntForge.sol
- Existing events — keep them, add new ones alongside

### Deployment note
This contract will be redeployed. After deployment:
1. Call `setCountdownContract(newAddress)` on BlockHuntToken to point to the new Countdown
2. Call `setTokenContract(tokenAddress)` on the new Countdown so it can read balances
3. Any other wiring calls the old Countdown had (check Deploy.s.sol)
