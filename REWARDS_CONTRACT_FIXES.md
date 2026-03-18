# BlockHuntRewards.sol — Fixes from Contract Review

> Paste this into Claude Code. All fixes are to BlockHuntRewards.sol and BlockHuntRewards.t.sol only.
> Do NOT modify any other files. Run `forge test` after each fix to confirm all tests pass.

---

## Fix 1: Pool over-commitment in lottery (MEDIUM)

**Problem:** `lotteryPaidOut` only increments when a winner claims, not when a draw is resolved. Multiple draws can be resolved beyond the pool balance before anyone claims. Later claimants could fail due to insufficient contract balance.

**Fix:** Increment `lotteryPaidOut` at resolve time instead of claim time. Remove the increment from `claimDailyPrize`.

In `resolveDailyDraw()`, add after line 313 (`dailyDrawCount[batch]++`):
```solidity
lotteryPaidOut[batch] += prize;
```

In `claimDailyPrize()`, remove this line (currently ~line 328):
```solidity
lotteryPaidOut[draw.batch] += draw.prize;
```

**Update tests:** The `test_dailyDraw_reverts_when_pool_exhausted` test currently requires a claim before the pool exhaustion check works. After this fix, the second `resolveDailyDraw` should revert immediately without needing the claim first. Update the test to remove the intermediate claim and verify the revert happens directly after the first resolve.

---

## Fix 2: Same over-commitment pattern in batch firsts (MEDIUM)

**Problem:** `firstsPaidOut` only increments on claim, not on award. Multiple firsts can be awarded beyond the pool.

**Fix:** Increment `firstsPaidOut` at award time instead of claim time. Remove the increment from `claimBatchFirst`.

In `setBatchFirstWinner()`, add after the `batchFirsts[batch][achievementId] = FirstAchievement(...)` assignment:
```solidity
firstsPaidOut[batch] += prize;
```

In `claimBatchFirst()`, remove this line (currently ~line 379):
```solidity
firstsPaidOut[batch] += fa.prize;
```

**Update tests:** Verify existing tests still pass. The `firstsRemaining()` view should now decrease immediately when a first is awarded, not when it's claimed.

---

## Fix 3: Day numbering convention (LOW)

**Problem:** `sweepExpired` and `getClaimable` both loop `day = 1` to `365`. If the keeper uses a different numbering scheme (e.g., sequential game days that go beyond 365, or large calendar-based numbers), the loop misses draws.

**Fix:** Add a tracking variable for the range of days used, so the loops are bounded correctly.

Add two new state variables:
```solidity
uint256 public firstDrawDay;   // smallest day number ever resolved
uint256 public lastDrawDay;    // largest day number ever resolved
```

In `resolveDailyDraw()`, update these after writing the draw:
```solidity
if (firstDrawDay == 0 || day < firstDrawDay) firstDrawDay = day;
if (day > lastDrawDay) lastDrawDay = day;
```

In `sweepExpired()`, replace `for (uint256 day = 1; day <= 365; day++)` with:
```solidity
for (uint256 day = firstDrawDay; day <= lastDrawDay; day++)
```

In `getClaimable()`, replace both `for (uint256 day = 1; day <= 365; day++)` loops (Pass 1 and Pass 2) with:
```solidity
for (uint256 day = firstDrawDay; day <= lastDrawDay; day++)
```

Add a guard at the top of both `sweepExpired` and `getClaimable` to handle the case where no draws have happened yet:
```solidity
if (lastDrawDay == 0) // no draws yet — skip daily loops
```

**Add test:** Test that resolving draws with non-sequential day numbers (e.g., day 100, day 200) works correctly with getClaimable and sweepExpired.

---

## Fix 4: setBatchBountyRecipients gas limit for large arrays (LOW)

**Problem:** Writing 5,000+ storage slots in one transaction exceeds block gas limits on Base.

**Fix:** Allow batched calls. Change `setBatchBountyRecipients` to be callable multiple times for the same batch, appending recipients instead of overwriting.

Replace the current `setBatchBountyRecipients` function with:

```solidity
/**
 * @notice Set batch bounty recipients. Can be called multiple times to
 *         add recipients in batches (for gas limit safety with large arrays).
 *         Call finalizeBatchBounty() after all recipients are added.
 * @param batch   Batch number
 * @param wallets Wallets to add as recipients
 */
function addBatchBountyRecipients(
    uint256 batch,
    address[] calldata wallets
) external onlyOwner whenNotPaused {
    require(batchConfigs[batch].active, "Batch not funded");
    require(!batchBounties[batch].distributed, "Already finalized");
    require(wallets.length > 0, "No recipients");

    for (uint256 i = 0; i < wallets.length; i++) {
        if (!bountyEntitled[batch][wallets[i]]) {
            bountyEntitled[batch][wallets[i]] = true;
            batchBounties[batch].totalRecipients++;
        }
    }
}

/**
 * @notice Finalize the batch bounty after all recipients are added.
 *         Computes equal share and locks the distribution.
 */
function finalizeBatchBounty(uint256 batch) external onlyOwner whenNotPaused {
    require(batchConfigs[batch].active, "Batch not funded");
    require(!batchBounties[batch].distributed, "Already finalized");
    require(batchBounties[batch].totalRecipients > 0, "No recipients added");

    uint256 pool = bountyPool(batch);
    uint256 perWallet = pool / batchBounties[batch].totalRecipients;
    require(perWallet > 0, "Share too small");

    batchBounties[batch].perWalletShare = perWallet;
    batchBounties[batch].setAt = block.timestamp;
    batchBounties[batch].distributed = true;

    emit BatchBountySet(batch, batchBounties[batch].totalRecipients, perWallet);
}
```

Remove the old `setBatchBountyRecipients` function entirely.

**Update tests:** Replace all calls to `setBatchBountyRecipients(batch, wallets)` with the two-step pattern:
```solidity
rewards.addBatchBountyRecipients(batch, wallets);
rewards.finalizeBatchBounty(batch);
```

**Add test:** Test calling `addBatchBountyRecipients` multiple times before finalizing — e.g., add 2 wallets, then add 2 more, then finalize. Verify all 4 are entitled and the per-wallet share is correct (pool / 4). Also test that duplicate wallets in separate calls don't double-count.

---

## Fix 5: withdrawLeftover settled flag blocks topUp (LOW)

**Problem:** `withdrawLeftover` sets `settled = true`, which permanently blocks `topUp`. If the founder withdraws buffer early and later wants to add more funds, they can't.

**Fix:** Make `settled` only block `withdrawLeftover` from being called again. Remove the `settled` check from `topUp`.

In `topUp()`, change the require on line 174 from:
```solidity
require(!batchConfigs[batch].settled, "Batch settled");
```
to:
```solidity
// settled flag no longer blocks topUp — founder can always add more funds
```
(Just remove the require entirely.)

Keep the `settled` check in `withdrawLeftover` to prevent double-withdrawal of the same buffer.

Also keep the `settled` check in `updateRatios` — once buffer has been withdrawn, changing ratios could create accounting inconsistencies.

**Add test:** Test that after calling `withdrawLeftover`, calling `topUp` still works. Verify the new funds are reflected in sub-pool calculations.

---

## New Tests to Add

In addition to the test updates above, add these missing test cases:

```solidity
function test_batchFirst_claim_reverts_expired() public {
    rewards.deposit{value: 1 ether}(1, 0, 10000, 0);
    rewards.setBatchFirstWinner(1, 0, alice);

    vm.warp(block.timestamp + 31 days);

    vm.prank(alice);
    vm.expectRevert("Claim window expired");
    rewards.claimBatchFirst(1, 0);
}

function test_sweepExpired_batchFirsts() public {
    rewards.deposit{value: 1 ether}(1, 0, 10000, 0);
    rewards.setBatchFirstWinner(1, 0, alice);

    vm.warp(block.timestamp + 31 days);

    uint256 founderBefore = founder.balance;
    rewards.sweepExpired(1, founder);
    // Should recover the first's prize (1 ether / 13)
    assertGt(founder.balance - founderBefore, 0);
}

function test_getClaimable_excludes_expired() public {
    rewards.deposit{value: 1 ether}(1, 6000, 2600, 1400);
    rewards.setDailyPrize(1, 0.01 ether);

    address[] memory wallets = new address[](1);
    wallets[0] = alice;
    rewards.resolveDailyDraw(1, 1, wallets, 0);

    // Before expiry — should show 1 claimable
    BlockHuntRewards.ClaimableResult memory before = rewards.getClaimable(alice);
    assertEq(before.wonDays.length, 1);

    // After expiry — should show 0
    vm.warp(block.timestamp + 31 days);
    BlockHuntRewards.ClaimableResult memory after_ = rewards.getClaimable(alice);
    assertEq(after_.wonDays.length, 0);
}

function test_emergencyWithdraw() public {
    rewards.deposit{value: 1 ether}(1, 6000, 2600, 1400);

    uint256 founderBefore = founder.balance;
    rewards.emergencyWithdraw(founder, 0.5 ether);
    assertEq(founder.balance - founderBefore, 0.5 ether);
}

function test_pool_commitment_tracked_at_resolve_time() public {
    // Verify Fix 1: pool decreases on resolve, not claim
    rewards.deposit{value: 0.1 ether}(1, 10000, 0, 0); // 100% lottery = 0.1 ETH
    rewards.setDailyPrize(1, 0.05 ether);

    address[] memory wallets = new address[](1);
    wallets[0] = alice;

    // First draw: 0.05 committed, 0.05 remaining
    rewards.resolveDailyDraw(1, 1, wallets, 0);
    assertEq(rewards.lotteryRemaining(1), 0.05 ether);

    // Second draw: 0.05 committed, 0 remaining
    rewards.resolveDailyDraw(2, 1, wallets, 0);
    assertEq(rewards.lotteryRemaining(1), 0);

    // Third draw: should revert — pool exhausted even though nobody claimed
    vm.expectRevert("Lottery pool exhausted");
    rewards.resolveDailyDraw(3, 1, wallets, 0);
}

function test_bounty_batched_recipients() public {
    rewards.deposit{value: 1 ether}(1, 0, 0, 10000);

    // Add in two batches
    address[] memory batch1 = new address[](2);
    batch1[0] = alice;
    batch1[1] = bob;
    rewards.addBatchBountyRecipients(1, batch1);

    address[] memory batch2 = new address[](2);
    batch2[0] = charlie;
    batch2[1] = founder;
    rewards.addBatchBountyRecipients(1, batch2);

    rewards.finalizeBatchBounty(1);

    (uint256 totalRecipients, uint256 perWalletShare,, bool distributed) =
        rewards.batchBounties(1);
    assertEq(totalRecipients, 4);
    assertEq(perWalletShare, 0.25 ether);
    assertTrue(distributed);

    // All can claim
    vm.prank(alice);
    rewards.claimBatchBounty(1);
    assertEq(alice.balance, 0.25 ether);
}

function test_bounty_duplicate_wallets_not_double_counted() public {
    rewards.deposit{value: 1 ether}(1, 0, 0, 10000);

    address[] memory wallets1 = new address[](2);
    wallets1[0] = alice;
    wallets1[1] = bob;
    rewards.addBatchBountyRecipients(1, wallets1);

    // Add alice again — should not double count
    address[] memory wallets2 = new address[](1);
    wallets2[0] = alice;
    rewards.addBatchBountyRecipients(1, wallets2);

    rewards.finalizeBatchBounty(1);

    (uint256 totalRecipients,,,) = rewards.batchBounties(1);
    assertEq(totalRecipients, 2); // alice + bob, not 3
}

function test_topUp_works_after_withdrawLeftover() public {
    rewards.deposit{value: 1 ether}(1, 6000, 2600, 1000); // 4% buffer
    rewards.withdrawLeftover(1, founder);

    // TopUp should still work
    rewards.topUp{value: 0.5 ether}(1);
    (uint256 totalDeposit,,,,, ) = rewards.batchConfigs(1);
    assertEq(totalDeposit, 1.5 ether);
}
```

---

## Safety checklist after all fixes

```bash
forge test
# All existing tests + new tests must pass
# Zero modifications to any file outside of:
#   - src/BlockHuntRewards.sol
#   - test/BlockHuntRewards.t.sol
```
