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
}
