# SPEC_FIXES — Audit Finding Fixes
> **Purpose:** Fix 4 findings from AUDIT_REPORT.md before redeploy
> **Priority:** Do all 4 before any deployment
> **After implementation:** Run `forge test` and ensure all 265 tests still pass + new tests pass

---

## Fix 1 — H-1: Guard Token Admin Setters

**File:** `src/BlockHuntToken.sol`
**Problem:** 5 admin setters have no guards. Owner can redirect funds at any time by calling `setTreasuryContract(maliciousAddress)` on mainnet.
**Functions to fix:** `setTreasuryContract`, `setMintWindowContract`, `setForgeContract`, `setCountdownContract`, `setEscrowContract`

**Fix:** Apply the same pattern already used for `setMigrationContract` — re-callable when `testMintEnabled` is true, locked after `disableTestMint()`.

For each of the 5 functions, add:
```solidity
require(currentValue == address(0) || testMintEnabled, "Already set");
```

Where `currentValue` is the respective state variable (`treasuryContract`, `mintWindowContract`, etc.).

**Example — setTreasuryContract:**
```solidity
function setTreasuryContract(address addr) external onlyOwner {
    require(address(treasuryContract) == address(0) || testMintEnabled, "Already set");
    treasuryContract = ITreasury(addr);  // or however it's currently typed
}
```

Apply the same pattern to all 5. Do NOT change `setMigrationContract` — it already has this guard.

**Tests to add:**
1. `test_Token_SetTreasuryContract_ReCallableInTestMode` — Can set, then change to different address while testMintEnabled is true.
2. `test_Token_SetTreasuryContract_LocksAfterTestMintDisabled` — After `disableTestMint()`, calling `setTreasuryContract` reverts with "Already set".
3. `test_Token_SetMintWindowContract_LocksAfterTestMintDisabled` — Same pattern.
4. `test_Token_SetForgeContract_LocksAfterTestMintDisabled` — Same pattern.
5. `test_Token_SetCountdownContract_LocksAfterTestMintDisabled` — Same pattern.
6. `test_Token_SetEscrowContract_LocksAfterTestMintDisabled` — Same pattern.

Run `forge test` after this fix before proceeding.

---

## Fix 2 — H-3: Voter List DoS in Countdown

**File:** `src/BlockHuntCountdown.sol`
**Problem:** `_resetCountdown` iterates over `_voterList` to clear `hasVoted` entries. An attacker can grow the list to thousands of entries, making reset exceed block gas limit. This bricks the game.

**Fix:** Replace the voter-clearing loop with a round-based counter.

**Step 2A — Add a round counter:**
```solidity
uint256 public countdownRound;
```

**Step 2B — Change `hasVoted` mapping:**

Current (find exact declaration):
```solidity
mapping(address => bool) public hasVoted;
```

Change to:
```solidity
mapping(uint256 => mapping(address => bool)) public hasVoted;
```

**Step 2C — Update `castVote` to use the round:**

Find where `hasVoted[msg.sender]` is read/written. Change to:
```solidity
hasVoted[countdownRound][msg.sender]
```

**Step 2D — Update `_resetCountdown`:**

Remove the loop that clears `hasVoted` entries and the `_voterList` array. Replace with:
```solidity
countdownRound++;
```

This invalidates all previous votes because the new round has a fresh mapping. O(1) instead of O(n).

**Step 2E — Remove `_voterList` array entirely** if it's only used for the clearing loop. If it's used elsewhere (e.g., for counting voters or frontend queries), keep it but still remove the clearing loop and increment the round. Clear the array with `delete _voterList` (this is O(1) for dynamic arrays in Solidity — it just resets the length to 0).

**Step 2F — Check for other references to `hasVoted` or `_voterList`:**
- `castVote` — update to use round
- `_resetCountdown` — replace loop with round increment
- `getCountdownInfo` or any view function that returns vote counts — update to use round
- Any external contract or interface that reads `hasVoted` — update

**Tests to update:**
- All existing vote-related tests that check `hasVoted[address]` need to change to `hasVoted[round][address]` or use the public getter accordingly
- Add: `test_VoterListDoS_ResetIsConstantGas` — Cast 100 votes, verify reset completes in reasonable gas (< 100k). This proves the fix works.
- Add: `test_VotesResetAfterRound` — Cast votes in round N, reset, verify votes don't carry over to round N+1.
- Add: `test_CanVoteInNewRound` — After reset, the same address can vote again.

Run `forge test` after this fix before proceeding.

---

## Fix 3 — H-4: Add 10% Royalty Cap

**File:** `src/BlockHuntToken.sol`
**Problem:** `setRoyalty` has no cap. Owner can set royalty to 100%.
**Function:** `setRoyalty` (find it — takes address receiver and uint96 fee)

**Fix:** Add one require:
```solidity
function setRoyalty(address receiver, uint96 fee) external onlyOwner {
    require(fee <= 1000, "Exceeds 10% cap");  // 1000 bps = 10%
    _setDefaultRoyalty(receiver, fee);
}
```

**Tests to add:**
1. `test_SetRoyalty_At10Percent` — Call with fee=1000. Should succeed.
2. `test_SetRoyalty_Above10Percent_Reverts` — Call with fee=1001. Should revert with "Exceeds 10% cap".
3. `test_SetRoyalty_At100Percent_Reverts` — Call with fee=10000. Should revert.

Run `forge test` after this fix before proceeding.

---

## Fix 4 — M-1: Pull-Payment for Sacrifice Winner

**File:** `src/BlockHuntEscrow.sol`
**Problem:** `initiateSacrifice` pushes 50% to winner via `call{value}`. If winner is a contract that reverts on ETH receive, the entire sacrifice (including community pool and season seed) is permanently blocked.

**Fix:** Switch the winner's 50% to a pull-payment (withdraw) pattern.

**Step 4A — Add state for pending withdrawal:**
```solidity
mapping(address => uint256) public pendingWithdrawal;
```

**Step 4B — In `initiateSacrifice`, instead of sending ETH to winner:**

Find the line that does something like:
```solidity
(bool success, ) = payable(winner).call{value: winnerShare}("");
require(success, "Winner payment failed");
```

Replace with:
```solidity
pendingWithdrawal[winner] = winnerShare;
```

Remove the ETH send and the success check for the winner. The community pool and season seed logic stays as-is (those are stored, not pushed).

**Step 4C — Add a withdrawal function:**
```solidity
/**
 * @notice Winner withdraws their 50% share after sacrifice.
 * @dev Pull-payment pattern prevents griefing by contract holders.
 */
function withdrawWinnerShare() external nonReentrant {
    uint256 amount = pendingWithdrawal[msg.sender];
    require(amount > 0, "Nothing to withdraw");
    
    pendingWithdrawal[msg.sender] = 0;
    
    (bool success, ) = payable(msg.sender).call{value: amount}("");
    require(success, "Transfer failed");
    
    emit WinnerShareWithdrawn(msg.sender, amount);
}
```

**Step 4D — Add the event:**
```solidity
event WinnerShareWithdrawn(address indexed winner, uint256 amount);
```

**Step 4E — Verify the rest of `initiateSacrifice` still works:**
- Community pool (40%) — should still be stored in `communityPool` variable, not sent. No change needed.
- Season seed (10%) — should still be stored in `season2Seed` variable, not sent. No change needed.
- The `sacrificeExecuted` flag should still be set. No change needed.

**Tests to update:**
- Any existing test that checks winner's balance immediately after sacrifice needs updating — the winner must now call `withdrawWinnerShare()` first.
- Add: `test_Sacrifice_WinnerMustWithdraw` — After sacrifice, winner balance hasn't changed. After `withdrawWinnerShare()`, winner receives 50%.
- Add: `test_Sacrifice_MaliciousContractDoesNotBlockSacrifice` — Sacrifice with a reverting contract as winner succeeds (stores pendingWithdrawal instead of sending). Community pool and season seed are correctly set.
- Add: `test_WithdrawWinnerShare_DoubleWithdraw_Reverts` — After withdrawing once, second call reverts with "Nothing to withdraw".
- Add: `test_WithdrawWinnerShare_NonWinner_Reverts` — Random address calls `withdrawWinnerShare()`, reverts.

Run `forge test` after this fix before proceeding.

---

## Verification

After all 4 fixes, run:
```bash
forge test
```

Report:
- Total tests before and after
- Any existing tests that broke and how they were fixed
- New tests added per fix
- Final pass/fail count

Also run a quick check: re-verify the 17 game invariants from the audit. Specifically confirm:
- Invariant #5 (royalty cap) now PASSES
- All other invariants still PASS
- Fund flows still sum correctly with the pull-payment change

---

## What NOT to Change

- Do NOT remove `emergencyWithdraw` from Treasury yet (stays for testnet)
- Do NOT add `tx.origin` check to `challengeCountdown` (blocks Safe users)
- Do NOT change any mint, combine, or forge logic
- Do NOT change scoring weights or challenge cooldown
- Do NOT change window timing (already correct from SPEC 01)
