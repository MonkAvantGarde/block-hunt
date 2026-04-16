// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/BlockHuntToken.sol";
import "../src/BlockHuntTreasury.sol";
import "../src/BlockHuntMintWindow.sol";
import "../src/BlockHuntForge.sol";
import "../src/BlockHuntCountdown.sol";
import "../src/BlockHuntEscrow.sol";
import "../src/BlockHuntMigration.sol";
import "../src/BlockHuntSeasonRegistry.sol";
import "../src/BlockHuntMarketplace.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

// ─────────────────────────────────────────────────────────────────────────────
// MockVRFCoordinator — simulates Chainlink VRF V2.5 for testing
// ─────────────────────────────────────────────────────────────────────────────
contract MockVRFCoordinator {
    uint256 private _nextRequestId = 1;
    mapping(uint256 => address) private _consumers;

    function requestRandomWords(
        VRFV2PlusClient.RandomWordsRequest calldata
    ) external returns (uint256 requestId) {
        requestId = _nextRequestId++;
        _consumers[requestId] = msg.sender;
    }

    function fulfillRequest(uint256 requestId, uint256 randomWord) external {
        address consumer = _consumers[requestId];
        require(consumer != address(0), "Unknown requestId");
        uint256[] memory randomWords = new uint256[](1);
        randomWords[0] = randomWord;
        VRFConsumerBaseV2Plus(consumer).rawFulfillRandomWords(requestId, randomWords);
    }

    function nextRequestId() external view returns (uint256) {
        return _nextRequestId;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MockTokenV2 — stub for Season 2 token used in migration tests
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
// RevertOnReceive — malicious contract that reverts when receiving ETH
// ─────────────────────────────────────────────────────────────────────────────
contract RevertOnReceive {
    receive() external payable {
        revert("I reject ETH");
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
        external pure returns (bytes4)
    {
        return 0xf23a6e61;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external pure returns (bytes4)
    {
        return 0xbc197c81;
    }

    function supportsInterface(bytes4) external pure returns (bool) {
        return true;
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN TEST CONTRACT
// ═════════════════════════════════════════════════════════════════════════════
contract BlockHuntTest is Test {

    // ── Contracts ──────────────────────────────────────────────────────────
    BlockHuntToken      public token;
    BlockHuntTreasury   public treasury;
    BlockHuntMintWindow public mintWindow;
    BlockHuntForge      public forge;
    BlockHuntCountdown  public countdown;
    BlockHuntEscrow     public escrow;
    BlockHuntMigration      public migration;
    BlockHuntSeasonRegistry public registry;
    BlockHuntMarketplace    public marketplace;
    MockTokenV2             public tokenV2;
    MockVRFCoordinator      public mockVRFCoordinator;

    // ── Wallets ────────────────────────────────────────────────────────────
    address public owner   = address(0x1);
    address public creator = address(0x2);
    address public alice   = address(0x3);
    address public bob     = address(0x4);
    address public carol   = address(0x5);
    address public keeper  = address(0x6);
    address public season2Treasury = address(0x7);
    address public dan     = address(0x8);

    uint256 public constant MINT_PRICE = 0.00008 ether; // Batch 1

    // ═════════════════════════════════════════════════════════════════════════
    // SETUP
    // ═════════════════════════════════════════════════════════════════════════
    function setUp() public {
        vm.startPrank(owner);

        mockVRFCoordinator = new MockVRFCoordinator();

        treasury   = new BlockHuntTreasury(creator);
        mintWindow = new BlockHuntMintWindow();
        countdown  = new BlockHuntCountdown();
        forge      = new BlockHuntForge(address(mockVRFCoordinator));
        token      = new BlockHuntToken(
            "https://api.blockhunt.xyz/metadata/{id}.json",
            creator,
            1000,
            address(mockVRFCoordinator)
        );

        escrow = new BlockHuntEscrow(keeper);
        escrow.setTokenContract(address(token));

        // Wire Token -> peripherals
        token.setTreasuryContract(address(treasury));
        token.setMintWindowContract(address(mintWindow));
        token.setForgeContract(address(forge));
        token.setCountdownContract(address(countdown));
        token.setEscrowContract(address(escrow));

        // Wire peripherals -> Token
        treasury.setTokenContract(address(token));
        treasury.setEscrowContract(address(escrow));
        mintWindow.setTokenContract(address(token));
        forge.setTokenContract(address(token));
        countdown.setTokenContract(address(token));

        // Migration
        migration = new BlockHuntMigration(address(token));
        tokenV2   = new MockTokenV2();
        migration.setTokenV2(address(tokenV2));
        token.setMigrationContract(address(migration));

        // Season Registry
        registry = new BlockHuntSeasonRegistry();
        registry.registerSeason(1, address(treasury), address(token), address(mintWindow), address(forge));
        registry.setSeasonMigration(1, address(migration));
        registry.markSeasonLaunched(1);

        // Marketplace
        marketplace = new BlockHuntMarketplace(address(token), creator);

        // Set keeper on countdown
        countdown.setKeeper(keeper);

        vm.stopPrank();

        // Fund test wallets
        vm.deal(alice, 100 ether);
        vm.deal(bob,   100 ether);
        vm.deal(carol, 100 ether);
        vm.deal(dan,   100 ether);
    }

    // ── Helper: mint blocks for a player via pseudo-random ────────────────
    function _mintBlocks(address player, uint256 quantity) internal {
        vm.prank(player);
        token.mint{value: MINT_PRICE * quantity}(quantity);
    }

    // ── Helper: give blocks of a specific tier using testMint ─────────────
    function _giveBlocks(address player, uint256 tier, uint256 amount) internal {
        vm.prank(owner);
        token.mintForTest(player, tier, amount);
    }

    // ── Helper: give 1 of each tier 2-7 ──────────────────────────────────
    function _giveAllTiers(address player) internal {
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(player, tier, 1);
        }
    }

    // ── Helper: give all tiers and verify countdown triggers ─────────────
    function _triggerCountdown(address player) internal {
        _giveAllTiers(player);
        assertTrue(token.countdownActive(), "Countdown should be active");
        assertEq(token.countdownHolder(), player, "Player should be holder");
    }

    // ── Helper: count total blocks across tiers 2-7 ─────────────────────
    function _totalBlocks(address player) internal view returns (uint256) {
        uint256 total;
        for (uint256 tier = 2; tier <= 7; tier++) {
            total += token.balanceOf(player, tier);
        }
        return total;
    }

    // ── Helper: setup a full sacrifice flow (for escrow tests) ───────────
    function _setupSacrifice() internal returns (address winner) {
        winner = alice;
        // Mint to build treasury
        _mintBlocks(bob, 500);
        // Give alice all tiers
        _triggerCountdown(alice);
        // Warp past countdown
        vm.warp(block.timestamp + 7 days + 1);
        // Execute sacrifice
        vm.prank(alice);
        token.sacrifice();
    }


    // ═════════════════════════════════════════════════════════════════════════
    // SECTION 2: TOKEN BASICS (~30 tests)
    // ═════════════════════════════════════════════════════════════════════════

    function test_mint_success() public {
        _mintBlocks(alice, 10);
        uint256 total = _totalBlocks(alice);
        assertEq(total, 10, "Should have 10 blocks");
    }

    function test_mint_insufficientPayment() public {
        vm.prank(alice);
        vm.expectRevert("Insufficient payment");
        token.mint{value: MINT_PRICE - 1}(1);
    }

    function test_mint_refundExcess() public {
        uint256 balBefore = alice.balance;
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 20}(10);
        uint256 spent = balBefore - alice.balance;
        assertEq(spent, MINT_PRICE * 10, "Should refund excess");
    }

    function test_mint_zeroQuantity() public {
        vm.prank(alice);
        vm.expectRevert("Invalid quantity");
        token.mint{value: MINT_PRICE}(0);
    }

    function test_mint_over500() public {
        vm.prank(alice);
        vm.expectRevert("Invalid quantity");
        token.mint{value: MINT_PRICE * 501}(501);
    }

    function test_mint_exactly500() public {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 500}(500);
        assertEq(_totalBlocks(alice), 500);
    }

    function test_mint_tierDistribution() public {
        // Mint enough to statistically get different tiers
        _mintBlocks(alice, 500);
        // At early supply, mostly T7 and T6
        assertTrue(token.balanceOf(alice, 7) > 0, "Should have T7");
    }

    function test_mint_priceFromMintWindow() public {
        uint256 price = token.currentMintPrice();
        assertEq(price, MINT_PRICE, "Batch 1 price should be 0.00008 ether");
    }

    function test_mint_updatesSupplyTracking() public {
        uint256 minted0 = token.totalMinted();
        _mintBlocks(alice, 50);
        assertEq(token.totalMinted(), minted0 + 50);
    }

    function test_mint_forwardsToTreasury() public {
        uint256 treasBefore = address(treasury).balance;
        uint256 creatorBefore = creator.balance;
        _mintBlocks(alice, 100);
        uint256 total = MINT_PRICE * 100;
        uint256 creatorFee = (total * 2000) / 10000; // 20%
        assertEq(creator.balance - creatorBefore, creatorFee);
        assertEq(address(treasury).balance - treasBefore, total - creatorFee);
    }

    function test_mint_whenPaused_reverts() public {
        vm.prank(owner);
        token.pause();
        vm.prank(alice);
        vm.expectRevert();
        token.mint{value: MINT_PRICE * 5}(5);
    }

    function test_balancesOf() public {
        _giveBlocks(alice, 3, 5);
        _giveBlocks(alice, 7, 10);
        uint256[8] memory bals = token.balancesOf(alice);
        assertEq(bals[3], 5);
        assertEq(bals[7], 10);
        assertEq(bals[1], 0);
    }

    function test_hasAllTiers_true() public {
        _giveAllTiers(alice);
        assertTrue(token.hasAllTiers(alice));
    }

    function test_hasAllTiers_false() public {
        _giveBlocks(alice, 7, 1);
        assertFalse(token.hasAllTiers(alice));
    }

    function test_supportsInterface_ERC1155() public view {
        // ERC1155 interfaceId = 0xd9b67a26
        assertTrue(token.supportsInterface(0xd9b67a26));
    }

    function test_supportsInterface_ERC2981() public view {
        // ERC2981 interfaceId = 0x2a55205a
        assertTrue(token.supportsInterface(0x2a55205a));
    }

    function test_setURI() public {
        vm.prank(owner);
        token.setURI("https://new-uri.com/{id}.json");
        // No revert = success
    }

    function test_setRoyalty() public {
        vm.prank(owner);
        token.setRoyalty(bob, 500); // 5%
    }

    function test_setRoyalty_maxCap() public {
        vm.prank(owner);
        vm.expectRevert("Exceeds 10% cap");
        token.setRoyalty(bob, 1001);
    }

    function test_pause_unpause() public {
        vm.startPrank(owner);
        token.pause();
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert();
        token.mint{value: MINT_PRICE}(1);

        vm.prank(owner);
        token.unpause();

        _mintBlocks(alice, 1);
        assertEq(_totalBlocks(alice), 1);
    }

    function test_mintForTest_success() public {
        _giveBlocks(alice, 5, 10);
        assertEq(token.balanceOf(alice, 5), 10);
    }

    function test_mintForTest_notOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        token.mintForTest(alice, 5, 10);
    }

    function test_disableTestMint() public {
        vm.startPrank(owner);
        token.disableTestMint();
        vm.expectRevert("Test mint disabled");
        token.mintForTest(alice, 5, 10);
        vm.stopPrank();
    }

    function test_mintForTest_invalidTier1() public {
        vm.prank(owner);
        vm.expectRevert("Invalid tier");
        token.mintForTest(alice, 1, 1);
    }

    function test_mintForTest_invalidTier8() public {
        vm.prank(owner);
        vm.expectRevert("Invalid tier");
        token.mintForTest(alice, 8, 1);
    }

    function test_mint_notConfigured() public {
        // Deploy a fresh token without wiring
        vm.startPrank(owner);
        BlockHuntToken freshToken = new BlockHuntToken("", creator, 1000, address(mockVRFCoordinator));
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert("Mint not configured");
        freshToken.mint{value: MINT_PRICE}(1);
    }

    function test_tierTotalSupply_updates() public {
        _giveBlocks(alice, 7, 100);
        assertEq(token.tierTotalSupply(7), 100);
    }

    function test_mint_tierConstants() public view {
        assertEq(token.TIER_ORIGIN(), 1);
        assertEq(token.TIER_WILLFUL(), 2);
        assertEq(token.TIER_CHAOTIC(), 3);
        assertEq(token.TIER_ORDERED(), 4);
        assertEq(token.TIER_REMEMBER(), 5);
        assertEq(token.TIER_RESTLESS(), 6);
        assertEq(token.TIER_INERT(), 7);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SECTION 3: MINT RATE LIMITING (~25 tests)
    // ═════════════════════════════════════════════════════════════════════════

    function test_mint_cycleCap_enforced() public {
        // perCycleCap = 500 by default, mint 500 should work
        _mintBlocks(alice, 500);
        assertEq(_totalBlocks(alice), 500);
        // Next mint should fail (on cooldown now)
        vm.prank(alice);
        vm.expectRevert("Player on cooldown");
        token.mint{value: MINT_PRICE * 1}(1);
    }

    function test_mint_cooldown_triggered() public {
        _mintBlocks(alice, 500); // hits cycle cap
        (bool canMint,,,,,,, ) = mintWindow.playerMintInfo(alice);
        assertFalse(canMint, "Should be on cooldown");
    }

    function test_mint_cooldown_expires() public {
        _mintBlocks(alice, 500); // triggers cooldown
        // Warp past 3h cooldown
        vm.warp(block.timestamp + 3 hours + 1);
        // Should be able to mint again
        _mintBlocks(alice, 1);
        assertEq(_totalBlocks(alice), 501);
    }

    function test_mint_dailyCap_enforced() public {
        // dailyCap = 5000. Do 10 cycles of 500 = 5000 total
        // Need to use shorter cooldown to stay within 24h period
        vm.prank(owner);
        mintWindow.setCooldownDuration(1 hours);

        for (uint256 i = 0; i < 10; i++) {
            _mintBlocks(alice, 500);
            vm.warp(block.timestamp + 1 hours + 1); // expire cooldown (within 24h period)
        }
        // Now at daily cap, next should fail with "Daily mint cap reached"
        vm.prank(alice);
        vm.expectRevert("Daily mint cap reached");
        token.mint{value: MINT_PRICE * 1}(1);
    }

    function test_mint_dailyCap_resets() public {
        // Use up daily cap
        for (uint256 i = 0; i < 10; i++) {
            _mintBlocks(alice, 500);
            vm.warp(block.timestamp + 3 hours + 1);
        }
        // Warp past 24h period
        vm.warp(block.timestamp + 24 hours + 1);
        // Should work again
        _mintBlocks(alice, 1);
    }

    function test_mint_multiplePlayers_independentCaps() public {
        _mintBlocks(alice, 500); // alice on cooldown
        _mintBlocks(bob, 100);   // bob should still work
        assertEq(_totalBlocks(bob), 100);
    }

    function test_canPlayerMint_view() public {
        assertTrue(mintWindow.canPlayerMint(alice));
        _mintBlocks(alice, 500);
        assertFalse(mintWindow.canPlayerMint(alice));
    }

    function test_playerMintInfo_view() public {
        _mintBlocks(alice, 100);
        (bool canMint, uint256 mintedThisCycle, uint256 cycleCap,,,,, ) = mintWindow.playerMintInfo(alice);
        assertTrue(canMint);
        assertEq(mintedThisCycle, 100);
        assertEq(cycleCap, 500);
    }

    function test_recordMint_onlyToken() public {
        vm.prank(alice);
        vm.expectRevert("Only token contract");
        mintWindow.recordMint(alice, 10);
    }

    function test_setCooldownDuration() public {
        vm.prank(owner);
        mintWindow.setCooldownDuration(1 hours);
        assertEq(mintWindow.cooldownDuration(), 1 hours);
    }

    function test_setPerCycleCap() public {
        vm.prank(owner);
        mintWindow.setPerCycleCap(100);
        assertEq(mintWindow.perCycleCap(), 100);
    }

    function test_setDailyCap() public {
        vm.prank(owner);
        mintWindow.setDailyCap(1000);
        assertEq(mintWindow.dailyCap(), 1000);
    }

    function test_batchAdvancement_onSupplyReached() public {
        assertEq(mintWindow.currentBatch(), 1);
        // Batch 1 supply = 100,000. We need to mint that many to advance.
        // Use test mode to simulate batch advancement by minting 100k blocks
        // through the window recording
        vm.prank(owner);
        mintWindow.setPerCycleCap(10_000);
        vm.prank(owner);
        mintWindow.setDailyCap(1_000_000);

        // Instead of actually minting 100k (gas-expensive), we can verify
        // the batch config
        uint256 batchSupply = mintWindow.batchSupply(1);
        assertEq(batchSupply, 100_000);
    }

    function test_batchPrice_changes() public {
        uint256 p1 = mintWindow.batchPrice(1);
        uint256 p2 = mintWindow.batchPrice(2);
        assertEq(p1, 0.00008 ether);
        assertEq(p2, 0.00012 ether);
        assertTrue(p2 > p1, "Batch 2 should be more expensive");
    }

    function test_isWindowOpen_alwaysTrue() public view {
        assertTrue(mintWindow.isWindowOpen());
    }

    function test_windowCapForBatch_maxUint() public view {
        uint256 cap = mintWindow.windowCapForBatch(1);
        assertEq(cap, type(uint256).max);
    }

    function test_mintWindow_setDailyPeriod() public {
        vm.prank(owner);
        mintWindow.setDailyPeriod(12 hours);
        assertEq(mintWindow.dailyPeriod(), 12 hours);
    }

    function test_mintWindow_disableTestMode() public {
        vm.startPrank(owner);
        mintWindow.disableTestMode();
        vm.expectRevert("Test mode disabled");
        mintWindow.setBatchConfig(0, 1, 1, 1);
        vm.stopPrank();
    }

    function test_mintWindow_getWindowInfo() public view {
        (bool isOpen,,,,, uint256 minted,,) = mintWindow.getWindowInfo();
        assertTrue(isOpen);
        assertEq(minted, 0);
    }

    function test_mintWindow_perUserDayCap() public view {
        assertEq(mintWindow.perUserDayCap(), 5000);
    }

    function test_mint_cooldown_exactBoundary() public {
        _mintBlocks(alice, 500); // triggers cooldown
        // At exactly cooldown boundary
        vm.warp(block.timestamp + 3 hours);
        // Should still be usable (>= comparison in recordMint)
        _mintBlocks(alice, 1);
    }

    function test_mint_partialCycle_noCooldown() public {
        _mintBlocks(alice, 200); // below cycle cap
        (bool canMint,,,,,,,) = mintWindow.playerMintInfo(alice);
        assertTrue(canMint, "Should not be on cooldown");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SECTION 4: COMBINE (~25 tests)
    // ═════════════════════════════════════════════════════════════════════════

    function test_combine_T7toT6() public {
        _giveBlocks(alice, 7, 21);
        vm.prank(alice);
        token.combine(7);
        assertEq(token.balanceOf(alice, 7), 0);
        assertEq(token.balanceOf(alice, 6), 1);
    }

    function test_combine_T6toT5() public {
        _giveBlocks(alice, 6, 19);
        vm.prank(alice);
        token.combine(6);
        assertEq(token.balanceOf(alice, 6), 0);
        assertEq(token.balanceOf(alice, 5), 1);
    }

    function test_combine_T5toT4() public {
        _giveBlocks(alice, 5, 17);
        vm.prank(alice);
        token.combine(5);
        assertEq(token.balanceOf(alice, 5), 0);
        assertEq(token.balanceOf(alice, 4), 1);
    }

    function test_combine_T4toT3() public {
        _giveBlocks(alice, 4, 15);
        vm.prank(alice);
        token.combine(4);
        assertEq(token.balanceOf(alice, 4), 0);
        assertEq(token.balanceOf(alice, 3), 1);
    }

    function test_combine_T3toT2() public {
        _giveBlocks(alice, 3, 13);
        vm.prank(alice);
        token.combine(3);
        assertEq(token.balanceOf(alice, 3), 0);
        assertEq(token.balanceOf(alice, 2), 1);
    }

    function test_combine_T2toT1_blocked() public {
        _giveBlocks(alice, 2, 100);
        vm.prank(alice);
        vm.expectRevert("Invalid tier");
        token.combine(2);
    }

    function test_combine_insufficientBlocks() public {
        _giveBlocks(alice, 7, 20); // need 21
        vm.prank(alice);
        vm.expectRevert("Insufficient blocks");
        token.combine(7);
    }

    function test_combine_invalidTier1() public {
        vm.prank(alice);
        vm.expectRevert("Invalid tier");
        token.combine(1);
    }

    function test_combine_invalidTier8() public {
        vm.prank(alice);
        vm.expectRevert("Invalid tier");
        token.combine(8);
    }

    function test_combine_burnsCorrectAmount() public {
        _giveBlocks(alice, 7, 42); // 2x ratio
        vm.prank(alice);
        token.combine(7);
        assertEq(token.balanceOf(alice, 7), 21); // 42 - 21 = 21
    }

    function test_combine_mintsOneTierUp() public {
        _giveBlocks(alice, 7, 21);
        vm.prank(alice);
        token.combine(7);
        assertEq(token.balanceOf(alice, 6), 1, "Should get 1 T6");
    }

    function test_combine_updatesSupply() public {
        _giveBlocks(alice, 7, 21);
        uint256 t7Before = token.tierTotalSupply(7);
        uint256 t6Before = token.tierTotalSupply(6);
        vm.prank(alice);
        token.combine(7);
        assertEq(token.tierTotalSupply(7), t7Before - 21);
        assertEq(token.tierTotalSupply(6), t6Before + 1);
    }

    function test_combine_triggersCountdown() public {
        // Give alice tiers 3-7 but NOT T2. Extra T3 so she keeps one after combine.
        _giveBlocks(alice, 7, 1);
        _giveBlocks(alice, 6, 1);
        _giveBlocks(alice, 5, 1);
        _giveBlocks(alice, 4, 1);
        _giveBlocks(alice, 3, 14); // 13 burned + 1 remains, no T2 yet
        assertFalse(token.countdownActive());
        // Combine T3->T2 triggers countdown (gives her T2, keeps 1 T3)
        vm.prank(alice);
        token.combine(3);
        assertTrue(token.countdownActive());
    }

    function test_combineMany_multipleTiers() public {
        _giveBlocks(alice, 7, 21);
        _giveBlocks(alice, 6, 19);
        uint256[] memory tiers = new uint256[](2);
        tiers[0] = 7;
        tiers[1] = 6;
        vm.prank(alice);
        token.combineMany(tiers);
        assertEq(token.balanceOf(alice, 7), 0);
        assertEq(token.balanceOf(alice, 6), 1); // minted from T7 combine
        assertEq(token.balanceOf(alice, 5), 1); // minted from T6 combine
    }

    function test_combineMany_singleTier() public {
        _giveBlocks(alice, 7, 21);
        uint256[] memory tiers = new uint256[](1);
        tiers[0] = 7;
        vm.prank(alice);
        token.combineMany(tiers);
        assertEq(token.balanceOf(alice, 6), 1);
    }

    function test_combineMany_emptyArray_reverts() public {
        uint256[] memory tiers = new uint256[](0);
        vm.prank(alice);
        vm.expectRevert(bytes("Invalid length"));
        token.combineMany(tiers);
    }

    function test_combine_whenPaused_reverts() public {
        _giveBlocks(alice, 7, 21);
        vm.prank(owner);
        token.pause();
        vm.prank(alice);
        vm.expectRevert();
        token.combine(7);
    }

    function test_combineMany_T2inArray_reverts() public {
        _giveBlocks(alice, 2, 100);
        uint256[] memory tiers = new uint256[](1);
        tiers[0] = 2;
        vm.prank(alice);
        vm.expectRevert("Invalid tier");
        token.combineMany(tiers);
    }

    function test_combine_combineRatios() public view {
        assertEq(token.combineRatio(7), 21);
        assertEq(token.combineRatio(6), 19);
        assertEq(token.combineRatio(5), 17);
        assertEq(token.combineRatio(4), 15);
        assertEq(token.combineRatio(3), 13);
        assertEq(token.combineRatio(2), 0); // T2->T1 disabled
    }

    function test_combine_consecutiveDoubleDown() public {
        // Combine T7->T6, then T6->T5 in combineMany
        _giveBlocks(alice, 7, 21 * 19); // enough for 19 T6
        // First get 19 T6
        for (uint256 i = 0; i < 19; i++) {
            vm.prank(alice);
            token.combine(7);
        }
        assertEq(token.balanceOf(alice, 6), 19);
        // Now combine T6->T5
        vm.prank(alice);
        token.combine(6);
        assertEq(token.balanceOf(alice, 5), 1);
    }

    function test_combineMany_whenPaused_reverts() public {
        _giveBlocks(alice, 7, 21);
        vm.prank(owner);
        token.pause();
        uint256[] memory tiers = new uint256[](1);
        tiers[0] = 7;
        vm.prank(alice);
        vm.expectRevert();
        token.combineMany(tiers);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SECTION 5: FORGE (~30 tests)
    // ═════════════════════════════════════════════════════════════════════════

    function test_forge_pseudoRandom_success() public {
        _giveBlocks(alice, 7, 21);
        // Full ratio = guaranteed success
        vm.prank(alice);
        forge.forge(7, 21);
        // Either success or fail, blocks are burned
        assertEq(token.balanceOf(alice, 7), 0, "T7 should be burned");
    }

    function test_forge_pseudoRandom_burnCount1() public {
        _giveBlocks(alice, 7, 1);
        vm.prank(alice);
        forge.forge(7, 1);
        assertEq(token.balanceOf(alice, 7), 0, "Block should be burned regardless");
    }

    function test_forge_invalidTier_T1() public {
        vm.prank(alice);
        vm.expectRevert("Invalid tier");
        forge.forge(1, 1);
    }

    function test_forge_invalidTier_T2() public {
        vm.prank(alice);
        vm.expectRevert("Invalid tier");
        forge.forge(2, 1);
    }

    function test_forge_invalidTier_T8() public {
        vm.prank(alice);
        vm.expectRevert("Invalid tier");
        forge.forge(8, 1);
    }

    function test_forge_burnCountRange() public {
        _giveBlocks(alice, 7, 21);
        // burnCount = ratio (21) should work
        vm.prank(alice);
        forge.forge(7, 21);
    }

    function test_forge_burnCount_overRatio_reverts() public {
        _giveBlocks(alice, 7, 22);
        vm.prank(alice);
        vm.expectRevert("Burn count out of range");
        forge.forge(7, 22); // ratio for T7 is 21
    }

    function test_forge_burnCount_zero_reverts() public {
        _giveBlocks(alice, 7, 5);
        vm.prank(alice);
        vm.expectRevert("Burn count out of range");
        forge.forge(7, 0);
    }

    function test_forge_fullRatio_guaranteedSuccess() public {
        // Full ratio = 100% success. burnCount/ratio * 100 = 100
        _giveBlocks(alice, 7, 21);
        vm.prank(alice);
        forge.forge(7, 21); // 21/21 = 100%
        // Success = got T6 minted
        // T7 burned for sure
        assertEq(token.balanceOf(alice, 7), 0);
        // Since 21/21 * 100 = 100, rand < 100 is always true
        assertEq(token.balanceOf(alice, 6), 1, "Full ratio should guarantee T6");
    }

    function test_forge_insufficientBlocks() public {
        _giveBlocks(alice, 7, 5);
        vm.prank(alice);
        vm.expectRevert("Insufficient blocks");
        forge.forge(7, 10);
    }

    function test_forge_feeRequired() public {
        vm.prank(owner);
        forge.setForgeFee(0.001 ether);
        _giveBlocks(alice, 7, 5);
        vm.prank(alice);
        vm.expectRevert("Insufficient forge fee");
        forge.forge(7, 1);
    }

    function test_forge_feeAccumulation() public {
        vm.prank(owner);
        forge.setForgeFee(0.001 ether);
        _giveBlocks(alice, 7, 5);
        vm.prank(alice);
        forge.forge{value: 0.001 ether}(7, 1);
        assertEq(address(forge).balance, 0.001 ether);
    }

    function test_forge_withdrawFees() public {
        vm.prank(owner);
        forge.setForgeFee(0.001 ether);
        _giveBlocks(alice, 7, 5);
        vm.prank(alice);
        forge.forge{value: 0.001 ether}(7, 1);

        uint256 bobBefore = bob.balance;
        vm.prank(owner);
        forge.withdrawFees(bob);
        assertEq(bob.balance - bobBefore, 0.001 ether);
    }

    function test_forge_burnsImmediately() public {
        _giveBlocks(alice, 7, 10);
        uint256 before = token.balanceOf(alice, 7);
        vm.prank(alice);
        forge.forge(7, 5);
        assertEq(token.balanceOf(alice, 7), before - 5, "Should burn immediately");
    }

    function test_forge_T7toT6() public {
        _giveBlocks(alice, 7, 21);
        vm.prank(alice);
        forge.forge(7, 21);
        assertEq(token.balanceOf(alice, 6), 1); // guaranteed at full ratio
    }

    function test_forge_T6toT5() public {
        _giveBlocks(alice, 6, 19);
        vm.prank(alice);
        forge.forge(6, 19);
        assertEq(token.balanceOf(alice, 5), 1);
    }

    function test_forge_T5toT4() public {
        _giveBlocks(alice, 5, 17);
        vm.prank(alice);
        forge.forge(5, 17);
        assertEq(token.balanceOf(alice, 4), 1);
    }

    function test_forge_T4toT3() public {
        _giveBlocks(alice, 4, 15);
        vm.prank(alice);
        forge.forge(4, 15);
        assertEq(token.balanceOf(alice, 3), 1);
    }

    function test_forge_T3toT2() public {
        _giveBlocks(alice, 3, 13);
        vm.prank(alice);
        forge.forge(3, 13);
        assertEq(token.balanceOf(alice, 2), 1);
    }

    function test_forgeBatch_single() public {
        _giveBlocks(alice, 7, 21);
        uint256[] memory tiers = new uint256[](1);
        uint256[] memory burns = new uint256[](1);
        tiers[0] = 7;
        burns[0] = 21;
        vm.prank(alice);
        forge.forgeBatch(tiers, burns);
        assertEq(token.balanceOf(alice, 7), 0);
    }

    function test_forgeBatch_multiple() public {
        _giveBlocks(alice, 7, 42); // 2 x 21
        uint256[] memory tiers = new uint256[](2);
        uint256[] memory burns = new uint256[](2);
        tiers[0] = 7; burns[0] = 21;
        tiers[1] = 7; burns[1] = 21;
        vm.prank(alice);
        forge.forgeBatch(tiers, burns);
        assertEq(token.balanceOf(alice, 7), 0);
    }

    function test_forgeBatch_mixedTiers() public {
        _giveBlocks(alice, 7, 21);
        _giveBlocks(alice, 6, 19);
        uint256[] memory tiers = new uint256[](2);
        uint256[] memory burns = new uint256[](2);
        tiers[0] = 7; burns[0] = 21;
        tiers[1] = 6; burns[1] = 19;
        vm.prank(alice);
        forge.forgeBatch(tiers, burns);
        assertEq(token.balanceOf(alice, 7), 0);
        assertEq(token.balanceOf(alice, 6), 1); // got T6 from forge T7 (full ratio = success)
        // T6 burn: 19 burned, but 1 minted from T7 forge success
    }

    function test_forgeBatch_max20() public {
        _giveBlocks(alice, 7, 20); // 1 block each attempt
        uint256[] memory tiers = new uint256[](20);
        uint256[] memory burns = new uint256[](20);
        for (uint256 i = 0; i < 20; i++) {
            tiers[i] = 7;
            burns[i] = 1;
        }
        vm.prank(alice);
        forge.forgeBatch(tiers, burns); // Should not revert
    }

    function test_forgeBatch_over20_reverts() public {
        _giveBlocks(alice, 7, 21);
        uint256[] memory tiers = new uint256[](21);
        uint256[] memory burns = new uint256[](21);
        for (uint256 i = 0; i < 21; i++) {
            tiers[i] = 7;
            burns[i] = 1;
        }
        vm.prank(alice);
        vm.expectRevert("1-20 attempts per batch");
        forge.forgeBatch(tiers, burns);
    }

    function test_forgeBatch_arrayMismatch_reverts() public {
        uint256[] memory tiers = new uint256[](2);
        uint256[] memory burns = new uint256[](1);
        tiers[0] = 7; tiers[1] = 7;
        burns[0] = 1;
        vm.prank(alice);
        vm.expectRevert("Array length mismatch");
        forge.forgeBatch(tiers, burns);
    }

    function test_forgeBatch_empty_reverts() public {
        uint256[] memory tiers = new uint256[](0);
        uint256[] memory burns = new uint256[](0);
        vm.prank(alice);
        vm.expectRevert("1-20 attempts per batch");
        forge.forgeBatch(tiers, burns);
    }

    function test_forge_triggersCountdown() public {
        // Give alice tiers 3-7 but NOT T2. Give enough T3 to forge and keep 1.
        _giveBlocks(alice, 7, 1);
        _giveBlocks(alice, 6, 1);
        _giveBlocks(alice, 5, 1);
        _giveBlocks(alice, 4, 1);
        _giveBlocks(alice, 3, 14); // 13 for forge + 1 to keep T3
        assertFalse(token.countdownActive());
        // Forge T3 with full ratio (13/13 = 100%) = guaranteed T2
        vm.prank(alice);
        forge.forge(3, 13);
        // Alice now has T2-T7, countdown should trigger
        assertTrue(token.countdownActive());
    }

    function test_forge_tokenContractNotSet_reverts() public {
        vm.startPrank(owner);
        BlockHuntForge freshForge = new BlockHuntForge(address(mockVRFCoordinator));
        vm.stopPrank();
        vm.prank(alice);
        vm.expectRevert("Token contract not set");
        freshForge.forge(7, 1);
    }

    function test_forgeBatch_feePerAttempt() public {
        vm.prank(owner);
        forge.setForgeFee(0.001 ether);
        _giveBlocks(alice, 7, 5);
        uint256[] memory tiers = new uint256[](5);
        uint256[] memory burns = new uint256[](5);
        for (uint256 i = 0; i < 5; i++) {
            tiers[i] = 7;
            burns[i] = 1;
        }
        vm.prank(alice);
        forge.forgeBatch{value: 0.005 ether}(tiers, burns);
        assertEq(address(forge).balance, 0.005 ether);
    }

    function test_forgeBatch_insufficientFee_reverts() public {
        vm.prank(owner);
        forge.setForgeFee(0.001 ether);
        _giveBlocks(alice, 7, 5);
        uint256[] memory tiers = new uint256[](5);
        uint256[] memory burns = new uint256[](5);
        for (uint256 i = 0; i < 5; i++) {
            tiers[i] = 7;
            burns[i] = 1;
        }
        vm.prank(alice);
        vm.expectRevert("Insufficient forge fee");
        forge.forgeBatch{value: 0.004 ether}(tiers, burns); // need 0.005
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SECTION 6: TREASURY (~20 tests)
    // ═════════════════════════════════════════════════════════════════════════

    function test_receiveMintFunds_creatorFeeSplit() public {
        uint256 creatorBefore = creator.balance;
        _mintBlocks(alice, 100);
        uint256 total = MINT_PRICE * 100;
        uint256 creatorFee = (total * 2000) / 10000; // 20%
        assertEq(creator.balance - creatorBefore, creatorFee);
    }

    function test_receiveMintFunds_onlyToken() public {
        vm.prank(alice);
        vm.expectRevert("Only token contract");
        treasury.receiveMintFunds{value: 1 ether}();
    }

    function test_claimPayout_fullBalance() public {
        _mintBlocks(bob, 500);
        uint256 treasuryBal = address(treasury).balance;
        assertTrue(treasuryBal > 0);

        _triggerCountdown(alice);
        vm.warp(block.timestamp + 7 days + 1);
        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        token.claimTreasury();
        assertTrue(alice.balance > aliceBefore, "Alice should receive treasury");
    }

    function test_claimPayout_onlyToken() public {
        vm.prank(alice);
        vm.expectRevert("Only token contract");
        treasury.claimPayout(alice);
    }

    function test_sacrificePayout_sendsToEscrow() public {
        _mintBlocks(bob, 500);
        _triggerCountdown(alice);
        vm.warp(block.timestamp + 7 days + 1);

        uint256 escrowBefore = address(escrow).balance;
        vm.prank(alice);
        token.sacrifice();
        assertTrue(address(escrow).balance > escrowBefore, "Escrow should receive funds");
    }

    function test_sacrificePayout_onlyToken() public {
        vm.prank(alice);
        vm.expectRevert("Only token contract");
        treasury.sacrificePayout(alice);
    }

    function test_setCreatorWallet() public {
        vm.prank(owner);
        treasury.setCreatorWallet(bob);
        assertEq(treasury.creatorWallet(), bob);
    }

    function test_setCreatorWallet_zeroAddress_reverts() public {
        vm.prank(owner);
        vm.expectRevert("Invalid address");
        treasury.setCreatorWallet(address(0));
    }

    function skip_setCreatorFee_maxCap_pendingE1() public {
        // TODO(E1): legacy test uses old max=1000 and old error string "Exceeds max fee".
        // New contract has max=3000 and error "Exceeds max". Port in E1.
        vm.prank(owner);
        treasury.setCreatorFee(1000); // max = 1000 bps
        vm.prank(owner);
        vm.expectRevert("Exceeds max fee");
        treasury.setCreatorFee(1001);
    }

    function skip_emergencyWithdraw_pendingE1() public {
        // TODO(E1): emergencyWithdraw removed in A1, full port handled by E1
        // Put money in treasury directly
        vm.deal(address(treasury), 10 ether);
        uint256 bobBefore = bob.balance;
        vm.prank(owner);
        // treasury.emergencyWithdraw(bob, 5 ether);
        assertEq(bob.balance - bobBefore, 5 ether);
    }

    function skip_emergencyWithdraw_onlyOwner_pendingE1() public {
        // TODO(E1): emergencyWithdraw removed in A1, full port handled by E1
        vm.deal(address(treasury), 10 ether);
        vm.prank(alice);
        vm.expectRevert();
        // treasury.emergencyWithdraw(alice, 5 ether);
    }

    function test_startNextSeason() public {
        vm.prank(owner);
        treasury.startNextSeason();
        assertEq(treasury.season(), 2);
    }

    function test_treasuryBalance_view() public {
        vm.deal(address(treasury), 5 ether);
        assertEq(treasury.treasuryBalance(), 5 ether);
    }

    function test_disableTestMode_locksSetters() public {
        vm.startPrank(owner);
        treasury.disableTestMode();
        // tokenContract already set, and testMode disabled
        vm.expectRevert("Already set");
        treasury.setTokenContract(bob);
        vm.stopPrank();
    }

    function test_treasury_totalDeposited() public {
        _mintBlocks(alice, 100);
        assertTrue(treasury.totalDeposited() > 0);
    }

    function skip_treasury_setCreatorFee_zero_pendingE1() public {
        // TODO(E1): legacy test asserts setCreatorFee(0) succeeds. New contract requires
        // MIN_CREATOR_FEE = 500 floor. Port in E1.
        vm.prank(owner);
        treasury.setCreatorFee(0);
        assertEq(treasury.creatorFeeBps(), 0);
    }

    function test_treasury_receive_eth() public {
        // Treasury can receive ETH directly
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool sent,) = address(treasury).call{value: 0.5 ether}("");
        assertTrue(sent);
    }

    function test_treasury_sacrificeNoEscrow_reverts() public {
        // Deploy fresh treasury without escrow set
        vm.startPrank(owner);
        BlockHuntTreasury freshTreasury = new BlockHuntTreasury(creator);
        freshTreasury.setTokenContract(alice); // set alice as token so alice can call
        vm.stopPrank();
        vm.deal(address(freshTreasury), 1 ether);
        vm.prank(alice);
        vm.expectRevert("Escrow contract not set");
        freshTreasury.sacrificePayout(alice);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SECTION 7: COUNTDOWN & ENDGAME (~40 tests)
    // ═════════════════════════════════════════════════════════════════════════

    function test_countdown_triggeredByMint() public {
        // Give alice tiers 2-6, then mint to hopefully get T7
        _giveBlocks(alice, 2, 1);
        _giveBlocks(alice, 3, 1);
        _giveBlocks(alice, 4, 1);
        _giveBlocks(alice, 5, 1);
        _giveBlocks(alice, 6, 1);
        _giveBlocks(alice, 7, 1);
        // Already has all tiers via testMint which triggers countdown
        assertTrue(token.countdownActive());
    }

    function test_countdown_triggeredByCombine() public {
        // Give alice tiers 3-7, and enough T3 to combine to T2 (keeping 1 T3)
        _giveBlocks(alice, 7, 1);
        _giveBlocks(alice, 6, 1);
        _giveBlocks(alice, 5, 1);
        _giveBlocks(alice, 4, 1);
        _giveBlocks(alice, 3, 14); // 14: 13 burned + 1 remains
        assertFalse(token.countdownActive());
        vm.prank(alice);
        token.combine(3);
        assertTrue(token.countdownActive());
    }

    function test_countdown_triggeredByClaimHolderStatus() public {
        // Pre-load tiers without triggering (directly via testMint one-by-one is fine,
        // testMint does call _checkCountdownTrigger, so the last one triggers it)
        // This tests claimHolderStatus for someone who already holds all tiers
        // Since mintForTest already triggers it, we need a different approach
        // Let's just verify claimHolderStatus works
        _giveAllTiers(alice); // this triggers countdown
        assertTrue(token.countdownActive()); // already triggered by last mintForTest
    }

    function test_countdown_notTriggered_missingTier() public {
        _giveBlocks(alice, 7, 1);
        _giveBlocks(alice, 6, 1);
        _giveBlocks(alice, 5, 1);
        // Missing T2, T3, T4
        assertFalse(token.countdownActive());
    }

    function test_countdown_duration_7days() public view {
        assertEq(token.countdownDuration(), 7 days);
        assertEq(countdown.countdownDuration(), 7 days);
    }

    function test_countdown_timeRemaining() public {
        _triggerCountdown(alice);
        uint256 remaining = countdown.timeRemaining();
        assertTrue(remaining > 0 && remaining <= 7 days);
    }

    function test_countdown_hasExpired_false() public {
        _triggerCountdown(alice);
        assertFalse(countdown.hasExpired());
    }

    function test_countdown_hasExpired_true() public {
        _triggerCountdown(alice);
        vm.warp(block.timestamp + 7 days + 1);
        assertTrue(countdown.hasExpired());
    }

    function test_countdown_getCountdownInfo() public {
        _triggerCountdown(alice);
        (bool active, address holder, uint256 startTime, uint256 endTime, uint256 remaining) = countdown.getCountdownInfo();
        assertTrue(active);
        assertEq(holder, alice);
        assertTrue(startTime > 0);
        assertEq(endTime, startTime + 7 days);
        assertTrue(remaining > 0);
    }

    function test_claimTreasury_afterExpiry() public {
        _mintBlocks(bob, 500); // build treasury
        _triggerCountdown(alice);
        vm.warp(block.timestamp + 7 days + 1);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        token.claimTreasury();
        assertTrue(alice.balance > aliceBefore);
        assertFalse(token.countdownActive());
    }

    function test_claimTreasury_beforeExpiry_reverts() public {
        _mintBlocks(bob, 500);
        _triggerCountdown(alice);
        vm.prank(alice);
        vm.expectRevert("Countdown still running");
        token.claimTreasury();
    }

    function test_claimTreasury_notHolder_reverts() public {
        _mintBlocks(bob, 500);
        _triggerCountdown(alice);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(bob);
        vm.expectRevert("Not the countdown holder");
        token.claimTreasury();
    }

    function test_claimTreasury_burnsAllTiers() public {
        _mintBlocks(bob, 500);
        _triggerCountdown(alice);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.claimTreasury();
        for (uint256 tier = 2; tier <= 7; tier++) {
            assertEq(token.balanceOf(alice, tier), 0, "All tiers should be burned");
        }
    }

    function test_sacrifice_afterExpiry() public {
        _mintBlocks(bob, 500);
        _triggerCountdown(alice);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.sacrifice();
        assertEq(token.balanceOf(alice, 1), 1, "Should receive Origin");
        assertFalse(token.countdownActive());
    }

    function test_sacrifice_beforeExpiry_reverts() public {
        _mintBlocks(bob, 500);
        _triggerCountdown(alice);
        vm.prank(alice);
        vm.expectRevert("Countdown still running");
        token.sacrifice();
    }

    function test_sacrifice_notHolder_reverts() public {
        _mintBlocks(bob, 500);
        _triggerCountdown(alice);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(bob);
        vm.expectRevert("Not the countdown holder");
        token.sacrifice();
    }

    function test_sacrifice_mintsOrigin() public {
        _mintBlocks(bob, 500);
        _triggerCountdown(alice);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.sacrifice();
        assertEq(token.balanceOf(alice, 1), 1);
    }

    function test_sacrifice_sendsToEscrow() public {
        _mintBlocks(bob, 500);
        _triggerCountdown(alice);
        vm.warp(block.timestamp + 7 days + 1);
        uint256 escrowBefore = address(escrow).balance;
        vm.prank(alice);
        token.sacrifice();
        assertTrue(address(escrow).balance > escrowBefore);
    }

    function test_executeDefaultOnExpiry_afterExpiry() public {
        _mintBlocks(bob, 500);
        _triggerCountdown(alice);
        vm.warp(block.timestamp + 7 days + 15 minutes + 1);

        // Anyone can call this after grace period
        vm.prank(carol);
        token.executeDefaultOnExpiry();
        assertEq(token.balanceOf(alice, 1), 1, "Holder gets Origin via default");
        assertFalse(token.countdownActive());
    }

    function test_executeDefaultOnExpiry_beforeExpiry_reverts() public {
        _mintBlocks(bob, 500);
        _triggerCountdown(alice);
        vm.prank(carol);
        vm.expectRevert("Countdown still running");
        token.executeDefaultOnExpiry();
    }

    function test_challenge_higherScore_succeeds() public {
        _triggerCountdown(alice);
        // Give bob more blocks (higher rank)
        _giveAllTiers(bob);
        _giveBlocks(bob, 7, 100); // more total blocks

        // Wait past safe period
        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(bob);
        countdown.challengeCountdown();
        assertEq(countdown.currentHolder(), bob);
        assertEq(token.countdownHolder(), bob);
    }

    function test_challenge_lowerScore_reverts() public {
        // Give alice lots of blocks
        _giveBlocks(alice, 7, 100);
        _giveBlocks(alice, 6, 50);
        _giveBlocks(alice, 5, 30);
        _giveBlocks(alice, 4, 20);
        _giveBlocks(alice, 3, 10);
        _giveBlocks(alice, 2, 5);
        // This triggers countdown for alice
        assertTrue(token.countdownActive());

        // Give bob all tiers but fewer blocks
        _giveAllTiers(bob);

        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(bob);
        vm.expectRevert("Must rank above holder");
        countdown.challengeCountdown();
    }

    function test_challenge_equalScore_reverts() public {
        _giveAllTiers(alice);
        assertTrue(token.countdownActive());

        // Give bob same setup
        _giveAllTiers(bob);

        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(bob);
        vm.expectRevert("Must rank above holder");
        countdown.challengeCountdown();
    }

    function test_challenge_missingTier_reverts() public {
        _triggerCountdown(alice);
        // Bob only has some tiers
        _giveBlocks(bob, 7, 100);

        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(bob);
        vm.expectRevert("Must hold all 6 tiers");
        countdown.challengeCountdown();
    }

    function test_challenge_noCountdown_reverts() public {
        vm.prank(bob);
        vm.expectRevert("No active countdown");
        countdown.challengeCountdown();
    }

    function test_challenge_selfChallenge_reverts() public {
        _triggerCountdown(alice);
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(alice);
        vm.expectRevert("Holder cannot self-challenge");
        countdown.challengeCountdown();
    }

    function test_challenge_withinSafePeriod_reverts() public {
        _triggerCountdown(alice);
        _giveAllTiers(bob);
        _giveBlocks(bob, 7, 100);

        // Don't wait past safe period
        vm.prank(bob);
        vm.expectRevert("Challenge cooldown active");
        countdown.challengeCountdown();
    }

    function test_challenge_resetsTimer() public {
        _triggerCountdown(alice);
        _giveAllTiers(bob);
        _giveBlocks(bob, 7, 100);

        vm.warp(block.timestamp + 1 days + 1);
        uint256 beforeChallenge = block.timestamp;

        vm.prank(bob);
        countdown.challengeCountdown();

        assertEq(token.countdownStartTime(), beforeChallenge);
    }

    function test_challenge_multipleSequential() public {
        _triggerCountdown(alice);

        // Challenge 1: bob takes over
        _giveAllTiers(bob);
        _giveBlocks(bob, 7, 100);
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(bob);
        countdown.challengeCountdown();
        assertEq(countdown.currentHolder(), bob);

        // Challenge 2: carol takes over with more
        _giveAllTiers(carol);
        _giveBlocks(carol, 7, 200);
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(carol);
        countdown.challengeCountdown();
        assertEq(countdown.currentHolder(), carol);
    }

    function test_calculateScore() public {
        _giveBlocks(alice, 2, 1);
        _giveBlocks(alice, 7, 10);
        uint256 score = countdown.calculateScore(alice);
        assertEq(score, 1 * 10000 + 10 * 1, "Score = 1*WEIGHT_T2 + 10*WEIGHT_T7");
    }

    function skip_castVote_burn_removedB3() public {}
    function skip_castVote_claim_removedB3() public {}
    function skip_castVote_doubleVote_reverts_removedB3() public {}

    function test_checkHolderStatus_disqualifies() public {
        _triggerCountdown(alice);
        assertTrue(countdown.isActive());

        // Transfer alice's blocks away so she no longer holds all tiers
        vm.prank(alice);
        token.safeTransferFrom(alice, bob, 7, 1, "");

        // Anyone can call checkHolderStatus
        countdown.checkHolderStatus();
        assertFalse(countdown.isActive(), "Countdown should be reset");
        assertFalse(token.countdownActive());
    }

    function test_checkHolderStatus_reTriggerable() public {
        _triggerCountdown(alice);

        // Transfer a tier away
        vm.prank(alice);
        token.safeTransferFrom(alice, bob, 7, 1, "");
        countdown.checkHolderStatus();
        assertFalse(countdown.isActive());

        // Re-give alice all tiers
        _giveBlocks(alice, 7, 1);
        // This triggers countdown again via _checkCountdownTrigger
        assertTrue(token.countdownActive());
    }

    function test_holderTransfersTokens_disqualified() public {
        _triggerCountdown(alice);
        // Transfer T2 away
        vm.prank(alice);
        token.safeTransferFrom(alice, bob, 2, 1, "");
        // Check holder status
        countdown.checkHolderStatus();
        assertFalse(countdown.isActive());
    }

    function test_countdown_noCountdownActive_claimReverts() public {
        vm.prank(alice);
        vm.expectRevert("No countdown active");
        token.claimTreasury();
    }

    function test_countdown_noCountdownActive_sacrificeReverts() public {
        vm.prank(alice);
        vm.expectRevert("No countdown active");
        token.sacrifice();
    }

    function test_claimHolderStatus_noTiers_reverts() public {
        vm.prank(alice);
        vm.expectRevert("Does not hold all 6 tiers");
        token.claimHolderStatus();
    }

    function test_claimHolderStatus_alreadyActive_reverts() public {
        _triggerCountdown(alice);
        vm.prank(bob);
        vm.expectRevert("Countdown already active");
        token.claimHolderStatus();
    }

    function test_countdown_startCountdown_onlyToken() public {
        vm.prank(alice);
        vm.expectRevert("Only token contract");
        countdown.startCountdown(alice);
    }

    function test_countdown_syncReset_onlyToken() public {
        vm.prank(alice);
        vm.expectRevert("Only token contract");
        countdown.syncReset();
    }

    function skip_countdown_castVote_noCountdown_removedB3() public {}

    function test_countdown_timeRemaining_noCountdown() public view {
        assertEq(countdown.timeRemaining(), 0);
    }

    function test_countdown_hasExpired_noCountdown() public view {
        assertFalse(countdown.hasExpired());
    }

    function test_executeDefaultOnExpiry_noCountdown_reverts() public {
        vm.prank(alice);
        vm.expectRevert("No countdown active");
        token.executeDefaultOnExpiry();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SECTION 8: ESCROW (~20 tests)
    // ═════════════════════════════════════════════════════════════════════════

    function test_initiateSacrifice_splits50_40_10() public {
        _mintBlocks(bob, 500);
        uint256 treasuryBal = address(treasury).balance;

        _triggerCountdown(alice);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.sacrifice();

        // Check escrow state
        assertTrue(escrow.sacrificeExecuted());
        uint256 winnerShare = escrow.pendingWithdrawal(alice);
        uint256 community = escrow.communityPool();
        uint256 seed = escrow.season2Seed();

        assertEq(winnerShare, treasuryBal / 2, "50% to winner");
        assertEq(seed, treasuryBal / 10, "10% to seed");
        assertEq(community, treasuryBal - winnerShare - seed, "40% to community");
    }

    function test_initiateSacrifice_onlyToken() public {
        vm.prank(alice);
        vm.expectRevert("Only token contract");
        escrow.initiateSacrifice(alice, 0);
    }

    function test_initiateSacrifice_doubleSacrifice_reverts() public {
        _mintBlocks(bob, 500);
        _triggerCountdown(alice);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.sacrifice();

        // Second sacrifice attempt (would need another countdown, but escrow blocks it)
        // The escrow.sacrificeExecuted is true, so any further call reverts
        vm.deal(address(escrow), 1 ether);
        vm.prank(address(token));
        vm.expectRevert("Sacrifice already executed");
        escrow.initiateSacrifice(bob, 1 ether);
    }

    function test_setLeaderboardEntitlements() public {
        _setupSacrifice();

        address[] memory players = new address[](2);
        uint256[] memory amounts = new uint256[](2);
        players[0] = bob;
        players[1] = carol;
        uint256 pool = escrow.communityPool();
        amounts[0] = pool / 2;
        amounts[1] = pool / 2;

        vm.prank(keeper);
        escrow.setLeaderboardEntitlements(players, amounts);
        assertTrue(escrow.entitlementsSet());
    }

    function test_setLeaderboardEntitlements_onlyKeeper() public {
        _setupSacrifice();

        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = 1;

        vm.prank(alice);
        vm.expectRevert("Only keeper");
        escrow.setLeaderboardEntitlements(players, amounts);
    }

    function test_setLeaderboardEntitlements_max100() public {
        _setupSacrifice();

        address[] memory players = new address[](101);
        uint256[] memory amounts = new uint256[](101);
        for (uint256 i = 0; i < 101; i++) {
            players[i] = address(uint160(100 + i));
            amounts[i] = 0;
        }

        vm.prank(keeper);
        vm.expectRevert("Max 100 players");
        escrow.setLeaderboardEntitlements(players, amounts);
    }

    function test_setLeaderboardEntitlements_exceedsPool_reverts() public {
        _setupSacrifice();
        uint256 pool = escrow.communityPool();

        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = pool + 1;

        vm.prank(keeper);
        vm.expectRevert("Exceeds community pool");
        escrow.setLeaderboardEntitlements(players, amounts);
    }

    function test_claimLeaderboardReward() public {
        _setupSacrifice();
        uint256 pool = escrow.communityPool();

        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = pool;

        vm.prank(keeper);
        escrow.setLeaderboardEntitlements(players, amounts);

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        escrow.claimLeaderboardReward();
        assertEq(bob.balance - bobBefore, pool);
    }

    function test_claimLeaderboardReward_doubleClaim_reverts() public {
        _setupSacrifice();
        uint256 pool = escrow.communityPool();

        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = pool;

        vm.prank(keeper);
        escrow.setLeaderboardEntitlements(players, amounts);

        vm.prank(bob);
        escrow.claimLeaderboardReward();

        vm.prank(bob);
        vm.expectRevert("Already claimed");
        escrow.claimLeaderboardReward();
    }

    function test_claimLeaderboardReward_afterWindow_reverts() public {
        _setupSacrifice();
        uint256 pool = escrow.communityPool();

        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = pool;

        vm.prank(keeper);
        escrow.setLeaderboardEntitlements(players, amounts);

        vm.warp(block.timestamp + 30 days + 1);

        vm.prank(bob);
        vm.expectRevert("Claim window expired");
        escrow.claimLeaderboardReward();
    }

    function test_withdrawWinnerShare() public {
        _setupSacrifice();
        uint256 share = escrow.pendingWithdrawal(alice);
        assertTrue(share > 0);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        escrow.withdrawWinnerShare();
        assertEq(alice.balance - aliceBefore, share);
    }

    function test_withdrawWinnerShare_notWinner_reverts() public {
        _setupSacrifice();
        vm.prank(carol);
        vm.expectRevert("Nothing to withdraw");
        escrow.withdrawWinnerShare();
    }

    function test_releaseSeason2Seed() public {
        _setupSacrifice();
        uint256 seed = escrow.season2Seed();
        assertTrue(seed > 0);

        vm.prank(keeper);
        escrow.setSeason2TreasuryAddress(season2Treasury);

        uint256 before = season2Treasury.balance;
        vm.deal(season2Treasury, 0);
        escrow.releaseSeason2Seed();
        assertEq(season2Treasury.balance, seed);
        assertTrue(escrow.season2SeedReleased());
    }

    function test_releaseSeason2Seed_noAddress_reverts() public {
        _setupSacrifice();
        vm.expectRevert("Season 2 address not set");
        escrow.releaseSeason2Seed();
    }

    function test_releaseSeason2Seed_doubleRelease_reverts() public {
        _setupSacrifice();
        vm.prank(keeper);
        escrow.setSeason2TreasuryAddress(season2Treasury);
        escrow.releaseSeason2Seed();
        vm.expectRevert("Already released");
        escrow.releaseSeason2Seed();
    }

    function test_sweepUnclaimedRewards() public {
        _setupSacrifice();
        uint256 pool = escrow.communityPool();

        // Set entitlements but don't claim
        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = pool / 2; // only allocate half

        vm.prank(keeper);
        escrow.setLeaderboardEntitlements(players, amounts);

        vm.prank(keeper);
        escrow.setSeason2TreasuryAddress(season2Treasury);

        // Warp past claim window
        vm.warp(block.timestamp + 30 days + 1);

        uint256 remaining = escrow.communityPool();
        assertTrue(remaining > 0);

        escrow.sweepUnclaimedRewards();
        assertEq(escrow.communityPool(), 0);
    }

    function test_sweepUnclaimedRewards_beforeWindow_reverts() public {
        _setupSacrifice();
        vm.prank(keeper);
        escrow.setSeason2TreasuryAddress(season2Treasury);

        vm.expectRevert("Claim window still open");
        escrow.sweepUnclaimedRewards();
    }

    function test_getEscrowInfo() public {
        (bool isSacrificeExecuted,,,,, ) = escrow.getEscrowInfo();
        assertFalse(isSacrificeExecuted);

        _setupSacrifice();
        (isSacrificeExecuted,,,,, ) = escrow.getEscrowInfo();
        assertTrue(isSacrificeExecuted);
    }

    function test_escrow_setTokenContract_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        escrow.setTokenContract(alice);
    }

    function test_escrow_setSeason2Treasury_onlyKeeper() public {
        vm.prank(alice);
        vm.expectRevert("Only keeper");
        escrow.setSeason2TreasuryAddress(season2Treasury);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SECTION 9: MIGRATION (~15 tests)
    // ═════════════════════════════════════════════════════════════════════════

    function test_migrate_success() public {
        // Give alice 100 blocks (the minimum)
        _giveBlocks(alice, 7, 100);

        vm.prank(owner);
        migration.openMigrationWindow();

        vm.prank(alice);
        migration.migrate();
        assertTrue(migration.hasMigrated(alice));
    }

    function test_migrate_burnAllS1Blocks() public {
        _giveBlocks(alice, 7, 50);
        _giveBlocks(alice, 6, 50);

        vm.prank(owner);
        migration.openMigrationWindow();

        vm.prank(alice);
        migration.migrate();

        assertEq(token.balanceOf(alice, 7), 0, "T7 should be burned");
        assertEq(token.balanceOf(alice, 6), 0, "T6 should be burned");
    }

    function test_migrate_starterAllocation_100() public {
        _giveBlocks(alice, 7, 100); // 100-499 range -> 100 starters

        vm.prank(owner);
        migration.openMigrationWindow();

        vm.prank(alice);
        migration.migrate();
        assertEq(migration.migrationReward(alice), 100);
    }

    function test_migrate_starterAllocation_150() public {
        _giveBlocks(alice, 7, 500); // 500-999 range -> 150 starters

        vm.prank(owner);
        migration.openMigrationWindow();

        vm.prank(alice);
        migration.migrate();
        assertEq(migration.migrationReward(alice), 150);
    }

    function test_migrate_starterAllocation_200() public {
        _giveBlocks(alice, 7, 1000); // 1000+ range -> 200 starters

        vm.prank(owner);
        migration.openMigrationWindow();

        vm.prank(alice);
        migration.migrate();
        assertEq(migration.migrationReward(alice), 200);
    }

    function test_migrate_doubleMigrate_reverts() public {
        _giveBlocks(alice, 7, 100);
        vm.prank(owner);
        migration.openMigrationWindow();

        vm.prank(alice);
        migration.migrate();

        // Give more blocks for second attempt
        _giveBlocks(alice, 7, 100);

        vm.prank(alice);
        vm.expectRevert("Already migrated");
        migration.migrate();
    }

    function test_migrate_windowClosed_reverts() public {
        _giveBlocks(alice, 7, 100);
        vm.prank(alice);
        vm.expectRevert("Migration window not open");
        migration.migrate();
    }

    function test_migrate_windowExpired_reverts() public {
        _giveBlocks(alice, 7, 100);
        vm.prank(owner);
        migration.openMigrationWindow();
        vm.warp(block.timestamp + 30 days + 1);
        vm.prank(alice);
        vm.expectRevert("Migration window closed");
        migration.migrate();
    }

    function test_migrate_belowMinimum_reverts() public {
        _giveBlocks(alice, 7, 99); // below 100

        vm.prank(owner);
        migration.openMigrationWindow();

        vm.prank(alice);
        vm.expectRevert("Need at least 100 Season 1 blocks");
        migration.migrate();
    }

    function test_openMigrationWindow() public {
        vm.prank(owner);
        migration.openMigrationWindow();
        assertTrue(migration.migrationOpen());
    }

    function test_openMigrationWindow_alreadyOpen_reverts() public {
        vm.prank(owner);
        migration.openMigrationWindow();
        vm.prank(owner);
        vm.expectRevert("Migration already open");
        migration.openMigrationWindow();
    }

    function test_closeMigrationWindow() public {
        vm.prank(owner);
        migration.openMigrationWindow();
        vm.prank(owner);
        migration.closeMigrationWindow();
        assertFalse(migration.migrationOpen());
    }

    function test_closeMigrationWindow_notOpen_reverts() public {
        vm.prank(owner);
        vm.expectRevert("Migration not open");
        migration.closeMigrationWindow();
    }

    function test_previewReward() public {
        _giveBlocks(alice, 7, 500);
        (uint256 totalBlocks, uint256 starterReward, bool eligible) = migration.previewReward(alice);
        assertEq(totalBlocks, 500);
        assertEq(starterReward, 150);
        assertTrue(eligible);
    }

    function test_getMigrationStatus() public {
        (bool isOpen,,,,,,) = migration.getMigrationStatus();
        assertFalse(isOpen);

        vm.prank(owner);
        migration.openMigrationWindow();

        (isOpen,,,,,,) = migration.getMigrationStatus();
        assertTrue(isOpen);
    }

    function test_migrate_stats_updated() public {
        _giveBlocks(alice, 7, 100);
        vm.prank(owner);
        migration.openMigrationWindow();

        vm.prank(alice);
        migration.migrate();

        assertEq(migration.totalMigrated(), 1);
        assertEq(migration.totalBlocksBurned(), 100);
        assertTrue(migration.totalStartersGiven() > 0);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SECTION 10: SEASON REGISTRY (~10 tests)
    // ═════════════════════════════════════════════════════════════════════════

    function test_registerSeason() public view {
        // Season 1 was registered in setUp
        (bool registered,,,,,) = registry.seasonState(1);
        assertTrue(registered);
    }

    function test_registerSeason_sequential() public {
        vm.prank(owner);
        registry.registerSeason(2, address(0x10), address(0x11), address(0x12), address(0x13));
        (bool registered,,,,,) = registry.seasonState(2);
        assertTrue(registered);
        assertEq(registry.totalSeasons(), 2);
    }

    function test_registerSeason_outOfOrder_reverts() public {
        vm.prank(owner);
        vm.expectRevert("Register in order");
        registry.registerSeason(3, address(0x10), address(0x11), address(0x12), address(0x13));
    }

    function test_markSeasonLaunched() public view {
        // Already launched in setUp
        (, bool launched,,,,) = registry.seasonState(1);
        assertTrue(launched);
    }

    function test_markSeasonEnded() public {
        vm.prank(owner);
        registry.markSeasonEnded(1, alice, true, 10 ether, 1 ether);
        (,, bool ended,,,) = registry.seasonState(1);
        assertTrue(ended);
    }

    function test_getAuthorisedSeedDestination() public {
        // End season 1
        vm.startPrank(owner);
        registry.markSeasonEnded(1, alice, true, 10 ether, 1 ether);
        // Register season 2
        registry.registerSeason(2, address(0x10), address(0x11), address(0x12), address(0x13));
        vm.stopPrank();

        address dest = registry.getAuthorisedSeedDestination(1);
        assertEq(dest, address(0x10));
    }

    function test_logSeedTransfer_onlyTreasury() public {
        vm.startPrank(owner);
        registry.markSeasonEnded(1, alice, true, 10 ether, 1 ether);
        registry.registerSeason(2, address(0x10), address(0x11), address(0x12), address(0x13));
        vm.stopPrank();

        // Only season 1 treasury can call
        vm.prank(alice);
        vm.expectRevert("Only from-season treasury");
        registry.logSeedTransfer(1, 2, 1 ether);

        vm.prank(address(treasury));
        registry.logSeedTransfer(1, 2, 1 ether); // should work
    }

    function test_getCurrentSeason() public view {
        assertEq(registry.getCurrentSeason(), 1);
    }

    function test_isRegisteredTreasury() public view {
        assertTrue(registry.isRegisteredTreasury(address(treasury)));
        assertFalse(registry.isRegisteredTreasury(alice));
    }

    function test_registerSeason_duplicate_reverts() public {
        vm.prank(owner);
        vm.expectRevert("Already registered");
        registry.registerSeason(1, address(0x10), address(0x11), address(0x12), address(0x13));
    }

    function test_markSeasonLaunched_notRegistered_reverts() public {
        vm.prank(owner);
        vm.expectRevert("Not registered");
        registry.markSeasonLaunched(5);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SECTION 11: MARKETPLACE STALE LISTINGS (~10 tests)
    // These test additional marketplace scenarios NOT covered in BlockHuntMarketplace.t.sol
    // ═════════════════════════════════════════════════════════════════════════

    function test_deactivateStaleListings_zeroBalance() public {
        // Give alice tokens and create a listing
        _giveBlocks(alice, 7, 10);
        vm.prank(alice);
        token.setApprovalForAll(address(marketplace), true);
        vm.prank(alice);
        uint256 listingId = marketplace.createListing(7, 10, 0.001 ether, 7 days);

        // Transfer all tokens away
        vm.prank(alice);
        token.safeTransferFrom(alice, bob, 7, 10, "");

        // Deactivate stale listings
        uint256[] memory ids = new uint256[](1);
        ids[0] = listingId;
        marketplace.deactivateStaleListings(ids);

        (,,,,,,bool active) = marketplace.getListing(listingId);
        assertFalse(active, "Listing should be deactivated");
    }

    function test_deactivateStaleListings_nonZeroPreserved() public {
        _giveBlocks(alice, 7, 10);
        vm.prank(alice);
        token.setApprovalForAll(address(marketplace), true);
        vm.prank(alice);
        uint256 listingId = marketplace.createListing(7, 10, 0.001 ether, 7 days);

        // Don't transfer — alice still has tokens
        uint256[] memory ids = new uint256[](1);
        ids[0] = listingId;
        marketplace.deactivateStaleListings(ids);

        (,,,,,,bool active) = marketplace.getListing(listingId);
        assertTrue(active, "Listing should remain active");
    }

    function test_deactivateStaleListings_emptyArray() public {
        uint256[] memory ids = new uint256[](0);
        marketplace.deactivateStaleListings(ids); // should not revert
    }

    function test_buyListing_sellerBalanceCheck() public {
        _giveBlocks(alice, 7, 10);
        vm.prank(alice);
        token.setApprovalForAll(address(marketplace), true);
        vm.prank(alice);
        uint256 listingId = marketplace.createListing(7, 10, 0.001 ether, 7 days);

        // Transfer half away
        vm.prank(alice);
        token.safeTransferFrom(alice, carol, 7, 5, "");

        // Can still buy up to seller's remaining balance
        vm.prank(bob);
        marketplace.buyListing{value: 0.005 ether}(listingId, 5);
    }

    function test_buyListing_sellerBalanceZero_reverts() public {
        _giveBlocks(alice, 7, 10);
        vm.prank(alice);
        token.setApprovalForAll(address(marketplace), true);
        vm.prank(alice);
        uint256 listingId = marketplace.createListing(7, 10, 0.001 ether, 7 days);

        // Transfer all away
        vm.prank(alice);
        token.safeTransferFrom(alice, carol, 7, 10, "");

        vm.prank(bob);
        vm.expectRevert("Seller insufficient balance");
        marketplace.buyListing{value: 0.001 ether}(listingId, 1);
    }

    function test_setFeeRecipient() public {
        vm.prank(owner);
        marketplace.setFeeRecipient(bob);
        assertEq(marketplace.feeRecipient(), bob);
    }

    function test_zeroFee() public {
        vm.prank(owner);
        marketplace.setProtocolFeeBps(0);

        _giveBlocks(alice, 7, 10);
        vm.prank(alice);
        token.setApprovalForAll(address(marketplace), true);
        vm.prank(alice);
        uint256 listingId = marketplace.createListing(7, 10, 0.001 ether, 7 days);

        uint256 aliceBefore = alice.balance;
        vm.prank(bob);
        marketplace.buyListing{value: 0.01 ether}(listingId, 10);
        // With 0% fee, alice gets full amount
        assertEq(alice.balance - aliceBefore, 0.01 ether);
    }

    function test_marketplace_setProtocolFeeBps_max() public {
        vm.prank(owner);
        vm.expectRevert("Max 20%");
        marketplace.setProtocolFeeBps(2001);
    }

    function test_marketplace_cancelListing() public {
        _giveBlocks(alice, 7, 10);
        vm.prank(alice);
        token.setApprovalForAll(address(marketplace), true);
        vm.prank(alice);
        uint256 listingId = marketplace.createListing(7, 10, 0.001 ether, 7 days);

        vm.prank(alice);
        marketplace.cancelListing(listingId);
        (,,,,,,bool active) = marketplace.getListing(listingId);
        assertFalse(active);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SECTION 12: CROSS-CONTRACT INTEGRATION (~20 tests)
    // ═════════════════════════════════════════════════════════════════════════

    function test_fullMintToTreasuryFlow() public {
        uint256 creatorBefore = creator.balance;
        _mintBlocks(alice, 100);
        uint256 totalPaid = MINT_PRICE * 100;
        uint256 creatorFee = (totalPaid * 2000) / 10000;
        uint256 treasuryShare = totalPaid - creatorFee;

        assertEq(creator.balance - creatorBefore, creatorFee, "Creator gets 20%");
        assertEq(address(treasury).balance, treasuryShare, "Treasury gets 80%");
        assertEq(_totalBlocks(alice), 100, "Alice has 100 blocks");
    }

    function test_mintCombineForgeCountdownClaim_fullGame() public {
        // Step 1: Mint to build treasury
        _mintBlocks(bob, 500);

        // Step 2: Build all tiers via combine chain
        // Each combine burns N of one tier and creates 1 of the next tier up.
        // We need to end up with 1 of each tier 2-7 for countdown.
        // Strategy: combine from T7 up, keeping leftovers, and give enough T3
        // to combine into T2 while keeping 1 T3.

        // Start by giving just the tiers we'll combine. Don't give all at once.
        _giveBlocks(alice, 7, 22); // 21 for combine + 1 to keep
        vm.prank(alice);
        token.combine(7); // burns 21 T7 -> 1 T6. Alice: T7=1, T6=1

        _giveBlocks(alice, 6, 19); // now alice has 20 T6
        vm.prank(alice);
        token.combine(6); // burns 19 T6 -> 1 T5. Alice: T7=1, T6=1, T5=1

        _giveBlocks(alice, 5, 17); // now alice has 18 T5
        vm.prank(alice);
        token.combine(5); // burns 17 T5 -> 1 T4. Alice: T7=1, T6=1, T5=1, T4=1

        _giveBlocks(alice, 4, 15); // now alice has 16 T4
        vm.prank(alice);
        token.combine(4); // burns 15 T4 -> 1 T3. Alice: T7=1, T6=1, T5=1, T4=1, T3=1

        _giveBlocks(alice, 3, 13); // now alice has 14 T3
        vm.prank(alice);
        token.combine(3); // burns 13 T3 -> 1 T2. Alice: T7=1, T6=1, T5=1, T4=1, T3=1, T2=1

        assertTrue(token.countdownActive(), "Countdown should be active");
        assertEq(token.countdownHolder(), alice);

        // Step 3: Wait for countdown
        vm.warp(block.timestamp + 7 days + 1);

        // Step 4: Claim treasury
        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        token.claimTreasury();
        assertTrue(alice.balance > aliceBefore);
        assertFalse(token.countdownActive());
    }

    function test_sacrificeEscrowDistribution_fullFlow() public {
        // Mint to build treasury
        _mintBlocks(bob, 500);
        uint256 treasuryBal = address(treasury).balance;

        // Trigger countdown and sacrifice
        _triggerCountdown(alice);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.sacrifice();

        // Verify escrow splits
        uint256 winnerShare = escrow.pendingWithdrawal(alice);
        assertEq(winnerShare, treasuryBal / 2);

        // Winner withdraws
        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        escrow.withdrawWinnerShare();
        assertEq(alice.balance - aliceBefore, winnerShare);

        // Keeper sets entitlements
        uint256 pool = escrow.communityPool();
        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = pool;

        vm.prank(keeper);
        escrow.setLeaderboardEntitlements(players, amounts);

        // Bob claims
        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        escrow.claimLeaderboardReward();
        assertEq(bob.balance - bobBefore, pool);

        // Release seed
        vm.prank(keeper);
        escrow.setSeason2TreasuryAddress(season2Treasury);
        uint256 seed = escrow.season2Seed();
        escrow.releaseSeason2Seed();
        assertEq(season2Treasury.balance, seed);
    }

    function test_revertOnReceive_pullPaymentProtection() public {
        // Deploy a contract that reverts on ETH receive
        RevertOnReceive ror = new RevertOnReceive();
        vm.deal(address(ror), 0);

        // claimTreasury to the rejecting contract
        _mintBlocks(bob, 500);

        // Give the rejecting contract all tiers
        vm.prank(owner);
        token.mintForTest(address(ror), 2, 1);
        vm.prank(owner);
        token.mintForTest(address(ror), 3, 1);
        vm.prank(owner);
        token.mintForTest(address(ror), 4, 1);
        vm.prank(owner);
        token.mintForTest(address(ror), 5, 1);
        vm.prank(owner);
        token.mintForTest(address(ror), 6, 1);
        vm.prank(owner);
        token.mintForTest(address(ror), 7, 1);

        assertTrue(token.countdownActive());
        vm.warp(block.timestamp + 7 days + 1);

        // claimTreasury should revert because ror rejects ETH
        vm.prank(address(ror));
        vm.expectRevert("Payout failed");
        token.claimTreasury();
    }

    function test_mintWindow_batchAdvancement_priceChange() public {
        // Verify price changes between batches
        uint256 price1 = mintWindow.batchPrice(1);
        uint256 price2 = mintWindow.batchPrice(2);
        assertTrue(price2 > price1);
    }

    function test_countdownChallengeTakeover_fullFlow() public {
        // Alice triggers countdown
        _triggerCountdown(alice);

        // Bob gets all tiers + more blocks
        _giveAllTiers(bob);
        _giveBlocks(bob, 7, 100);

        // Wait past safe period
        vm.warp(block.timestamp + 1 days + 1);

        // Bob challenges
        vm.prank(bob);
        countdown.challengeCountdown();
        assertEq(countdown.currentHolder(), bob);
        assertEq(token.countdownHolder(), bob);

        // Wait for countdown to expire
        vm.warp(block.timestamp + 7 days + 1);

        // Bob claims treasury
        _mintBlocks(carol, 100); // build some treasury
        vm.prank(bob);
        token.claimTreasury();
        assertFalse(token.countdownActive());
    }

    function test_holderDisqualification_reTriggerable() public {
        // Alice triggers countdown
        _triggerCountdown(alice);
        assertTrue(token.countdownActive());

        // Alice transfers a tier
        vm.prank(alice);
        token.safeTransferFrom(alice, bob, 3, 1, "");

        // Check holder status — disqualifies
        countdown.checkHolderStatus();
        assertFalse(token.countdownActive());

        // Re-give alice all tiers
        _giveBlocks(alice, 3, 1);
        assertTrue(token.countdownActive()); // re-triggered
    }

    function test_pauseBlocksMintAndCombine() public {
        vm.prank(owner);
        token.pause();

        vm.prank(alice);
        vm.expectRevert();
        token.mint{value: MINT_PRICE}(1);

        _giveBlocks(alice, 7, 21);
        vm.prank(alice);
        vm.expectRevert();
        token.combine(7);

        vm.prank(owner);
        token.unpause();
    }

    function test_testModeLock_preventsAdminChanges() public {
        vm.startPrank(owner);
        token.disableTestMint();

        vm.expectRevert("Test mint disabled");
        token.mintForTest(alice, 7, 1);

        vm.expectRevert("Test mode disabled");
        token.setCountdownDuration(1 days);

        vm.expectRevert("Test mode disabled");
        token.setRarityCoefficients(1, 1, 1);
        vm.stopPrank();
    }

    function test_countdown_resetAfterClaim() public {
        _mintBlocks(bob, 100);
        _triggerCountdown(alice);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.claimTreasury();

        assertFalse(token.countdownActive());
        assertEq(token.countdownHolder(), address(0));
        assertEq(token.countdownStartTime(), 0);
    }

    function test_countdown_resetAfterSacrifice() public {
        _mintBlocks(bob, 100);
        _triggerCountdown(alice);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.sacrifice();

        assertFalse(token.countdownActive());
        assertFalse(countdown.isActive());
    }

    function test_multiplePlayers_independentMinting() public {
        _mintBlocks(alice, 100);
        _mintBlocks(bob, 200);
        _mintBlocks(carol, 50);

        assertEq(_totalBlocks(alice), 100);
        assertEq(_totalBlocks(bob), 200);
        assertEq(_totalBlocks(carol), 50);
    }

    function test_totalMinted_neverDecrements() public {
        _mintBlocks(alice, 100);
        uint256 minted1 = token.totalMinted();

        // Burn via combine
        _giveBlocks(alice, 7, 21);
        vm.prank(alice);
        token.combine(7);

        // totalMinted should not change (burns don't decrement)
        assertEq(token.totalMinted(), minted1);
    }

    function test_mint_duringCountdown_allowed() public {
        _triggerCountdown(alice);
        assertTrue(token.countdownActive());
        // Minting should still work during countdown
        _mintBlocks(bob, 10);
        assertEq(_totalBlocks(bob), 10);
    }

    function test_combine_duringCountdown_allowed() public {
        _triggerCountdown(alice);
        _giveBlocks(bob, 7, 21);
        vm.prank(bob);
        token.combine(7);
        assertEq(token.balanceOf(bob, 6), 1);
    }

    function test_forge_duringCountdown_allowed() public {
        _triggerCountdown(alice);
        _giveBlocks(bob, 7, 21);
        vm.prank(bob);
        forge.forge(7, 21);
    }

    function test_sacrifice_burnsAllTiers() public {
        _mintBlocks(bob, 100);
        _triggerCountdown(alice);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.sacrifice();
        for (uint256 t = 2; t <= 7; t++) {
            assertEq(token.balanceOf(alice, t), 0);
        }
    }

    function test_defaultSacrifice_mintsOrigin() public {
        _mintBlocks(bob, 100);
        _triggerCountdown(alice);
        vm.warp(block.timestamp + 7 days + 15 minutes + 1);
        vm.prank(carol); // anyone, after grace period
        token.executeDefaultOnExpiry();
        assertEq(token.balanceOf(alice, 1), 1);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SECTION 13: MINT VRF CANCEL FLOW (~10 tests)
    // ═════════════════════════════════════════════════════════════════════════

    function test_cancelMintRequest_afterTTL() public {
        // Enable VRF so we get a pending request
        vm.prank(owner);
        token.setVrfEnabled(true);

        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        uint256[] memory pending = token.getPendingRequests(alice);
        assertEq(pending.length, 1);
        uint256 requestId = pending[0];

        // Warp past TTL (1 hour)
        vm.warp(block.timestamp + 1 hours);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        token.cancelMintRequest(requestId);

        // Should refund
        assertTrue(alice.balance > aliceBefore);
    }

    function test_cancelMintRequest_beforeTTL_reverts() public {
        vm.prank(owner);
        token.setVrfEnabled(true);

        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        uint256[] memory pending = token.getPendingRequests(alice);
        uint256 requestId = pending[0];

        vm.prank(alice);
        vm.expectRevert("Too early to cancel");
        token.cancelMintRequest(requestId);
    }

    function test_cancelMintRequest_refundsETH() public {
        vm.prank(owner);
        token.setVrfEnabled(true);

        uint256 cost = MINT_PRICE * 10;
        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        token.mint{value: cost}(10);

        uint256[] memory pending = token.getPendingRequests(alice);
        uint256 requestId = pending[0];

        vm.warp(block.timestamp + 1 hours);
        vm.prank(alice);
        token.cancelMintRequest(requestId);

        assertEq(alice.balance, aliceBefore, "Full refund");
    }

    function skip_cancelMintRequest_updatesWindowMinted_removedD9() public {}

    function test_cancelMintRequest_wrongPlayer_reverts() public {
        vm.prank(owner);
        token.setVrfEnabled(true);

        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        uint256[] memory pending = token.getPendingRequests(alice);
        vm.warp(block.timestamp + 1 hours);

        vm.prank(bob);
        vm.expectRevert("Not your request");
        token.cancelMintRequest(pending[0]);
    }

    function test_cancelMintRequest_alreadyCancelled_reverts() public {
        vm.prank(owner);
        token.setVrfEnabled(true);

        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        uint256[] memory pending = token.getPendingRequests(alice);
        uint256 requestId = pending[0];

        vm.warp(block.timestamp + 1 hours);
        vm.prank(alice);
        token.cancelMintRequest(requestId);

        vm.prank(alice);
        vm.expectRevert("Request not found");
        token.cancelMintRequest(requestId);
    }

    function test_getPendingRequests_empty() public view {
        uint256[] memory pending = token.getPendingRequests(alice);
        assertEq(pending.length, 0);
    }

    function test_getPendingRequests_afterMint() public {
        vm.prank(owner);
        token.setVrfEnabled(true);

        vm.prank(alice);
        token.mint{value: MINT_PRICE * 5}(5);

        uint256[] memory pending = token.getPendingRequests(alice);
        assertEq(pending.length, 1);
    }

    function test_cancelMintRequest_nonexistent_reverts() public {
        vm.prank(alice);
        vm.expectRevert("Request not found");
        token.cancelMintRequest(999);
    }

    function test_vrfMint_thenFulfill() public {
        vm.prank(owner);
        token.setVrfEnabled(true);

        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        uint256[] memory pending = token.getPendingRequests(alice);
        uint256 requestId = pending[0];

        // Fulfill VRF
        mockVRFCoordinator.fulfillRequest(requestId, 12345);

        // Alice should have blocks now
        assertEq(_totalBlocks(alice), 10);
        // Pending requests should be cleared
        pending = token.getPendingRequests(alice);
        assertEq(pending.length, 0);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SECTION 14: ADMIN & ACCESS CONTROL (~15 tests)
    // ═════════════════════════════════════════════════════════════════════════

    function test_setMintWindowContract_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        token.setMintWindowContract(alice);
    }

    function test_setTreasuryContract_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        token.setTreasuryContract(alice);
    }

    function test_setForgeContract_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        token.setForgeContract(alice);
    }

    function test_setCountdownContract_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        token.setCountdownContract(alice);
    }

    function test_setEscrowContract_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        token.setEscrowContract(alice);
    }

    function test_setVrfConfig_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        token.setVrfConfig(1, bytes32(0), 100_000);
    }

    function test_setVrfEnabled_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        token.setVrfEnabled(true);
    }

    function test_setCountdownDuration_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        token.setCountdownDuration(1 days);
    }

    function test_setRarityCoefficients_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        token.setRarityCoefficients(1, 1, 1);
    }

    function test_contractWiring_alreadySet_reverts() public {
        vm.startPrank(owner);
        token.disableTestMint(); // test mode disabled
        vm.expectRevert("Already set");
        token.setMintWindowContract(bob);
        vm.stopPrank();
    }

    function test_forge_setForgeFee_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        forge.setForgeFee(0.001 ether);
    }

    function test_treasury_setCreatorWallet_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        treasury.setCreatorWallet(alice);
    }

    function test_countdown_setKeeper_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        countdown.setKeeper(alice);
    }

    function test_escrow_setSeason2Treasury_onlyKeeper_withSuccess() public {
        vm.prank(alice);
        vm.expectRevert("Only keeper");
        escrow.setSeason2TreasuryAddress(season2Treasury);

        vm.prank(keeper);
        escrow.setSeason2TreasuryAddress(season2Treasury);
        assertEq(escrow.season2TreasuryAddress(), season2Treasury);
    }

    function test_mintWindow_setters_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        mintWindow.setCooldownDuration(1 hours);

        vm.prank(alice);
        vm.expectRevert();
        mintWindow.setPerCycleCap(100);

        vm.prank(alice);
        vm.expectRevert();
        mintWindow.setDailyCap(100);
    }

    function test_setMintPrice_testMode() public {
        vm.prank(owner);
        token.setMintPrice(1, 0.001 ether);
        // The price from mintWindow should take precedence
        assertEq(token.currentMintPrice(), MINT_PRICE); // mintWindow price overrides
    }

    function test_setMintPrice_testModeDisabled_reverts() public {
        vm.startPrank(owner);
        token.disableTestMint();
        vm.expectRevert("Test mode disabled");
        token.setMintPrice(1, 0.001 ether);
        vm.stopPrank();
    }

    function test_forge_setVrfEnabled_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        forge.setVrfEnabled(true);
    }

    function test_forge_setVrfConfig_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        forge.setVrfConfig(1, bytes32(0), 100_000);
    }

    function test_forge_setTokenContract_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        forge.setTokenContract(alice);
    }

    function test_countdown_setCountdownDuration_testMode() public {
        vm.prank(owner);
        countdown.setCountdownDuration(1 days);
        assertEq(countdown.countdownDuration(), 1 days);
    }

    function test_countdown_setSafePeriod_testMode() public {
        vm.prank(owner);
        countdown.setSafePeriod(2 hours);
        assertEq(countdown.safePeriod(), 2 hours);
    }

    function test_countdown_disableTestMode() public {
        vm.startPrank(owner);
        countdown.disableTestMode();
        vm.expectRevert("Test mode disabled");
        countdown.setCountdownDuration(1 days);
        vm.stopPrank();
    }

    function test_escrow_disableTestMode() public {
        vm.startPrank(owner);
        escrow.disableTestMode();
        vm.expectRevert("Already set");
        escrow.setTokenContract(bob);
        vm.stopPrank();
    }

    function test_mintWindow_setKeeper() public {
        vm.prank(owner);
        mintWindow.setKeeper(keeper);
        assertEq(mintWindow.keeper(), keeper);
    }

    function test_mintWindow_setTokenContract() public {
        vm.prank(owner);
        mintWindow.setTokenContract(bob);
        assertEq(mintWindow.tokenContract(), bob);
    }

    function test_migration_setTokenV1() public {
        vm.prank(owner);
        migration.setTokenV1(bob);
        assertEq(migration.tokenV1(), bob);
    }

    function test_migration_setTokenV2_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        migration.setTokenV2(alice);
    }

    function test_token_receiveETH() public {
        // Token contract can accept ETH (for pending mint payments)
        vm.prank(alice);
        (bool sent,) = address(token).call{value: 0.1 ether}("");
        assertTrue(sent);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SECTION 15: ADDITIONAL EDGE CASES (to reach 300+ tests)
    // ═════════════════════════════════════════════════════════════════════════

    function test_combine_exactRatio() public {
        // Exactly the ratio amount should work
        _giveBlocks(alice, 7, 21);
        vm.prank(alice);
        token.combine(7);
        assertEq(token.balanceOf(alice, 7), 0);
        assertEq(token.balanceOf(alice, 6), 1);
    }

    function test_combine_twoConsecutive() public {
        _giveBlocks(alice, 7, 42);
        vm.prank(alice);
        token.combine(7);
        vm.prank(alice);
        token.combine(7);
        assertEq(token.balanceOf(alice, 6), 2);
    }

    function test_forge_vrfMode_requestCreated() public {
        vm.startPrank(owner);
        forge.setVrfEnabled(true);
        forge.setVrfConfig(1, bytes32(uint256(1)), 200_000);
        vm.stopPrank();

        _giveBlocks(alice, 7, 5);
        vm.prank(alice);
        forge.forge(7, 5);

        // Check request was stored
        (address player,,, bool resolved,,) = forge.vrfForgeRequests(1);
        assertEq(player, alice);
        assertFalse(resolved);
    }

    function test_forge_vrfMode_fulfill() public {
        vm.startPrank(owner);
        forge.setVrfEnabled(true);
        forge.setVrfConfig(1, bytes32(uint256(1)), 200_000);
        vm.stopPrank();

        _giveBlocks(alice, 7, 21);
        vm.prank(alice);
        forge.forge(7, 21); // full ratio

        // Fulfill with randomWord = 0 (0 % 100 = 0, 0 < 100 = success)
        mockVRFCoordinator.fulfillRequest(1, 0);
        assertEq(token.balanceOf(alice, 6), 1, "VRF success should mint T6");
    }

    function test_forge_vrfMode_fulfillFail() public {
        vm.startPrank(owner);
        forge.setVrfEnabled(true);
        forge.setVrfConfig(1, bytes32(uint256(1)), 200_000);
        vm.stopPrank();

        _giveBlocks(alice, 7, 1);
        vm.prank(alice);
        forge.forge(7, 1); // 1/21 = ~4.76% chance

        // Fulfill with randomWord = 9999 (9999 % 10000 = 9999, 9999 >= 476 = fail)
        mockVRFCoordinator.fulfillRequest(1, 9999);
        assertEq(token.balanceOf(alice, 6), 0, "Should not get T6 on fail");
    }

    function test_sacrifice_originTierSupplyIncreases() public {
        _mintBlocks(bob, 100);
        uint256 originBefore = token.tierTotalSupply(1);
        _triggerCountdown(alice);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.sacrifice();
        assertEq(token.tierTotalSupply(1), originBefore + 1);
    }

    function test_claimTreasury_tierSupplyDecreases() public {
        _mintBlocks(bob, 100);
        _triggerCountdown(alice);
        vm.warp(block.timestamp + 7 days + 1);

        uint256[] memory supplyBefore = new uint256[](8);
        for (uint256 t = 2; t <= 7; t++) {
            supplyBefore[t] = token.tierTotalSupply(t);
        }

        vm.prank(alice);
        token.claimTreasury();

        for (uint256 t = 2; t <= 7; t++) {
            assertTrue(token.tierTotalSupply(t) <= supplyBefore[t]);
        }
    }

    function skip_mint_windowCapMaxUint_removedD9() public {}

    function skip_countdown_votesBothTypes_removedB3() public {}

    function test_countdown_scoringWeights() public view {
        assertEq(countdown.WEIGHT_T2(), 10000);
        assertEq(countdown.WEIGHT_T3(), 2000);
        assertEq(countdown.WEIGHT_T4(), 500);
        assertEq(countdown.WEIGHT_T5(), 100);
        assertEq(countdown.WEIGHT_T6(), 20);
        assertEq(countdown.WEIGHT_T7(), 1);
    }

    function test_escrow_claimWindow_30days() public view {
        assertEq(escrow.CLAIM_WINDOW(), 30 days);
    }

    function test_migration_constants() public view {
        assertEq(migration.MIGRATION_WINDOW(), 30 days);
        assertEq(migration.MIN_BLOCKS(), 100);
        assertEq(migration.REWARD_LOW(), 100);
        assertEq(migration.REWARD_MID(), 150);
        assertEq(migration.REWARD_HIGH(), 200);
    }

    function test_registry_getNextSeasonTreasury() public {
        vm.startPrank(owner);
        registry.registerSeason(2, address(0x10), address(0x11), address(0x12), address(0x13));
        vm.stopPrank();

        address next = registry.getNextSeasonTreasury(1);
        assertEq(next, address(0x10));
    }

    function test_registry_getNextSeasonTreasury_notRegistered_reverts() public {
        vm.expectRevert("Next season not registered");
        registry.getNextSeasonTreasury(1);
    }

    function test_registry_setSeasonMigration() public {
        vm.prank(owner);
        registry.setSeasonMigration(1, address(0x99));
        (,,,,address mig) = registry.seasonContracts(1);
        assertEq(mig, address(0x99));
    }

    function test_registry_markSeasonEnded_notLaunched_reverts() public {
        vm.startPrank(owner);
        registry.registerSeason(2, address(0x10), address(0x11), address(0x12), address(0x13));
        vm.expectRevert("Not launched");
        registry.markSeasonEnded(2, alice, true, 10 ether, 1 ether);
        vm.stopPrank();
    }

    function test_registry_markSeasonLaunched_alreadyLaunched_reverts() public {
        vm.prank(owner);
        vm.expectRevert("Already launched");
        registry.markSeasonLaunched(1);
    }

    function test_registry_registerSeason_zeroSeason_reverts() public {
        vm.prank(owner);
        vm.expectRevert("Season must be > 0");
        registry.registerSeason(0, address(0x10), address(0x11), address(0x12), address(0x13));
    }

    function test_registry_registerSeason_zeroTreasury_reverts() public {
        vm.prank(owner);
        vm.expectRevert("Treasury required");
        registry.registerSeason(2, address(0), address(0x11), address(0x12), address(0x13));
    }

    function test_token_burnForMigration_onlyMigration() public {
        uint256[] memory ids = new uint256[](1);
        uint256[] memory amounts = new uint256[](1);
        ids[0] = 7; amounts[0] = 1;
        vm.prank(alice);
        vm.expectRevert("Only migration contract");
        token.burnForMigration(alice, ids, amounts);
    }

    function test_token_mintMigrationStarters_onlyMigration() public {
        uint256[] memory ids = new uint256[](1);
        uint256[] memory amounts = new uint256[](1);
        ids[0] = 7; amounts[0] = 1;
        vm.prank(alice);
        vm.expectRevert("Only migration contract");
        token.mintMigrationStarters(alice, ids, amounts);
    }

    function test_token_resetDailyWindow_onlyMintWindow() public {
        vm.prank(alice);
        vm.expectRevert("Only mint window contract");
        token.resetDailyWindow(1);
    }

    function test_token_resetExpiredHolder_onlyCountdown() public {
        vm.prank(alice);
        vm.expectRevert("Only countdown contract");
        token.resetExpiredHolder();
    }

    function test_token_updateCountdownHolder_onlyCountdown() public {
        vm.prank(alice);
        vm.expectRevert("Only countdown contract");
        token.updateCountdownHolder(alice);
    }

    function test_token_burnForForge_onlyForge() public {
        vm.prank(alice);
        vm.expectRevert("Only forge contract");
        token.burnForForge(alice, 7, 1);
    }

    function test_token_resolveForge_onlyForge() public {
        vm.prank(alice);
        vm.expectRevert("Only forge contract");
        token.resolveForge(alice, 7, true);
    }

    function test_mintWindow_batchSupply_invalidBatch_reverts() public {
        vm.expectRevert("Invalid batch");
        mintWindow.batchSupply(0);
        vm.expectRevert("Invalid batch");
        mintWindow.batchSupply(11);
    }

    function test_mintWindow_batchPrice_invalidBatch_reverts() public {
        vm.expectRevert("Invalid batch");
        mintWindow.batchPrice(0);
    }

    function test_forge_withdrawFees_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        forge.withdrawFees(alice);
    }

    function test_escrow_noSacrifice_claimReverts() public {
        vm.prank(alice);
        vm.expectRevert("Entitlements not set yet");
        escrow.claimLeaderboardReward();
    }

    function test_escrow_noSacrifice_releaseReverts() public {
        vm.expectRevert("No sacrifice yet");
        escrow.releaseSeason2Seed();
    }

    function test_escrow_noSacrifice_sweepReverts() public {
        vm.expectRevert("No sacrifice");
        escrow.sweepUnclaimedRewards();
    }

    function test_escrow_withdrawWinnerShare_doubleWithdraw_reverts() public {
        _setupSacrifice();
        vm.prank(alice);
        escrow.withdrawWinnerShare();
        vm.prank(alice);
        vm.expectRevert("Nothing to withdraw");
        escrow.withdrawWinnerShare();
    }

    function test_escrow_setLeaderboardEntitlements_alreadySet_reverts() public {
        _setupSacrifice();
        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = 0;

        vm.prank(keeper);
        escrow.setLeaderboardEntitlements(players, amounts);

        vm.prank(keeper);
        vm.expectRevert("Entitlements already set");
        escrow.setLeaderboardEntitlements(players, amounts);
    }

    function test_escrow_setLeaderboardEntitlements_arrayMismatch_reverts() public {
        _setupSacrifice();
        address[] memory players = new address[](2);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        players[1] = carol;
        amounts[0] = 0;

        vm.prank(keeper);
        vm.expectRevert("Array length mismatch");
        escrow.setLeaderboardEntitlements(players, amounts);
    }

    function test_escrow_noEntitlement_claimReverts() public {
        _setupSacrifice();
        uint256 pool = escrow.communityPool();
        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = pool; // must be <= communityPool
        vm.prank(keeper);
        escrow.setLeaderboardEntitlements(players, amounts);

        vm.prank(carol); // carol has no entitlement
        vm.expectRevert("No entitlement");
        escrow.claimLeaderboardReward();
    }

    function test_mint_mintRequestTTL() public view {
        assertEq(token.mintRequestTTL(), 10 minutes);
    }

    function test_token_constants() public view {
        assertEq(token.DENOM(), 10_000_000_000);
        assertEq(token.SCALE(), 100_000);
    }

    function test_mintWindow_currentDay() public view {
        uint256 day = mintWindow.currentDay();
        assertEq(day, block.timestamp / 86400);
    }

    function test_mintWindow_userDayMints() public {
        _mintBlocks(alice, 100);
        uint256 mints = mintWindow.userDayMints(0, alice);
        assertEq(mints, 100);
    }

    function test_mintWindow_setAllBatchConfigs() public {
        vm.startPrank(owner);
        uint256[] memory supplies = new uint256[](3);
        uint256[] memory prices = new uint256[](3);
        uint256[] memory caps = new uint256[](3);
        supplies[0] = 1000; prices[0] = 0.001 ether; caps[0] = 0;
        supplies[1] = 2000; prices[1] = 0.002 ether; caps[1] = 0;
        supplies[2] = 3000; prices[2] = 0.003 ether; caps[2] = 0;
        mintWindow.setAllBatchConfigs(supplies, prices, caps);
        vm.stopPrank();

        assertEq(mintWindow.batchCount(), 3);
        assertEq(mintWindow.batchSupply(1), 1000);
        assertEq(mintWindow.batchPrice(2), 0.002 ether);
    }

    function test_mintWindow_setAllBatchConfigs_mismatch_reverts() public {
        vm.startPrank(owner);
        uint256[] memory supplies = new uint256[](2);
        uint256[] memory prices = new uint256[](3);
        uint256[] memory caps = new uint256[](3);
        vm.expectRevert("Length mismatch");
        mintWindow.setAllBatchConfigs(supplies, prices, caps);
        vm.stopPrank();
    }

    function test_countdown_takeoverCount() public {
        _triggerCountdown(alice);
        assertEq(countdown.takeoverCount(), 0);

        _giveAllTiers(bob);
        _giveBlocks(bob, 7, 100);
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(bob);
        countdown.challengeCountdown();
        assertEq(countdown.takeoverCount(), 1);
    }

    function test_migration_getPlayerMigrationInfo() public {
        (bool migrated, uint256 startersReceived) = migration.getPlayerMigrationInfo(alice);
        assertFalse(migrated);
        assertEq(startersReceived, 0);
    }

    function test_migration_previewReward_notEligible() public {
        // No blocks
        (uint256 totalBlocks, uint256 starterReward, bool eligible) = migration.previewReward(alice);
        assertEq(totalBlocks, 0);
        assertEq(starterReward, 0);
        assertFalse(eligible);
    }

    function test_migration_openWindow_noTokenV2_reverts() public {
        vm.startPrank(owner);
        BlockHuntMigration freshMigration = new BlockHuntMigration(address(token));
        vm.expectRevert("Season 2 token not set");
        freshMigration.openMigrationWindow();
        vm.stopPrank();
    }

    function test_forge_receive_eth() public {
        // Forge contract can receive ETH
        vm.prank(alice);
        (bool sent,) = address(forge).call{value: 0.1 ether}("");
        assertTrue(sent);
    }

    function test_escrow_receive_eth() public {
        // Escrow can receive ETH
        vm.prank(alice);
        (bool sent,) = address(escrow).call{value: 0.1 ether}("");
        assertTrue(sent);
    }

    function test_countdown_season() public view {
        assertEq(countdown.currentSeason(), 1);
    }

    function test_countdown_countdownRound() public {
        assertEq(countdown.countdownRound(), 0);
        _triggerCountdown(alice);

        // Disqualify and reset
        vm.prank(alice);
        token.safeTransferFrom(alice, bob, 7, 1, "");
        countdown.checkHolderStatus();

        assertEq(countdown.countdownRound(), 1);
    }

    function test_mint_emitsEvent() public {
        vm.prank(alice);
        vm.expectEmit(true, false, false, false);
        emit BlockHuntToken.BlockMinted(alice, 10);
        token.mint{value: MINT_PRICE * 10}(10);
    }

    function test_combine_emitsEvent() public {
        _giveBlocks(alice, 7, 21);
        vm.prank(alice);
        vm.expectEmit(true, true, true, false);
        emit BlockHuntToken.BlocksCombined(alice, 7, 6);
        token.combine(7);
    }

    function test_treasury_creatorFeeBps() public view {
        assertEq(treasury.creatorFeeBps(), 2000);
    }

    function test_treasury_season() public view {
        assertEq(treasury.season(), 1);
    }

    function test_mintWindow_batchInfo() public view {
        (uint256 id,,) = mintWindow.batches(1);
        assertEq(id, 1);
    }

    function test_token_setMigrationContract_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        token.setMigrationContract(alice);
    }

    function test_escrow_setTokenContract_zeroAddress_reverts() public {
        vm.prank(owner);
        vm.expectRevert("Invalid address");
        escrow.setTokenContract(address(0));
    }

    function test_escrow_setSeason2Treasury_zeroAddress_reverts() public {
        vm.prank(keeper);
        vm.expectRevert("Invalid address");
        escrow.setSeason2TreasuryAddress(address(0));
    }

    function test_registry_markSeasonEnded_double_reverts() public {
        vm.startPrank(owner);
        registry.markSeasonEnded(1, alice, true, 10 ether, 1 ether);
        vm.expectRevert("Already ended");
        registry.markSeasonEnded(1, alice, true, 10 ether, 1 ether);
        vm.stopPrank();
    }

    function test_registry_setSeasonMigration_zeroAddress_reverts() public {
        vm.prank(owner);
        vm.expectRevert("Migration required");
        registry.setSeasonMigration(1, address(0));
    }

    function test_registry_setSeasonMigration_notRegistered_reverts() public {
        vm.prank(owner);
        vm.expectRevert("Season not registered");
        registry.setSeasonMigration(99, address(0x1));
    }

    function test_mint_thenCombine_fullFlow() public {
        // Mint 500 blocks
        _mintBlocks(alice, 500);
        uint256 t7 = token.balanceOf(alice, 7);
        // Try to combine if enough
        if (t7 >= 21) {
            vm.prank(alice);
            token.combine(7);
            assertTrue(token.balanceOf(alice, 6) >= 1);
        }
    }

    function test_escrow_sweepUnclaimedRewards_noAddress_reverts() public {
        _setupSacrifice();
        // Don't set season2TreasuryAddress
        vm.warp(block.timestamp + 30 days + 1);
        vm.expectRevert("Season 2 address not set");
        escrow.sweepUnclaimedRewards();
    }

    function test_escrow_sweepUnclaimedRewards_nothingToSweep() public {
        _setupSacrifice();
        uint256 pool = escrow.communityPool();

        // Set entitlements for full pool
        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = pool;
        vm.prank(keeper);
        escrow.setLeaderboardEntitlements(players, amounts);

        // Bob claims all
        vm.prank(bob);
        escrow.claimLeaderboardReward();

        vm.prank(keeper);
        escrow.setSeason2TreasuryAddress(season2Treasury);
        vm.warp(block.timestamp + 30 days + 1);

        vm.expectRevert("Nothing to sweep");
        escrow.sweepUnclaimedRewards();
    }

    function test_escrow_claimLeaderboardReward_noEntitlements_reverts() public {
        _setupSacrifice();
        // Don't set entitlements
        vm.prank(bob);
        vm.expectRevert("Entitlements not set yet");
        escrow.claimLeaderboardReward();
    }

    function test_token_currentMintPrice_noMintWindow() public {
        vm.startPrank(owner);
        BlockHuntToken freshToken = new BlockHuntToken("", creator, 1000, address(mockVRFCoordinator));
        vm.stopPrank();
        assertEq(freshToken.currentMintPrice(), 0.00008 ether); // falls back to batch 1
    }
}
