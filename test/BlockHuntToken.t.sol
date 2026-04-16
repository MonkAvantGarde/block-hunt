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
}
