# SPEC 02 — Countdown Challenge Mechanic
> **Purpose:** Add countdown challenge system where a player with all 6 tiers AND a higher score can take over the countdown from the current holder
> **Priority:** Do this after SPEC 01 (MintWindow changes)
> **After implementation:** Run `forge test` and fix any failures
> **IMPORTANT:** This spec modifies BOTH BlockHuntCountdown.sol AND BlockHuntToken.sol

---

## Architectural Context

From SPEC 00 verification, countdown state lives on BlockHuntToken:
- `countdownActive` (bool)
- `countdownHolder` (address)
- `countdownStartTime` (uint256)
- `claimTreasury()` and `sacrifice()` live on Token and check Token's own state

The Countdown contract is a helper — Token calls `countdown.startCountdown(holder)` to sync.

**For the challenge mechanic to work, the Countdown contract needs to be able to update Token's countdown state.** This requires a small addition to Token: a function callable only by the Countdown contract that updates the holder and resets the start time.

---

## Step 1 — Read Before Changing

Read these files and understand current implementation:
```
src/BlockHuntToken.sol (focus on: countdownActive, countdownHolder, countdownStartTime, _checkCountdownTrigger, claimTreasury, sacrifice, claimHolderStatus)
src/BlockHuntCountdown.sol (focus on: startCountdown, checkHolderStatus, syncReset, all state variables)
test/BlockHunt.t.sol (search for all Countdown-related tests)
```

Report:
- Exact lines where countdownHolder, countdownStartTime, countdownActive are declared in Token
- How `_checkCountdownTrigger` sets these values
- How `claimTreasury` and `sacrifice` read these values
- How `checkHolderStatus` on Countdown interacts with Token
- What `syncReset` does
- All existing countdown-related events on both contracts

---

## Step 2 — BlockHuntToken.sol Modification

### 2A. Add one new function to Token:

```solidity
/**
 * @notice Called by the Countdown contract to update the countdown holder
 *         when a successful challenge shifts the countdown to a new player.
 * @dev Only callable by the registered Countdown contract.
 *      Resets countdownStartTime to block.timestamp (full 7-day reset).
 *      Does NOT change countdownActive — countdown remains active.
 * @param newHolder The address of the new countdown holder
 */
function updateCountdownHolder(address newHolder) external {
    require(msg.sender == address(countdownContract), "Only countdown contract");
    require(countdownActive, "No active countdown");
    
    countdownHolder = newHolder;
    countdownStartTime = block.timestamp;
    
    emit CountdownHolderUpdated(newHolder, block.timestamp);
}
```

### 2B. Add the event:

```solidity
event CountdownHolderUpdated(address indexed newHolder, uint256 timestamp);
```

### 2C. That's it for Token.

Do NOT change:
- `_checkCountdownTrigger` — the initial countdown trigger path stays as-is
- `claimTreasury` — unchanged
- `sacrifice` — unchanged
- `claimHolderStatus` — unchanged (this is how players FIRST trigger the countdown)
- Any mint, combine, or forge logic
- Any VRF logic

---

## Step 3 — BlockHuntCountdown.sol: New State Variables

Add these:

```solidity
// Challenge mechanic
uint256 public holderScore;           // Score recorded at time of claim or successful challenge
uint256 public lastChallengeTime;     // Timestamp of last successful claim or challenge
uint256 public constant CHALLENGE_COOLDOWN = 24 hours;

// Scoring weights — compressed exponential based on tier economic cost
uint256 public constant WEIGHT_T2 = 10000;
uint256 public constant WEIGHT_T3 = 2000;
uint256 public constant WEIGHT_T4 = 500;
uint256 public constant WEIGHT_T5 = 100;
uint256 public constant WEIGHT_T6 = 20;
uint256 public constant WEIGHT_T7 = 1;
```

Check what tier ID constants exist. From SPEC 00:
- Token has: TIER_ORIGIN=1, TIER_WILLFUL=2, TIER_CHAOTIC=3, TIER_ORDERED=4, TIER_REMEMBER=5, TIER_RESTLESS=6, TIER_INERT=7
- Countdown may need to define matching constants OR read them from Token

---

## Step 4 — BlockHuntCountdown.sol: New Function `calculateScore(address)`

```solidity
/**
 * @notice Calculate a player's weighted score based on tier balances.
 * @dev Reads balances from Token contract. View function — no gas cost.
 *      T1 (Origin) is excluded from scoring — it is sacrifice-only.
 *
 * Score = (T2 × 10,000) + (T3 × 2,000) + (T4 × 500) + (T5 × 100) + (T6 × 20) + (T7 × 1)
 *
 * @param player The address to calculate score for
 * @return score The weighted score
 */
function calculateScore(address player) public view returns (uint256) {
    // Use Token's balancesOf(player) which returns uint256[8] (index 1-7 = tiers)
    // OR call balanceOf(player, tierId) for each tier individually
    // balancesOf is preferred — single external call vs 6 separate calls
    
    // Multiply each tier balance by its weight, sum and return
}
```

**Implementation note:** `balancesOf(address)` returns `uint256[8]` where index matches tier ID (1=T1, 2=T2, ..., 7=T7, 0=unused). So:
```
score = balances[2] * WEIGHT_T2 + balances[3] * WEIGHT_T3 + balances[4] * WEIGHT_T4 +
        balances[5] * WEIGHT_T5 + balances[6] * WEIGHT_T6 + balances[7] * WEIGHT_T7;
```

---

## Step 5 — BlockHuntCountdown.sol: Modify `startCountdown(address holder)`

This function is called BY Token when a player first triggers the countdown. Add score tracking:

```solidity
// EXISTING logic stays — just ADD these lines after the countdown is started:
holderScore = calculateScore(holder);
lastChallengeTime = block.timestamp;
```

Do NOT change the function signature or existing checks. This is additive only.

---

## Step 6 — BlockHuntCountdown.sol: New Function `challengeCountdown()`

```solidity
/**
 * @notice Challenge the current countdown holder. If the challenger holds all 6 tiers
 *         AND has a strictly higher score, the countdown resets to 7 days under the challenger.
 *
 * @dev Flow:
 *   1. Verify countdown is active
 *   2. Verify caller is not current holder
 *   3. Verify caller holds all 6 mintable tiers (T2-T7)
 *   4. Verify 24-hour cooldown has passed since last claim/challenge
 *   5. Calculate both scores LIVE (not from storage)
 *   6. Require challenger score > holder score (strictly greater)
 *   7. Update Countdown state (holder, score, challenge time)
 *   8. Call Token.updateCountdownHolder(challenger) to sync Token state
 *   9. Emit events
 */
function challengeCountdown() external {
    // 1. Countdown must be active
    //    Check: how does this contract know if countdown is active?
    //    It may have its own `isActive` flag, OR it may read from Token.
    //    Use whichever is authoritative.
    require(isActive, "No active countdown");
    
    // 2. Cannot challenge yourself
    require(msg.sender != currentHolder, "Holder cannot self-challenge");
    
    // 3. Challenger must hold all 6 tiers
    //    Use Token's hasAllTiers(address) — returns bool
    IBlockHuntToken tokenContract_ = IBlockHuntToken(tokenContract);
    require(tokenContract_.hasAllTiers(msg.sender), "Must hold all 6 tiers");
    
    // 4. 24-hour cooldown since last claim or successful challenge
    require(
        block.timestamp >= lastChallengeTime + CHALLENGE_COOLDOWN,
        "Challenge cooldown active"
    );
    
    // 5. Calculate BOTH scores live
    uint256 challengerScore = calculateScore(msg.sender);
    uint256 currentHolderScore = calculateScore(currentHolder);
    
    // 6. Strictly greater
    require(challengerScore > currentHolderScore, "Score not high enough");
    
    // 7. Store old holder for events
    address oldHolder = currentHolder;
    uint256 oldScore = currentHolderScore;
    
    // 8. Update Countdown contract state
    currentHolder = msg.sender;
    holderScore = challengerScore;
    lastChallengeTime = block.timestamp;
    // Note: countdownStartTime on THIS contract may also need updating
    // Check if Countdown has its own start time or only Token does
    
    // 9. Sync Token state — THIS IS THE KEY CALL
    //    This updates countdownHolder and countdownStartTime on Token
    tokenContract_.updateCountdownHolder(msg.sender);
    
    // 10. Emit events
    emit CountdownChallenged(msg.sender, challengerScore, oldHolder, oldScore, true);
    emit CountdownShifted(msg.sender, oldHolder, challengerScore, block.timestamp);
}
```

**Critical implementation notes:**

**A. The Token sync call is essential.** Without `tokenContract_.updateCountdownHolder(msg.sender)`, Token still thinks the old holder has the countdown. `claimTreasury()` and `sacrifice()` on Token check Token's `countdownHolder` — if it's not synced, the new holder can't claim.

**B. The Token interface needs updating.** The Countdown contract calls Token through an interface. This interface must be extended to include `updateCountdownHolder(address)`. Find where the IBlockHuntToken interface is defined (could be in the Countdown file or a separate interfaces file) and add the new function.

**C. Check `hasAllTiers` accessibility.** Verify that `hasAllTiers(address)` is a public function on Token that can be called externally by Countdown. From SPEC 00 it should be, but confirm.

**D. `syncReset` interaction.** The existing `syncReset()` function (called when Token resets the countdown) should also reset the challenge-related state. Add to `syncReset`:
```solidity
holderScore = 0;
lastChallengeTime = 0;
```

---

## Step 7 — New Events on Countdown

```solidity
/// @notice Emitted when a challenge attempt is made
event CountdownChallenged(
    address indexed challenger,
    uint256 challengerScore,
    address indexed previousHolder,
    uint256 previousHolderScore,
    bool success
);

/// @notice Emitted when countdown successfully shifts to a new holder
event CountdownShifted(
    address indexed newHolder,
    address indexed previousHolder,
    uint256 newScore,
    uint256 timestamp
);
```

Keep all existing events (CountdownStarted, CountdownEnded, VoteCast, CountdownReset). These are additive.

---

## Step 8 — Update Tests

### Token tests — new:
1. `testUpdateCountdownHolderOnlyCountdown` — Only countdown contract can call. Others revert.
2. `testUpdateCountdownHolderUpdatesState` — After call, Token's countdownHolder and countdownStartTime are updated.
3. `testUpdateCountdownHolderRevertsNoActiveCountdown` — Reverts if no active countdown.
4. `testUpdateCountdownHolderEmitsEvent` — CountdownHolderUpdated event emitted.

### Score calculation tests:
5. `testCalculateScoreEmpty` — Player with no blocks → score 0.
6. `testCalculateScoreT7Only` — 1000 T7 → score 1000.
7. `testCalculateScoreAllTiers` — Known balances across all tiers → correct weighted sum.
8. `testCalculateScoreExcludesT1` — T1 balance does not affect score.
9. `testCalculateScoreChangesWithBalance` — Score updates when balances change.

### Challenge success tests:
10. `testChallengeSucceedsHigherScore` — Challenger with higher score takes over. Verify:
    - Countdown contract: currentHolder, holderScore, lastChallengeTime updated
    - Token contract: countdownHolder and countdownStartTime updated
    - Events emitted correctly
11. `testChallengeFullReset` — New holder gets full 7 days (countdownStartTime on Token = block.timestamp at challenge time).
12. `testMultipleSequentialChallenges` — A claims, 24hrs pass, B challenges A, 24hrs pass, C challenges B. All state correct after each.
13. `testOriginalClaimStillWorks` — Normal `claimHolderStatus` flow (via Token) still works exactly as before.

### Challenge revert tests:
14. `testChallengeRevertsNoCountdown` — No active countdown → revert.
15. `testChallengeRevertsSelf` — Current holder challenges self → revert.
16. `testChallengeRevertsMissingTier` — Challenger missing one tier → revert.
17. `testChallengeRevertsCooldown` — Within 24 hours of last challenge → revert.
18. `testChallengeRevertsLowerScore` — Challenger score lower → revert.
19. `testChallengeRevertsEqualScore` — Challenger score exactly equal → revert.

### Edge case tests:
20. `testHolderScoreLiveRecalculation` — Holder mints more after claiming. Challenger's score was higher than claim-time score but lower than current. Challenge fails.
21. `testHolderScoreDropsFromForge` — Holder loses blocks via forge. Challenger who previously couldn't win now can.
22. `testChallengeAtExactly24Hours` — Challenge at exactly lastChallengeTime + 24 hours. Should succeed.
23. `testClaimTreasuryAfterChallenge` — Challenge succeeds, new holder waits 7 days, calls claimTreasury on Token. Works.
24. `testSacrificeAfterChallenge` — Same but sacrifice path.
25. `testOldHolderCannotClaimAfterChallenge` — Old holder calls claimTreasury → reverts (Token's countdownHolder changed).
26. `testSyncResetClearsChallenge State` — When countdown resets (holder loses a tier), holderScore and lastChallengeTime reset to 0.
27. `testCheckHolderStatusStillWorks` — The keeper's `checkHolderStatus()` still correctly resets countdown if holder loses a tier, even after challenges have happened.

---

## Step 9 — Verify

Run full test suite:
```bash
forge test
```

Report:
- Total test count before and after
- Tests modified vs new
- Pass/fail status
- Any existing tests that broke and how they were fixed

---

## Step 10 — Interface Check

After all code is written, verify:

1. The IBlockHuntToken interface (wherever it's defined) includes `updateCountdownHolder(address)`
2. The IBlockHuntToken interface includes `hasAllTiers(address)` (may already be there)
3. The Countdown contract can successfully call both functions on Token
4. No circular dependency issues

---

## Post-Deployment Wiring

After deploying new Token, MintWindow, and Countdown:

```
1. Deploy new BlockHuntToken
2. Deploy new BlockHuntMintWindow
3. Deploy new BlockHuntCountdown
4. Wire Token → Treasury (existing), MintWindow (new), Forge (existing), Countdown (new), Escrow (existing), Migration (existing)
5. Wire Treasury → Token (new)
6. Wire MintWindow → Token (new)
7. Wire Forge → Token (new)
8. Wire Countdown → Token (new)
9. Wire Escrow → Token (new)
10. Wire Treasury → Escrow
11. Set VRF config on Token (subId, keyHash, callbackGasLimit=2500000)
12. Set VRF config on Forge
13. Add new Token + Forge as VRF consumers on Chainlink subscription
14. Register Season 1 on SeasonRegistry
15. Call forceOpenWindow() on new MintWindow to test
```

NOTE: Since Token is being redeployed, ALL contracts that talk to Token need to be told the new Token address. Check Deploy.s.sol for the full wiring sequence and replicate it.

---

## Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Countdown reset on challenge | Full 7-day reset | Each new holder earns fresh 7 days. Maximizes treasury growth. Natural gas costs prevent infinite loops |
| Cooldown period | 24 hours on position | Prevents ping-pong. Not per-challenger — once position is secured, nobody can challenge for 24hrs |
| Score comparison | Live recalculation | Holder's score at challenge time, not at claim time. Creates strategic risk from forging during countdown |
| Failed challenge | Simple revert, no penalty | No cooldown on failed attempts. Low barrier to try, high barrier to succeed |
| Equal scores | Challenger loses (strictly greater required) | Defender's advantage — incumbent holds on ties |
| T1 in scoring | Excluded | T1 is sacrifice-only, not part of the competitive game |

---

## What NOT to Change

- Mint logic (VRF, pricing, batches, caps)
- Combine logic
- Forge logic
- Treasury fund flows (claim, sacrifice payouts)
- Migration logic
- Escrow logic
- Season registry logic
- Existing events (only add new ones)
- The core countdown trigger path (Token's claimHolderStatus → _checkCountdownTrigger → countdown.startCountdown)
