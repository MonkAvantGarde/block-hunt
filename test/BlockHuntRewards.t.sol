// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/BlockHuntRewards.sol";

contract MockTokenForRewards {
    mapping(address => uint256) public t6Balance;

    function rewardMint(address to, uint32 quantity) external {
        t6Balance[to] += quantity;
    }

    function dailyEligible(uint256, address) external pure returns (bool) { return false; }
    function dailyMinterCount(uint256) external pure returns (uint256) { return 0; }
}

contract BlockHuntRewardsV2Test is Test {
    BlockHuntRewards rewards;
    MockTokenForRewards mockToken;
    address owner = address(this);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xC0C);
    address token;

    receive() external payable {}

    function setUp() public {
        vm.warp(1700000000);
        mockToken = new MockTokenForRewards();
        token = address(mockToken);
        rewards = new BlockHuntRewards();
        rewards.setTokenContract(token);
    }

    // ── Vault ───────────────────────────────────────────────────────────────

    function test_fund() public {
        rewards.fund{value: 1 ether}();
        assertEq(rewards.vaultBalance(), 1 ether);
    }

    function test_withdraw() public {
        rewards.fund{value: 1 ether}();
        rewards.withdraw(0.5 ether);
        assertEq(rewards.vaultBalance(), 0.5 ether);
    }

    function test_withdraw_exceeds_vault_reverts() public {
        rewards.fund{value: 1 ether}();
        vm.expectRevert(bytes("Insufficient vault"));
        rewards.withdraw(1.5 ether);
    }

    // ── Config ──────────────────────────────────────────────────────────────

    function test_setTierBounty() public {
        rewards.setTierBounty(1, 6, 0.01 ether);
        assertEq(rewards.tierBountyAmount(1, 1, 6), 0.01 ether);
    }

    function test_setLeaderboardAmounts() public {
        uint256[3] memory amounts = [uint256(0.05 ether), 0.03 ether, 0.01 ether];
        rewards.setLeaderboardAmounts(amounts);
        assertEq(rewards.leaderboardAmounts(0), 0.05 ether);
        assertEq(rewards.leaderboardAmounts(1), 0.03 ether);
        assertEq(rewards.leaderboardAmounts(2), 0.01 ether);
    }

    function test_setStreakMilestone() public {
        rewards.setStreakMilestone(0, 3, 100, 10);
        (uint16 days_, uint16 slots, uint16 claimed, uint16 reward) = rewards.streakMilestones(0);
        assertEq(days_, 3);
        assertEq(slots, 100);
        assertEq(claimed, 0);
        assertEq(reward, 10);
    }

    // ── onMint ──────────────────────────────────────────────────────────────

    function test_onMint_setsEligibility() public {
        vm.prank(token);
        rewards.onMint(alice, 0.001 ether, 1);
        uint32 today = uint32(block.timestamp / 1 days);
        assertTrue(rewards.dailyEligible(1, today, alice));
    }

    function test_onMint_incrementsStreak() public {
        vm.prank(token);
        rewards.onMint(alice, 0.001 ether, 1);
        assertEq(rewards.streakDay(1, alice), 1);

        vm.warp(block.timestamp + 1 days);
        vm.prank(token);
        rewards.onMint(alice, 0.001 ether, 1);
        assertEq(rewards.streakDay(1, alice), 2);
    }

    function test_onMint_streakResets_afterGap() public {
        vm.prank(token);
        rewards.onMint(alice, 0.001 ether, 1);

        vm.warp(block.timestamp + 3 days);
        vm.prank(token);
        rewards.onMint(alice, 0.001 ether, 1);
        assertEq(rewards.streakDay(1, alice), 1);
    }

    function test_onMint_sameDayNoOp() public {
        vm.prank(token);
        rewards.onMint(alice, 0.001 ether, 1);
        vm.prank(token);
        rewards.onMint(alice, 0.002 ether, 1);
        assertEq(rewards.streakDay(1, alice), 1);
    }

    function test_onMint_onlyToken() public {
        vm.prank(alice);
        vm.expectRevert(bytes("Only token"));
        rewards.onMint(alice, 0.001 ether, 1);
    }

    // ── recordTierDrop ──────────────────────────────────────────────────────

    function test_recordTierDrop_incrementsTotalMinted() public {
        vm.prank(token);
        rewards.recordTierDrop(alice, 7, 1);
        assertEq(rewards.totalMintedByPlayer(alice), 1);
    }

    function test_recordTierDrop_setsBountyWinner() public {
        rewards.setTierBounty(1, 7, 0.01 ether);
        vm.prank(token);
        rewards.recordTierDrop(alice, 7, 1);
        assertEq(rewards.tierBountyWinner(1, 1, 7), alice);
    }

    function test_recordTierDrop_secondPlayerDoesNotOverwrite() public {
        rewards.setTierBounty(1, 7, 0.01 ether);
        vm.prank(token);
        rewards.recordTierDrop(alice, 7, 1);
        vm.prank(token);
        rewards.recordTierDrop(bob, 7, 1);
        assertEq(rewards.tierBountyWinner(1, 1, 7), alice);
    }

    // ── claimBounty ─────────────────────────────────────────────────────────

    function test_claimBounty() public {
        rewards.fund{value: 1 ether}();
        rewards.setTierBounty(1, 7, 0.01 ether);
        vm.prank(token);
        rewards.recordTierDrop(alice, 7, 1);

        vm.prank(alice);
        rewards.claimBounty(1, 7);
        assertEq(alice.balance, 0.01 ether);
        assertEq(rewards.vaultBalance(), 0.99 ether);
    }

    function test_claimBounty_nonWinner_reverts() public {
        rewards.fund{value: 1 ether}();
        rewards.setTierBounty(1, 7, 0.01 ether);
        vm.prank(token);
        rewards.recordTierDrop(alice, 7, 1);

        vm.prank(bob);
        vm.expectRevert(bytes("Not winner"));
        rewards.claimBounty(1, 7);
    }

    function test_claimBounty_doubleClaim_reverts() public {
        rewards.fund{value: 1 ether}();
        rewards.setTierBounty(1, 7, 0.01 ether);
        vm.prank(token);
        rewards.recordTierDrop(alice, 7, 1);

        vm.prank(alice);
        rewards.claimBounty(1, 7);
        vm.prank(alice);
        vm.expectRevert(bytes("Already claimed"));
        rewards.claimBounty(1, 7);
    }

    // ── claimStreak ─────────────────────────────────────────────────────────

    function test_claimStreak() public {
        rewards.setStreakMilestone(0, 3, 100, 10);

        for (uint256 d = 0; d < 3; d++) {
            if (d > 0) vm.warp(block.timestamp + 1 days);
            vm.prank(token);
            rewards.onMint(alice, 0.001 ether, 1);
        }
        assertEq(rewards.streakDay(1, alice), 3);

        vm.prank(alice);
        rewards.claimStreak(0);
        assertEq(mockToken.t6Balance(alice), 10);
    }

    function test_claimStreak_insufficientDays_reverts() public {
        rewards.setStreakMilestone(0, 3, 100, 10);
        vm.prank(token);
        rewards.onMint(alice, 0.001 ether, 1);

        vm.prank(alice);
        vm.expectRevert(bytes("Streak too short"));
        rewards.claimStreak(0);
    }

    function test_claimStreak_slotsExhausted_reverts() public {
        rewards.setStreakMilestone(0, 1, 1, 10);

        vm.prank(token);
        rewards.onMint(alice, 0.001 ether, 1);
        vm.prank(alice);
        rewards.claimStreak(0);

        vm.prank(token);
        rewards.onMint(bob, 0.001 ether, 1);
        vm.prank(bob);
        vm.expectRevert(bytes("Slots exhausted"));
        rewards.claimStreak(0);
    }

    // ── Referral ────────────────────────────────────────────────────────────

    function test_setReferrer() public {
        rewards.setReferralsActive(true);
        vm.prank(alice);
        rewards.setReferrer(bob);
        assertEq(rewards.referrerOf(alice), bob);
    }

    function test_setReferrer_selfReferral_reverts() public {
        rewards.setReferralsActive(true);
        vm.prank(alice);
        vm.expectRevert(bytes("Self-referral"));
        rewards.setReferrer(alice);
    }

    function test_setReferrer_duplicate_reverts() public {
        rewards.setReferralsActive(true);
        vm.prank(alice);
        rewards.setReferrer(bob);
        vm.prank(alice);
        vm.expectRevert(bytes("Already set"));
        rewards.setReferrer(carol);
    }

    function test_setReferrer_paused_reverts() public {
        vm.prank(alice);
        vm.expectRevert(bytes("Referrals paused"));
        rewards.setReferrer(bob);
    }

    function test_claimReferral() public {
        rewards.fund{value: 1 ether}();
        rewards.setReferralsActive(true);
        rewards.setReferralAmount(0.01 ether);

        vm.prank(alice);
        rewards.setReferrer(bob);

        for (uint256 i = 0; i < 50; i++) {
            vm.prank(token);
            rewards.recordTierDrop(alice, 7, 1);
            vm.prank(token);
            rewards.onMint(alice, 0.001 ether, 1);
        }

        assertTrue(rewards.snapshotAmount(alice) > 0);

        vm.prank(bob);
        rewards.claimReferral(alice);
        assertTrue(rewards.referralPaid(alice));
    }

    function test_claimReferral_softFreeze_works() public {
        rewards.fund{value: 1 ether}();
        rewards.setReferralsActive(true);
        rewards.setReferralAmount(0.01 ether);

        vm.prank(alice);
        rewards.setReferrer(bob);

        for (uint256 i = 0; i < 50; i++) {
            vm.prank(token);
            rewards.recordTierDrop(alice, 7, 1);
            vm.prank(token);
            rewards.onMint(alice, 0.001 ether, 1);
        }

        rewards.setReferralsActive(false);

        vm.prank(bob);
        rewards.claimReferral(alice);
        assertTrue(rewards.referralPaid(alice));
    }

    // ── Distributions ───────────────────────────────────────────────────────

    function test_distributeLottery() public {
        rewards.fund{value: 1 ether}();

        vm.prank(token);
        rewards.onMint(alice, 0.001 ether, 1);

        uint32 today = uint32(block.timestamp / 1 days);
        rewards.distributeLottery(today, alice, 0.05 ether);
        assertEq(alice.balance, 0.05 ether);
        assertEq(rewards.vaultBalance(), 0.95 ether);
    }

    function test_distributeLottery_nonEligible_reverts() public {
        rewards.fund{value: 1 ether}();
        uint32 today = uint32(block.timestamp / 1 days);
        vm.expectRevert(bytes("Winner not eligible"));
        rewards.distributeLottery(today, alice, 0.05 ether);
    }

    function test_distributeLottery_duplicateDay_reverts() public {
        rewards.fund{value: 1 ether}();
        vm.prank(token);
        rewards.onMint(alice, 0.001 ether, 1);
        uint32 today = uint32(block.timestamp / 1 days);
        rewards.distributeLottery(today, alice, 0.05 ether);
        vm.expectRevert(bytes("Already distributed"));
        rewards.distributeLottery(today, alice, 0.05 ether);
    }

    function test_distributeLeaderboard() public {
        rewards.fund{value: 1 ether}();
        rewards.setLeaderboardAmounts([uint256(0.05 ether), 0.03 ether, 0.01 ether]);

        vm.prank(token);
        rewards.onMint(alice, 0.001 ether, 1);
        vm.prank(token);
        rewards.onMint(bob, 0.001 ether, 1);
        vm.prank(token);
        rewards.onMint(carol, 0.001 ether, 1);

        uint32 today = uint32(block.timestamp / 1 days);
        rewards.distributeLeaderboard(today, [alice, bob, carol]);
        assertEq(alice.balance, 0.05 ether);
        assertEq(bob.balance, 0.03 ether);
        assertEq(carol.balance, 0.01 ether);
    }

    function test_distributeLeaderboard_nonEligible_reverts() public {
        rewards.fund{value: 1 ether}();
        rewards.setLeaderboardAmounts([uint256(0.05 ether), 0.03 ether, 0.01 ether]);
        uint32 today = uint32(block.timestamp / 1 days);
        vm.expectRevert(bytes("Winner not eligible"));
        rewards.distributeLeaderboard(today, [alice, bob, carol]);
    }

    // ── Season ──────────────────────────────────────────────────────────────

    function test_advanceSeason_resetsStreak() public {
        vm.prank(token);
        rewards.onMint(alice, 0.001 ether, 1);
        assertEq(rewards.streakDay(1, alice), 1);

        rewards.advanceSeason();
        assertEq(rewards.currentSeason(), 2);
        assertEq(rewards.streakDay(2, alice), 0);
    }

    function test_advanceSeason_preservesReferral() public {
        rewards.setReferralsActive(true);
        vm.prank(alice);
        rewards.setReferrer(bob);

        rewards.advanceSeason();
        assertEq(rewards.referrerOf(alice), bob);
    }

    // ── Vault invariant ─────────────────────────────────────────────────────

    function test_vault_invariant() public {
        rewards.fund{value: 1 ether}();
        rewards.setTierBounty(1, 7, 0.01 ether);

        vm.prank(token);
        rewards.recordTierDrop(alice, 7, 1);
        vm.prank(alice);
        rewards.claimBounty(1, 7);

        assertEq(rewards.vaultBalance(), 0.99 ether);
        assertEq(address(rewards).balance, 0.99 ether);
    }
}
