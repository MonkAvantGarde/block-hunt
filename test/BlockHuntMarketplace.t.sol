// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/BlockHuntMarketplace.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

/// @dev Minimal ERC-1155 for testing
contract MockToken is ERC1155 {
    constructor() ERC1155("") {}
    function mint(address to, uint256 id, uint256 amount) external {
        _mint(to, id, amount, "");
    }
}

contract BlockHuntMarketplaceTest is Test {
    BlockHuntMarketplace marketplace;
    MockToken token;

    address payable seller = payable(makeAddr("seller"));
    address payable buyer  = payable(makeAddr("buyer"));
    address payable fee    = payable(makeAddr("fee"));

    function setUp() public {
        token = new MockToken();
        marketplace = new BlockHuntMarketplace(address(token), fee);

        // Give seller 100 T7 blocks
        token.mint(seller, 7, 100);

        // Give seller 5 T1 (Origin) blocks
        token.mint(seller, 1, 5);

        // Seller approves marketplace
        vm.prank(seller);
        token.setApprovalForAll(address(marketplace), true);

        // Fund buyer
        vm.deal(buyer, 10 ether);
    }

    // ── Create listing ────────────────────────────────────────────────

    function test_createListing() public {
        vm.prank(seller);
        uint256 id = marketplace.createListing(7, 50, 0.001 ether, 7 days);
        assertEq(id, 1);

        (address s, uint256 tier, uint256 qty, uint256 price, , uint256 exp, bool active) = marketplace.getListing(1);
        assertEq(s, seller);
        assertEq(tier, 7);
        assertEq(qty, 50);
        assertEq(price, 0.001 ether);
        assertTrue(active);
        assertEq(exp, block.timestamp + 7 days);
    }

    function test_createListing_T1Origin() public {
        vm.prank(seller);
        uint256 id = marketplace.createListing(1, 2, 0.1 ether, 7 days);
        assertEq(id, 1);
        (, uint256 tier, uint256 qty, , , , ) = marketplace.getListing(1);
        assertEq(tier, 1);
        assertEq(qty, 2);
    }

    function test_createListing_defaultDuration() public {
        vm.prank(seller);
        marketplace.createListing(7, 10, 0.001 ether, 0); // 0 = default
        (, , , , , uint256 exp, ) = marketplace.getListing(1);
        assertEq(exp, block.timestamp + 7 days);
    }

    function test_revert_invalidTier() public {
        vm.prank(seller);
        vm.expectRevert("Invalid tier");
        marketplace.createListing(8, 10, 0.001 ether, 7 days);
    }

    function test_revert_invalidTierZero() public {
        vm.prank(seller);
        vm.expectRevert("Invalid tier");
        marketplace.createListing(0, 10, 0.001 ether, 7 days);
    }

    function test_revert_belowMinPrice() public {
        vm.prank(seller);
        vm.expectRevert("Below min price");
        marketplace.createListing(7, 10, 0.000001 ether, 7 days);
    }

    function test_revert_insufficientBalance() public {
        vm.prank(seller);
        vm.expectRevert("Insufficient balance");
        marketplace.createListing(7, 999, 0.001 ether, 7 days);
    }

    function test_revert_notApproved() public {
        // Revoke approval
        vm.prank(seller);
        token.setApprovalForAll(address(marketplace), false);

        vm.prank(seller);
        vm.expectRevert("Marketplace not approved");
        marketplace.createListing(7, 10, 0.001 ether, 7 days);
    }

    function test_revert_durationTooShort() public {
        vm.prank(seller);
        vm.expectRevert("Duration too short");
        marketplace.createListing(7, 10, 0.001 ether, 30 minutes);
    }

    function test_revert_durationTooLong() public {
        vm.prank(seller);
        vm.expectRevert("Duration too long");
        marketplace.createListing(7, 10, 0.001 ether, 31 days);
    }

    // ── Buy full listing ──────────────────────────────────────────────

    function test_buyFull() public {
        vm.prank(seller);
        marketplace.createListing(7, 50, 0.001 ether, 7 days);

        uint256 totalPrice = 50 * 0.001 ether; // 0.05 ETH
        uint256 expectedFee = totalPrice / 10;  // 10% = 0.005 ETH
        uint256 expectedSeller = totalPrice - expectedFee;

        uint256 sellerBefore = seller.balance;
        uint256 feeBefore = fee.balance;

        vm.prank(buyer);
        marketplace.buyListing{value: totalPrice}(1, 50);

        // Tokens transferred
        assertEq(token.balanceOf(buyer, 7), 50);
        assertEq(token.balanceOf(seller, 7), 50); // had 100, sold 50

        // ETH distributed
        assertEq(seller.balance - sellerBefore, expectedSeller);
        assertEq(fee.balance - feeBefore, expectedFee);

        // Listing deactivated
        (, , , , , , bool active) = marketplace.getListing(1);
        assertFalse(active);
    }

    // ── Buy partial ───────────────────────────────────────────────────

    function test_buyPartial() public {
        vm.prank(seller);
        marketplace.createListing(7, 50, 0.001 ether, 7 days);

        vm.prank(buyer);
        marketplace.buyListing{value: 0.01 ether}(1, 10);

        // 10 transferred, 40 remaining
        assertEq(token.balanceOf(buyer, 7), 10);
        (, , uint256 qty, , , , bool active) = marketplace.getListing(1);
        assertEq(qty, 40);
        assertTrue(active);
    }

    // ── Cancel listing ────────────────────────────────────────────────

    function test_cancel() public {
        vm.prank(seller);
        marketplace.createListing(7, 50, 0.001 ether, 7 days);

        vm.prank(seller);
        marketplace.cancelListing(1);

        (, , , , , , bool active) = marketplace.getListing(1);
        assertFalse(active);
    }

    function test_revert_cancelNotSeller() public {
        vm.prank(seller);
        marketplace.createListing(7, 50, 0.001 ether, 7 days);

        vm.prank(buyer);
        vm.expectRevert("Not seller");
        marketplace.cancelListing(1);
    }

    // ── Expired listing ───────────────────────────────────────────────

    function test_revert_buyExpired() public {
        vm.prank(seller);
        marketplace.createListing(7, 50, 0.001 ether, 1 hours);

        vm.warp(block.timestamp + 2 hours);

        vm.prank(buyer);
        vm.expectRevert("Listing expired");
        marketplace.buyListing{value: 0.05 ether}(1, 50);
    }

    // ── Insufficient ETH ──────────────────────────────────────────────

    function test_revert_insufficientETH() public {
        vm.prank(seller);
        marketplace.createListing(7, 50, 0.001 ether, 7 days);

        vm.prank(buyer);
        vm.expectRevert("Insufficient ETH");
        marketplace.buyListing{value: 0.01 ether}(1, 50); // needs 0.05
    }

    // ── Excess ETH refunded ───────────────────────────────────────────

    function test_excessRefunded() public {
        vm.prank(seller);
        marketplace.createListing(7, 10, 0.001 ether, 7 days);

        uint256 before = buyer.balance;
        vm.prank(buyer);
        marketplace.buyListing{value: 1 ether}(1, 10); // sends 1 ETH, needs 0.01

        // Buyer spent only 0.01 ETH
        assertEq(before - buyer.balance, 0.01 ether);
    }

    // ── getActiveListings ─────────────────────────────────────────────

    function test_getActiveListings() public {
        vm.startPrank(seller);
        marketplace.createListing(7, 10, 0.001 ether, 7 days);
        token.mint(seller, 6, 10);
        marketplace.createListing(6, 5, 0.01 ether, 7 days);
        marketplace.cancelListing(1); // cancel first
        vm.stopPrank();

        (uint256[] memory ids, , uint256[] memory tiers, , , ) = marketplace.getActiveListings(1, 10);
        assertEq(ids.length, 1);
        assertEq(ids[0], 2);
        assertEq(tiers[0], 6);
    }

    // ── Fee config ────────────────────────────────────────────────────

    function test_setProtocolFee() public {
        marketplace.setProtocolFeeBps(500);
        assertEq(marketplace.protocolFeeBps(), 500);
    }

    function test_revert_feeExceedsMax() public {
        vm.expectRevert("Max 20%");
        marketplace.setProtocolFeeBps(2001);
    }
}
