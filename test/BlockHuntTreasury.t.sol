// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/BlockHuntTreasury.sol";

contract BlockHuntTreasuryTest is Test {
    BlockHuntTreasury treasury;
    address owner = address(0xBEEF);
    address creator = address(0xC0DE);
    address token = address(0x7070);

    event CreatorFeeUpdated(uint256 oldBps, uint256 newBps);

    function setUp() public {
        vm.prank(owner);
        treasury = new BlockHuntTreasury(creator);
        vm.prank(owner);
        treasury.setTokenContract(token);
    }

    function test_InitialCreatorFeeIs2000Bps() public {
        assertEq(treasury.creatorFeeBps(), 2000);
    }

    function test_SetCreatorFeeBelowFloorReverts() public {
        vm.prank(owner);
        vm.expectRevert(bytes("Below minimum"));
        treasury.setCreatorFee(499);
    }

    function test_SetCreatorFeeEmitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit CreatorFeeUpdated(2000, 1500);
        treasury.setCreatorFee(1500);
    }

    function test_EmergencyWithdrawRemoved() public {
        (bool ok, ) = address(treasury).call(
            abi.encodeWithSignature("emergencyWithdraw()")
        );
        assertFalse(ok, "emergencyWithdraw should not exist");
    }

    function test_ReceiveMintFundsRoutes80PctToPool() public {
        vm.deal(token, 10 ether);
        vm.prank(token);
        treasury.receiveMintFunds{value: 10 ether}();
        // 20% creator fee => 2 ether to creator, 8 ether held in contract
        assertEq(address(treasury).balance, 8 ether);
        assertEq(creator.balance, 2 ether);
    }
}
