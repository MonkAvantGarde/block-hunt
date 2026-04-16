// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/BlockHuntCountdown.sol";

contract MockTokenForCountdown {
    mapping(address => mapping(uint256 => uint256)) public bals;

    function setBal(address who, uint256 tier, uint256 n) external {
        bals[who][tier] = n;
    }

    function hasAllTiers(address a) external view returns (bool) {
        for (uint256 t = 2; t <= 7; t++) {
            if (bals[a][t] == 0) return false;
        }
        return true;
    }

    function balanceOf(address a, uint256 t) external view returns (uint256) {
        return bals[a][t];
    }

    function balancesOf(address a) external view returns (uint256[8] memory out) {
        for (uint256 t = 0; t < 8; t++) out[t] = bals[a][t];
    }

    function calculateScore(address) external pure returns (uint256) { return 0; }
    function resetExpiredHolder() external {}
    function updateCountdownHolder(address) external {}
}

contract BlockHuntCountdownTest is Test {
    BlockHuntCountdown countdown;
    MockTokenForCountdown mockToken;
    address owner = address(0xBEEF);
    address alice = address(0xA11CE);
    address bob   = address(0xB0B);

    function setUp() public {
        mockToken = new MockTokenForCountdown();
        vm.prank(owner);
        countdown = new BlockHuntCountdown();
        vm.prank(owner);
        countdown.setTokenContract(address(mockToken));
    }

    function _fullSet(address who) internal {
        for (uint256 t = 2; t <= 7; t++) mockToken.setBal(who, t, 1);
    }

    function _fullSetWithScore(address who, uint256 extra7) internal {
        _fullSet(who);
        mockToken.setBal(who, 7, 1 + extra7);
    }

    function test_StartCountdownSetsHolderSince() public {
        _fullSet(alice);
        vm.prank(address(mockToken));
        countdown.startCountdown(alice);
        assertEq(countdown.holderSince(), block.timestamp);
        assertGt(countdown.holderSince(), 0);
    }

    function test_HolderSinceZeroBeforeCountdown() public view {
        assertEq(countdown.currentHolder(), address(0));
        assertEq(countdown.holderSince(), 0);
    }

    function test_CumulativeTimeBanksOnChallenge() public {
        _fullSetWithScore(alice, 0);
        vm.prank(address(mockToken));
        countdown.startCountdown(alice);

        vm.warp(block.timestamp + 2 days);

        // Bob needs higher score to challenge — give him more T7 blocks
        _fullSetWithScore(bob, 100);

        // Warp past safe period
        vm.prank(owner);
        countdown.setSafePeriod(0);

        vm.prank(bob);
        countdown.challengeCountdown();

        assertEq(countdown.cumulativeDefenseTime(alice), 2 days);
        assertEq(countdown.currentHolder(), bob);
        assertEq(countdown.holderSince(), block.timestamp);
    }

    function test_CannotClaimWithoutEnoughDefenseTime() public {
        _fullSet(alice);
        vm.prank(address(mockToken));
        countdown.startCountdown(alice);
        assertFalse(countdown.canClaim(alice));
    }

    function test_CanClaimAfterFullDefense() public {
        _fullSet(alice);
        vm.prank(address(mockToken));
        countdown.startCountdown(alice);

        vm.warp(block.timestamp + 7 days);
        assertTrue(countdown.canClaim(alice));
    }

    function test_CanClaimWithCumulativeDefense() public {
        _fullSetWithScore(alice, 0);
        vm.prank(address(mockToken));
        countdown.startCountdown(alice);

        vm.warp(block.timestamp + 3 days);

        // Bob takes over
        _fullSetWithScore(bob, 100);
        vm.prank(owner);
        countdown.setSafePeriod(0);
        vm.prank(bob);
        countdown.challengeCountdown();

        // Alice has 3 days banked
        assertEq(countdown.cumulativeDefenseTime(alice), 3 days);
        assertFalse(countdown.canClaim(alice));

        vm.warp(block.timestamp + 2 days);

        // Alice takes back (needs higher score now)
        mockToken.setBal(alice, 7, 200);
        vm.prank(alice);
        countdown.challengeCountdown();

        // Bob has 2 days banked
        assertEq(countdown.cumulativeDefenseTime(bob), 2 days);

        // Alice needs 4 more days (has 3 banked)
        vm.warp(block.timestamp + 4 days);
        assertTrue(countdown.canClaim(alice));
    }

    function test_HolderSinceResetsOnCountdownReset() public {
        _fullSet(alice);
        vm.prank(address(mockToken));
        countdown.startCountdown(alice);
        assertGt(countdown.holderSince(), 0);

        vm.prank(address(mockToken));
        countdown.syncReset();
        assertEq(countdown.holderSince(), 0);
        assertEq(countdown.currentHolder(), address(0));
    }
}
