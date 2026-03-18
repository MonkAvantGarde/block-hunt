# SPEC 01 — BlockHuntMintWindow.sol Changes
> **Purpose:** Change from two 6-hour windows to three 3-hour windows, add testing override
> **Priority:** Do this first — unblocks all testing
> **After implementation:** Run `forge test` and fix any failures

---

## Step 1 — Read Before Changing

Read these files first and understand the current implementation:
```
src/BlockHuntMintWindow.sol
test/BlockHunt.t.sol (search for "Window" or "MintWindow" related tests)
```

Report what the current values are for:
- Window duration
- Time guard (minimum gap between windows)
- Any constants related to timing

---

## Step 2 — Changes to BlockHuntMintWindow.sol

### 2A. Window duration: 6 hours → 3 hours

Find the constant or variable that sets window duration (likely `WINDOW_DURATION` or similar).
Change from 6 hours (21600 seconds) to 3 hours (10800 seconds).

### 2B. Time guard: current value → 4 hours

Find the constant or variable that controls the minimum time between window openings (the check that produces "Too early for next window" error).
Change to 4 hours (14400 seconds).

**Why 4 hours:** The new schedule is 10:00 / 18:00 / 02:00 UTC. Each window is 3 hours, leaving 5-hour gaps. A 4-hour guard gives 1 hour of buffer while allowing the schedule to work.

### 2C. Add testing override: `forceOpenWindow()`

Add a new owner-only function that opens a mint window bypassing the time guard check. This is for testing purposes only.

```solidity
/**
 * @notice Owner-only: force open a mint window, bypassing time guard.
 * @dev Only works when testMintEnabled is true. Will be disabled before mainnet
 *      along with mintForTest. Respects all other window logic (duration, caps, etc).
 */
function forceOpenWindow() external onlyOwner {
    require(testMintEnabled, "Test mode disabled");
    // Same logic as openWindow() but WITHOUT the time guard check
    // Must still set windowOpenTime, windowCloseTime, etc.
    // Must still emit the same event as openWindow()
}
```

**Important details:**
- Gate this behind `testMintEnabled` — same flag that controls `mintForTest()` on the Token contract. If BlockHuntMintWindow doesn't have this flag, check if there's an equivalent. If not, add a `testModeEnabled` bool with a setter, defaulting to `true`.
- The function should do everything `openWindow()` does EXCEPT the time guard check.
- If `openWindow()` has other checks (like "window already open"), those should still apply.
- Must emit the same event so the frontend picks it up identically.

---

## Step 3 — Update Tests

### Existing tests
- Find all tests that reference the old window duration (6 hours / 21600 seconds) and update to 3 hours (10800 seconds).
- Find all tests that reference the old time guard and update to 4 hours (14400 seconds).
- Run `forge test` after each batch of changes to catch breakage early.

### New tests for `forceOpenWindow()`
Add these test cases:

1. **Owner can force open window** — Call `forceOpenWindow()` as owner, verify window is open.
2. **Force open bypasses time guard** — Open a window, close it (warp time past duration), then immediately call `forceOpenWindow()` without waiting for the time guard. Should succeed.
3. **Non-owner cannot force open** — Call `forceOpenWindow()` from non-owner address. Should revert.
4. **Force open fails when test mode disabled** — Disable test mode, then call `forceOpenWindow()`. Should revert with "Test mode disabled".
5. **Force open fails when window already open** — Open a window, then immediately call `forceOpenWindow()` again. Should revert (can't have two windows open).
6. **Force-opened window still has correct duration** — Force open, verify the window close time is exactly 3 hours after open time.
7. **Normal openWindow still respects time guard** — Verify that `openWindow()` still enforces the 4-hour guard even after `forceOpenWindow()` exists.

---

## Step 4 — Verify

Run full test suite:
```bash
forge test
```

All existing tests should pass (with updated timing values).
All new tests should pass.

Report:
- How many tests existed before
- How many were modified
- How many new tests added
- Final test count and pass/fail status

---

## Context

### Why these changes
- Three 3-hour windows per day (10:00 / 18:00 / 02:00 UTC) give every major timezone a prime evening window
- Shorter windows increase urgency (scarcity psychology)
- More windows per day means more engagement cycles
- Testing override lets the developer test mint flows without waiting for time guards

### What NOT to change
- Daily cap logic — leave as is
- Batch advancement logic — leave as is
- Supply tracking — leave as is
- Event emissions — keep existing events, don't rename them
- The `openWindow()` function itself — only change the constants it checks against

### Deployment note
This contract will be redeployed. BlockHuntToken.sol is NOT being redeployed — the existing Token contract will be pointed to the new MintWindow via `setMintWindowContract()`. Do not modify BlockHuntToken.sol.
