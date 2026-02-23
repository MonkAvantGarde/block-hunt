// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/BlockHuntToken.sol";
import "../src/BlockHuntTreasury.sol";
import "../src/BlockHuntMintWindow.sol";
import "../src/BlockHuntForge.sol";
import "../src/BlockHuntCountdown.sol";

contract BlockHuntTest is Test {

    BlockHuntToken    public token;
    BlockHuntTreasury public treasury;
    BlockHuntMintWindow public mintWindow;
    BlockHuntForge    public forge;
    BlockHuntCountdown public countdown;

    // Test wallets
    address public owner   = address(0x1);
    address public creator = address(0x2);
    address public alice   = address(0x3);
    address public bob     = address(0x4);

    uint256 public constant MINT_PRICE = 0.00025 ether;

    function setUp() public {
        vm.startPrank(owner);

        treasury   = new BlockHuntTreasury(creator);
        mintWindow = new BlockHuntMintWindow();
        countdown  = new BlockHuntCountdown();
        forge      = new BlockHuntForge();
        token      = new BlockHuntToken(
            "https://api.blockhunt.xyz/metadata/{id}.json",
            creator,
            500
        );

        token.setTreasuryContract(address(treasury));
        token.setMintWindowContract(address(mintWindow));
        token.setForgeContract(address(forge));
        treasury.setTokenContract(address(token));
        mintWindow.setTokenContract(address(token));
        forge.setTokenContract(address(token));
        countdown.setTokenContract(address(token));

        mintWindow.openWindow();

        vm.stopPrank();

        vm.deal(alice, 10 ether);
        vm.deal(bob,   10 ether);
    }

    // ── MINT TESTS ──────────────────────────────────────────────────────

    function test_MintSucceeds() public {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        uint256 total = 0;
        for (uint256 tier = 1; tier <= 7; tier++) {
            total += token.balanceOf(alice, tier);
        }
        assertEq(total, 10, "Alice should have 10 blocks");
    }

    function test_MintFailsWhenWindowClosed() public {
        vm.prank(owner);
        mintWindow.closeWindow();

        vm.prank(alice);
        vm.expectRevert("Window closed");
        token.mint{value: MINT_PRICE * 5}(5);
    }

    function test_MintFailsWithInsufficientPayment() public {
        vm.prank(alice);
        vm.expectRevert("Insufficient payment");
        token.mint{value: 0.0001 ether}(10);
    }

    function test_MintRefundsExcessPayment() public {
        uint256 balanceBefore = alice.balance;

        vm.prank(alice);
        token.mint{value: MINT_PRICE * 20}(10);

        uint256 spent = balanceBefore - alice.balance;
        assertEq(spent, MINT_PRICE * 10, "Should only charge for 10 blocks");
    }

    function test_TreasuryReceivesFunds() public {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 100}(100);

        uint256 expectedTreasury = (MINT_PRICE * 100 * 9500) / 10000;
        assertApproxEqAbs(
            treasury.treasuryBalance(),
            expectedTreasury,
            0.0001 ether,
            "Treasury should have ~95% of mint revenue"
        );
    }

    function test_CreatorReceivesFee() public {
        uint256 creatorBefore = creator.balance;

        vm.prank(alice);
        token.mint{value: MINT_PRICE * 100}(100);

        uint256 creatorEarned = creator.balance - creatorBefore;
        uint256 expectedFee = (MINT_PRICE * 100 * 500) / 10000;
        assertApproxEqAbs(creatorEarned, expectedFee, 0.0001 ether, "Creator should earn 5%");
    }

    // ── COMBINE TESTS ────────────────────────────────────────────────────

    function test_CombineSucceeds() public {
        _giveBlocks(alice, 7, 20);

        uint256 tier6Before = token.balanceOf(alice, 6);

        vm.prank(alice);
        token.combine(7);

        assertEq(token.balanceOf(alice, 7), 0,               "Should have burned all Tier-7");
        assertEq(token.balanceOf(alice, 6), tier6Before + 1, "Should have gained 1 Tier-6");
    }

    function test_CombineFailsInsufficientBlocks() public {
        _giveBlocks(alice, 7, 10);

        vm.prank(alice);
        vm.expectRevert("Insufficient blocks");
        token.combine(7);
    }

    function test_CombineManySucceeds() public {
        _giveBlocks(alice, 7, 20);
        _giveBlocks(alice, 6, 39); // 39 + 1 from tier7 combine = 40, need 20 for tier5

        uint256[] memory tiers = new uint256[](2);
        tiers[0] = 7;
        tiers[1] = 6;

        vm.prank(alice);
        token.combineMany(tiers);

        assertEq(token.balanceOf(alice, 7), 0,  "Tier-7 should be burned");
        assertEq(token.balanceOf(alice, 6), 20, "Tier-6 net: 39 + 1 - 20 = 20 remaining");
        assertEq(token.balanceOf(alice, 5), 1,  "Should have 1 Tier-5");
    }

    // ── FORGE TESTS ──────────────────────────────────────────────────────

    function test_ForgeRequestSucceeds() public {
        _giveBlocks(alice, 7, 99);

        vm.prevrandao(bytes32(uint256(1)));
        vm.prank(alice);
        forge.forge(7, 99);

        assertEq(token.balanceOf(alice, 7), 0, "Tier-7 blocks should be burned");
    }

    function test_ForgeFailsInvalidTier() public {
        vm.prank(alice);
        vm.expectRevert("Invalid tier");
        forge.forge(1, 50);
    }

    function test_ForgeFailsInvalidBurnCount() public {
        _giveBlocks(alice, 7, 50);

        vm.prank(alice);
        vm.expectRevert("Burn count must be 10-99");
        forge.forge(7, 5);
    }

    function test_ForgeFailsInsufficientBlocks() public {
        _giveBlocks(alice, 7, 5);

        vm.prank(alice);
        vm.expectRevert("Insufficient blocks");
        forge.forge(7, 10);
    }

    // ── TREASURY TESTS ────────────────────────────────────────────────────

    function test_TreasuryClaimPayout() public {
        vm.deal(address(treasury), 10 ether);

        uint256 aliceBalanceBefore = alice.balance;

        vm.prank(address(token));
        treasury.claimPayout(alice);

        assertEq(alice.balance, aliceBalanceBefore + 10 ether, "Alice should receive full treasury");
        assertEq(treasury.treasuryBalance(), 0, "Treasury should be empty");
    }

    function test_TreasurySacrificePayout() public {
        vm.deal(address(treasury), 10 ether);

        uint256 aliceBalanceBefore = alice.balance;

        vm.prank(address(token));
        treasury.sacrificePayout(alice);

        assertEq(alice.balance, aliceBalanceBefore + 5 ether, "Alice should receive 50%");
        assertEq(treasury.treasuryBalance(), 5 ether, "50% should remain for Season 2");
        assertEq(treasury.nextSeasonSeed(), 5 ether,  "Seed should be set");
    }

    // ── COUNTDOWN TESTS ───────────────────────────────────────────────────

    function test_CountdownTriggersWhenAllTiersHeld() public {
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        assertEq(token.countdownActive(), true,  "Countdown should be active");
        assertEq(token.countdownHolder(), alice, "Alice should be countdown holder");
    }

    function test_CountdownDoesNotTriggerWithMissingTier() public {
        for (uint256 tier = 2; tier <= 6; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        assertEq(token.countdownActive(), false, "Countdown should not be active");
    }

    function test_MintBlockedDuringCountdown() public {
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }
        assertEq(token.countdownActive(), true);

        vm.prank(bob);
        vm.expectRevert("Countdown is active");
        token.mint{value: MINT_PRICE * 5}(5);
    }

    // ── ENDGAME TESTS ────────────────────────────────────────────────────

    function test_ClaimTreasury() public {
        vm.deal(address(treasury), 10 ether);

        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }
        assertEq(token.countdownActive(), true);

        uint256 aliceBalanceBefore = alice.balance;

        vm.prank(alice);
        token.claimTreasury();

        assertGt(alice.balance, aliceBalanceBefore, "Alice should have received ETH");
        assertEq(treasury.treasuryBalance(), 0, "Treasury should be empty");
    }

    function test_SacrificeMintsOrigin() public {
        vm.deal(address(treasury), 10 ether);

        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        vm.prank(alice);
        token.sacrifice();

        assertEq(token.balanceOf(alice, 1), 1, "Alice should hold The Origin");

        for (uint256 tier = 2; tier <= 7; tier++) {
            assertEq(token.balanceOf(alice, tier), 0, "All tiers should be burned");
        }
    }

    function test_OnlyCountdownHolderCanClaim() public {
        vm.deal(address(treasury), 10 ether);

        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        vm.prank(bob);
        vm.expectRevert("Not the countdown holder");
        token.claimTreasury();
    }

    // ── WINDOW TESTS ────────────────────────────────────────────────────

    function test_WindowOpensAndCloses() public {
        assertEq(mintWindow.isWindowOpen(), true, "Window should be open");

        vm.prank(owner);
        mintWindow.closeWindow();

        assertEq(mintWindow.isWindowOpen(), false, "Window should be closed");
    }

    function test_RolloverAccumulates() public {
        vm.prank(owner);
        mintWindow.closeWindow();

        vm.prank(owner);
        mintWindow.openWindow();

        (, , , , uint256 allocated, , , ) = mintWindow.getWindowInfo();
        assertEq(allocated, 100_000, "Should have 2x base cap due to rollover");
    }

    // ── HELPER ───────────────────────────────────────────────────────────

    function _giveBlocks(address player, uint256 tier, uint256 amount) internal {
        token.mintForTest(player, tier, amount);
    }
}
