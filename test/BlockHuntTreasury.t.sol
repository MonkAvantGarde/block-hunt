// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/BlockHuntTreasury.sol";
import "../src/BlockHuntEscrow.sol";

contract BlockHuntTreasuryTest is Test {
    BlockHuntTreasury treasury;
    BlockHuntEscrow escrow;
    address owner = address(0xBEEF);
    address creator = address(0xC0DE);
    address token = address(0x7070);
    address keeper = address(0xBBBB);

    event CreatorFeeUpdated(uint256 oldBps, uint256 newBps);

    function setUp() public {
        vm.startPrank(owner);
        treasury = new BlockHuntTreasury(creator);
        treasury.setTokenContract(token);
        escrow = new BlockHuntEscrow(keeper);
        escrow.setTokenContract(token);
        treasury.setEscrowContract(address(escrow));
        vm.stopPrank();
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
            abi.encodeWithSignature("emergencyWithdraw(address,uint256)", address(0), 0)
        );
        assertFalse(ok, "emergencyWithdraw(address,uint256) should not exist");
    }

    function test_ReceiveMintFundsRoutes80PctToPool() public {
        vm.deal(token, 10 ether);
        vm.prank(token);
        treasury.receiveMintFunds{value: 10 ether}();
        // 20% creator fee => 2 ether to creator, 8 ether tracked in totalDeposited
        assertEq(treasury.totalDeposited(), 8 ether);
        assertEq(creator.balance, 2 ether);
    }

    // ── A2: explicit amount tests ──────────────────────────────────────────

    function test_SacrificePayoutReturnsAmount() public {
        vm.deal(token, 10 ether);
        vm.prank(token);
        treasury.receiveMintFunds{value: 10 ether}();

        uint256 treasuryBal = address(treasury).balance;
        vm.prank(token);
        uint256 returned = treasury.sacrificePayout(address(0xAAAA));
        assertEq(returned, treasuryBal, "sacrificePayout must return exact amount sent");
    }

    function test_EscrowUsesExplicitAmountNotBalance() public {
        vm.deal(token, 10 ether);
        vm.prank(token);
        treasury.receiveMintFunds{value: 10 ether}();

        // Send stale ETH directly to escrow (simulates leftover from prior season)
        vm.deal(address(escrow), 5 ether);

        uint256 treasuryBal = address(treasury).balance;
        vm.prank(token);
        treasury.sacrificePayout(address(0xAAAA));

        // Now escrow has treasuryBal + 5 ether stale
        // initiateSacrifice should only split on treasuryBal, not total balance
        vm.prank(token);
        escrow.initiateSacrifice(address(0xAAAA), treasuryBal);

        uint256 winnerShare = treasuryBal / 2;
        uint256 seedShare = treasuryBal / 10;
        uint256 communityShare = treasuryBal - winnerShare - seedShare;

        assertEq(escrow.pendingWithdrawal(address(0xAAAA)), winnerShare);
        assertEq(escrow.communityPool(), communityShare);
        assertEq(escrow.season2Seed(), seedShare);
    }
}
