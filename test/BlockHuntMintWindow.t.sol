// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/BlockHuntMintWindow.sol";

contract BlockHuntMintWindowTest is Test {
    BlockHuntMintWindow window;
    address owner = address(0xBEEF);
    address token = address(0x7070);
    address alice = address(0xA11CE);

    function setUp() public {
        vm.prank(owner);
        window = new BlockHuntMintWindow();
        vm.prank(owner);
        window.setTokenContract(token);
    }

    function test_CycleResetsAfterCooldownDurationOfInactivity() public {
        vm.prank(token);
        window.recordMint(alice, 400);

        (bool canMint, uint256 minted, , , , , , ) = window.playerMintInfo(alice);
        assertTrue(canMint);
        assertEq(minted, 400);

        vm.warp(block.timestamp + 3 hours + 1);

        vm.prank(token);
        window.recordMint(alice, 1);

        (canMint, minted, , , , , , ) = window.playerMintInfo(alice);
        assertTrue(canMint);
        assertEq(minted, 1, "Cycle should auto-reset after inactivity");
    }

    function test_CycleDoesNotResetBeforeCooldownExpires() public {
        vm.prank(token);
        window.recordMint(alice, 400);

        vm.warp(block.timestamp + 2 hours);

        vm.prank(token);
        window.recordMint(alice, 50);

        (bool canMint, uint256 minted, , , , , , ) = window.playerMintInfo(alice);
        assertTrue(canMint);
        assertEq(minted, 450, "Cycle should NOT reset before cooldown duration");
    }

    function test_SetCooldownDurationBoundsEnforced() public {
        vm.prank(owner);
        vm.expectRevert(bytes("Duration out of range"));
        window.setCooldownDuration(30 seconds);

        vm.prank(owner);
        vm.expectRevert(bytes("Duration out of range"));
        window.setCooldownDuration(25 hours);

        vm.prank(owner);
        window.setCooldownDuration(1 hours);
        assertEq(window.cooldownDuration(), 1 hours);
    }

    function test_SetPerCycleCapBoundsEnforced() public {
        vm.prank(owner);
        vm.expectRevert(bytes("Cap out of range"));
        window.setPerCycleCap(0);

        vm.prank(owner);
        vm.expectRevert(bytes("Cap out of range"));
        window.setPerCycleCap(10_001);

        vm.prank(owner);
        window.setPerCycleCap(100);
        assertEq(window.perCycleCap(), 100);
    }

    function test_SetDailyCapBoundsEnforced() public {
        vm.prank(owner);
        vm.expectRevert(bytes("Cap out of range"));
        window.setDailyCap(0);

        vm.prank(owner);
        vm.expectRevert(bytes("Cap out of range"));
        window.setDailyCap(1_000_001);

        vm.prank(owner);
        window.setDailyCap(10_000);
        assertEq(window.dailyCap(), 10_000);
    }

    function test_SetDailyPeriodBoundsEnforced() public {
        vm.prank(owner);
        vm.expectRevert(bytes("Duration out of range"));
        window.setDailyPeriod(30 minutes);

        vm.prank(owner);
        vm.expectRevert(bytes("Duration out of range"));
        window.setDailyPeriod(8 days);

        vm.prank(owner);
        window.setDailyPeriod(12 hours);
        assertEq(window.dailyPeriod(), 12 hours);
    }
}
