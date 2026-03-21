// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/BlockHuntRewards.sol";

contract BlockHuntRewardsTest is Test {

    BlockHuntRewards public rewards;

    address public owner    = address(this);
    address public alice    = address(0xA11CE);
    address public bob      = address(0xB0B);
    address public charlie  = address(0xC0C);
    address public founder  = address(0xF00);

    function setUp() public {
        rewards = new BlockHuntRewards();
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  DEPOSIT & CONFIGURATION
    // ═══════════════════════════════════════════════════════════════════════

    function test_deposit() public {
        rewards.deposit{value: 0.5 ether}(1, 6000, 2600, 1400);

        (uint256 totalDeposit, uint16 lotteryBps, uint16 firstsBps, uint16 bountyBps, bool active,) =
            rewards.batchConfigs(1);

        assertEq(totalDeposit, 0.5 ether);
        assertEq(lotteryBps, 6000);
        assertEq(firstsBps, 2600);
        assertEq(bountyBps, 1400);
        assertTrue(active);
    }

    function test_deposit_reverts_if_already_funded() public {
        rewards.deposit{value: 0.5 ether}(1, 6000, 2600, 1400);
        vm.expectRevert("Batch already funded");
        rewards.deposit{value: 0.5 ether}(1, 6000, 2600, 1400);
    }

    function test_deposit_reverts_if_ratios_exceed_100() public {
        vm.expectRevert("Ratios exceed 100%");
        rewards.deposit{value: 0.5 ether}(1, 5000, 4000, 2000);
    }

    function test_deposit_reverts_for_invalid_batch() public {
        vm.expectRevert("Invalid batch");
        rewards.deposit{value: 0.5 ether}(0, 6000, 2600, 1400);

        vm.expectRevert("Invalid batch");
        rewards.deposit{value: 0.5 ether}(11, 6000, 2600, 1400);
    }

    function test_deposit_reverts_from_non_owner() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert();
        rewards.deposit{value: 0.5 ether}(1, 6000, 2600, 1400);
    }

    function test_topUp() public {
        rewards.deposit{value: 0.5 ether}(1, 6000, 2600, 1400);
        rewards.topUp{value: 0.3 ether}(1);

        (uint256 totalDeposit,,,,, ) = rewards.batchConfigs(1);
        assertEq(totalDeposit, 0.8 ether);
    }

    function test_topUp_reverts_if_not_funded() public {
        vm.expectRevert("Batch not funded");
        rewards.topUp{value: 0.3 ether}(1);
    }

    function test_updateRatios() public {
        rewards.deposit{value: 1 ether}(1, 6000, 2600, 1400);
        rewards.updateRatios(1, 5000, 3000, 2000);

        (, uint16 lotteryBps, uint16 firstsBps, uint16 bountyBps,,) = rewards.batchConfigs(1);
        assertEq(lotteryBps, 5000);
        assertEq(firstsBps, 3000);
        assertEq(bountyBps, 2000);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  PROPORTIONAL SUB-POOL VIEWS
    // ═══════════════════════════════════════════════════════════════════════

    function test_subPool_calculation() public {
        rewards.deposit{value: 1 ether}(1, 6000, 2600, 1400);

        assertEq(rewards.lotteryPool(1), 0.6 ether);
        assertEq(rewards.firstsPool(1), 0.26 ether);
        assertEq(rewards.bountyPool(1), 0.14 ether);
    }

    function test_subPools_rescale_on_topUp() public {
        rewards.deposit{value: 1 ether}(1, 6000, 2600, 1400);
        rewards.topUp{value: 1 ether}(1);

        // Pools should double
        assertEq(rewards.lotteryPool(1), 1.2 ether);
        assertEq(rewards.firstsPool(1), 0.52 ether);
        assertEq(rewards.bountyPool(1), 0.28 ether);
    }

    function test_subPools_rescale_on_ratioChange() public {
        rewards.deposit{value: 1 ether}(1, 6000, 2600, 1400);
        rewards.updateRatios(1, 4000, 4000, 2000);

        assertEq(rewards.lotteryPool(1), 0.4 ether);
        assertEq(rewards.firstsPool(1), 0.4 ether);
        assertEq(rewards.bountyPool(1), 0.2 ether);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  DAILY LOTTERY
    // ═══════════════════════════════════════════════════════════════════════

    function test_dailyDraw_resolve_and_claim() public {
        rewards.deposit{value: 1 ether}(1, 6000, 2600, 1400);
        rewards.setDailyPrize(1, 0.01 ether);

        address[] memory wallets = new address[](3);
        wallets[0] = alice;
        wallets[1] = bob;
        wallets[2] = charlie;

        // randomSeed=0 → winner index 0 = alice
        rewards.resolveDailyDraw(1, 1, wallets, 0);

        (uint256 batch, uint256 prize, address winner, uint256 resolvedAt, bool claimed) =
            rewards.dailyDraws(1);

        assertEq(batch, 1);
        assertEq(prize, 0.01 ether);
        assertEq(winner, alice);
        assertTrue(resolvedAt > 0);
        assertFalse(claimed);

        // Alice claims
        vm.prank(alice);
        rewards.claimDailyPrize(1);

        (,,,, claimed) = rewards.dailyDraws(1);
        assertTrue(claimed);
        assertEq(alice.balance, 0.01 ether);
    }

    function test_dailyDraw_selects_correct_winner() public {
        rewards.deposit{value: 1 ether}(1, 6000, 2600, 1400);
        rewards.setDailyPrize(1, 0.01 ether);

        address[] memory wallets = new address[](3);
        wallets[0] = alice;
        wallets[1] = bob;
        wallets[2] = charlie;

        // randomSeed=1 → 1 % 3 = 1 → bob
        rewards.resolveDailyDraw(1, 1, wallets, 1);
        (, , address winner,,) = rewards.dailyDraws(1);
        assertEq(winner, bob);
    }

    function test_dailyDraw_reverts_already_resolved() public {
        rewards.deposit{value: 1 ether}(1, 6000, 2600, 1400);
        rewards.setDailyPrize(1, 0.01 ether);

        address[] memory wallets = new address[](1);
        wallets[0] = alice;

        rewards.resolveDailyDraw(1, 1, wallets, 0);
        vm.expectRevert("Day already resolved");
        rewards.resolveDailyDraw(1, 1, wallets, 0);
    }

    function test_dailyPrize_claim_reverts_non_winner() public {
        rewards.deposit{value: 1 ether}(1, 6000, 2600, 1400);
        rewards.setDailyPrize(1, 0.01 ether);

        address[] memory wallets = new address[](1);
        wallets[0] = alice;
        rewards.resolveDailyDraw(1, 1, wallets, 0);

        vm.prank(bob);
        vm.expectRevert("Not the winner");
        rewards.claimDailyPrize(1);
    }

    function test_dailyPrize_claim_reverts_expired() public {
        rewards.deposit{value: 1 ether}(1, 6000, 2600, 1400);
        rewards.setDailyPrize(1, 0.01 ether);

        address[] memory wallets = new address[](1);
        wallets[0] = alice;
        rewards.resolveDailyDraw(1, 1, wallets, 0);

        vm.warp(block.timestamp + 31 days);
        vm.prank(alice);
        vm.expectRevert("Claim window expired");
        rewards.claimDailyPrize(1);
    }

    // Fix 1: Pool exhaustion reverts at resolve time, not claim time
    function test_dailyDraw_reverts_when_pool_exhausted() public {
        rewards.deposit{value: 0.1 ether}(1, 1000, 0, 0); // 10% = 0.01 ETH lottery
        rewards.setDailyPrize(1, 0.01 ether);

        address[] memory wallets = new address[](1);
        wallets[0] = alice;

        rewards.resolveDailyDraw(1, 1, wallets, 0);

        // Pool committed at resolve time — second resolve should revert immediately
        vm.expectRevert("Lottery pool exhausted");
        rewards.resolveDailyDraw(2, 1, wallets, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  BATCH FIRSTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_batchFirst_award_and_claim() public {
        rewards.deposit{value: 1 ether}(1, 0, 10000, 0); // 100% to firsts

        rewards.setBatchFirstWinner(1, 0, alice);

        (address winner, uint256 prize, uint256 awardedAt, bool claimed) =
            rewards.batchFirsts(1, 0);

        assertEq(winner, alice);
        assertEq(prize, uint256(1 ether) / 13);
        assertTrue(awardedAt > 0);
        assertFalse(claimed);

        vm.prank(alice);
        rewards.claimBatchFirst(1, 0);

        (,,, claimed) = rewards.batchFirsts(1, 0);
        assertTrue(claimed);
    }

    function test_batchFirst_custom_prize() public {
        rewards.deposit{value: 1 ether}(1, 0, 10000, 0);
        rewards.setFirstPrize(1, 0, 0.05 ether);

        rewards.setBatchFirstWinner(1, 0, alice);
        (, uint256 prize,,) = rewards.batchFirsts(1, 0);
        assertEq(prize, 0.05 ether);
    }

    function test_batchFirst_reverts_already_awarded() public {
        rewards.deposit{value: 1 ether}(1, 0, 10000, 0);
        rewards.setBatchFirstWinner(1, 0, alice);

        vm.expectRevert("Already awarded");
        rewards.setBatchFirstWinner(1, 0, bob);
    }

    function test_batchFirst_claim_reverts_non_winner() public {
        rewards.deposit{value: 1 ether}(1, 0, 10000, 0);
        rewards.setBatchFirstWinner(1, 0, alice);

        vm.prank(bob);
        vm.expectRevert("Not the winner");
        rewards.claimBatchFirst(1, 0);
    }

    function test_batchFirst_claim_reverts_expired() public {
        rewards.deposit{value: 1 ether}(1, 0, 10000, 0);
        rewards.setBatchFirstWinner(1, 0, alice);

        vm.warp(block.timestamp + 31 days);

        vm.prank(alice);
        vm.expectRevert("Claim window expired");
        rewards.claimBatchFirst(1, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  BATCH BOUNTY (two-step: addBatchBountyRecipients + finalizeBatchBounty)
    // ═══════════════════════════════════════════════════════════════════════

    function test_batchBounty_set_and_claim() public {
        rewards.deposit{value: 1 ether}(1, 0, 0, 10000); // 100% to bounty

        address[] memory wallets = new address[](4);
        wallets[0] = alice;
        wallets[1] = bob;
        wallets[2] = charlie;
        wallets[3] = founder;

        rewards.addBatchBountyRecipients(1, wallets);
        rewards.finalizeBatchBounty(1);

        (uint256 totalRecipients, uint256 perWalletShare,, bool distributed) =
            rewards.batchBounties(1);

        assertEq(totalRecipients, 4);
        assertEq(perWalletShare, 0.25 ether);
        assertTrue(distributed);

        vm.prank(alice);
        rewards.claimBatchBounty(1);
        assertEq(alice.balance, 0.25 ether);

        vm.prank(bob);
        rewards.claimBatchBounty(1);
        assertEq(bob.balance, 0.25 ether);
    }

    function test_batchBounty_reverts_not_entitled() public {
        rewards.deposit{value: 1 ether}(1, 0, 0, 10000);

        address[] memory wallets = new address[](1);
        wallets[0] = alice;
        rewards.addBatchBountyRecipients(1, wallets);
        rewards.finalizeBatchBounty(1);

        vm.prank(bob);
        vm.expectRevert("Not entitled");
        rewards.claimBatchBounty(1);
    }

    function test_batchBounty_reverts_double_claim() public {
        rewards.deposit{value: 1 ether}(1, 0, 0, 10000);

        address[] memory wallets = new address[](1);
        wallets[0] = alice;
        rewards.addBatchBountyRecipients(1, wallets);
        rewards.finalizeBatchBounty(1);

        vm.prank(alice);
        rewards.claimBatchBounty(1);

        vm.prank(alice);
        vm.expectRevert("Already claimed");
        rewards.claimBatchBounty(1);
    }

    function test_batchBounty_reverts_expired() public {
        rewards.deposit{value: 1 ether}(1, 0, 0, 10000);

        address[] memory wallets = new address[](1);
        wallets[0] = alice;
        rewards.addBatchBountyRecipients(1, wallets);
        rewards.finalizeBatchBounty(1);

        vm.warp(block.timestamp + 31 days);

        vm.prank(alice);
        vm.expectRevert("Claim window expired");
        rewards.claimBatchBounty(1);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  DYNAMIC ADJUSTMENT — THE KEY FEATURE
    // ═══════════════════════════════════════════════════════════════════════

    function test_topUp_increases_all_subPools() public {
        rewards.deposit{value: 1 ether}(1, 6000, 2600, 1400);

        // Before topup
        assertEq(rewards.lotteryPool(1), 0.6 ether);
        assertEq(rewards.firstsPool(1), 0.26 ether);
        assertEq(rewards.bountyPool(1), 0.14 ether);

        rewards.topUp{value: 1 ether}(1);

        // After topup — all doubled proportionally
        assertEq(rewards.lotteryPool(1), 1.2 ether);
        assertEq(rewards.firstsPool(1), 0.52 ether);
        assertEq(rewards.bountyPool(1), 0.28 ether);
    }

    function test_ratio_change_preserves_already_awarded() public {
        rewards.deposit{value: 1 ether}(1, 6000, 2600, 1400);
        rewards.setDailyPrize(1, 0.01 ether);

        // Award day 1 with 60% lottery pool
        address[] memory wallets = new address[](1);
        wallets[0] = alice;
        rewards.resolveDailyDraw(1, 1, wallets, 0);

        // Claim
        vm.prank(alice);
        rewards.claimDailyPrize(1);

        // Now change ratios — shrink lottery to 20%
        rewards.updateRatios(1, 2000, 4000, 4000);

        // Lottery pool is now 0.2 ETH, with 0.01 already committed
        assertEq(rewards.lotteryPool(1), 0.2 ether);
        assertEq(rewards.lotteryPaidOut(1), 0.01 ether);
        assertEq(rewards.lotteryRemaining(1), 0.19 ether);
    }

    function test_full_lifecycle() public {
        // 1. Deposit batch 1 with design doc ratios
        rewards.deposit{value: 0.5 ether}(1, 6000, 2600, 1400);
        rewards.setDailyPrize(1, 0.01 ether);

        // 2. Daily draw day 1
        address[] memory dayWallets = new address[](2);
        dayWallets[0] = alice;
        dayWallets[1] = bob;
        rewards.resolveDailyDraw(1, 1, dayWallets, 0); // alice wins

        // 3. Batch first: Pioneer
        rewards.setBatchFirstWinner(1, 0, bob);

        // 4. Game goes well — top up
        rewards.topUp{value: 0.5 ether}(1);

        // Sub-pools doubled (now based on 1 ETH deposit)
        assertEq(rewards.lotteryPool(1), 0.6 ether);
        assertEq(rewards.firstsPool(1), 0.26 ether);
        assertEq(rewards.bountyPool(1), 0.14 ether);

        // 5. Claims still work
        vm.prank(alice);
        rewards.claimDailyPrize(1);
        assertEq(alice.balance, 0.01 ether);

        vm.prank(bob);
        rewards.claimBatchFirst(1, 0);
        // Bob's prize was awarded when pool was 0.13 ETH (0.5 * 26%)
        // Prize = 0.13 / 13 = 0.01 ETH
        assertEq(bob.balance, 0.01 ether);

        // 6. Batch sells out — bounty distributed
        address[] memory minters = new address[](2);
        minters[0] = alice;
        minters[1] = charlie;
        rewards.addBatchBountyRecipients(1, minters);
        rewards.finalizeBatchBounty(1);

        vm.prank(charlie);
        rewards.claimBatchBounty(1);
        assertEq(charlie.balance, 0.07 ether); // 0.14 / 2
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  GETCLAIMABLE VIEW
    // ═══════════════════════════════════════════════════════════════════════

    function test_getClaimable() public {
        rewards.deposit{value: 1 ether}(1, 6000, 2600, 1400);
        rewards.setDailyPrize(1, 0.01 ether);

        // Give alice a daily win
        address[] memory wallets = new address[](1);
        wallets[0] = alice;
        rewards.resolveDailyDraw(1, 1, wallets, 0);

        // Give alice a batch first
        rewards.setBatchFirstWinner(1, 0, alice);

        // Give alice a bounty
        rewards.addBatchBountyRecipients(1, wallets);
        rewards.finalizeBatchBounty(1);

        BlockHuntRewards.ClaimableResult memory result = rewards.getClaimable(alice);

        assertEq(result.wonDays.length, 1);
        assertEq(result.wonDays[0], 1);
        assertEq(result.wonAmounts[0], 0.01 ether);

        assertEq(result.firstBatches.length, 1);
        assertEq(result.firstBatches[0], 1);
        assertEq(result.firstIds[0], 0);

        assertEq(result.bountyBatches.length, 1);
        assertEq(result.bountyBatches[0], 1);
    }

    function test_getClaimable_empty_for_non_winner() public {
        rewards.deposit{value: 1 ether}(1, 6000, 2600, 1400);

        BlockHuntRewards.ClaimableResult memory result = rewards.getClaimable(alice);
        assertEq(result.wonDays.length, 0);
        assertEq(result.firstBatches.length, 0);
        assertEq(result.bountyBatches.length, 0);
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

    // ═══════════════════════════════════════════════════════════════════════
    //  SWEEP & WITHDRAW
    // ═══════════════════════════════════════════════════════════════════════

    function test_sweepExpired_daily() public {
        rewards.deposit{value: 1 ether}(1, 6000, 2600, 1400);
        rewards.setDailyPrize(1, 0.01 ether);

        address[] memory wallets = new address[](1);
        wallets[0] = alice;
        rewards.resolveDailyDraw(1, 1, wallets, 0);

        // Fast forward past claim window
        vm.warp(block.timestamp + 31 days);

        uint256 founderBefore = founder.balance;
        rewards.sweepExpired(1, founder);
        assertEq(founder.balance - founderBefore, 0.01 ether);
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

    function test_withdrawLeftover_buffer() public {
        // 60% + 26% + 10% = 96%, so 4% buffer
        rewards.deposit{value: 1 ether}(1, 6000, 2600, 1000);

        uint256 buffer = 1 ether - rewards.lotteryPool(1) - rewards.firstsPool(1) - rewards.bountyPool(1);
        assertEq(buffer, 0.04 ether);

        uint256 founderBefore = founder.balance;
        rewards.withdrawLeftover(1, founder);
        assertEq(founder.balance - founderBefore, 0.04 ether);
    }

    // Fix 5: topUp still works after withdrawLeftover
    function test_topUp_works_after_withdrawLeftover() public {
        rewards.deposit{value: 1 ether}(1, 6000, 2600, 1000); // 4% buffer
        rewards.withdrawLeftover(1, founder);

        // TopUp should still work
        rewards.topUp{value: 0.5 ether}(1);
        (uint256 totalDeposit,,,,, ) = rewards.batchConfigs(1);
        assertEq(totalDeposit, 1.5 ether);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  PAUSE
    // ═══════════════════════════════════════════════════════════════════════

    function test_pause_blocks_claims() public {
        rewards.deposit{value: 1 ether}(1, 6000, 2600, 1400);
        rewards.setDailyPrize(1, 0.01 ether);

        address[] memory wallets = new address[](1);
        wallets[0] = alice;
        rewards.resolveDailyDraw(1, 1, wallets, 0);

        rewards.pause();

        vm.prank(alice);
        vm.expectRevert();
        rewards.claimDailyPrize(1);

        rewards.unpause();

        vm.prank(alice);
        rewards.claimDailyPrize(1);
        assertEq(alice.balance, 0.01 ether);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  EDGE CASES
    // ═══════════════════════════════════════════════════════════════════════

    function test_setDailyPrize_updatable() public {
        rewards.deposit{value: 1 ether}(1, 6000, 2600, 1400);
        rewards.setDailyPrize(1, 0.01 ether);
        assertEq(rewards.dailyPrize(1), 0.01 ether);

        rewards.setDailyPrize(1, 0.02 ether);
        assertEq(rewards.dailyPrize(1), 0.02 ether);
    }

    function test_multiple_batches_independent() public {
        rewards.deposit{value: 0.5 ether}(1, 6000, 2600, 1400);
        rewards.deposit{value: 1.0 ether}(2, 4000, 3000, 3000);

        assertEq(rewards.lotteryPool(1), 0.3 ether);
        assertEq(rewards.lotteryPool(2), 0.4 ether);

        assertEq(rewards.bountyPool(1), 0.07 ether);
        assertEq(rewards.bountyPool(2), 0.3 ether);
    }

    function test_emergencyWithdraw() public {
        rewards.deposit{value: 1 ether}(1, 6000, 2600, 1400);

        uint256 founderBefore = founder.balance;
        rewards.emergencyWithdraw(founder, 0.5 ether);
        assertEq(founder.balance - founderBefore, 0.5 ether);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  FIX 1: POOL COMMITMENT TRACKED AT RESOLVE TIME
    // ═══════════════════════════════════════════════════════════════════════

    function test_pool_commitment_tracked_at_resolve_time() public {
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

    // ═══════════════════════════════════════════════════════════════════════
    //  FIX 3: NON-SEQUENTIAL DAY NUMBERS
    // ═══════════════════════════════════════════════════════════════════════

    function test_nonSequential_days_getClaimable_and_sweep() public {
        rewards.deposit{value: 1 ether}(1, 10000, 0, 0);
        rewards.setDailyPrize(1, 0.01 ether);

        address[] memory wallets = new address[](1);
        wallets[0] = alice;

        // Use non-sequential day numbers
        rewards.resolveDailyDraw(100, 1, wallets, 0);
        rewards.resolveDailyDraw(200, 1, wallets, 0);

        // getClaimable should find both
        BlockHuntRewards.ClaimableResult memory result = rewards.getClaimable(alice);
        assertEq(result.wonDays.length, 2);
        assertEq(result.wonDays[0], 100);
        assertEq(result.wonDays[1], 200);

        // Day range tracking
        assertEq(rewards.firstDrawDay(), 100);
        assertEq(rewards.lastDrawDay(), 200);

        // Sweep after expiry
        vm.warp(block.timestamp + 31 days);
        uint256 founderBefore = founder.balance;
        rewards.sweepExpired(1, founder);
        assertEq(founder.balance - founderBefore, 0.02 ether);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  FIX 4: BATCHED BOUNTY RECIPIENTS
    // ═══════════════════════════════════════════════════════════════════════

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

    // ── Keeper role tests ──────────────────────────────────────────────────

    function test_setKeeper() public {
        address keeperAddr = makeAddr("keeper");
        rewards.setKeeper(keeperAddr);
        assertEq(rewards.keeper(), keeperAddr);
    }

    function test_keeper_can_resolveDailyDraw() public {
        address keeperAddr = makeAddr("keeper");
        rewards.setKeeper(keeperAddr);

        rewards.deposit{value: 1 ether}(1, 6000, 2600, 1400);
        rewards.setDailyPrize(1, 0.01 ether);

        address[] memory wallets = new address[](1);
        wallets[0] = alice;

        vm.prank(keeperAddr);
        rewards.resolveDailyDraw(1, 1, wallets, 42);

        (,,address winner,,) = rewards.dailyDraws(1);
        assertEq(winner, alice);
    }

    function test_keeper_can_setBatchFirstWinner() public {
        address keeperAddr = makeAddr("keeper");
        rewards.setKeeper(keeperAddr);

        rewards.deposit{value: 1 ether}(1, 6000, 2600, 1400);

        vm.prank(keeperAddr);
        rewards.setBatchFirstWinner(1, 0, alice);

        (address winner,,,) = rewards.batchFirsts(1, 0);
        assertEq(winner, alice);
    }

    function test_unauthorized_cannot_call_keeper_functions() public {
        rewards.deposit{value: 1 ether}(1, 6000, 2600, 1400);
        rewards.setDailyPrize(1, 0.01 ether);

        address[] memory wallets = new address[](1);
        wallets[0] = alice;

        vm.prank(alice);
        vm.expectRevert("Not authorized");
        rewards.resolveDailyDraw(1, 1, wallets, 42);
    }

    function test_MAX_BATCHES_is_10() public view {
        assertEq(rewards.MAX_BATCHES(), 10);
    }

    receive() external payable {}
}
