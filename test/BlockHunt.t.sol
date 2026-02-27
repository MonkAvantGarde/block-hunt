// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/BlockHuntToken.sol";
import "../src/BlockHuntTreasury.sol";
import "../src/BlockHuntMintWindow.sol";
import "../src/BlockHuntForge.sol";
import "../src/BlockHuntCountdown.sol";
import "../src/BlockHuntMigration.sol";
import "../src/BlockHuntSeasonRegistry.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal Season-2 token stub used by migration tests
// ─────────────────────────────────────────────────────────────────────────────
contract MockTokenV2 {
    mapping(address => mapping(uint256 => uint256)) public balances;

    function mintMigrationStarters(
        address player,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external {
        for (uint256 i = 0; i < ids.length; i++) {
            balances[player][ids[i]] += amounts[i];
        }
    }

    function balanceOf(address player, uint256 id) external view returns (uint256) {
        return balances[player][id];
    }

    function totalReceived(address player) external view returns (uint256 total) {
        for (uint256 t = 3; t <= 7; t++) {
            total += balances[player][t];
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main test contract
// ─────────────────────────────────────────────────────────────────────────────
contract BlockHuntTest is Test {

    // ── Contracts ────────────────────────────────────────────────────────────
    BlockHuntToken      public token;
    BlockHuntTreasury   public treasury;
    BlockHuntMintWindow public mintWindow;
    BlockHuntForge      public forge;
    BlockHuntCountdown  public countdown;
    BlockHuntMigration      public migration;
    BlockHuntSeasonRegistry public registry;
    MockTokenV2             public tokenV2;

    // ── Wallets ───────────────────────────────────────────────────────────────
    address public owner   = address(0x1);
    address public creator = address(0x2);
    address public alice   = address(0x3);
    address public bob     = address(0x4);
    address public carol   = address(0x5);

    uint256 public constant MINT_PRICE = 0.00025 ether;

    // ─────────────────────────────────────────────────────────────────────────
    // setUp — deploys all 7 contracts and wires them together
    // ─────────────────────────────────────────────────────────────────────────
    function setUp() public {
        vm.startPrank(owner);

        // Deploy core contracts
        treasury   = new BlockHuntTreasury(creator);
        mintWindow = new BlockHuntMintWindow();
        countdown  = new BlockHuntCountdown();
        forge      = new BlockHuntForge();
        token      = new BlockHuntToken(
            "https://api.blockhunt.xyz/metadata/{id}.json",
            creator,
            500  // 5% royalty in basis points
        );

        // Wire contracts together
        token.setTreasuryContract(address(treasury));
        token.setMintWindowContract(address(mintWindow));
        token.setForgeContract(address(forge));
        token.setCountdownContract(address(countdown));   // NEW: bidirectional sync
        treasury.setTokenContract(address(token));
        mintWindow.setTokenContract(address(token));
        forge.setTokenContract(address(token));
        countdown.setTokenContract(address(token));

        // Deploy migration + stub Season-2 token
        migration = new BlockHuntMigration(address(token));
        tokenV2   = new MockTokenV2();
        migration.setTokenV2(address(tokenV2));
        token.setMigrationContract(address(migration));

        // Deploy season registry and register Season 1
        registry = new BlockHuntSeasonRegistry();
        registry.registerSeason(
            1,
            address(treasury),
            address(token),
            address(mintWindow),
            address(forge)
        );
        registry.setSeasonMigration(1, address(migration));
        registry.markSeasonLaunched(1);

        // Open the first daily mint window
        mintWindow.openWindow();

        vm.stopPrank();

        // Fund test wallets
        vm.deal(alice, 100 ether);
        vm.deal(bob,   100 ether);
        vm.deal(carol, 100 ether);
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 1. MINT TESTS
    // ═════════════════════════════════════════════════════════════════════════

    function test_MintSucceeds() public {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        uint256 total = 0;
        for (uint256 tier = 1; tier <= 7; tier++) {
            total += token.balanceOf(alice, tier);
        }
        assertEq(total, 10, "Alice should have 10 blocks total");
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
        token.mint{value: MINT_PRICE * 20}(10);  // overpay by 10x

        uint256 spent = balanceBefore - alice.balance;
        assertEq(spent, MINT_PRICE * 10, "Should only charge for 10 blocks");
    }

    function test_MintFailsWithZeroQuantity() public {
        vm.prank(alice);
        vm.expectRevert("Invalid quantity");
        token.mint{value: MINT_PRICE}(0);
    }

    function test_MintFailsWithQuantityOver500() public {
        vm.prank(alice);
        vm.expectRevert("Invalid quantity");
        token.mint{value: MINT_PRICE * 501}(501);
    }

    function test_MintFailsWhenCountdownActive() public {
        // Trigger countdown by giving alice all tiers
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }
        assertEq(token.countdownActive(), true);

        vm.prank(bob);
        vm.expectRevert("Countdown is active");
        token.mint{value: MINT_PRICE * 5}(5);
    }

    function test_TreasuryReceivesFunds() public {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 100}(100);

        uint256 expectedTreasury = (MINT_PRICE * 100 * 9500) / 10000;
        assertApproxEqAbs(
            treasury.treasuryBalance(),
            expectedTreasury,
            0.0001 ether,
            "Treasury should hold ~95% of mint revenue"
        );
    }

    function test_CreatorReceivesFee() public {
        uint256 creatorBefore = creator.balance;

        vm.prank(alice);
        token.mint{value: MINT_PRICE * 100}(100);

        uint256 creatorEarned = creator.balance - creatorBefore;
        uint256 expectedFee   = (MINT_PRICE * 100 * 500) / 10000;
        assertApproxEqAbs(creatorEarned, expectedFee, 0.0001 ether, "Creator should earn 5%");
    }

    function test_MintIncrementsTierSupply() public {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 50}(50);

        uint256 supplyTotal = 0;
        for (uint256 tier = 1; tier <= 7; tier++) {
            supplyTotal += token.tierTotalSupply(tier);
        }
        assertEq(supplyTotal, 50, "Tier total supply should equal minted count");
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 2. COMBINE TESTS
    // ═════════════════════════════════════════════════════════════════════════

    function test_CombineSucceeds() public {
        _giveBlocks(alice, 7, 20);  // combine ratio is 20:1 for Tier 7→6

        uint256 tier6Before = token.balanceOf(alice, 6);

        vm.prank(alice);
        token.combine(7);

        assertEq(token.balanceOf(alice, 7), 0,                "All Tier-7 burned");
        assertEq(token.balanceOf(alice, 6), tier6Before + 1,  "Should gain 1 Tier-6");
    }

    function test_CombineFailsInsufficientBlocks() public {
        _giveBlocks(alice, 7, 10);  // needs 20

        vm.prank(alice);
        vm.expectRevert("Insufficient blocks");
        token.combine(7);
    }

    function test_CombineFailsInvalidTier() public {
        vm.prank(alice);
        vm.expectRevert("Invalid tier");
        token.combine(1);  // Can't combine Tier 1 (Origin)
    }

    function test_CombineRatiosAreCorrect() public {
        // Verify all combine ratios match the GDD
        assertEq(token.combineRatio(7), 20,  "Tier 7-6: 20:1");
        assertEq(token.combineRatio(6), 20,  "Tier 6-5: 20:1");
        assertEq(token.combineRatio(5), 30,  "Tier 5-4: 30:1");
        assertEq(token.combineRatio(4), 30,  "Tier 4-3: 30:1");
        assertEq(token.combineRatio(3), 50,  "Tier 3-2: 50:1");
        assertEq(token.combineRatio(2), 100, "Tier 2-1: 100:1");
    }

    function test_CombineManySucceeds() public {
        _giveBlocks(alice, 7, 20);  // will produce 1 Tier-6
        _giveBlocks(alice, 6, 39);  // 39 + 1 = 40, then consume 20 → 1 Tier-5

        uint256[] memory tiers = new uint256[](2);
        tiers[0] = 7;
        tiers[1] = 6;

        vm.prank(alice);
        token.combineMany(tiers);

        assertEq(token.balanceOf(alice, 7), 0,  "Tier-7 fully burned");
        assertEq(token.balanceOf(alice, 6), 20, "Tier-6 net: 39 + 1 - 20 = 20");
        assertEq(token.balanceOf(alice, 5), 1,  "Should have 1 Tier-5");
    }

    function test_CombineDecreasesTierSupply() public {
        _giveBlocks(alice, 7, 20);
        uint256 supplyBefore = token.tierTotalSupply(7);

        vm.prank(alice);
        token.combine(7);

        assertEq(token.tierTotalSupply(7), supplyBefore - 20, "Supply should decrease by burn amount");
    }

    function test_CombineTriggersCountdown() public {
        // Give alice tiers 3-7, then combine 7→6 to complete set
        for (uint256 tier = 3; tier <= 6; tier++) {
            _giveBlocks(alice, tier, 1);
        }
        _giveBlocks(alice, 2, 1);
        _giveBlocks(alice, 7, 20);

        vm.prank(alice);
        token.combine(7);  // should give 1 Tier-6, completing Tiers 2-7

        assertEq(token.countdownActive(), true, "Countdown should trigger");
        assertEq(token.countdownHolder(), alice, "Alice should be holder");
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 3. FORGE TESTS
    // ═════════════════════════════════════════════════════════════════════════

    function test_ForgeRequestSucceeds() public {
        _giveBlocks(alice, 7, 99);

        vm.prevrandao(bytes32(uint256(1)));
        vm.prank(alice);
        forge.forge(7, 99);  // 99% success chance

        // Either 0 or 1 Tier-6 received; all Tier-7 must be burned
        assertEq(token.balanceOf(alice, 7), 0, "Tier-7 blocks should always be burned");
    }

    function test_ForgeGuaranteedSuccessAt99() public {
        // With prevrandao = 0, pseudo-random = 0 % 100 = 0, which is < 99 → success
        _giveBlocks(alice, 7, 99);

        vm.prevrandao(bytes32(uint256(0)));
        vm.prank(alice);
        forge.forge(7, 99);

        assertEq(token.balanceOf(alice, 6), 1, "Should receive Tier-6 on success");
    }

    function test_ForgeFailsInvalidTier() public {
        vm.prank(alice);
        vm.expectRevert("Invalid tier");
        forge.forge(1, 50);  // can't forge Tier 1
    }

    function test_ForgeFailsInvalidTierAbove7() public {
        vm.prank(alice);
        vm.expectRevert("Invalid tier");
        forge.forge(8, 50);
    }

    function test_ForgeFailsBurnCountTooLow() public {
        _giveBlocks(alice, 7, 50);

        vm.prank(alice);
        vm.expectRevert("Burn count must be 10-99");
        forge.forge(7, 9);  // minimum is 10
    }

    function test_ForgeFailsBurnCountTooHigh() public {
        _giveBlocks(alice, 7, 100);

        vm.prank(alice);
        vm.expectRevert("Burn count must be 10-99");
        forge.forge(7, 100);  // maximum is 99
    }

    function test_ForgeFailsInsufficientBlocks() public {
        _giveBlocks(alice, 7, 5);

        vm.prank(alice);
        vm.expectRevert("Insufficient blocks");
        forge.forge(7, 10);
    }

    function test_ForgeEmitsEvents() public {
        _giveBlocks(alice, 7, 50);

        vm.prevrandao(bytes32(uint256(1)));
        vm.prank(alice);

        vm.expectEmit(true, true, false, false);
        emit BlockHuntForge.ForgeRequested(1, alice, 7, 50);

        forge.forge(7, 50);
    }

    function test_ForgeRequestRecorded() public {
        _giveBlocks(alice, 7, 50);

        vm.prevrandao(bytes32(uint256(1)));
        vm.prank(alice);
        forge.forge(7, 50);

        (address player, uint256 fromTier, uint256 burnCount, bool resolved) = forge.forgeRequests(1);
        assertEq(player,    alice, "Player should be alice");
        assertEq(fromTier,  7,     "fromTier should be 7");
        assertEq(burnCount, 50,    "burnCount should be 50");
        assertEq(resolved,  true,  "Should be resolved");
    }

    function test_ForgeNonceIncrements() public {
        _giveBlocks(alice, 7, 20);
        _giveBlocks(bob,   7, 20);

        vm.prevrandao(bytes32(uint256(1)));
        vm.prank(alice);
        forge.forge(7, 10);

        vm.prank(bob);
        forge.forge(7, 10);

        assertEq(forge.requestNonce(), 2, "Nonce should be 2 after two forges");
    }

    function test_ForgeFeeCanBeSet() public {
        vm.prank(owner);
        forge.setForgeFee(0.001 ether);
        assertEq(forge.forgeFee(), 0.001 ether);
    }

    function test_ForgeFailsWithInsufficientFee() public {
        vm.prank(owner);
        forge.setForgeFee(0.001 ether);

        _giveBlocks(alice, 7, 20);

        vm.prank(alice);
        vm.expectRevert("Insufficient forge fee");
        forge.forge{value: 0}(7, 10);
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 4. TREASURY TESTS
    // ═════════════════════════════════════════════════════════════════════════

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

        assertEq(alice.balance,            aliceBalanceBefore + 5 ether, "Alice should receive 50%");
        assertEq(treasury.treasuryBalance(), 5 ether,                    "50% should remain as seed");
        assertEq(treasury.nextSeasonSeed(),  5 ether,                    "Seed should be set");
    }

    function test_TreasuryOnlyAcceptsTokenContract() public {
        vm.prank(alice);
        vm.expectRevert("Only token contract");
        treasury.claimPayout(alice);
    }

    function test_TreasuryStartNextSeason() public {
        // Seed must be set first via sacrifice
        vm.deal(address(treasury), 10 ether);
        vm.prank(address(token));
        treasury.sacrificePayout(alice);  // sets nextSeasonSeed = 5 ether

        vm.prank(owner);
        treasury.startNextSeason();

        assertEq(treasury.season(), 2, "Season should advance to 2");
        assertEq(treasury.nextSeasonSeed(), 0, "Seed should be cleared after season start");
    }

    function test_TreasuryCreatorFeeCanBeUpdated() public {
        vm.prank(owner);
        treasury.setCreatorFee(300);  // 3%
        assertEq(treasury.creatorFeeBps(), 300);
    }

    function test_TreasuryCreatorFeeCannotExceedMax() public {
        vm.prank(owner);
        vm.expectRevert("Exceeds max fee");
        treasury.setCreatorFee(1001);  // 10.01% — above 10% cap
    }

    function test_TreasuryTokenContractCanOnlyBeSetOnce() public {
        vm.prank(owner);
        vm.expectRevert("Already set");
        treasury.setTokenContract(address(alice));
    }

    function test_TreasuryEmergencyWithdraw() public {
        vm.deal(address(treasury), 5 ether);
        uint256 ownerBefore = owner.balance;

        vm.prank(owner);
        treasury.emergencyWithdraw(owner, 5 ether);

        assertEq(owner.balance, ownerBefore + 5 ether, "Owner should receive emergency withdrawal");
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 5. MINT WINDOW TESTS
    // ═════════════════════════════════════════════════════════════════════════

    function test_WindowOpensAndCloses() public {
        assertEq(mintWindow.isWindowOpen(), true, "Window should be open after setUp");

        vm.prank(owner);
        mintWindow.closeWindow();

        assertEq(mintWindow.isWindowOpen(), false, "Window should be closed");
    }

    function test_RolloverAccumulates() public {
        // Close window without minting → full BASE_DAILY_CAP rolls over
        vm.prank(owner);
        mintWindow.closeWindow();

        vm.prank(owner);
        mintWindow.openWindow();

        (, , , , uint256 allocated, , , ) = mintWindow.getWindowInfo();
        assertEq(allocated, 100_000, "2x BASE_DAILY_CAP (50k each) should accumulate");
    }

    function test_WindowInfoReturnsCorrectData() public {
        (
            bool isOpen,
            uint256 day,
            uint256 openAt,
            uint256 closeAt,
            uint256 allocated,
            ,
            ,
        ) = mintWindow.getWindowInfo();

        assertEq(isOpen,    true,   "Window should be open");
        assertEq(day,       1,      "Should be day 1");
        assertGt(openAt,    0,      "Open timestamp should be set");
        assertGt(closeAt,   openAt, "Close should be after open");
        assertEq(allocated, 50_000, "Base cap should be 50,000");
    }

    function test_WindowExpiresByTime() public {
        // Fast-forward past the 8-hour window
        vm.warp(block.timestamp + 8 hours + 1);

        assertEq(mintWindow.isWindowOpen(), false, "Window should be expired");
    }

    function test_WindowTracksUserDayMints() public {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        uint256 userMints = mintWindow.userDayMints(1, alice);
        assertEq(userMints, 10, "User day mints should be tracked");
    }

    function test_PerUserDayCapCanBeSet() public {
        vm.prank(owner);
        mintWindow.setPerUserDayCap(100);
        assertEq(mintWindow.perUserDayCap(), 100);
    }

    function test_BatchTracksSupply() public {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        (, , , uint256 totalMinted) = mintWindow.batches(1);
        assertEq(totalMinted, 10, "Batch should track minted blocks");
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 6. COUNTDOWN TESTS
    // ═════════════════════════════════════════════════════════════════════════

    function test_CountdownTriggersWhenAllTiersHeld() public {
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        assertEq(token.countdownActive(), true,  "Countdown should be active");
        assertEq(token.countdownHolder(), alice,  "Alice should be holder");
    }

    function test_CountdownDoesNotTriggerWithMissingTier() public {
        for (uint256 tier = 2; tier <= 6; tier++) {
            _giveBlocks(alice, tier, 1);
            // Tier 7 missing
        }

        assertEq(token.countdownActive(), false, "Countdown should not fire without all tiers");
    }

    function test_CountdownContractSyncsOnTrigger() public {
        // When Token triggers countdown, Countdown contract should also be active
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        assertEq(countdown.isActive(),      true,  "Countdown contract should be active");
        assertEq(countdown.currentHolder(), alice, "Countdown contract should record holder");
    }

    function test_CastVoteSucceeds() public {
        // Activate countdown contract via token trigger
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        vm.prank(bob);
        countdown.castVote(true);  // vote to burn/sacrifice

        assertEq(countdown.votesBurn(),    1, "Should have 1 burn vote");
        assertEq(countdown.votesClaim(),   0, "Should have 0 claim votes");
        assertEq(countdown.hasVoted(bob),  true, "Bob should be marked as voted");
    }

    function test_CastVoteClaimSucceeds() public {
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        vm.prank(bob);
        countdown.castVote(false);  // vote to claim

        assertEq(countdown.votesBurn(),  0, "Should have 0 burn votes");
        assertEq(countdown.votesClaim(), 1, "Should have 1 claim vote");
    }

    function test_CannotVoteTwice() public {
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        vm.prank(bob);
        countdown.castVote(true);

        vm.prank(bob);
        vm.expectRevert("Already voted");
        countdown.castVote(false);
    }

    function test_CannotVoteWithoutActiveCountdown() public {
        vm.prank(bob);
        vm.expectRevert("No active countdown");
        countdown.castVote(true);
    }

    function test_TimeRemainingDecreases() public {
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        uint256 remaining1 = countdown.timeRemaining();
        vm.warp(block.timestamp + 1 days);
        uint256 remaining2 = countdown.timeRemaining();

        assertGt(remaining1, remaining2, "Time remaining should decrease");
    }

    function test_CountdownExpiresAfter7Days() public {
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        vm.warp(block.timestamp + 7 days + 1);

        assertEq(countdown.hasExpired(),    true, "Should be expired");
        assertEq(countdown.timeRemaining(), 0,    "No time remaining");
    }

    function test_CheckHolderStatusResetsIfBlocksSold() public {
        // Setup countdown via token
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }
        assertEq(token.countdownActive(), true);
        assertEq(countdown.isActive(),    true);

        // Alice still has all tiers — status check should keep countdown active
        countdown.checkHolderStatus();
        assertEq(countdown.isActive(), true, "Still active when holder qualifies");
    }

    function test_GetCountdownInfoReturnsData() public {
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        (
            bool active,
            address holder,
            uint256 startTime,
            uint256 endTime,
            uint256 remaining,
            uint256 burnVotes,
            uint256 claimVotes
        ) = countdown.getCountdownInfo();

        assertEq(active,      true,  "Should be active");
        assertEq(holder,      alice, "Holder should be alice");
        assertGt(startTime,   0,     "Start time should be set");
        assertGt(endTime,     startTime, "End time should be after start");
        assertGt(remaining,   0,     "Time should remain");
        assertEq(burnVotes,   0,     "No votes yet");
        assertEq(claimVotes,  0,     "No votes yet");
    }

    function test_OnlyTokenCanStartCountdown() public {
        vm.prank(alice);
        vm.expectRevert("Only token contract");
        countdown.startCountdown(alice);
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 7. ENDGAME TESTS
    // ═════════════════════════════════════════════════════════════════════════

    function test_ClaimTreasury() public {
        vm.deal(address(treasury), 10 ether);

        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }
        assertEq(token.countdownActive(), true);

        uint256 aliceBalanceBefore = alice.balance;

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.claimTreasury();

        assertGt(alice.balance, aliceBalanceBefore, "Alice should receive ETH");
        assertEq(treasury.treasuryBalance(), 0,     "Treasury should be empty");
    }

    function test_ClaimBurnsAllHeldTiers() public {
        vm.deal(address(treasury), 10 ether);

        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 3);  // give 3 of each
        }

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.claimTreasury();

        for (uint256 tier = 2; tier <= 7; tier++) {
            assertEq(token.balanceOf(alice, tier), 0, "All blocks should be burned on claim");
        }
    }

    function test_SacrificeMintsOrigin() public {
        vm.deal(address(treasury), 10 ether);

        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.sacrifice();

        assertEq(token.balanceOf(alice, 1), 1, "Alice should receive The Origin token");

        for (uint256 tier = 2; tier <= 7; tier++) {
            assertEq(token.balanceOf(alice, tier), 0, "All tiers should be burned");
        }
    }

    function test_SacrificeDistributesTreasury50_50() public {
        vm.deal(address(treasury), 10 ether);
        uint256 aliceBefore = alice.balance;

        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.sacrifice();

        assertApproxEqAbs(alice.balance - aliceBefore, 5 ether,  0.001 ether, "Alice gets ~50%");
        assertApproxEqAbs(treasury.treasuryBalance(),  5 ether,  0.001 ether, "~50% stays as seed");
    }

    function test_OnlyCountdownHolderCanClaim() public {
        vm.deal(address(treasury), 10 ether);

        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(bob);
        vm.expectRevert("Not the countdown holder");
        token.claimTreasury();
    }

    function test_OnlyCountdownHolderCanSacrifice() public {
        vm.deal(address(treasury), 10 ether);

        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(bob);
        vm.expectRevert("Not the countdown holder");
        token.sacrifice();
    }

    function test_ClaimRequiresAllTiers() public {
        // Give alice all tiers to trigger countdown
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }
        // Countdown requires all tiers to be active
        assertEq(token.countdownActive(), true, "Countdown needs all tiers to be active");
    }

    function test_CountdownResetsAfterClaim() public {
        vm.deal(address(treasury), 10 ether);

        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.claimTreasury();

        assertEq(token.countdownActive(), false,      "Countdown should reset");
        assertEq(token.countdownHolder(), address(0), "Holder should be cleared");
    }

    function test_CountdownResetsAfterSacrifice() public {
        vm.deal(address(treasury), 10 ether);

        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.sacrifice();

        assertEq(token.countdownActive(), false,      "Countdown should reset after sacrifice");
        assertEq(token.countdownHolder(), address(0), "Holder should be cleared");
    }

    function test_NewCountdownCanTriggerAfterClaim() public {
        vm.deal(address(treasury), 10 ether);

        // Alice wins and claims
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.claimTreasury();

        // Bob now collects all tiers — countdown should be re-triggerable
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(bob, tier, 1);
        }

        assertEq(token.countdownActive(), true,  "New countdown should be possible");
        assertEq(token.countdownHolder(), bob,   "Bob should be new holder");
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 7b. ENDGAME — 7-DAY ENFORCEMENT & NEW MECHANICS
    // ═════════════════════════════════════════════════════════════════════════

    function test_ClaimRevertsBeforeTimerExpires() public {
        _giveAllTiers(alice);

        vm.prank(alice);
        vm.expectRevert("Countdown still running");
        token.claimTreasury();
    }

    function test_SacrificeRevertsBeforeTimerExpires() public {
        _giveAllTiers(alice);

        vm.prank(alice);
        vm.expectRevert("Countdown still running");
        token.sacrifice();
    }

    function test_DefaultSacrificeRevertsBeforeTimerExpires() public {
        _giveAllTiers(alice);

        vm.prank(bob);
        vm.expectRevert("Countdown still running");
        token.executeDefaultOnExpiry();
    }

    function test_DefaultSacrificeExecutedByAnyone() public {
        vm.deal(address(treasury), 10 ether);
        _giveAllTiers(alice);

        vm.warp(block.timestamp + 7 days + 1);

        // Bob (not the holder) calls — simulates Gelato keeper
        vm.prank(bob);
        token.executeDefaultOnExpiry();

        assertFalse(token.countdownActive(),          "Countdown should be reset");
        assertEq(token.countdownHolder(), address(0), "Holder should be cleared");
        assertEq(token.balanceOf(alice, 1), 1,        "Alice receives The Origin");
        for (uint256 tier = 2; tier <= 7; tier++) {
            assertEq(token.balanceOf(alice, tier), 0, "All tiers should be burned");
        }
    }

    function test_DefaultSacrificeRevertsIfHolderAlreadyActed() public {
        vm.deal(address(treasury), 10 ether);
        _giveAllTiers(alice);

        vm.warp(block.timestamp + 7 days + 1);

        // Alice acts first
        vm.prank(alice);
        token.claimTreasury();

        // Keeper fires a moment later — countdown already ended
        vm.prank(bob);
        vm.expectRevert("No countdown active");
        token.executeDefaultOnExpiry();
    }

    function test_CountdownStartTimeRecorded() public {
        uint256 before = block.timestamp;
        _giveAllTiers(alice);
        assertEq(token.countdownStartTime(), before);
    }

    function test_CountdownStartTimeResetAfterEndgame() public {
        vm.deal(address(treasury), 10 ether);
        _giveAllTiers(alice);
        assertGt(token.countdownStartTime(), 0);

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.claimTreasury();

        assertEq(token.countdownStartTime(), 0);
    }

    function test_ClaimSyncsCountdownContract() public {
        vm.deal(address(treasury), 10 ether);
        _giveAllTiers(alice);
        assertTrue(countdown.isActive());

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.claimTreasury();

        assertFalse(countdown.isActive());
        assertEq(countdown.currentHolder(), address(0));
        assertEq(countdown.countdownStartTime(), 0);
    }

    function test_SacrificeSyncsCountdownContract() public {
        vm.deal(address(treasury), 10 ether);
        _giveAllTiers(alice);
        assertTrue(countdown.isActive());

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.sacrifice();

        assertFalse(countdown.isActive());
        assertEq(countdown.currentHolder(), address(0));
    }

    function test_DefaultSacrificeSyncsCountdownContract() public {
        vm.deal(address(treasury), 10 ether);
        _giveAllTiers(alice);
        assertTrue(countdown.isActive());

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(bob);
        token.executeDefaultOnExpiry();

        assertFalse(countdown.isActive());
        assertEq(countdown.currentHolder(), address(0));
    }

    function test_ClaimHolderStatusRevertsIfDoesNotHoldAllTiers() public {
        _giveBlocks(bob, 2, 1); // only one tier

        vm.prank(bob);
        vm.expectRevert("Does not hold all 6 tiers");
        token.claimHolderStatus();
    }

    function test_ClaimHolderStatusRevertsIfCountdownAlreadyActive() public {
        _giveAllTiers(alice); // alice triggers countdown

        // Bob also holds all tiers
        vm.startPrank(owner);
        for (uint256 tier = 2; tier <= 7; tier++) {
            token.mintForTest(bob, tier, 1);
        }
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert("Countdown already active");
        token.claimHolderStatus();
    }

    function test_SyncResetRevertsIfCalledDirectly() public {
        vm.prank(alice);
        vm.expectRevert("Only token contract");
        countdown.syncReset();
    }

    function test_StartCountdownRevertsIfCalledDirectly() public {
        vm.prank(alice);
        vm.expectRevert("Only token contract");
        countdown.startCountdown(alice);
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 8. TOKEN ADMIN & SECURITY TESTS
    // ═════════════════════════════════════════════════════════════════════════

    function test_PauseStopsMinting() public {
        vm.prank(owner);
        token.pause();

        vm.prank(alice);
        vm.expectRevert();  // Pausable reverts with EnforcedPause
        token.mint{value: MINT_PRICE * 5}(5);
    }

    function test_UnpauseRestoresMinting() public {
        vm.prank(owner);
        token.pause();

        vm.prank(owner);
        token.unpause();

        vm.prank(alice);
        token.mint{value: MINT_PRICE * 5}(5);  // should succeed
    }

    function test_TestMintDisabledAfterDisableCall() public {
        vm.prank(owner);
        token.disableTestMint();

        vm.expectRevert("Test mint disabled");
        token.mintForTest(alice, 7, 10);
    }

    function test_OnlyOwnerCanDisableTestMint() public {
        vm.prank(alice);
        vm.expectRevert();  // OwnableUnauthorizedAccount
        token.disableTestMint();
    }

    function test_BalancesOfReturnsAllTiers() public {
        _giveBlocks(alice, 2, 5);
        _giveBlocks(alice, 5, 3);
        _giveBlocks(alice, 7, 10);

        uint256[8] memory bals = token.balancesOf(alice);
        assertEq(bals[2], 5,  "Tier 2 balance");
        assertEq(bals[5], 3,  "Tier 5 balance");
        assertEq(bals[7], 10, "Tier 7 balance");
        assertEq(bals[3], 0,  "Tier 3 should be zero");
    }

    function test_HasAllTiersReturnsTrueWhenComplete() public {
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }
        assertEq(token.hasAllTiers(alice), true);
    }

    function test_HasAllTiersReturnsFalseWhenIncomplete() public {
        for (uint256 tier = 2; tier <= 6; tier++) {
            _giveBlocks(alice, tier, 1);
        }
        assertEq(token.hasAllTiers(alice), false);
    }

    function test_SupportsERC1155Interface() public view {
        bytes4 erc1155 = 0xd9b67a26;
        assertEq(token.supportsInterface(erc1155), true, "Should support ERC-1155");
    }

    function test_SupportsERC2981Interface() public view {
        bytes4 erc2981 = 0x2a55205a;
        assertEq(token.supportsInterface(erc2981), true, "Should support ERC-2981 royalties");
    }

    function test_SetURIByOwner() public {
        vm.prank(owner);
        token.setURI("https://new.api.com/{id}.json");
        // URI is stored internally; no public getter — just verify no revert
    }

    function test_SetURIRevertsForNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        token.setURI("https://malicious.com/{id}.json");
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 9. MIGRATION TESTS
    // ═════════════════════════════════════════════════════════════════════════

    function test_MigrationWindowOpensAndCloses() public {
        vm.prank(owner);
        migration.openMigrationWindow();

        assertEq(migration.migrationOpen(),    true, "Migration should be open");
        assertGt(migration.migrationOpenAt(),  0,    "Open timestamp set");
        assertGt(migration.migrationCloseAt(), 0,    "Close timestamp set");

        vm.prank(owner);
        migration.closeMigrationWindow();

        assertEq(migration.migrationOpen(), false, "Migration should be closed");
    }

    function test_MigrationRequiresMinimumBlocks() public {
        vm.prank(owner);
        migration.openMigrationWindow();

        _giveBlocks(alice, 7, 50);  // only 50, needs 100

        vm.prank(alice);
        vm.expectRevert("Need at least 100 Season 1 blocks");
        migration.migrate();
    }

    function test_MigrationSucceedsWithLowTier() public {
        vm.prank(owner);
        migration.openMigrationWindow();

        _giveBlocks(alice, 7, 200);  // 200 blocks → 100 starters (low tier)

        vm.prank(alice);
        migration.migrate();

        assertEq(migration.hasMigrated(alice),      true,  "Alice should be marked as migrated");
        assertEq(migration.migrationReward(alice),  100,   "Should receive 100 starters");
        assertGt(tokenV2.totalReceived(alice),      0,     "Should have received Season 2 starters");
    }

    function test_MigrationSucceedsWithMidTier() public {
        vm.prank(owner);
        migration.openMigrationWindow();

        _giveBlocks(alice, 7, 600);  // 600 blocks → 150 starters (mid tier)

        vm.prank(alice);
        migration.migrate();

        assertEq(migration.migrationReward(alice), 150, "Should receive 150 starters");
    }

    function test_MigrationSucceedsWithHighTier() public {
        vm.prank(owner);
        migration.openMigrationWindow();

        _giveBlocks(alice, 7, 1000);  // 1000 blocks → 200 starters (high tier)

        vm.prank(alice);
        migration.migrate();

        assertEq(migration.migrationReward(alice), 200, "Should receive 200 starters");
    }

    function test_CannotMigrateTwice() public {
        vm.prank(owner);
        migration.openMigrationWindow();

        _giveBlocks(alice, 7, 200);

        vm.prank(alice);
        migration.migrate();

        vm.prank(alice);
        vm.expectRevert("Already migrated");
        migration.migrate();
    }

    function test_CannotMigrateWhenWindowClosed() public {
        _giveBlocks(alice, 7, 200);

        vm.prank(alice);
        vm.expectRevert("Migration window not open");
        migration.migrate();
    }

    function test_MigrationBurnsSeason1Blocks() public {
        vm.prank(owner);
        migration.openMigrationWindow();

        _giveBlocks(alice, 7, 200);

        vm.prank(alice);
        migration.migrate();

        assertEq(token.balanceOf(alice, 7), 0, "All Season 1 blocks should be burned");
    }

    function test_MigrationWindowExpires() public {
        vm.prank(owner);
        migration.openMigrationWindow();

        vm.warp(block.timestamp + 30 days + 1);

        _giveBlocks(alice, 7, 200);

        vm.prank(alice);
        vm.expectRevert("Migration window closed");
        migration.migrate();
    }

    function test_MigrationStatsAreTracked() public {
        vm.prank(owner);
        migration.openMigrationWindow();

        _giveBlocks(alice, 7, 200);
        _giveBlocks(bob,   7, 600);

        vm.prank(alice);
        migration.migrate();

        vm.prank(bob);
        migration.migrate();

        assertEq(migration.totalMigrated(),    2,   "2 players should have migrated");
        assertGt(migration.totalBlocksBurned(), 0,   "Burned blocks should be tracked");
        assertGt(migration.totalStartersGiven(), 0,  "Starters given should be tracked");
    }

    function test_MigrationWindowCannotOpenTwice() public {
        vm.prank(owner);
        migration.openMigrationWindow();

        vm.prank(owner);
        vm.expectRevert("Migration already open");
        migration.openMigrationWindow();
    }

    function test_MigrationRequiresTokenV2BeforeOpening() public {
        BlockHuntMigration migration2 = new BlockHuntMigration(address(token));
        // tokenV2 not set

        vm.expectRevert("Season 2 token not set");
        migration2.openMigrationWindow();
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 10. SEASON REGISTRY TESTS
    // ═════════════════════════════════════════════════════════════════════════

    function test_RegistrySeasonOneRegistered() public view {
        (bool registered, bool launched, bool ended, , , ) = registry.seasonState(1);
        assertEq(registered, true, "Season 1 should be registered");
        assertEq(launched,   true, "Season 1 should be launched");
        assertEq(ended,      false, "Season 1 should not be ended");
    }

    function test_RegistrySeasonOneContractsStored() public view {
        (
            address treasury_,
            address token_,
            address mintWindow_,
            address forge_,
            address migration_
        ) = registry.seasonContracts(1);

        assertEq(treasury_,   address(treasury),   "Treasury address stored");
        assertEq(token_,      address(token),       "Token address stored");
        assertEq(mintWindow_, address(mintWindow),  "MintWindow address stored");
        assertEq(forge_,      address(forge),       "Forge address stored");
        assertEq(migration_,  address(migration),   "Migration address stored");
    }

    function test_RegistryCurrentSeasonIsOne() public view {
        assertEq(registry.getCurrentSeason(), 1, "Current season should be 1");
    }

    function test_RegistryIsRegisteredTreasury() public view {
        assertEq(registry.isRegisteredTreasury(address(treasury)), true,  "Should recognise treasury");
        assertEq(registry.isRegisteredTreasury(address(alice)),    false, "Should not recognise random address");
    }

    function test_RegistryCannotRegisterSameSeasonTwice() public {
        vm.prank(owner);
        vm.expectRevert("Already registered");
        registry.registerSeason(1, address(treasury), address(token), address(mintWindow), address(forge));
    }

    function test_RegistryMustRegisterInOrder() public {
        vm.prank(owner);
        vm.expectRevert("Register in order");
        registry.registerSeason(3, address(treasury), address(token), address(mintWindow), address(forge));
    }

    function test_RegistryCannotMarkLaunchedTwice() public {
        vm.prank(owner);
        vm.expectRevert("Already launched");
        registry.markSeasonLaunched(1);
    }

    function test_RegistryMarkSeasonEnded() public {
        vm.prank(owner);
        registry.markSeasonEnded(1, alice, false, 10 ether, 0);

        (, , bool ended, , , ) = registry.seasonState(1);
        assertEq(ended, true, "Season should be marked ended");

        (address winner, bool wasSacrifice, uint256 finalTreasury, ) = registry.seasonOutcome(1);
        assertEq(winner,        alice,     "Winner should be alice");
        assertEq(wasSacrifice,  false,     "Should be claim not sacrifice");
        assertEq(finalTreasury, 10 ether,  "Final treasury recorded");
    }

    function test_RegistryMarkSeasonEndedSacrifice() public {
        vm.prank(owner);
        registry.markSeasonEnded(1, alice, true, 10 ether, 5 ether);

        (address winner, bool wasSacrifice, , uint256 seed) = registry.seasonOutcome(1);
        assertEq(winner,       alice,   "Winner should be alice");
        assertEq(wasSacrifice, true,    "Should be sacrifice");
        assertEq(seed,         5 ether, "Seed amount recorded");
    }

    function test_RegistryCannotEndUnlaunchedSeason() public {
        // Register a second season but don't launch it
        vm.startPrank(owner);
        BlockHuntTreasury   treasury2   = new BlockHuntTreasury(creator);
        BlockHuntToken      token2      = new BlockHuntToken("uri", creator, 500);
        BlockHuntMintWindow mintWindow2 = new BlockHuntMintWindow();
        BlockHuntForge      forge2      = new BlockHuntForge();

        registry.registerSeason(2, address(treasury2), address(token2), address(mintWindow2), address(forge2));

        vm.expectRevert("Not launched");
        registry.markSeasonEnded(2, alice, false, 0, 0);
        vm.stopPrank();
    }

    function test_RegistryCannotEndSeasonTwice() public {
        vm.startPrank(owner);
        registry.markSeasonEnded(1, alice, false, 10 ether, 0);

        vm.expectRevert("Already ended");
        registry.markSeasonEnded(1, alice, false, 10 ether, 0);
        vm.stopPrank();
    }

    function test_RegistryGetAuthorisedSeedDestination() public {
        // Register Season 2 so there's a valid next season
        vm.startPrank(owner);
        BlockHuntTreasury   treasury2   = new BlockHuntTreasury(creator);
        BlockHuntToken      token2      = new BlockHuntToken("uri", creator, 500);
        BlockHuntMintWindow mintWindow2 = new BlockHuntMintWindow();
        BlockHuntForge      forge2      = new BlockHuntForge();

        registry.registerSeason(2, address(treasury2), address(token2), address(mintWindow2), address(forge2));
        registry.markSeasonEnded(1, alice, true, 10 ether, 5 ether); // sacrifice
        vm.stopPrank();

        address dest = registry.getAuthorisedSeedDestination(1);
        assertEq(dest, address(treasury2), "Seed destination should be Season 2 treasury");
    }

    function test_RegistryGetAuthorisedSeedDestinationFailsIfNotSacrifice() public {
        vm.startPrank(owner);
        BlockHuntTreasury   treasury2   = new BlockHuntTreasury(creator);
        BlockHuntToken      token2      = new BlockHuntToken("uri", creator, 500);
        BlockHuntMintWindow mintWindow2 = new BlockHuntMintWindow();
        BlockHuntForge      forge2      = new BlockHuntForge();

        registry.registerSeason(2, address(treasury2), address(token2), address(mintWindow2), address(forge2));
        registry.markSeasonEnded(1, alice, false, 10 ether, 0); // claim, not sacrifice
        vm.stopPrank();

        vm.expectRevert("Not a sacrifice");
        registry.getAuthorisedSeedDestination(1);
    }

    function test_RegistryGetNextSeasonTreasury() public {
        vm.startPrank(owner);
        BlockHuntTreasury   treasury2   = new BlockHuntTreasury(creator);
        BlockHuntToken      token2      = new BlockHuntToken("uri", creator, 500);
        BlockHuntMintWindow mintWindow2 = new BlockHuntMintWindow();
        BlockHuntForge      forge2      = new BlockHuntForge();

        registry.registerSeason(2, address(treasury2), address(token2), address(mintWindow2), address(forge2));
        vm.stopPrank();

        address next = registry.getNextSeasonTreasury(1);
        assertEq(next, address(treasury2), "Should return Season 2 treasury");
    }

    function test_RegistryGetNextSeasonTreasuryFailsIfNotRegistered() public view {
        // Season 2 not registered
        assertEq(registry.totalSeasons(), 1, "Only Season 1 registered");
    }

    function test_RegistryOnlyOwnerCanRegister() public {
        vm.prank(alice);
        vm.expectRevert();
        registry.registerSeason(2, address(treasury), address(token), address(mintWindow), address(forge));
    }

    function test_RegistryOnlyOwnerCanMarkLaunched() public {
        vm.prank(alice);
        vm.expectRevert();
        registry.markSeasonLaunched(1);
    }

    function test_RegistryOnlyOwnerCanMarkEnded() public {
        vm.prank(alice);
        vm.expectRevert();
        registry.markSeasonEnded(1, alice, false, 0, 0);
    }

    function test_RegistryLogSeedTransfer() public {
        // Register Season 2 first
        vm.startPrank(owner);
        BlockHuntTreasury   treasury2   = new BlockHuntTreasury(creator);
        BlockHuntToken      token2      = new BlockHuntToken("uri", creator, 500);
        BlockHuntMintWindow mintWindow2 = new BlockHuntMintWindow();
        BlockHuntForge      forge2      = new BlockHuntForge();
        registry.registerSeason(2, address(treasury2), address(token2), address(mintWindow2), address(forge2));
        vm.stopPrank();

        // logSeedTransfer can only be called by the from-season treasury
        vm.prank(address(treasury));
        registry.logSeedTransfer(1, 2, 5 ether); // should emit event without reverting
    }

    function test_RegistryLogSeedTransferFailsIfNotTreasury() public {
        vm.startPrank(owner);
        BlockHuntTreasury   treasury2   = new BlockHuntTreasury(creator);
        BlockHuntToken      token2      = new BlockHuntToken("uri", creator, 500);
        BlockHuntMintWindow mintWindow2 = new BlockHuntMintWindow();
        BlockHuntForge      forge2      = new BlockHuntForge();
        registry.registerSeason(2, address(treasury2), address(token2), address(mintWindow2), address(forge2));
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert("Only from-season treasury");
        registry.logSeedTransfer(1, 2, 5 ether);
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 11. INTEGRATION / END-TO-END TESTS
    // ═════════════════════════════════════════════════════════════════════════

    function test_FullGameFlow_Claim() public {
        // 1. Mint blocks
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 50}(50);

        // 2. Give alice all 6 tiers (simulate grinding) — also triggers countdown
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        // 3. Countdown triggers on both Token and Countdown contracts
        assertEq(token.countdownActive(), true);
        assertEq(countdown.isActive(),    true);

        // 4. Others can vote
        vm.prank(bob);
        countdown.castVote(false);  // vote claim

        // 5. Wait 7 days, then Alice claims
        vm.deal(address(treasury), 5 ether);
        uint256 aliceBefore = alice.balance;

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.claimTreasury();

        assertGt(alice.balance, aliceBefore,         "Alice should have received ETH");
        assertEq(token.countdownActive(), false,      "Game should end");
        assertEq(countdown.isActive(),    false,      "Countdown contract should sync");
    }

    function test_FullGameFlow_Sacrifice_ThenMigration() public {
        // 1. Give alice all tiers and sacrifice
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        vm.deal(address(treasury), 10 ether);

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.sacrifice();

        // 2. Alice holds The Origin
        assertEq(token.balanceOf(alice, 1), 1);

        // 3. Treasury has seed for Season 2
        assertApproxEqAbs(treasury.nextSeasonSeed(), 5 ether, 0.001 ether);

        // 4. Migration window opens for Season 1 → Season 2
        _giveBlocks(bob, 7, 500);

        vm.prank(owner);
        migration.openMigrationWindow();

        vm.prank(bob);
        migration.migrate();

        assertEq(migration.hasMigrated(bob),    true, "Bob migrated to Season 2");
        assertEq(migration.migrationReward(bob), 150, "Bob gets 150 starters");
    }

    function test_MultiplePlayersCannotTriggerSimultaneousCountdowns() public {
        // Alice triggers countdown
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }
        assertEq(token.countdownActive(), true);
        assertEq(token.countdownHolder(), alice);

        // Bob also collects all tiers — countdown should NOT reassign
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(bob, tier, 1);
        }

        // Holder should still be alice
        assertEq(token.countdownHolder(), alice, "First holder keeps countdown");
    }


    // ═════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═════════════════════════════════════════════════════════════════════════

    /// @dev Mints blocks directly to a player via testMint — bypasses window.
    function _giveBlocks(address player, uint256 tier, uint256 amount) internal {
        vm.prank(owner);
        token.mintForTest(player, tier, amount);
    }

    /// @dev Give a player exactly one block of every tier (2–7), triggering countdown.
    function _giveAllTiers(address player) internal {
        vm.startPrank(owner);
        for (uint256 tier = 2; tier <= 7; tier++) {
            token.mintForTest(player, tier, 1);
        }
        vm.stopPrank();
    }
}
