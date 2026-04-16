// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/BlockHuntToken.sol";

contract BlockHuntTokenTest is Test {
    BlockHuntToken token;
    address owner = address(0xBEEF);
    address vrfCoordinator = address(0xFF);

    function setUp() public {
        vm.prank(owner);
        token = new BlockHuntToken("https://example.com/{id}.json", owner, 500, vrfCoordinator);
    }

    // ── D1: VRF gas params ──────────────────────────────────────────────

    function test_VrfGasParamsDefault() public view {
        assertEq(token.vrfGasPerBlock(), 28_000);
        assertEq(token.vrfGasMax(), 15_000_000);
    }

    function test_SetVrfGasParamsRejectsLowGasPerBlock() public {
        vm.prank(owner);
        vm.expectRevert(bytes("gasPerBlock out of range"));
        token.setVrfGasParams(0, 15_000_000);
    }

    function test_SetVrfGasParamsRejectsHighGasMax() public {
        vm.prank(owner);
        vm.expectRevert(bytes("gasMax out of range"));
        token.setVrfGasParams(28_000, 31_000_000);
    }

    function test_SetVrfGasParamsSuccess() public {
        vm.prank(owner);
        token.setVrfGasParams(50_000, 20_000_000);
        assertEq(token.vrfGasPerBlock(), 50_000);
        assertEq(token.vrfGasMax(), 20_000_000);
    }

    // ── D3: Configurable mint request TTL ───────────────────────────────

    function test_DefaultMintRequestTTL() public view {
        assertEq(token.mintRequestTTL(), 10 minutes);
    }

    function test_SetMintRequestTTLRejectsTooLow() public {
        vm.prank(owner);
        vm.expectRevert(bytes("TTL out of range"));
        token.setMintRequestTTL(30 seconds);
    }

    function test_SetMintRequestTTLRejectsTooHigh() public {
        vm.prank(owner);
        vm.expectRevert(bytes("TTL out of range"));
        token.setMintRequestTTL(2 hours);
    }

    function test_SetMintRequestTTLSuccess() public {
        vm.prank(owner);
        token.setMintRequestTTL(30 minutes);
        assertEq(token.mintRequestTTL(), 30 minutes);
    }

    // ── D6: combineMany cap ─────────────────────────────────────────────

    function test_CombineManyRejectsEmpty() public {
        uint256[] memory empty = new uint256[](0);
        vm.expectRevert(bytes("Invalid length"));
        token.combineMany(empty);
    }

    function test_CombineManyRejectsOver50() public {
        uint256[] memory oversize = new uint256[](51);
        vm.expectRevert(bytes("Invalid length"));
        token.combineMany(oversize);
    }

    // ── D10: rewardMint ─────────────────────────────────────────────────

    function test_RewardMintOnlyFromRewardsContract() public {
        vm.prank(address(0xCAFE));
        vm.expectRevert(bytes("Only rewards"));
        token.rewardMint(address(0xA11CE), 10);
    }

    function test_RewardMintCreatesT6Blocks() public {
        address rewards = address(0xBBBB);
        vm.prank(owner);
        token.setRewardsContract(rewards);

        vm.prank(rewards);
        token.rewardMint(address(0xA11CE), 10);
        assertEq(token.balanceOf(address(0xA11CE), 6), 10);
    }

    // ── D4: Lazy reveal threshold ───────────────────────────────────────

    function test_LazyRevealDisabledByDefault() public view {
        assertEq(token.lazyRevealThreshold(), 0);
    }

    function test_SetLazyRevealThreshold() public {
        vm.prank(owner);
        token.setLazyRevealThreshold(200);
        assertEq(token.lazyRevealThreshold(), 200);
    }

    function test_SetLazyRevealThresholdRejectsLow() public {
        vm.prank(owner);
        vm.expectRevert(bytes("Threshold must be 0 or >=50"));
        token.setLazyRevealThreshold(10);
    }

    function test_SetLazyRevealThresholdAllowsZero() public {
        vm.prank(owner);
        token.setLazyRevealThreshold(200);
        vm.prank(owner);
        token.setLazyRevealThreshold(0);
        assertEq(token.lazyRevealThreshold(), 0);
    }

    // ── VRF min quantity threshold ──────────────────────────────────────

    function test_VrfMinQuantityDefaultZero() public view {
        assertEq(token.vrfMinQuantity(), 0);
    }

    function test_SetVrfMinQuantity() public {
        vm.prank(owner);
        token.setVrfMinQuantity(20);
        assertEq(token.vrfMinQuantity(), 20);
    }

    function test_SetVrfMinQuantityRejectsOver500() public {
        vm.prank(owner);
        vm.expectRevert(bytes("Exceeds max mint"));
        token.setVrfMinQuantity(501);
    }
}
