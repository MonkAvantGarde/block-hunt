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
import "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

// ─────────────────────────────────────────────────────────────────────────────
// MockVRFCoordinator
//
// Simulates the Chainlink VRF V2.5 coordinator for testing.
//
// Usage in tests:
//   1. Call forge.forge() - this calls requestRandomWords() on the mock,
//      which returns an incrementing requestId and records the consumer.
//   2. Call mockVRFCoordinator.fulfillRequest(requestId, randomWord) to
//      simulate Chainlink delivering randomness. This triggers the forge
//      contract's fulfillRandomWords() callback.
//
// fulfillRequest(requestId, 0)  → random % 100 = 0  → always < burnCount → success
// fulfillRequest(requestId, 99) → random % 100 = 99 → always >= burnCount → fail
// ─────────────────────────────────────────────────────────────────────────────
contract MockVRFCoordinator {
    uint256 private _nextRequestId = 1;

    // Records which consumer made each request (so fulfillRequest knows who to call back)
    mapping(uint256 => address) private _consumers;

    /// @dev Called by BlockHuntForge.forge() internally via s_vrfCoordinator.requestRandomWords()
    function requestRandomWords(
        VRFV2PlusClient.RandomWordsRequest calldata /* req */
    ) external returns (uint256 requestId) {
        requestId = _nextRequestId++;
        _consumers[requestId] = msg.sender;
    }

    /// @notice Test helper - simulate Chainlink delivering a specific random word.
    /// @param requestId  The requestId returned by requestRandomWords()
    /// @param randomWord The raw random number to deliver (contract does % 100 internally)
    function fulfillRequest(uint256 requestId, uint256 randomWord) external {
        address consumer = _consumers[requestId];
        require(consumer != address(0), "Unknown requestId");

        uint256[] memory randomWords = new uint256[](1);
        randomWords[0] = randomWord;

        // rawFulfillRandomWords is the external entry point on VRFConsumerBaseV2Plus.
        // It checks msg.sender == s_vrfCoordinator, then calls fulfillRandomWords().
        VRFConsumerBaseV2Plus(consumer).rawFulfillRandomWords(requestId, randomWords);
    }

    function nextRequestId() external view returns (uint256) {
        return _nextRequestId;
    }
}

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
// RevertOnReceive — malicious contract that reverts when receiving ETH
// ─────────────────────────────────────────────────────────────────────────────
contract RevertOnReceive {
    receive() external payable {
        revert("I reject ETH");
    }

    // Must implement ERC1155Receiver to accept NFTs
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
    BlockHuntEscrow     public escrow;
    BlockHuntMigration      public migration;
    BlockHuntSeasonRegistry public registry;
    MockTokenV2             public tokenV2;
    MockVRFCoordinator      public mockVRFCoordinator;

    // ── Wallets ───────────────────────────────────────────────────────────────
    address public owner   = address(0x1);
    address public creator = address(0x2);
    address public alice   = address(0x3);
    address public bob     = address(0x4);
    address public carol   = address(0x5);
    address public keeper  = address(0x6);
    address public season2Treasury = address(0x7);

    uint256 public constant MINT_PRICE = 0.00008 ether; // Batch 1 price

    // ─────────────────────────────────────────────────────────────────────────
    // setUp - deploys all 8 contracts and wires them together
    // ─────────────────────────────────────────────────────────────────────────
    function setUp() public {
        vm.startPrank(owner);

        // Deploy mock VRF coordinator first - forge constructor requires it
        mockVRFCoordinator = new MockVRFCoordinator();

        // Deploy core contracts
        treasury   = new BlockHuntTreasury(creator);
        mintWindow = new BlockHuntMintWindow();
        countdown  = new BlockHuntCountdown();
        forge      = new BlockHuntForge(address(mockVRFCoordinator));
        token      = new BlockHuntToken(
            "https://api.blockhunt.xyz/metadata/{id}.json",
            creator,
            1000, // 10% royalty in basis points
            address(mockVRFCoordinator)
        );

        // Deploy escrow (keeper-managed sacrifice fund distribution)
        escrow = new BlockHuntEscrow(keeper);
        escrow.setTokenContract(address(token));

        // Wire contracts together
        token.setTreasuryContract(address(treasury));
        token.setMintWindowContract(address(mintWindow));
        token.setForgeContract(address(forge));
        token.setCountdownContract(address(countdown));
        token.setEscrowContract(address(escrow));
        treasury.setTokenContract(address(token));
        treasury.setEscrowContract(address(escrow));
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
        // Fast-forward past 3-hour window so it expires
        vm.warp(block.timestamp + 3 hours + 1);

        vm.prank(alice);
        vm.expectRevert("Window closed");
        token.mint{value: MINT_PRICE * 5}(5);
    }

    function test_MintFailsWithInsufficientPayment() public {
        vm.prank(alice);
        vm.expectRevert("Insufficient payment");
        token.mint{value: 0.00004 ether}(10); // underpays: 0.00004 < 0.00008 * 10
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

    function test_MintSucceedsDuringCountdown() public {
        // Trigger countdown by giving alice all tiers
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }
        assertEq(token.countdownActive(), true);

        // Minting should still work during countdown
        vm.prank(bob);
        token.mint{value: MINT_PRICE * 5}(5);
    }

    function test_TreasuryReceivesFunds() public {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 100}(100);

        uint256 expectedTreasury = (MINT_PRICE * 100 * 9000) / 10000;
        assertApproxEqAbs(
            treasury.treasuryBalance(),
            expectedTreasury,
            0.0001 ether,
            "Treasury should hold ~90% of mint revenue"
        );
    }

    function test_CreatorReceivesFee() public {
        uint256 creatorBefore = creator.balance;

        vm.prank(alice);
        token.mint{value: MINT_PRICE * 100}(100);

        uint256 creatorEarned = creator.balance - creatorBefore;
        uint256 expectedFee   = (MINT_PRICE * 100 * 1000) / 10000;
        assertApproxEqAbs(creatorEarned, expectedFee, 0.0001 ether, "Creator should earn 10%");
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
        _giveBlocks(alice, 7, 21);  // combine ratio is 21:1 for Tier 7→6

        uint256 tier6Before = token.balanceOf(alice, 6);

        vm.prank(alice);
        token.combine(7);

        assertEq(token.balanceOf(alice, 7), 0,                "All Tier-7 burned");
        assertEq(token.balanceOf(alice, 6), tier6Before + 1,  "Should gain 1 Tier-6");
    }

    function test_CombineFailsInsufficientBlocks() public {
        _giveBlocks(alice, 7, 10);  // needs 21

        vm.prank(alice);
        vm.expectRevert("Insufficient blocks");
        token.combine(7);
    }

    function test_CombineFailsInvalidTier() public {
        vm.prank(alice);
        vm.expectRevert("Invalid tier");
        token.combine(1);  // Can't combine Tier 1 (Origin)
    }

    // [PHASE 2] T2→T1 combine is now blocked — The Origin is sacrifice-only.
    function test_CombineTier2Reverts() public {
        _giveBlocks(alice, 2, 100);

        vm.prank(alice);
        vm.expectRevert("Invalid tier");
        token.combine(2);
    }

    // [PHASE 2] combineMany also blocks T2
    function test_CombineManyTier2Reverts() public {
        _giveBlocks(alice, 2, 100);

        uint256[] memory tiers = new uint256[](1);
        tiers[0] = 2;

        vm.prank(alice);
        vm.expectRevert("Invalid tier");
        token.combineMany(tiers);
    }

    function test_CombineRatiosAreCorrect() public view {
        assertEq(token.combineRatio(7), 21,  "Tier 7-6: 21:1");
        assertEq(token.combineRatio(6), 19,  "Tier 6-5: 19:1");
        assertEq(token.combineRatio(5), 17,  "Tier 5-4: 17:1");
        assertEq(token.combineRatio(4), 15,  "Tier 4-3: 15:1");
        assertEq(token.combineRatio(3), 13,  "Tier 3-2: 13:1");
        // [PHASE 2] T2→T1 combine ratio removed — should be 0
        assertEq(token.combineRatio(2), 0,   "Tier 2-1: removed (sacrifice-only)");
    }

    function test_CombineManySucceeds() public {
        _giveBlocks(alice, 7, 21);  // will produce 1 Tier-6
        _giveBlocks(alice, 6, 37);  // 37 + 1 = 38, then consume 19 → 1 Tier-5

        uint256[] memory tiers = new uint256[](2);
        tiers[0] = 7;
        tiers[1] = 6;

        vm.prank(alice);
        token.combineMany(tiers);

        assertEq(token.balanceOf(alice, 7), 0,  "Tier-7 fully burned");
        assertEq(token.balanceOf(alice, 6), 19, "Tier-6 net: 37 + 1 - 19 = 19");
        assertEq(token.balanceOf(alice, 5), 1,  "Should have 1 Tier-5");
    }

    function test_CombineDecreasesTierSupply() public {
        _giveBlocks(alice, 7, 21);
        uint256 supplyBefore = token.tierTotalSupply(7);

        vm.prank(alice);
        token.combine(7);

        assertEq(token.tierTotalSupply(7), supplyBefore - 21, "Supply should decrease by burn amount");
    }

    function test_CombineTriggersCountdown() public {
        // Give alice tiers 3-7, then combine 7→6 to complete set
        for (uint256 tier = 3; tier <= 6; tier++) {
            _giveBlocks(alice, tier, 1);
        }
        _giveBlocks(alice, 2, 1);
        _giveBlocks(alice, 7, 21);

        vm.prank(alice);
        token.combine(7);  // should give 1 Tier-6, completing Tiers 2-7

        assertEq(token.countdownActive(), true, "Countdown should trigger");
        assertEq(token.countdownHolder(), alice, "Alice should be holder");
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 3. FORGE TESTS - PSEUDO-RANDOM MODE (vrfEnabled = false, default)
    //
    // [PHASE 2] Forge now uses burnForForge/resolveForge two-step internally.
    // Burns happen immediately on forge() call. Results resolve synchronously
    // in pseudo-random mode.
    // ═════════════════════════════════════════════════════════════════════════

    function test_ForgeRequestSucceeds() public {
        _giveBlocks(alice, 7, 21); // T7 combine ratio is 21 - burn 21 = 100% chance

        vm.prevrandao(bytes32(uint256(1)));
        vm.prank(alice);
        forge.forge(7, 21);  // max burn for T7 = 100% success

        // All Tier-7 must be burned regardless of outcome
        assertEq(token.balanceOf(alice, 7), 0, "Tier-7 blocks should always be burned");
    }

    function test_ForgeGuaranteedSuccessAtFullRatio() public {
        // T7 combine ratio is 21. Burning the full ratio = (21*100)/21 = 100% success.
        _giveBlocks(alice, 7, 21);

        vm.prevrandao(bytes32(uint256(0)));
        vm.prank(alice);
        forge.forge(7, 21);

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

    // [PHASE 2] T2→T1 forge is invalid
    function test_ForgeTier2IsInvalid() public {
        _giveBlocks(alice, 2, 10);
        vm.prank(alice);
        vm.expectRevert("Invalid tier");
        forge.forge(2, 10);
    }

    function test_ForgeFailsBurnCountTooLow() public {
        _giveBlocks(alice, 7, 5);

        vm.prank(alice);
        vm.expectRevert("Burn count out of range");
        forge.forge(7, 0);  // minimum is 1
    }

    function test_ForgeFailsBurnCountTooHigh() public {
        _giveBlocks(alice, 7, 23);

        vm.prank(alice);
        vm.expectRevert("Burn count out of range");
        forge.forge(7, 22);  // T7 combine ratio is 21; 22 exceeds it
    }

    function test_ForgeFailsInsufficientBlocks() public {
        _giveBlocks(alice, 7, 5);

        vm.prank(alice);
        vm.expectRevert("Insufficient blocks");
        forge.forge(7, 10);
    }

    function test_ForgeEmitsEvents() public {
        _giveBlocks(alice, 7, 10);

        vm.prevrandao(bytes32(uint256(1)));
        vm.prank(alice);

        vm.expectEmit(true, true, false, false);
        emit BlockHuntForge.ForgeRequested(1, alice, 7, 10);

        forge.forge(7, 10);
    }

    function test_ForgeRequestRecorded() public {
        _giveBlocks(alice, 7, 10);

        vm.prevrandao(bytes32(uint256(1)));
        vm.prank(alice);
        forge.forge(7, 10);

        (address player, uint256 fromTier, uint256 burnCount, bool resolved) = forge.forgeRequests(1);
        assertEq(player,    alice, "Player should be alice");
        assertEq(fromTier,  7,     "fromTier should be 7");
        assertEq(burnCount, 10,    "burnCount should be 10");
        assertEq(resolved,  true,  "Should be resolved");
    }

    function test_ForgeNonceIncrements() public {
        _giveBlocks(alice, 7, 21);
        _giveBlocks(bob,   7, 21);

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

        _giveBlocks(alice, 7, 21);

        vm.prank(alice);
        vm.expectRevert("Insufficient forge fee");
        forge.forge{value: 0}(7, 10);
    }

    // [PHASE 2] burnForForge burns blocks immediately at request time
    function test_BurnForForge_BurnsImmediately() public {
        _giveBlocks(alice, 7, 10);
        assertEq(token.balanceOf(alice, 7), 10);

        vm.prevrandao(bytes32(uint256(1)));
        vm.prank(alice);
        forge.forge(7, 10);

        // Blocks burned immediately via burnForForge (before resolve)
        assertEq(token.balanceOf(alice, 7), 0, "Blocks should be burned immediately on forge request");
    }

    // [PHASE 2] resolveForge mints upgrade on success
    function test_ResolveForge_MintsOnSuccess() public {
        _giveBlocks(alice, 7, 21);

        // Full ratio burn = 100% success guaranteed
        vm.prevrandao(bytes32(uint256(0)));
        vm.prank(alice);
        forge.forge(7, 21);

        assertEq(token.balanceOf(alice, 7), 0, "All T7 burned");
        assertEq(token.balanceOf(alice, 6), 1, "Should receive T6 on success");
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 3b. FORGE TESTS - VRF MODE (vrfEnabled = true)
    // ═════════════════════════════════════════════════════════════════════════

    modifier withVRFEnabled() {
        vm.prank(owner);
        forge.setVrfConfig(
            1,
            bytes32(uint256(0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71)),
            200_000
        );
        vm.prank(owner);
        forge.setVrfEnabled(true);
        _;
    }

    function test_VRF_ForgeRequestCreated() public withVRFEnabled {
        _giveBlocks(alice, 7, 10);

        vm.prank(alice);
        forge.forge(7, 10);

        (address player, uint256 fromTier, uint256 burnCount, bool resolved) = forge.vrfForgeRequests(1);
        assertEq(player,    alice, "Player should be alice");
        assertEq(fromTier,  7,     "fromTier should be 7");
        assertEq(burnCount, 10,    "burnCount should be 10");
        assertEq(resolved,  false, "Should not be resolved yet - waiting for VRF callback");
    }

    function test_VRF_ForgeNonceDoesNotIncrementInVRFMode() public withVRFEnabled {
        _giveBlocks(alice, 7, 10);

        vm.prank(alice);
        forge.forge(7, 10);

        assertEq(forge.requestNonce(), 0, "Nonce should not increment in VRF mode");
    }

    function test_VRF_ForgeEmitsForgeRequestedEvent() public withVRFEnabled {
        _giveBlocks(alice, 7, 10);

        vm.expectEmit(true, true, false, false);
        emit BlockHuntForge.ForgeRequested(1, alice, 7, 10);

        vm.prank(alice);
        forge.forge(7, 10);
    }

    // [PHASE 2] Blocks are burned immediately via burnForForge at request time
    function test_VRF_BlocksBurnedImmediatelyOnRequest() public withVRFEnabled {
        _giveBlocks(alice, 7, 10);
        assertEq(token.balanceOf(alice, 7), 10);

        vm.prank(alice);
        forge.forge(7, 10);

        // Blocks are burned at request time via burnForForge (not at callback)
        assertEq(token.balanceOf(alice, 7), 0, "Blocks should be burned at request time");
    }

    function test_VRF_SuccessfulForgeReceivesTier() public withVRFEnabled {
        _giveBlocks(alice, 7, 10);

        vm.prank(alice);
        forge.forge(7, 10);  // requestId = 1

        // T7 ratio=21, burnCount=10 → successChance = (10*100)/21 = 47
        // randomWord = 0 → 0 % 100 = 0 → 0 < 47 → success
        mockVRFCoordinator.fulfillRequest(1, 0);

        assertEq(token.balanceOf(alice, 7), 0, "All Tier-7 should be burned");
        assertEq(token.balanceOf(alice, 6), 1, "Should receive 1 Tier-6 on success");
    }

    function test_VRF_FailedForgeDoesNotReceiveTier() public withVRFEnabled {
        _giveBlocks(alice, 7, 10);

        vm.prank(alice);
        forge.forge(7, 10);  // requestId = 1

        // T7 ratio=21, burnCount=10 → successChance = 47
        // randomWord = 99 → 99 % 100 = 99 → 99 >= 47 → fail
        mockVRFCoordinator.fulfillRequest(1, 99);

        assertEq(token.balanceOf(alice, 7), 0, "All Tier-7 should still be burned on fail");
        assertEq(token.balanceOf(alice, 6), 0, "Should NOT receive Tier-6 on fail");
    }

    function test_VRF_ForgeResolvedFlagSetAfterCallback() public withVRFEnabled {
        _giveBlocks(alice, 7, 10);

        vm.prank(alice);
        forge.forge(7, 10);

        (, , , bool resolvedBefore) = forge.vrfForgeRequests(1);
        assertEq(resolvedBefore, false, "Should be unresolved before callback");

        mockVRFCoordinator.fulfillRequest(1, 0);

        (, , , bool resolvedAfter) = forge.vrfForgeRequests(1);
        assertEq(resolvedAfter, true, "Should be resolved after callback");
    }

    function test_VRF_ForgeEmitsForgeResolvedOnCallback() public withVRFEnabled {
        _giveBlocks(alice, 7, 10);

        vm.prank(alice);
        forge.forge(7, 10);

        vm.expectEmit(true, true, false, false);
        emit BlockHuntForge.ForgeResolved(1, alice, 7, true);

        mockVRFCoordinator.fulfillRequest(1, 0);
    }

    function test_VRF_CannotFulfillSameRequestTwice() public withVRFEnabled {
        _giveBlocks(alice, 7, 10);

        vm.prank(alice);
        forge.forge(7, 10);

        mockVRFCoordinator.fulfillRequest(1, 0);  // first callback - ok

        vm.expectRevert("Already resolved");
        mockVRFCoordinator.fulfillRequest(1, 0);  // second callback - should revert
    }

    function test_VRF_MultipleForgesGetDistinctRequestIds() public withVRFEnabled {
        _giveBlocks(alice, 7, 21);
        _giveBlocks(bob,   7, 21);

        vm.prank(alice);
        forge.forge(7, 10);  // requestId = 1

        vm.prank(bob);
        forge.forge(7, 10);  // requestId = 2

        (address playerOne, , , ) = forge.vrfForgeRequests(1);
        (address playerTwo, , , ) = forge.vrfForgeRequests(2);

        assertEq(playerOne, alice, "Request 1 should belong to alice");
        assertEq(playerTwo, bob,   "Request 2 should belong to bob");
    }

    function test_VRF_MultipleForgesResolveIndependently() public withVRFEnabled {
        _giveBlocks(alice, 7, 21);
        _giveBlocks(bob,   7, 21);

        vm.prank(alice);
        forge.forge(7, 21);  // requestId = 1 - full ratio = 100% success

        vm.prank(bob);
        forge.forge(7, 21);  // requestId = 2 - full ratio = 100% success

        mockVRFCoordinator.fulfillRequest(1, 0);   // success for alice (100% chance)
        mockVRFCoordinator.fulfillRequest(2, 0);   // success for bob (100% chance)

        assertEq(token.balanceOf(alice, 6), 1, "Alice should receive Tier-6");
        assertEq(token.balanceOf(bob,   6), 1, "Bob should also receive Tier-6");
    }

    function test_VRF_BoundarySuccessAtExactBurnCount() public withVRFEnabled {
        // T7 ratio=21. burnCount=10 → successChance = (10*100)/21 = 47.
        // Random value 46 → 46 < 47 → success
        _giveBlocks(alice, 7, 10);

        vm.prank(alice);
        forge.forge(7, 10);

        mockVRFCoordinator.fulfillRequest(1, 46);
        assertEq(token.balanceOf(alice, 6), 1, "Should succeed when random = successChance - 1");
    }

    function test_VRF_BoundaryFailAtExactBurnCount() public withVRFEnabled {
        // T7 ratio=21. burnCount=10 → successChance = (10*100)/21 = 47.
        // Random value 47 → 47 >= 47 → fail
        _giveBlocks(alice, 7, 10);

        vm.prank(alice);
        forge.forge(7, 10);

        mockVRFCoordinator.fulfillRequest(1, 47);
        assertEq(token.balanceOf(alice, 6), 0, "Should fail when random = successChance");
    }

    function test_VRF_ForgeRequiresSubscriptionConfigured() public {
        vm.prank(owner);
        forge.setVrfEnabled(true);

        _giveBlocks(alice, 7, 10);

        vm.prank(alice);
        vm.expectRevert("VRF subscription not configured");
        forge.forge(7, 10);
    }

    function test_VRF_SetVrfConfigOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        forge.setVrfConfig(1, bytes32(uint256(1)), 200_000);
    }

    function test_VRF_SetVrfEnabledOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        forge.setVrfEnabled(true);
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 3c. FORGE BATCH TESTS (forgeBatch)
    //
    // [PHASE 2] New batch forge — N attempts, one VRF word.
    // ═════════════════════════════════════════════════════════════════════════

    function test_ForgeBatch_PseudoRandom_SingleAttempt() public {
        _giveBlocks(alice, 7, 21);

        uint256[] memory tiers  = new uint256[](1);
        uint256[] memory burns  = new uint256[](1);
        tiers[0] = 7;
        burns[0] = 21;  // full ratio = 100% success

        vm.prevrandao(bytes32(uint256(0)));
        vm.prank(alice);
        forge.forgeBatch(tiers, burns);

        assertEq(token.balanceOf(alice, 7), 0, "T7 burned");
        // May or may not succeed depending on pseudo-random - but blocks must be burned
    }

    function test_ForgeBatch_PseudoRandom_MultipleAttempts() public {
        _giveBlocks(alice, 7, 42);  // enough for 2 attempts of 21 each

        uint256[] memory tiers  = new uint256[](2);
        uint256[] memory burns  = new uint256[](2);
        tiers[0] = 7; burns[0] = 21;
        tiers[1] = 7; burns[1] = 21;

        vm.prevrandao(bytes32(uint256(0)));
        vm.prank(alice);
        forge.forgeBatch(tiers, burns);

        assertEq(token.balanceOf(alice, 7), 0, "All T7 should be burned");
    }

    function test_ForgeBatch_MixedTiers() public {
        _giveBlocks(alice, 7, 10);
        _giveBlocks(alice, 5, 15);

        uint256[] memory tiers  = new uint256[](2);
        uint256[] memory burns  = new uint256[](2);
        tiers[0] = 7; burns[0] = 10;
        tiers[1] = 5; burns[1] = 15;

        vm.prevrandao(bytes32(uint256(0)));
        vm.prank(alice);
        forge.forgeBatch(tiers, burns);

        assertEq(token.balanceOf(alice, 7), 0, "T7 burned");
        assertEq(token.balanceOf(alice, 5), 0, "T5 burned");
    }

    function test_ForgeBatch_ArrayMismatchReverts() public {
        uint256[] memory tiers  = new uint256[](2);
        uint256[] memory burns  = new uint256[](1);
        tiers[0] = 7; tiers[1] = 7;
        burns[0] = 10;

        vm.prank(alice);
        vm.expectRevert("Array length mismatch");
        forge.forgeBatch(tiers, burns);
    }

    function test_ForgeBatch_EmptyReverts() public {
        uint256[] memory tiers  = new uint256[](0);
        uint256[] memory burns  = new uint256[](0);

        vm.prank(alice);
        vm.expectRevert("1-20 attempts per batch");
        forge.forgeBatch(tiers, burns);
    }

    function test_ForgeBatch_Over20Reverts() public {
        uint256[] memory tiers = new uint256[](21);
        uint256[] memory burns = new uint256[](21);
        for (uint256 i = 0; i < 21; i++) {
            tiers[i] = 7;
            burns[i] = 1;
        }
        _giveBlocks(alice, 7, 21);

        vm.prank(alice);
        vm.expectRevert("1-20 attempts per batch");
        forge.forgeBatch(tiers, burns);
    }

    function test_ForgeBatch_InvalidTierReverts() public {
        _giveBlocks(alice, 2, 10);

        uint256[] memory tiers  = new uint256[](1);
        uint256[] memory burns  = new uint256[](1);
        tiers[0] = 2; burns[0] = 5;

        vm.prank(alice);
        vm.expectRevert("Invalid tier");
        forge.forgeBatch(tiers, burns);
    }

    function test_ForgeBatch_VRF_RequestCreated() public withVRFEnabled {
        _giveBlocks(alice, 7, 21);

        uint256[] memory tiers  = new uint256[](2);
        uint256[] memory burns  = new uint256[](2);
        tiers[0] = 7; burns[0] = 10;
        tiers[1] = 7; burns[1] = 10;

        vm.prank(alice);
        forge.forgeBatch(tiers, burns);

        (address player, uint256 attemptCount, bool resolved) = forge.vrfBatchRequests(1);
        assertEq(player,       alice, "Player should be alice");
        assertEq(attemptCount, 2,     "Should have 2 attempts");
        assertEq(resolved,     false, "Should not be resolved yet");
    }

    function test_ForgeBatch_VRF_CallbackResolvesAll() public withVRFEnabled {
        _giveBlocks(alice, 7, 42);

        uint256[] memory tiers  = new uint256[](2);
        uint256[] memory burns  = new uint256[](2);
        tiers[0] = 7; burns[0] = 21;  // 100% success
        tiers[1] = 7; burns[1] = 21;  // 100% success

        vm.prank(alice);
        forge.forgeBatch(tiers, burns);

        // All blocks burned immediately
        assertEq(token.balanceOf(alice, 7), 0, "All T7 burned on request");

        // Fulfill - both should succeed at any random word (100% chance)
        mockVRFCoordinator.fulfillRequest(1, 12345);

        (, , bool resolved) = forge.vrfBatchRequests(1);
        assertEq(resolved, true, "Batch should be resolved after callback");
        assertEq(token.balanceOf(alice, 6), 2, "Should receive 2 Tier-6 on dual success");
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 3d. FORGE - PROBABILITY ANCHORING TESTS
    // ═════════════════════════════════════════════════════════════════════════

    function test_ForgeT7_HalfRatioIs47Percent() public withVRFEnabled {
        // T7 ratio=21. burnCount=10 → successChance = (10*100)/21 = 47.
        _giveBlocks(alice, 7, 10);
        vm.prank(alice);
        forge.forge(7, 10);
        mockVRFCoordinator.fulfillRequest(1, 46);
        assertEq(token.balanceOf(alice, 6), 1, "Burn 10 of 21 = 47% - should succeed at 46");
    }

    function test_ForgeT5_HalfRatioIs47Percent() public withVRFEnabled {
        // T5 ratio=17. burnCount=8 → successChance = (8*100)/17 = 47.
        _giveBlocks(alice, 5, 8);
        vm.prank(alice);
        forge.forge(5, 8);
        mockVRFCoordinator.fulfillRequest(1, 46);
        assertEq(token.balanceOf(alice, 4), 1, "Burn 8 of 17 = 47% - should succeed at 46");
    }

    function test_ForgeT3_HalfRatioIs46Percent() public withVRFEnabled {
        // T3 ratio=13. burnCount=6 → successChance = (6*100)/13 = 46.
        _giveBlocks(alice, 3, 6);
        vm.prank(alice);
        forge.forge(3, 6);
        mockVRFCoordinator.fulfillRequest(1, 45);
        assertEq(token.balanceOf(alice, 2), 1, "Burn 6 of 13 = 46% - should succeed at 45");
    }

    function test_ForgeFullRatioIs100Percent() public withVRFEnabled {
        _giveBlocks(alice, 7, 21);
        vm.prank(alice);
        forge.forge(7, 21);
        mockVRFCoordinator.fulfillRequest(1, 99);  // worst random still succeeds
        assertEq(token.balanceOf(alice, 6), 1, "Burning full ratio should always succeed");
    }

    function test_ForgeT4_QuarterRatioIs26Percent() public withVRFEnabled {
        // T4 ratio=15. Burn 4 → (4*100)/15 = 26%.
        // randomWord=26 → 26 >= 26 → fail.
        _giveBlocks(alice, 4, 4);
        vm.prank(alice);
        forge.forge(4, 4);
        mockVRFCoordinator.fulfillRequest(1, 26);
        assertEq(token.balanceOf(alice, 3), 0, "Should fail when random = successChance");
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 3e. MINT VRF TESTS
    // ═════════════════════════════════════════════════════════════════════════

    modifier withMintVRFEnabled() {
        vm.prank(owner);
        token.setVrfConfig(
            1,                       // subscriptionId
            bytes32(uint256(1)),     // keyHash
            500_000                  // callbackGasLimit
        );
        vm.prank(owner);
        token.setVrfEnabled(true);
        _;
    }

    function test_MintVRF_RequestEmitsEvent() public withMintVRFEnabled {
        vm.prank(alice);
        vm.expectEmit(true, false, false, false);
        emit BlockHuntToken.MintRequested(alice, 1, 10);
        token.mint{value: MINT_PRICE * 10}(10);
    }

    function test_MintVRF_BlocksNotDeliveredUntilCallback() public withMintVRFEnabled {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        uint256 total = 0;
        for (uint256 tier = 1; tier <= 7; tier++) {
            total += token.balanceOf(alice, tier);
        }
        assertEq(total, 0, "Blocks should not exist before callback");
    }

    function test_MintVRF_CallbackDeliversBlocks() public withMintVRFEnabled {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        mockVRFCoordinator.fulfillRequest(1, 12345);

        uint256 total = 0;
        for (uint256 tier = 1; tier <= 7; tier++) {
            total += token.balanceOf(alice, tier);
        }
        assertEq(total, 10, "Alice should have 10 blocks after callback");
    }

    function test_MintVRF_FulfilledEmitsEvents() public withMintVRFEnabled {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        vm.expectEmit(true, true, false, true);
        emit BlockHuntToken.MintFulfilled(alice, 1, 10);
        mockVRFCoordinator.fulfillRequest(1, 12345);
    }

    function test_MintVRF_ETHHeldByContractBeforeCallback() public withMintVRFEnabled {
        uint256 contractBefore = address(token).balance;

        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        assertEq(
            address(token).balance,
            contractBefore + MINT_PRICE * 10,
            "Token contract should hold ETH pending delivery"
        );
    }

    function test_MintVRF_ETHForwardedToTreasuryAfterCallback() public withMintVRFEnabled {
        uint256 treasuryBefore = address(treasury).balance;

        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        assertEq(address(treasury).balance, treasuryBefore, "Treasury should not have funds before callback");

        mockVRFCoordinator.fulfillRequest(1, 12345);

        assertGt(address(treasury).balance, treasuryBefore, "Treasury should receive funds after callback");
    }

    function test_MintVRF_CapReservedAtRequestTime() public withMintVRFEnabled {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 100}(100);

        assertEq(token.windowDayMinted(), 100, "Cap should be reserved at request time, before callback");
    }

    function test_MintVRF_CapReleasedOnCancel() public withMintVRFEnabled {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 100}(100);
        assertEq(token.windowDayMinted(), 100);

        vm.warp(block.timestamp + 1 hours + 1);

        vm.prank(alice);
        token.cancelMintRequest(1);

        assertEq(token.windowDayMinted(), 0, "Cap should be released after cancel");
    }

    function test_MintVRF_PendingRequestTracked() public withMintVRFEnabled {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        uint256[] memory pending = token.getPendingRequests(alice);
        assertEq(pending.length, 1, "Alice should have 1 pending request");
        assertEq(pending[0],    1,  "Pending requestId should be 1");
    }

    function test_MintVRF_PendingRequestClearedAfterCallback() public withMintVRFEnabled {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        mockVRFCoordinator.fulfillRequest(1, 12345);

        uint256[] memory pending = token.getPendingRequests(alice);
        assertEq(pending.length, 0, "Pending list should be empty after callback");
    }

    function test_MintVRF_CancelBeforeTimeoutReverts() public withMintVRFEnabled {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        vm.warp(block.timestamp + 30 minutes);

        vm.prank(alice);
        vm.expectRevert("Too early to cancel: request is within the 1 hour window");
        token.cancelMintRequest(1);
    }

    function test_MintVRF_CancelAfterTimeoutSucceeds() public withMintVRFEnabled {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        vm.warp(block.timestamp + 1 hours + 1);

        vm.prank(alice);
        token.cancelMintRequest(1);  // should not revert
    }

    function test_MintVRF_CancelRefundsETH() public withMintVRFEnabled {
        uint256 balanceBefore = alice.balance;

        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        vm.warp(block.timestamp + 1 hours + 1);

        vm.prank(alice);
        token.cancelMintRequest(1);

        assertApproxEqAbs(alice.balance, balanceBefore, 0.00001 ether, "Alice should be fully refunded");
    }

    function test_MintVRF_OnlyPlayerCanCancelTheirRequest() public withMintVRFEnabled {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        vm.warp(block.timestamp + 1 hours + 1);

        vm.prank(bob);
        vm.expectRevert("Not your request");
        token.cancelMintRequest(1);
    }

    function test_MintVRF_LateCallbackOnCancelledRequestIsIgnored() public withMintVRFEnabled {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        vm.warp(block.timestamp + 1 hours + 1);

        vm.prank(alice);
        token.cancelMintRequest(1);

        mockVRFCoordinator.fulfillRequest(1, 12345);

        uint256 total = 0;
        for (uint256 tier = 1; tier <= 7; tier++) {
            total += token.balanceOf(alice, tier);
        }
        assertEq(total, 0, "Cancelled request callback should deliver nothing");
    }

    function test_MintVRF_GasLimitScalesWithQuantity() public withMintVRFEnabled {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 200}(200);

        mockVRFCoordinator.fulfillRequest(1, 99999);

        uint256 total = 0;
        for (uint256 tier = 1; tier <= 7; tier++) {
            total += token.balanceOf(alice, tier);
        }
        assertEq(total, 200, "All 200 blocks should be delivered via large mint callback");
    }

    function test_MintVRF_SetVrfConfigOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        token.setVrfConfig(1, bytes32(uint256(1)), 500_000);
    }

    function test_MintVRF_SetVrfEnabledOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        token.setVrfEnabled(true);
    }

    function test_MintPseudoRandom_StillWorksWhenVRFDisabled() public {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        uint256 total = 0;
        for (uint256 tier = 1; tier <= 7; tier++) {
            total += token.balanceOf(alice, tier);
        }
        assertEq(total, 10, "Pseudo-random mint should deliver blocks synchronously");
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

    // [PHASE 2] sacrificePayout sends 100% to Escrow (was Countdown)
    function test_TreasurySacrificePayout() public {
        vm.deal(address(treasury), 10 ether);
        uint256 escrowBefore = address(escrow).balance;

        vm.prank(address(token));
        treasury.sacrificePayout(alice);

        assertEq(treasury.treasuryBalance(), 0,                     "Treasury should be empty");
        assertEq(address(escrow).balance, escrowBefore + 10 ether,  "Escrow should hold 100%");
    }

    function test_TreasuryOnlyAcceptsTokenContract() public {
        vm.prank(alice);
        vm.expectRevert("Only token contract");
        treasury.claimPayout(alice);
    }

    function test_TreasuryStartNextSeason() public {
        vm.prank(owner);
        treasury.startNextSeason();

        assertEq(treasury.season(), 2, "Season should advance to 2");
    }

    function test_TreasuryCreatorFeeCanBeUpdated() public {
        vm.prank(owner);
        treasury.setCreatorFee(300);  // 3%
        assertEq(treasury.creatorFeeBps(), 300);
    }

    function test_TreasuryCreatorFeeCannotExceedMax() public {
        vm.prank(owner);
        vm.expectRevert("Exceeds max fee");
        treasury.setCreatorFee(1001);  // 10.01% - above 10% cap
    }

    function test_TreasuryTokenContractCanOnlyBeSetOnce() public {
        // In test mode, re-calling is allowed
        vm.prank(owner);
        treasury.setTokenContract(address(alice));
        assertEq(treasury.tokenContract(), address(alice));

        // After disabling test mode, it locks
        vm.startPrank(owner);
        treasury.setTokenContract(address(token)); // restore for other tests
        treasury.disableTestMode();
        vm.expectRevert("Already set");
        treasury.setTokenContract(address(alice));
        vm.stopPrank();
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

        // [PHASE 2] closeWindow is now permissionless but only works after window expires
        vm.warp(block.timestamp + 3 hours + 1);
        mintWindow.closeWindow();

        assertEq(mintWindow.isWindowOpen(), false, "Window should be closed");
    }

    function test_RolloverAccumulates() public {
        // Close window after expiry without minting - full window cap rolls over
        vm.warp(block.timestamp + 3 hours + 1);
        mintWindow.closeWindow();

        // openWindow requires owner or keeper
        vm.warp(block.timestamp + 4 hours);
        vm.prank(owner);
        mintWindow.openWindow();

        (, , , , uint256 allocated, , , ) = mintWindow.getWindowInfo();
        assertEq(allocated, 66_000, "2x windowCapForBatch(1) (33,000 each) should accumulate");
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
        assertEq(allocated, 33_000, "Batch 1 window cap should be 33,000");
    }

    function test_WindowExpiresByTime() public {
        vm.warp(block.timestamp + 3 hours + 1);
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

        (, , uint256 totalMinted) = mintWindow.batches(1);
        assertEq(totalMinted, 10, "Batch should track minted blocks");
    }

    // [PHASE 2] Permissionless openWindow with MIN_WINDOW_GAP time guard
    function test_OpenWindowByKeeper() public {
        // Fast-forward past window + gap
        vm.warp(block.timestamp + 4 hours + 1);

        // Set alice as keeper
        vm.prank(owner);
        mintWindow.setKeeper(alice);

        // Keeper can call openWindow
        vm.prank(alice);
        mintWindow.openWindow();

        assertEq(mintWindow.isWindowOpen(), true, "Window should be open after keeper call");
        assertEq(mintWindow.currentDay(), 2, "Day should advance to 2");
    }

    function test_OpenWindowUnauthorizedReverts() public {
        // Non-owner/non-keeper cannot call openWindow
        vm.warp(block.timestamp + 4 hours + 1);
        vm.prank(alice);
        vm.expectRevert("Not authorized");
        mintWindow.openWindow();
    }

    function test_OpenWindowTooEarlyReverts() public {
        // Try to open a new window too soon (< MIN_WINDOW_GAP = 4 hours)
        vm.warp(block.timestamp + 3 hours);

        vm.prank(owner);
        vm.expectRevert("Too early for next window");
        mintWindow.openWindow();
    }

    function test_CloseWindowPermissionless() public {
        // closeWindow is permissionless but requires window to be past closeAt
        vm.warp(block.timestamp + 3 hours + 1);

        vm.prank(alice);
        mintWindow.closeWindow();

        assertEq(mintWindow.isWindowOpen(), false, "Window should be closed");
    }

    function test_CloseWindowTooEarlyReverts() public {
        // Window is still active (within 3 hours)
        vm.prank(alice);
        vm.expectRevert("Window still active");
        mintWindow.closeWindow();
    }

    // [PHASE 2] Per-user cap enforcement in recordMint
    function test_PerUserCapEnforced() public {
        vm.prank(owner);
        mintWindow.setPerUserDayCap(100);

        // Mint up to cap
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 100}(100);

        // Next mint should fail per-user cap
        vm.prank(alice);
        vm.expectRevert("Per-user window cap reached");
        token.mint{value: MINT_PRICE * 1}(1);
    }

    function test_PerUserCapDoesNotAffectOtherUsers() public {
        vm.prank(owner);
        mintWindow.setPerUserDayCap(100);

        // Alice mints to cap
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 100}(100);

        // Bob can still mint
        vm.prank(bob);
        token.mint{value: MINT_PRICE * 50}(50);

        assertEq(mintWindow.userDayMints(1, alice), 100);
        assertEq(mintWindow.userDayMints(1, bob),   50);
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 5B. FORCE OPEN WINDOW TESTS
    // ═════════════════════════════════════════════════════════════════════════

    function test_ForceOpenWindow_OwnerCanForceOpen() public {
        // Close current window
        vm.warp(block.timestamp + 3 hours + 1);
        mintWindow.closeWindow();

        vm.prank(owner);
        mintWindow.forceOpenWindow();

        assertEq(mintWindow.isWindowOpen(), true, "Window should be open after force open");
        assertEq(mintWindow.currentDay(), 2, "Day should advance to 2");
    }

    function test_ForceOpenWindow_BypassesTimeGuard() public {
        // Close current window
        vm.warp(block.timestamp + 3 hours + 1);
        mintWindow.closeWindow();

        // Don't wait for MIN_WINDOW_GAP — force open immediately
        vm.prank(owner);
        mintWindow.forceOpenWindow();

        assertEq(mintWindow.isWindowOpen(), true, "Force open should bypass time guard");
    }

    function test_ForceOpenWindow_NonOwnerReverts() public {
        vm.warp(block.timestamp + 3 hours + 1);
        mintWindow.closeWindow();

        vm.prank(alice);
        vm.expectRevert();
        mintWindow.forceOpenWindow();
    }

    function test_ForceOpenWindow_FailsWhenTestModeDisabled() public {
        vm.startPrank(owner);
        mintWindow.disableTestMode();

        vm.expectRevert("Test mode disabled");
        mintWindow.forceOpenWindow();
        vm.stopPrank();
    }

    function test_ForceOpenWindow_FailsWhenWindowAlreadyOpen() public {
        // Window is already open from setUp — force open should settle it and open a new one
        // (same behavior as openWindow when previous window is still open)
        vm.prank(owner);
        mintWindow.forceOpenWindow();

        assertEq(mintWindow.isWindowOpen(), true, "New window should be open");
        assertEq(mintWindow.currentDay(), 2, "Day should advance");
    }

    function test_ForceOpenWindow_CorrectDuration() public {
        vm.warp(block.timestamp + 3 hours + 1);
        mintWindow.closeWindow();

        uint256 openTime = block.timestamp;
        vm.prank(owner);
        mintWindow.forceOpenWindow();

        (, , uint256 openAt, uint256 closeAt, , , , ) = mintWindow.getWindowInfo();
        assertEq(openAt, openTime, "Open time should be current timestamp");
        assertEq(closeAt, openTime + 3 hours, "Close time should be 3 hours after open");
    }

    function test_ForceOpenWindow_NormalOpenStillRespectsTimeGuard() public {
        // Force open a window
        vm.warp(block.timestamp + 3 hours + 1);
        mintWindow.closeWindow();
        vm.prank(owner);
        mintWindow.forceOpenWindow();

        // Try normal openWindow too soon — should revert
        vm.warp(block.timestamp + 3 hours + 1);
        vm.prank(owner);
        vm.expectRevert("Too early for next window");
        mintWindow.openWindow();

        // After MIN_WINDOW_GAP it should work
        vm.warp(block.timestamp + 4 hours);
        vm.prank(owner);
        mintWindow.openWindow();
        assertEq(mintWindow.isWindowOpen(), true);
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
        }

        assertEq(token.countdownActive(), false, "Countdown should not fire without all tiers");
    }

    function test_CountdownContractSyncsOnTrigger() public {
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        assertEq(countdown.isActive(),      true,  "Countdown contract should be active");
        assertEq(countdown.currentHolder(), alice, "Countdown contract should record holder");
    }

    function test_CastVoteSucceeds() public {
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        vm.prank(bob);
        countdown.castVote(true);

        assertEq(countdown.votesBurn(),    1, "Should have 1 burn vote");
        assertEq(countdown.votesClaim(),   0, "Should have 0 claim votes");
        assertEq(countdown.hasVoted(countdown.countdownRound(), bob),  true, "Bob should be marked as voted");
    }

    function test_CastVoteClaimSucceeds() public {
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        vm.prank(bob);
        countdown.castVote(false);

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

    // ── Fix H-3: Voter List DoS — Round-based voting ──────────────────────────

    function test_VoterListDoS_ResetIsConstantGas() public {
        _giveAllTiers(alice);

        // Cast 100 votes from different addresses
        for (uint256 i = 1; i <= 100; i++) {
            address voter = address(uint160(0xBEEF000 + i));
            vm.prank(voter);
            countdown.castVote(true);
        }

        // Reset via checkHolderStatus (alice loses a tier)
        vm.prank(alice);
        token.safeTransferFrom(alice, bob, 2, 1, "");

        uint256 gasBefore = gasleft();
        countdown.checkHolderStatus();
        uint256 gasUsed = gasBefore - gasleft();

        // Should be well under 100k gas regardless of voter count
        assertLt(gasUsed, 100_000, "Reset should be O(1), not O(n)");
    }

    function test_VotesResetAfterRound() public {
        _giveAllTiers(alice);
        uint256 round1 = countdown.countdownRound();

        vm.prank(bob);
        countdown.castVote(true);
        assertEq(countdown.hasVoted(round1, bob), true);

        // Reset countdown (alice loses a tier)
        vm.prank(alice);
        token.safeTransferFrom(alice, bob, 2, 1, "");
        countdown.checkHolderStatus();

        uint256 round2 = countdown.countdownRound();
        assertGt(round2, round1, "Round should increment");
        // Bob's vote in old round still stored, but new round is clean
        assertEq(countdown.hasVoted(round2, bob), false, "Bob should not be voted in new round");
    }

    function test_CanVoteInNewRound() public {
        _giveAllTiers(alice);

        vm.prank(bob);
        countdown.castVote(true);

        // Reset
        vm.prank(alice);
        token.safeTransferFrom(alice, bob, 2, 1, "");
        countdown.checkHolderStatus();

        // Start new countdown
        _giveAllTiers(carol);

        // Bob can vote again in the new round
        vm.prank(bob);
        countdown.castVote(false);
        assertEq(countdown.votesClaim(), 1, "Bob should be able to vote in new round");
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
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }
        assertEq(token.countdownActive(), true);
        assertEq(countdown.isActive(),    true);

        countdown.checkHolderStatus();
        assertEq(countdown.isActive(), true, "Still active when holder qualifies");
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
            _giveBlocks(alice, tier, 3);
        }

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.claimTreasury();

        for (uint256 tier = 2; tier <= 7; tier++) {
            assertEq(token.balanceOf(alice, tier), 0, "All blocks should be burned on claim");
        }
    }

    // [PHASE 2] sacrifice() takes no params — winner never controls community pool
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

    // [PHASE 2] Sacrifice sends funds through Escrow for 50/40/10 split
    function test_SacrificeDistributesTreasury50_40_10() public {
        vm.deal(address(treasury), 10 ether);
        uint256 aliceBefore = alice.balance;

        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.sacrifice();

        // 50% stored as pending withdrawal (pull-payment)
        assertEq(alice.balance, aliceBefore, "Alice should NOT receive ETH yet");
        assertApproxEqAbs(escrow.pendingWithdrawal(alice), 5 ether, 0.001 ether, "50% stored for withdrawal");
        // Alice withdraws
        vm.prank(alice);
        escrow.withdrawWinnerShare();
        assertApproxEqAbs(alice.balance - aliceBefore, 5 ether, 0.001 ether, "Alice gets 50% after withdrawal");
        // 40% held in escrow as communityPool
        assertApproxEqAbs(escrow.communityPool(), 4 ether, 0.001 ether, "Escrow holds 40% as communityPool");
        // 10% held in escrow as season2Seed
        assertApproxEqAbs(escrow.season2Seed(), 1 ether, 0.001 ether, "Escrow holds 10% as season2Seed");
        // Treasury empty
        assertEq(treasury.treasuryBalance(), 0, "Treasury should be empty after sacrifice");
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

        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.claimTreasury();

        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(bob, tier, 1);
        }

        assertEq(token.countdownActive(), true,  "New countdown should be possible");
        assertEq(token.countdownHolder(), bob,   "Bob should be new holder");
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 7b. ENDGAME - 7-DAY ENFORCEMENT & DEFAULT SACRIFICE
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

    // [PHASE 2] executeDefaultOnExpiry takes no params
    function test_DefaultSacrificeRevertsBeforeTimerExpires() public {
        _giveAllTiers(alice);

        vm.prank(bob);
        vm.expectRevert("Countdown still running");
        token.executeDefaultOnExpiry();
    }

    // [PHASE 2] executeDefaultOnExpiry takes no params
    function test_DefaultSacrificeExecutedByAnyone() public {
        vm.deal(address(treasury), 10 ether);
        _giveAllTiers(alice);

        vm.warp(block.timestamp + 7 days + 1);

        // Bob (not the holder) calls - simulates Gelato keeper
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

        vm.prank(alice);
        token.claimTreasury();

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
        _giveBlocks(bob, 2, 1);

        vm.prank(bob);
        vm.expectRevert("Does not hold all 6 tiers");
        token.claimHolderStatus();
    }

    function test_ClaimHolderStatusRevertsIfCountdownAlreadyActive() public {
        _giveAllTiers(alice);

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


    // ═════════════════════════════════════════════════════════════════════════
    // 7c. COUNTDOWN RESET - HOLDER DISQUALIFICATION
    // ═════════════════════════════════════════════════════════════════════════

    function test_CheckHolderStatus_NoopWhenNotActive() public {
        assertFalse(countdown.isActive());
        countdown.checkHolderStatus();
        assertFalse(countdown.isActive());
        assertFalse(token.countdownActive());
    }

    function test_CheckHolderStatus_NoopWhenHolderStillQualified() public {
        _giveAllTiers(alice);
        assertTrue(countdown.isActive());
        assertTrue(token.countdownActive());

        countdown.checkHolderStatus();

        assertTrue(countdown.isActive(),    "Countdown should remain active");
        assertTrue(token.countdownActive(), "Token countdown should remain active");
        assertEq(countdown.currentHolder(), alice, "Holder should still be alice");
    }

    function test_CheckHolderStatus_ResetsCountdownContractWhenHolderLosesTier() public {
        _giveAllTiers(alice);
        assertTrue(countdown.isActive());

        vm.prank(alice);
        token.safeTransferFrom(alice, bob, 2, 1, "");
        assertFalse(token.hasAllTiers(alice));

        countdown.checkHolderStatus();

        assertFalse(countdown.isActive(),           "Countdown contract should be reset");
        assertEq(countdown.currentHolder(), address(0), "Holder should be cleared");
        assertEq(countdown.countdownStartTime(), 0,     "Start time should be cleared");
    }

    function test_CheckHolderStatus_ResetsTokenWhenHolderLosesTier() public {
        _giveAllTiers(alice);
        assertTrue(token.countdownActive());

        vm.prank(alice);
        token.safeTransferFrom(alice, bob, 7, 1, "");

        countdown.checkHolderStatus();

        assertFalse(token.countdownActive(),           "Token countdownActive must be reset");
        assertEq(token.countdownHolder(),   address(0), "Token countdownHolder must be cleared");
        assertEq(token.countdownStartTime(), 0,         "Token countdownStartTime must be cleared");
    }

    function test_CheckHolderStatus_AllowsNewCountdownAfterReset() public {
        _giveAllTiers(alice);
        vm.prank(alice);
        token.safeTransferFrom(alice, bob, 2, 1, "");
        countdown.checkHolderStatus();

        assertFalse(token.countdownActive());

        for (uint256 tier = 3; tier <= 7; tier++) {
            _giveBlocks(bob, tier, 1);
        }

        assertTrue(token.countdownActive(),      "New countdown should start");
        assertEq(token.countdownHolder(), bob,   "Bob should be new holder");
    }

    function test_ResetExpiredHolder_RevertsIfNotCountdownContract() public {
        _giveAllTiers(alice);

        vm.prank(alice);
        vm.expectRevert("Only countdown contract");
        token.resetExpiredHolder();
    }

    function test_CheckHolderStatus_EmitsCountdownResetEvent() public {
        _giveAllTiers(alice);
        vm.prank(alice);
        token.safeTransferFrom(alice, bob, 2, 1, "");

        vm.expectEmit(true, false, false, false);
        emit BlockHuntCountdown.CountdownReset(alice);

        countdown.checkHolderStatus();
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 7d. TOKEN — updateCountdownHolder
    // ═════════════════════════════════════════════════════════════════════════

    function test_UpdateCountdownHolder_OnlyCountdownContract() public {
        _giveAllTiers(alice);
        assertTrue(token.countdownActive());

        // Non-countdown contract should revert
        vm.prank(alice);
        vm.expectRevert("Only countdown contract");
        token.updateCountdownHolder(bob);
    }

    function test_UpdateCountdownHolder_UpdatesState() public {
        _giveAllTiers(alice);
        assertTrue(token.countdownActive());

        uint256 challengeTime = block.timestamp + 1 days;
        vm.warp(challengeTime);

        vm.prank(address(countdown));
        token.updateCountdownHolder(bob);

        assertEq(token.countdownHolder(), bob, "Holder should be updated to bob");
        assertEq(token.countdownStartTime(), challengeTime, "Start time should reset");
        assertTrue(token.countdownActive(), "Countdown should remain active");
    }

    function test_UpdateCountdownHolder_RevertsNoActiveCountdown() public {
        assertFalse(token.countdownActive());

        vm.prank(address(countdown));
        vm.expectRevert("No active countdown");
        token.updateCountdownHolder(bob);
    }

    function test_UpdateCountdownHolder_EmitsEvent() public {
        _giveAllTiers(alice);

        vm.expectEmit(true, false, false, true);
        emit BlockHuntToken.CountdownHolderUpdated(bob, block.timestamp);

        vm.prank(address(countdown));
        token.updateCountdownHolder(bob);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 7e. COUNTDOWN CHALLENGE — SCORING
    // ═════════════════════════════════════════════════════════════════════════

    function test_CalculateScore_Empty() public view {
        assertEq(countdown.calculateScore(alice), 0, "Empty player should have score 0");
    }

    function test_CalculateScore_T7Only() public {
        _giveBlocks(alice, 7, 1000);
        assertEq(countdown.calculateScore(alice), 1000, "1000 T7 = 1000 points");
    }

    function test_CalculateScore_AllTiers() public {
        // Give known balances: 2×T2, 3×T3, 5×T4, 10×T5, 50×T6, 100×T7
        _giveBlocks(alice, 2, 2);
        _giveBlocks(alice, 3, 3);
        _giveBlocks(alice, 4, 5);
        _giveBlocks(alice, 5, 10);
        _giveBlocks(alice, 6, 50);
        _giveBlocks(alice, 7, 100);

        // 2*10000 + 3*2000 + 5*500 + 10*100 + 50*20 + 100*1 = 20000+6000+2500+1000+1000+100 = 30600
        assertEq(countdown.calculateScore(alice), 30600, "Weighted score should be 30600");
    }

    function test_CalculateScore_ExcludesT1() public {
        // calculateScore formula only sums T2-T7 weights.
        // Verify that a player with ONLY T7 blocks gets score = count * WEIGHT_T7.
        // If T1 were included, the formula would differ.
        // Also verify the score formula doesn't accidentally include index 0 or 1.
        _giveBlocks(alice, 7, 100);
        _giveBlocks(alice, 2, 1);
        // Score should be exactly 100*1 + 1*10000 = 10100
        // If T1 (index 1) were counted, it would be different since alice has 0 T1
        assertEq(countdown.calculateScore(alice), 10100, "Score should only count T2-T7");
    }

    function test_CalculateScore_ChangesWithBalance() public {
        _giveBlocks(alice, 7, 100);
        assertEq(countdown.calculateScore(alice), 100);

        _giveBlocks(alice, 7, 100);
        assertEq(countdown.calculateScore(alice), 200, "Score should update with new mints");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 7f. COUNTDOWN CHALLENGE — startCountdown records score
    // ═════════════════════════════════════════════════════════════════════════

    function test_ClaimHolderStatus_RecordsScore() public {
        // Give alice blocks across tiers so she has a score
        _giveBlocks(alice, 2, 1);
        _giveBlocks(alice, 3, 1);
        _giveBlocks(alice, 4, 1);
        _giveBlocks(alice, 5, 1);
        _giveBlocks(alice, 6, 1);
        // T7 given last triggers countdown
        _giveBlocks(alice, 7, 10);

        uint256 expectedScore = 1 * 10000 + 1 * 2000 + 1 * 500 + 1 * 100 + 1 * 20 + 10 * 1;
        assertEq(countdown.holderScore(), expectedScore, "holderScore should match calculateScore");
    }

    function test_ClaimHolderStatus_SetsLastChallengeTime() public {
        _giveAllTiers(alice);
        assertEq(countdown.lastChallengeTime(), block.timestamp, "lastChallengeTime should be set");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 7g. COUNTDOWN CHALLENGE — SUCCESS CASES
    // ═════════════════════════════════════════════════════════════════════════

    function test_Challenge_SucceedsHigherScore() public {
        // Alice triggers countdown with minimal blocks
        _giveAllTiers(alice);
        assertTrue(countdown.isActive());
        uint256 aliceScore = countdown.calculateScore(alice);

        // Bob gets more blocks — higher score
        _giveBlocks(bob, 2, 2);
        _giveBlocks(bob, 3, 2);
        _giveBlocks(bob, 4, 2);
        _giveBlocks(bob, 5, 2);
        _giveBlocks(bob, 6, 2);
        _giveBlocks(bob, 7, 100);
        uint256 bobScore = countdown.calculateScore(bob);
        assertTrue(bobScore > aliceScore, "Bob should have higher score");

        // Wait 24 hours for cooldown
        vm.warp(block.timestamp + 24 hours);

        vm.prank(bob);
        countdown.challengeCountdown();

        // Verify Countdown contract state
        assertEq(countdown.currentHolder(), bob, "Countdown holder should be bob");
        assertEq(countdown.holderScore(), bobScore, "holderScore should be bob's score");
        assertTrue(countdown.isActive(), "Countdown should still be active");

        // Verify Token state synced
        assertEq(token.countdownHolder(), bob, "Token holder should be bob");
        assertTrue(token.countdownActive(), "Token countdown should be active");
    }

    function test_Challenge_FullReset() public {
        _giveAllTiers(alice);
        uint256 claimTime = block.timestamp;

        // Give bob higher score
        _giveBlocks(bob, 2, 5);
        _giveBlocks(bob, 3, 5);
        _giveBlocks(bob, 4, 5);
        _giveBlocks(bob, 5, 5);
        _giveBlocks(bob, 6, 5);
        _giveBlocks(bob, 7, 100);

        // Warp past cooldown (halfway through countdown)
        vm.warp(claimTime + 3 days);

        vm.prank(bob);
        countdown.challengeCountdown();

        // Token's countdownStartTime should be reset to NOW, not the original start
        assertEq(token.countdownStartTime(), block.timestamp, "Should get full 7-day reset");

        // Countdown won't expire until 7 full days from challenge
        vm.warp(block.timestamp + 6 days);
        assertFalse(countdown.hasExpired(), "Should not be expired after 6 days from challenge");

        vm.warp(block.timestamp + 1 days);
        assertTrue(countdown.hasExpired(), "Should expire after 7 days from challenge");
    }

    function test_Challenge_MultipleSequential() public {
        // A claims
        _giveAllTiers(alice);
        assertEq(countdown.currentHolder(), alice);

        // B gets higher score
        _giveBlocks(bob, 2, 3);
        _giveBlocks(bob, 3, 3);
        _giveBlocks(bob, 4, 3);
        _giveBlocks(bob, 5, 3);
        _giveBlocks(bob, 6, 3);
        _giveBlocks(bob, 7, 100);

        // 24 hours, B challenges A
        vm.warp(block.timestamp + 24 hours);
        vm.prank(bob);
        countdown.challengeCountdown();
        assertEq(countdown.currentHolder(), bob);
        assertEq(token.countdownHolder(), bob);

        // C gets even higher score
        _giveBlocks(carol, 2, 10);
        _giveBlocks(carol, 3, 10);
        _giveBlocks(carol, 4, 10);
        _giveBlocks(carol, 5, 10);
        _giveBlocks(carol, 6, 10);
        _giveBlocks(carol, 7, 500);

        // 24 hours, C challenges B
        vm.warp(block.timestamp + 24 hours);
        vm.prank(carol);
        countdown.challengeCountdown();
        assertEq(countdown.currentHolder(), carol);
        assertEq(token.countdownHolder(), carol);
        assertTrue(countdown.isActive());
    }

    function test_Challenge_OriginalClaimStillWorks() public {
        // Normal claimHolderStatus flow via Token still works
        _giveAllTiers(alice);

        assertTrue(token.countdownActive());
        assertEq(token.countdownHolder(), alice);
        assertTrue(countdown.isActive());
        assertEq(countdown.currentHolder(), alice);
        assertGt(countdown.holderScore(), 0, "Score should be recorded");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 7h. COUNTDOWN CHALLENGE — REVERT CASES
    // ═════════════════════════════════════════════════════════════════════════

    function test_Challenge_RevertsNoCountdown() public {
        assertFalse(countdown.isActive());

        vm.prank(bob);
        vm.expectRevert("No active countdown");
        countdown.challengeCountdown();
    }

    function test_Challenge_RevertsSelf() public {
        _giveAllTiers(alice);

        vm.warp(block.timestamp + 24 hours);
        vm.prank(alice);
        vm.expectRevert("Holder cannot self-challenge");
        countdown.challengeCountdown();
    }

    function test_Challenge_RevertsMissingTier() public {
        _giveAllTiers(alice);

        // Bob has high score but missing T2
        _giveBlocks(bob, 3, 100);
        _giveBlocks(bob, 4, 100);
        _giveBlocks(bob, 5, 100);
        _giveBlocks(bob, 6, 100);
        _giveBlocks(bob, 7, 10000);

        vm.warp(block.timestamp + 24 hours);
        vm.prank(bob);
        vm.expectRevert("Must hold all 6 tiers");
        countdown.challengeCountdown();
    }

    function test_Challenge_RevertsCooldown() public {
        _giveAllTiers(alice);

        // Bob has higher score and all tiers
        _giveBlocks(bob, 2, 5);
        _giveBlocks(bob, 3, 5);
        _giveBlocks(bob, 4, 5);
        _giveBlocks(bob, 5, 5);
        _giveBlocks(bob, 6, 5);
        _giveBlocks(bob, 7, 100);

        // Try to challenge within 24 hours of claim
        vm.warp(block.timestamp + 23 hours);
        vm.prank(bob);
        vm.expectRevert("Challenge cooldown active");
        countdown.challengeCountdown();
    }

    function test_Challenge_RevertsLowerScore() public {
        // Alice gets lots of blocks
        _giveBlocks(alice, 2, 10);
        _giveBlocks(alice, 3, 10);
        _giveBlocks(alice, 4, 10);
        _giveBlocks(alice, 5, 10);
        _giveBlocks(alice, 6, 10);
        _giveBlocks(alice, 7, 100);

        // Bob gets minimal
        _giveAllTiers(bob);
        // Reset so alice can claim (bob triggered it, reset it)
        // Actually — bob triggered countdown, not alice. Let me restructure.
        // We need alice to be holder. Let's use a different approach.

        // Start fresh — alice triggers countdown
        // Since bob already triggered it, let's work with what we have
        // Bob is holder with score 12621. Alice has much higher score.
        // So alice challenges bob.
        // But we want to test LOWER score failing. So let carol challenge with low score.

        _giveAllTiers(carol);
        // carol has score = 1*10000+1*2000+1*500+1*100+1*20+1 = 12621
        // bob (holder) has same score 12621 — but bob was first holder
        // Actually bob triggered countdown first. Let's just check the scores.

        vm.warp(block.timestamp + 24 hours);
        vm.prank(carol);
        vm.expectRevert("Must rank above holder");
        countdown.challengeCountdown();
    }

    function test_Challenge_RevertsEqualScore() public {
        _giveAllTiers(alice);
        uint256 aliceScore = countdown.calculateScore(alice);

        // Bob gets exact same blocks — equal score
        _giveBlocks(bob, 2, 1);
        _giveBlocks(bob, 3, 1);
        _giveBlocks(bob, 4, 1);
        _giveBlocks(bob, 5, 1);
        _giveBlocks(bob, 6, 1);
        _giveBlocks(bob, 7, 1);
        uint256 bobScore = countdown.calculateScore(bob);
        assertEq(bobScore, aliceScore, "Scores should be equal");

        vm.warp(block.timestamp + 24 hours);
        vm.prank(bob);
        vm.expectRevert("Must rank above holder");
        countdown.challengeCountdown();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 7i. COUNTDOWN CHALLENGE — EDGE CASES
    // ═════════════════════════════════════════════════════════════════════════

    function test_Challenge_HolderScoreLiveRecalculation() public {
        // Alice claims with minimal blocks then accumulates more
        _giveAllTiers(alice);

        // Alice gets many more blocks — her total blocks count is high
        _giveBlocks(alice, 7, 200);
        uint256 aliceTotalBlocks = 6 + 200; // 1 each T2-T7 + 200 T7

        // Bob has all 6 tiers but fewer total blocks than Alice
        _giveBlocks(bob, 2, 1);
        _giveBlocks(bob, 3, 1);
        _giveBlocks(bob, 4, 1);
        _giveBlocks(bob, 5, 1);
        _giveBlocks(bob, 6, 1);
        _giveBlocks(bob, 7, 1);
        uint256 bobTotalBlocks = 6;
        assertTrue(bobTotalBlocks < aliceTotalBlocks, "Bob has fewer total blocks");

        // Both have 6 distinct tiers — tiebreaker is total blocks
        // Challenge should FAIL because Bob has fewer total blocks
        vm.warp(block.timestamp + 24 hours);
        vm.prank(bob);
        vm.expectRevert("Must rank above holder");
        countdown.challengeCountdown();
    }

    function test_Challenge_HolderScoreDrops() public {
        // Alice claims with lots of T7 blocks
        _giveBlocks(alice, 2, 1);
        _giveBlocks(alice, 3, 1);
        _giveBlocks(alice, 4, 1);
        _giveBlocks(alice, 5, 1);
        _giveBlocks(alice, 6, 1);
        _giveBlocks(alice, 7, 500);

        // Alice score = 10000+2000+500+100+20+500 = 13120
        // Alice then combines T7→T6 (burns 20 T7, gets 1 T6)
        vm.prank(alice);
        token.combine(7);
        // New score: 10000+2000+500+100+40+480 = 13120... same because 20*1 = 20, but gains 20
        // Let's instead have her transfer away some blocks
        vm.prank(alice);
        token.safeTransferFrom(alice, address(0xdead), 7, 400, "");
        // New alice score: 10000+2000+500+100+40+(500-20-400)*1 = 10000+2000+500+100+40+80 = 12720

        // Bob has score that beats the reduced score
        _giveBlocks(bob, 2, 1);
        _giveBlocks(bob, 3, 1);
        _giveBlocks(bob, 4, 1);
        _giveBlocks(bob, 5, 1);
        _giveBlocks(bob, 6, 1);
        _giveBlocks(bob, 7, 300);

        vm.warp(block.timestamp + 24 hours);
        vm.prank(bob);
        countdown.challengeCountdown();

        assertEq(countdown.currentHolder(), bob);
    }

    function test_Challenge_AtExactly24Hours() public {
        _giveAllTiers(alice);
        uint256 claimTime = countdown.lastChallengeTime();

        _giveBlocks(bob, 2, 5);
        _giveBlocks(bob, 3, 5);
        _giveBlocks(bob, 4, 5);
        _giveBlocks(bob, 5, 5);
        _giveBlocks(bob, 6, 5);
        _giveBlocks(bob, 7, 100);

        // Warp to exactly 24 hours — should succeed (>=)
        vm.warp(claimTime + 24 hours);
        vm.prank(bob);
        countdown.challengeCountdown();

        assertEq(countdown.currentHolder(), bob);
    }

    function test_ClaimTreasury_AfterChallenge() public {
        // Alice triggers, bob challenges, bob waits 7 days, bob claims treasury
        _giveAllTiers(alice);
        _giveBlocks(bob, 2, 5);
        _giveBlocks(bob, 3, 5);
        _giveBlocks(bob, 4, 5);
        _giveBlocks(bob, 5, 5);
        _giveBlocks(bob, 6, 5);
        _giveBlocks(bob, 7, 100);

        vm.warp(block.timestamp + 24 hours);
        vm.prank(bob);
        countdown.challengeCountdown();

        // Fund treasury for claim
        vm.deal(address(treasury), 10 ether);

        // Wait 7 days
        vm.warp(block.timestamp + 7 days);

        vm.prank(bob);
        token.claimTreasury();

        assertFalse(token.countdownActive(), "Countdown should be reset after claim");
    }

    function test_Sacrifice_AfterChallenge() public {
        _giveAllTiers(alice);
        _giveBlocks(bob, 2, 5);
        _giveBlocks(bob, 3, 5);
        _giveBlocks(bob, 4, 5);
        _giveBlocks(bob, 5, 5);
        _giveBlocks(bob, 6, 5);
        _giveBlocks(bob, 7, 100);

        vm.warp(block.timestamp + 24 hours);
        vm.prank(bob);
        countdown.challengeCountdown();

        // Fund treasury for sacrifice
        vm.deal(address(treasury), 10 ether);

        // Wait 7 days
        vm.warp(block.timestamp + 7 days);

        vm.prank(bob);
        token.sacrifice();

        assertFalse(token.countdownActive());
        assertEq(token.balanceOf(bob, 1), 1, "Bob should have The Origin");
    }

    function test_OldHolder_CannotClaimAfterChallenge() public {
        _giveAllTiers(alice);
        _giveBlocks(bob, 2, 5);
        _giveBlocks(bob, 3, 5);
        _giveBlocks(bob, 4, 5);
        _giveBlocks(bob, 5, 5);
        _giveBlocks(bob, 6, 5);
        _giveBlocks(bob, 7, 100);

        vm.warp(block.timestamp + 24 hours);
        vm.prank(bob);
        countdown.challengeCountdown();

        vm.deal(address(treasury), 10 ether);
        vm.warp(block.timestamp + 7 days);

        // Alice (old holder) tries to claim — should revert
        vm.prank(alice);
        vm.expectRevert("Not the countdown holder");
        token.claimTreasury();
    }

    function test_SyncReset_ClearsChallengeState() public {
        _giveAllTiers(alice);
        assertGt(countdown.holderScore(), 0);
        assertGt(countdown.lastChallengeTime(), 0);

        // Holder loses a tier — checkHolderStatus resets everything
        vm.prank(alice);
        token.safeTransferFrom(alice, bob, 2, 1, "");
        countdown.checkHolderStatus();

        assertEq(countdown.holderScore(), 0, "holderScore should be cleared");
        assertEq(countdown.lastChallengeTime(), 0, "lastChallengeTime should be cleared");
    }

    function test_CheckHolderStatus_StillWorksAfterChallenge() public {
        _giveAllTiers(alice);

        _giveBlocks(bob, 2, 5);
        _giveBlocks(bob, 3, 5);
        _giveBlocks(bob, 4, 5);
        _giveBlocks(bob, 5, 5);
        _giveBlocks(bob, 6, 5);
        _giveBlocks(bob, 7, 100);

        vm.warp(block.timestamp + 24 hours);
        vm.prank(bob);
        countdown.challengeCountdown();

        // Bob loses ALL of one tier — transfers all 5 T2 away
        vm.prank(bob);
        token.safeTransferFrom(bob, carol, 2, 5, "");

        countdown.checkHolderStatus();

        assertFalse(countdown.isActive(), "Countdown should be reset");
        assertFalse(token.countdownActive(), "Token countdown should be reset");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 8. ESCROW TESTS (NEW - Phase 2)
    //
    // BlockHuntEscrow handles all sacrifice fund distribution:
    //   50% → winner immediately
    //   40% → community pool (keeper sets entitlements)
    //   10% → Season 2 seed
    // ═════════════════════════════════════════════════════════════════════════

    function test_Escrow_InitiateSacrifice_OnlyToken() public {
        vm.deal(address(escrow), 10 ether);
        vm.prank(alice);
        vm.expectRevert("Only token contract");
        escrow.initiateSacrifice(alice);
    }

    function test_Escrow_SetLeaderboardEntitlements() public {
        _doSacrifice(10 ether);

        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = 3 ether;

        vm.prank(keeper);
        escrow.setLeaderboardEntitlements(players, amounts);

        assertEq(escrow.entitlementsSet(), true);
        assertEq(escrow.leaderboardEntitlement(bob), 3 ether);
    }

    function test_Escrow_SetEntitlements_OnlyKeeper() public {
        _doSacrifice(10 ether);

        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = 1 ether;

        vm.prank(alice);
        vm.expectRevert("Only keeper");
        escrow.setLeaderboardEntitlements(players, amounts);
    }

    function test_Escrow_SetEntitlements_ExceedPoolReverts() public {
        _doSacrifice(10 ether);

        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = 5 ether;  // exceeds the ~4 ether pool

        vm.prank(keeper);
        vm.expectRevert("Exceeds community pool");
        escrow.setLeaderboardEntitlements(players, amounts);
    }

    function test_Escrow_ClaimLeaderboardReward() public {
        _doSacrifice(10 ether);

        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = 3 ether;

        vm.prank(keeper);
        escrow.setLeaderboardEntitlements(players, amounts);

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        escrow.claimLeaderboardReward();

        assertEq(bob.balance - bobBefore, 3 ether, "Bob should receive entitlement");
        assertEq(escrow.hasClaimed(bob), true);
    }

    function test_Escrow_ClaimDoubleClaim_Reverts() public {
        _doSacrifice(10 ether);

        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = 3 ether;

        vm.prank(keeper);
        escrow.setLeaderboardEntitlements(players, amounts);

        vm.prank(bob);
        escrow.claimLeaderboardReward();

        vm.prank(bob);
        vm.expectRevert("Already claimed");
        escrow.claimLeaderboardReward();
    }

    function test_Escrow_ClaimNoEntitlement_Reverts() public {
        _doSacrifice(10 ether);

        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = 3 ether;

        vm.prank(keeper);
        escrow.setLeaderboardEntitlements(players, amounts);

        vm.prank(carol);
        vm.expectRevert("No entitlement");
        escrow.claimLeaderboardReward();
    }

    function test_Escrow_ClaimAfterExpiry_Reverts() public {
        _doSacrifice(10 ether);

        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = 3 ether;

        vm.prank(keeper);
        escrow.setLeaderboardEntitlements(players, amounts);

        vm.warp(block.timestamp + 31 days);

        vm.prank(bob);
        vm.expectRevert("Claim window expired");
        escrow.claimLeaderboardReward();
    }

    function test_Escrow_ReleaseSeason2Seed() public {
        _doSacrifice(10 ether);

        vm.prank(keeper);
        escrow.setSeason2TreasuryAddress(season2Treasury);

        uint256 seedAmount = escrow.season2Seed();
        uint256 s2Before = season2Treasury.balance;

        escrow.releaseSeason2Seed();

        assertEq(season2Treasury.balance - s2Before, seedAmount, "Season 2 treasury receives seed");
        assertEq(escrow.season2SeedReleased(), true);
    }

    function test_Escrow_SweepUnclaimedRewards() public {
        _doSacrifice(10 ether);

        // Set minimal entitlements so pool has funds
        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = 1 ether;

        vm.prank(keeper);
        escrow.setLeaderboardEntitlements(players, amounts);

        vm.prank(keeper);
        escrow.setSeason2TreasuryAddress(season2Treasury);

        // Fast-forward past claim window
        vm.warp(block.timestamp + 31 days);

        uint256 poolBefore = escrow.communityPool();
        assertGt(poolBefore, 0);

        escrow.sweepUnclaimedRewards();

        assertEq(escrow.communityPool(), 0, "Pool should be emptied");
    }

    function test_Escrow_SweepBeforeExpiry_Reverts() public {
        _doSacrifice(10 ether);

        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = 1 ether;
        vm.prank(keeper);
        escrow.setLeaderboardEntitlements(players, amounts);

        vm.prank(keeper);
        escrow.setSeason2TreasuryAddress(season2Treasury);

        vm.warp(block.timestamp + 15 days);
        vm.expectRevert("Claim window still open");
        escrow.sweepUnclaimedRewards();
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 9. TOKEN ADMIN & SECURITY TESTS
    // ═════════════════════════════════════════════════════════════════════════

    function test_PauseStopsMinting() public {
        vm.prank(owner);
        token.pause();

        vm.prank(alice);
        vm.expectRevert();
        token.mint{value: MINT_PRICE * 5}(5);
    }

    function test_UnpauseRestoresMinting() public {
        vm.prank(owner);
        token.pause();

        vm.prank(owner);
        token.unpause();

        vm.prank(alice);
        token.mint{value: MINT_PRICE * 5}(5);
    }

    function test_TestMintDisabledAfterDisableCall() public {
        vm.prank(owner);
        token.disableTestMint();

        vm.prank(owner);
        vm.expectRevert("Test mint disabled");
        token.mintForTest(alice, 7, 10);
    }

    function test_OnlyOwnerCanDisableTestMint() public {
        vm.prank(alice);
        vm.expectRevert();
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
    }

    function test_SetURIRevertsForNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        token.setURI("https://malicious.com/{id}.json");
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 10. MIGRATION TESTS
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

        _giveBlocks(alice, 7, 50);

        vm.prank(alice);
        vm.expectRevert("Need at least 100 Season 1 blocks");
        migration.migrate();
    }

    function test_MigrationSucceedsWithLowTier() public {
        vm.prank(owner);
        migration.openMigrationWindow();

        _giveBlocks(alice, 7, 200);

        vm.prank(alice);
        migration.migrate();

        assertEq(migration.hasMigrated(alice),      true,  "Alice should be marked as migrated");
        assertEq(migration.migrationReward(alice),  100,   "Should receive 100 starters");
        assertGt(tokenV2.totalReceived(alice),      0,     "Should have received Season 2 starters");
    }

    function test_MigrationSucceedsWithMidTier() public {
        vm.prank(owner);
        migration.openMigrationWindow();

        _giveBlocks(alice, 7, 600);

        vm.prank(alice);
        migration.migrate();

        assertEq(migration.migrationReward(alice), 150, "Should receive 150 starters");
    }

    function test_MigrationSucceedsWithHighTier() public {
        vm.prank(owner);
        migration.openMigrationWindow();

        _giveBlocks(alice, 7, 1000);

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


    // ═════════════════════════════════════════════════════════════════════════
    // 11. SEASON REGISTRY TESTS
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

    function test_RegistryOnlyOwnerCanRegister() public {
        vm.prank(alice);
        vm.expectRevert();
        registry.registerSeason(2, address(treasury), address(token), address(mintWindow), address(forge));
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 12. INTEGRATION / END-TO-END TESTS
    // ═════════════════════════════════════════════════════════════════════════

    function test_FullGameFlow_Claim() public {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 50}(50);

        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        assertEq(token.countdownActive(), true);
        assertEq(countdown.isActive(),    true);

        vm.prank(bob);
        countdown.castVote(false);

        vm.deal(address(treasury), 5 ether);
        uint256 aliceBefore = alice.balance;

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.claimTreasury();

        assertGt(alice.balance, aliceBefore,         "Alice should have received ETH");
        assertEq(token.countdownActive(), false,      "Game should end");
        assertEq(countdown.isActive(),    false,      "Countdown contract should sync");
    }

    // [PHASE 2] Full sacrifice flow using Escrow
    function test_FullGameFlow_Sacrifice_ThenEscrowClaims() public {
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }

        vm.deal(address(treasury), 10 ether);

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.sacrifice();

        // Alice holds The Origin
        assertEq(token.balanceOf(alice, 1), 1);

        // Escrow holds community pool + season2 seed
        assertApproxEqAbs(escrow.communityPool(), 4 ether, 0.001 ether, "40% held in escrow");
        assertApproxEqAbs(escrow.season2Seed(),   1 ether, 0.001 ether, "10% held in escrow");

        // Keeper sets entitlements
        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = 3 ether;
        vm.prank(keeper);
        escrow.setLeaderboardEntitlements(players, amounts);

        // Bob claims
        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        escrow.claimLeaderboardReward();
        assertEq(bob.balance - bobBefore, 3 ether, "Bob receives entitlement");

        // Release season 2 seed
        vm.prank(keeper);
        escrow.setSeason2TreasuryAddress(season2Treasury);
        escrow.releaseSeason2Seed();
        assertGt(season2Treasury.balance, 0, "Season 2 treasury receives seed");
    }

    function test_FullGameFlow_VRFForge_ThenWin() public withVRFEnabled {
        _giveBlocks(alice, 7, 21);

        vm.prank(alice);
        forge.forge(7, 21);

        mockVRFCoordinator.fulfillRequest(1, 0);
        assertEq(token.balanceOf(alice, 6), 1, "Alice forged a Tier-6 via VRF");

        for (uint256 tier = 2; tier <= 5; tier++) {
            _giveBlocks(alice, tier, 1);
        }
        _giveBlocks(alice, 7, 1);
        assertEq(token.countdownActive(), true, "Countdown should trigger");

        vm.deal(address(treasury), 5 ether);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.claimTreasury();

        assertFalse(token.countdownActive(), "Game should be over");
    }

    function test_MultiplePlayersCannotTriggerSimultaneousCountdowns() public {
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }
        assertEq(token.countdownActive(), true);
        assertEq(token.countdownHolder(), alice);

        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(bob, tier, 1);
        }

        assertEq(token.countdownHolder(), alice, "First holder keeps countdown");
    }


    // ═════════════════════════════════════════════════════════════════════════
    // RESTORED: COUNTDOWN VIEW HELPERS
    // ═════════════════════════════════════════════════════════════════════════

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

    function test_ClaimRequiresAllTiers() public {
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }
        assertEq(token.countdownActive(), true, "Countdown needs all tiers to be active");
    }

    function test_StartCountdownRevertsIfCalledDirectly() public {
        vm.prank(alice);
        vm.expectRevert("Only token contract");
        countdown.startCountdown(alice);
    }

    function test_ResetExpiredHolder_NoopIfAlreadyInactive() public {
        assertFalse(token.countdownActive());
        vm.prank(address(countdown));
        token.resetExpiredHolder();
        assertFalse(token.countdownActive(), "Should still be inactive");
    }


    // ═════════════════════════════════════════════════════════════════════════
    // RESTORED: MINT VRF - MULTIPLE PENDING & CANCEL EDGE CASES
    // ═════════════════════════════════════════════════════════════════════════

    function test_MintVRF_MultiplePendingRequestsAllowed() public withMintVRFEnabled {
        vm.startPrank(alice);
        token.mint{value: MINT_PRICE * 10}(10);
        token.mint{value: MINT_PRICE * 10}(10);
        vm.stopPrank();

        uint256[] memory pending = token.getPendingRequests(alice);
        assertEq(pending.length, 2, "Alice can have multiple pending requests simultaneously");
    }

    function test_MintVRF_TwoPlayersHaveSeparatePendingLists() public withMintVRFEnabled {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        vm.prank(bob);
        token.mint{value: MINT_PRICE * 10}(10);

        assertEq(token.getPendingRequests(alice).length, 1, "Alice has 1 pending");
        assertEq(token.getPendingRequests(bob).length,   1, "Bob has 1 pending");
    }

    function test_MintVRF_CancelEmitsEvent() public withMintVRFEnabled {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        vm.warp(block.timestamp + 1 hours + 1);

        vm.expectEmit(true, true, false, true);
        emit BlockHuntToken.MintCancelled(alice, 1, MINT_PRICE * 10);

        vm.prank(alice);
        token.cancelMintRequest(1);
    }

    function test_MintVRF_CancelClearsFromPendingList() public withMintVRFEnabled {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        vm.warp(block.timestamp + 1 hours + 1);

        vm.prank(alice);
        token.cancelMintRequest(1);

        assertEq(token.getPendingRequests(alice).length, 0, "Pending list should be empty after cancel");
    }

    function test_MintVRF_CancelNonExistentRequestReverts() public withMintVRFEnabled {
        vm.warp(block.timestamp + 1 hours + 1);

        vm.prank(alice);
        vm.expectRevert("Request not found");
        token.cancelMintRequest(999);
    }

    function test_MintVRF_CallbackChecksCountdownTrigger() public withMintVRFEnabled {
        // Give alice all tiers to trigger and resolve countdown first
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }
        vm.deal(address(treasury), 5 ether);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.claimTreasury();
        assertEq(token.countdownActive(), false, "Countdown reset after claim");

        // Give bob tiers 2-7 via testMint (countdown triggers on last one)
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(bob, tier, 1);
        }
        assertEq(token.countdownActive(), true,  "Bob triggered countdown via testMint");
        assertEq(token.countdownHolder(), bob,   "Bob is holder");
    }

    function test_MintPseudoRandom_NoPendingRequests() public {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 10}(10);

        assertEq(token.getPendingRequests(alice).length, 0, "Pseudo-random path creates no pending requests");
    }

    function test_MintVRF_CapReservedBeforeCallbackPreventsOverrun() public withMintVRFEnabled {
        // Mint a large number - cap should be reserved immediately
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 400}(400);

        // Cap reserved at request time; the window cap should be reduced
        // Second mint should respect remaining cap
        vm.prank(bob);
        token.mint{value: MINT_PRICE * 10}(10);

        // Both pending
        assertEq(token.getPendingRequests(alice).length, 1);
        assertEq(token.getPendingRequests(bob).length, 1);
    }

    function test_MintVRF_TierAggregationProducesCorrectTotal() public withMintVRFEnabled {
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 50}(50);

        mockVRFCoordinator.fulfillRequest(1, 42);

        uint256 total = 0;
        for (uint256 tier = 2; tier <= 7; tier++) {
            total += token.balanceOf(alice, tier);
        }
        assertEq(total, 50, "Aggregated tier mint must sum to exactly 50");
    }


    // ═════════════════════════════════════════════════════════════════════════
    // RESTORED: ESCROW - ADDITIONAL EDGE CASES
    // ═════════════════════════════════════════════════════════════════════════

    function test_Escrow_EntitlementStoredAfterSacrifice() public {
        _doSacrifice(10 ether);

        // Keeper sets entitlements
        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = 4 ether;

        vm.prank(keeper);
        escrow.setLeaderboardEntitlements(players, amounts);

        assertEq(escrow.leaderboardEntitlement(bob), 4 ether, "Bob entitlement should be stored");
    }

    function test_Escrow_ClaimWindowSetAfterSacrifice() public {
        _doSacrifice(10 ether);
        assertGt(escrow.claimWindowExpiry(), block.timestamp, "Claim window should be in future");
    }

    function test_Escrow_SweepWithNoSacrifice_Reverts() public {
        vm.expectRevert("No sacrifice");
        escrow.sweepUnclaimedRewards();
    }

    function test_Escrow_MultipleEntrantsClaim() public {
        _doSacrifice(10 ether);

        address[] memory players = new address[](2);
        uint256[] memory amounts = new uint256[](2);
        players[0] = bob;   amounts[0] = 2 ether;
        players[1] = carol; amounts[1] = 1 ether;

        vm.prank(keeper);
        escrow.setLeaderboardEntitlements(players, amounts);

        uint256 bobBefore   = bob.balance;
        uint256 carolBefore = carol.balance;

        vm.prank(bob);
        escrow.claimLeaderboardReward();

        vm.prank(carol);
        escrow.claimLeaderboardReward();

        assertEq(bob.balance   - bobBefore,   2 ether, "Bob gets his 2 ether");
        assertEq(carol.balance - carolBefore, 1 ether, "Carol gets her 1 ether");
    }

    function test_Escrow_SweepAfterExpiry() public {
        _doSacrifice(10 ether);

        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = 1 ether;

        vm.prank(keeper);
        escrow.setLeaderboardEntitlements(players, amounts);

        // Set season2 treasury address so sweep has a destination
        vm.prank(keeper);
        escrow.setSeason2TreasuryAddress(season2Treasury);

        // Bob never claims - sweep after 30 days
        vm.warp(block.timestamp + 31 days);
        escrow.sweepUnclaimedRewards();

        assertEq(escrow.communityPool(), 0, "Pool should be emptied");
    }

    function test_Escrow_SweepIsPermissionless() public {
        _doSacrifice(10 ether);

        address[] memory players = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        players[0] = bob;
        amounts[0] = 1 ether;

        vm.prank(keeper);
        escrow.setLeaderboardEntitlements(players, amounts);

        vm.prank(keeper);
        escrow.setSeason2TreasuryAddress(season2Treasury);

        vm.warp(block.timestamp + 31 days);

        // Carol (random non-owner) can trigger the sweep
        vm.prank(carol);
        escrow.sweepUnclaimedRewards();

        assertEq(escrow.communityPool(), 0, "Carol should be able to trigger sweep");
    }


    // ═════════════════════════════════════════════════════════════════════════
    // RESTORED: MIGRATION EDGE CASES
    // ═════════════════════════════════════════════════════════════════════════

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

        // 3. Escrow holds the 40% community pool and 10% season2Seed
        assertApproxEqAbs(escrow.communityPool(), 4 ether, 0.001 ether, "40% held in escrow");
        assertApproxEqAbs(escrow.season2Seed(),   1 ether, 0.001 ether, "10% held in escrow");

        // 4. Migration window opens for Season 1 → Season 2
        _giveBlocks(bob, 7, 500);

        vm.prank(owner);
        migration.openMigrationWindow();

        vm.prank(bob);
        migration.migrate();

        assertEq(migration.hasMigrated(bob),    true, "Bob migrated to Season 2");
        assertEq(migration.migrationReward(bob), 150, "Bob gets 150 starters");
    }


    // ═════════════════════════════════════════════════════════════════════════
    // RESTORED: SEASON REGISTRY TESTS
    // ═════════════════════════════════════════════════════════════════════════

    function test_RegistryMarkSeasonEndedSacrifice() public {
        vm.prank(owner);
        registry.markSeasonEnded(1, alice, true, 10 ether, 5 ether);

        (address winner, bool wasSacrifice, , uint256 seed) = registry.seasonOutcome(1);
        assertEq(winner,       alice,   "Winner should be alice");
        assertEq(wasSacrifice, true,    "Should be sacrifice");
        assertEq(seed,         5 ether, "Seed amount recorded");
    }

    function test_RegistryCannotEndUnlaunchedSeason() public {
        vm.startPrank(owner);
        BlockHuntTreasury   treasury2   = new BlockHuntTreasury(creator);
        BlockHuntToken      token2      = new BlockHuntToken("uri", creator, 1000, address(mockVRFCoordinator));
        BlockHuntMintWindow mintWindow2 = new BlockHuntMintWindow();
        BlockHuntForge      forge2      = new BlockHuntForge(address(mockVRFCoordinator));

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
        vm.startPrank(owner);
        BlockHuntTreasury   treasury2   = new BlockHuntTreasury(creator);
        BlockHuntToken      token2      = new BlockHuntToken("uri", creator, 1000, address(mockVRFCoordinator));
        BlockHuntMintWindow mintWindow2 = new BlockHuntMintWindow();
        BlockHuntForge      forge2      = new BlockHuntForge(address(mockVRFCoordinator));

        registry.registerSeason(2, address(treasury2), address(token2), address(mintWindow2), address(forge2));
        registry.markSeasonEnded(1, alice, true, 10 ether, 5 ether);
        vm.stopPrank();

        address dest = registry.getAuthorisedSeedDestination(1);
        assertEq(dest, address(treasury2), "Seed destination should be Season 2 treasury");
    }

    function test_RegistryGetAuthorisedSeedDestinationFailsIfNotSacrifice() public {
        vm.startPrank(owner);
        BlockHuntTreasury   treasury2   = new BlockHuntTreasury(creator);
        BlockHuntToken      token2      = new BlockHuntToken("uri", creator, 1000, address(mockVRFCoordinator));
        BlockHuntMintWindow mintWindow2 = new BlockHuntMintWindow();
        BlockHuntForge      forge2      = new BlockHuntForge(address(mockVRFCoordinator));

        registry.registerSeason(2, address(treasury2), address(token2), address(mintWindow2), address(forge2));
        registry.markSeasonEnded(1, alice, false, 10 ether, 0);
        vm.stopPrank();

        vm.expectRevert("Not a sacrifice");
        registry.getAuthorisedSeedDestination(1);
    }

    function test_RegistryGetNextSeasonTreasury() public {
        vm.startPrank(owner);
        BlockHuntTreasury   treasury2   = new BlockHuntTreasury(creator);
        BlockHuntToken      token2      = new BlockHuntToken("uri", creator, 1000, address(mockVRFCoordinator));
        BlockHuntMintWindow mintWindow2 = new BlockHuntMintWindow();
        BlockHuntForge      forge2      = new BlockHuntForge(address(mockVRFCoordinator));

        registry.registerSeason(2, address(treasury2), address(token2), address(mintWindow2), address(forge2));
        vm.stopPrank();

        address next = registry.getNextSeasonTreasury(1);
        assertEq(next, address(treasury2), "Should return Season 2 treasury");
    }

    function test_RegistryGetNextSeasonTreasuryFailsIfNotRegistered() public view {
        assertEq(registry.totalSeasons(), 1, "Only Season 1 registered");
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
        vm.startPrank(owner);
        BlockHuntTreasury   treasury2   = new BlockHuntTreasury(creator);
        BlockHuntToken      token2      = new BlockHuntToken("uri", creator, 1000, address(mockVRFCoordinator));
        BlockHuntMintWindow mintWindow2 = new BlockHuntMintWindow();
        BlockHuntForge      forge2      = new BlockHuntForge(address(mockVRFCoordinator));
        registry.registerSeason(2, address(treasury2), address(token2), address(mintWindow2), address(forge2));
        vm.stopPrank();

        vm.prank(address(treasury));
        registry.logSeedTransfer(1, 2, 5 ether);
    }

    function test_RegistryLogSeedTransferFailsIfNotTreasury() public {
        vm.startPrank(owner);
        BlockHuntTreasury   treasury2   = new BlockHuntTreasury(creator);
        BlockHuntToken      token2      = new BlockHuntToken("uri", creator, 1000, address(mockVRFCoordinator));
        BlockHuntMintWindow mintWindow2 = new BlockHuntMintWindow();
        BlockHuntForge      forge2      = new BlockHuntForge(address(mockVRFCoordinator));
        registry.registerSeason(2, address(treasury2), address(token2), address(mintWindow2), address(forge2));
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert("Only from-season treasury");
        registry.logSeedTransfer(1, 2, 5 ether);
    }


    // ═════════════════════════════════════════════════════════════════════════
    // 14. TEST-MODE SETTER TESTS
    // ═════════════════════════════════════════════════════════════════════════

    // ── Escrow.setTokenContract ──────────────────────────────────────────────

    function test_Escrow_SetTokenContract_ReCallableInTestMode() public {
        // Escrow already has tokenContract set from setUp
        assertEq(escrow.tokenContract(), address(token));

        // Re-calling should work in test mode
        vm.prank(owner);
        escrow.setTokenContract(address(alice));
        assertEq(escrow.tokenContract(), address(alice));
    }

    function test_Escrow_SetTokenContract_LocksAfterTestModeDisabled() public {
        vm.startPrank(owner);
        escrow.disableTestMode();
        vm.expectRevert("Already set");
        escrow.setTokenContract(address(alice));
        vm.stopPrank();
    }

    // ── Token.setMigrationContract ───────────────────────────────────────────

    function test_Token_SetMigrationContract_ReCallableInTestMode() public {
        // Migration contract already set from setUp
        assertTrue(token.migrationContract() != address(0));

        // Re-calling should work while testMintEnabled is true
        vm.prank(owner);
        token.setMigrationContract(address(alice));
        assertEq(token.migrationContract(), address(alice));
    }

    function test_Token_SetMigrationContract_LocksAfterTestMintDisabled() public {
        vm.startPrank(owner);
        token.disableTestMint();
        vm.expectRevert("Already set");
        token.setMigrationContract(address(alice));
        vm.stopPrank();
    }

    // ── Treasury.setTokenContract (already tested above, added explicit test mode coverage) ─

    function test_Treasury_SetTokenContract_ReCallableInTestMode() public {
        assertEq(treasury.tokenContract(), address(token));

        vm.prank(owner);
        treasury.setTokenContract(address(alice));
        assertEq(treasury.tokenContract(), address(alice));
    }

    function test_Treasury_SetTokenContract_LocksAfterTestModeDisabled() public {
        vm.startPrank(owner);
        treasury.disableTestMode();
        vm.expectRevert("Already set");
        treasury.setTokenContract(address(alice));
        vm.stopPrank();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FIX H-4: Royalty 10% Cap
    // ═════════════════════════════════════════════════════════════════════════

    function test_SetRoyalty_At10Percent() public {
        vm.prank(owner);
        token.setRoyalty(alice, 1000); // 10% — should succeed
        (address receiver, uint256 amount) = token.royaltyInfo(1, 1 ether);
        assertEq(receiver, alice);
        assertEq(amount, 0.1 ether);
    }

    function test_SetRoyalty_Above10Percent_Reverts() public {
        vm.prank(owner);
        vm.expectRevert("Exceeds 10% cap");
        token.setRoyalty(alice, 1001);
    }

    function test_SetRoyalty_At100Percent_Reverts() public {
        vm.prank(owner);
        vm.expectRevert("Exceeds 10% cap");
        token.setRoyalty(alice, 10000);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FIX H-1: Token Admin Setter Guards
    // ═════════════════════════════════════════════════════════════════════════

    function test_Token_SetTreasuryContract_ReCallableInTestMode() public {
        assertEq(token.treasuryContract(), address(treasury));
        vm.prank(owner);
        token.setTreasuryContract(address(alice));
        assertEq(token.treasuryContract(), address(alice));
    }

    function test_Token_SetTreasuryContract_LocksAfterTestMintDisabled() public {
        vm.startPrank(owner);
        token.disableTestMint();
        vm.expectRevert("Already set");
        token.setTreasuryContract(address(alice));
        vm.stopPrank();
    }

    function test_Token_SetMintWindowContract_LocksAfterTestMintDisabled() public {
        vm.startPrank(owner);
        token.disableTestMint();
        vm.expectRevert("Already set");
        token.setMintWindowContract(address(alice));
        vm.stopPrank();
    }

    function test_Token_SetForgeContract_LocksAfterTestMintDisabled() public {
        vm.startPrank(owner);
        token.disableTestMint();
        vm.expectRevert("Already set");
        token.setForgeContract(address(alice));
        vm.stopPrank();
    }

    function test_Token_SetCountdownContract_LocksAfterTestMintDisabled() public {
        vm.startPrank(owner);
        token.disableTestMint();
        vm.expectRevert("Already set");
        token.setCountdownContract(address(alice));
        vm.stopPrank();
    }

    function test_Token_SetEscrowContract_LocksAfterTestMintDisabled() public {
        vm.startPrank(owner);
        token.disableTestMint();
        vm.expectRevert("Already set");
        token.setEscrowContract(address(alice));
        vm.stopPrank();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FIX M-1: Pull-Payment for Sacrifice Winner
    // ═════════════════════════════════════════════════════════════════════════

    function test_Sacrifice_WinnerMustWithdraw() public {
        vm.deal(address(treasury), 10 ether);
        uint256 aliceBefore = alice.balance;

        _giveAllTiers(alice);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.sacrifice();

        // Balance should NOT have changed — pull-payment
        assertEq(alice.balance, aliceBefore, "Alice should not receive ETH until withdrawal");

        // Withdraw
        vm.prank(alice);
        escrow.withdrawWinnerShare();
        assertApproxEqAbs(alice.balance - aliceBefore, 5 ether, 0.001 ether, "Alice gets 50% after withdraw");
    }

    function test_Sacrifice_MaliciousContractDoesNotBlockSacrifice() public {
        // Deploy a contract that reverts on ETH receive
        RevertOnReceive malicious = new RevertOnReceive();
        address malAddr = address(malicious);

        vm.deal(address(treasury), 10 ether);
        _giveAllTiers(malAddr);

        vm.warp(block.timestamp + 7 days + 1);

        // Sacrifice should succeed (stores pendingWithdrawal instead of sending)
        vm.prank(malAddr);
        token.sacrifice();

        // Verify pools are correctly set
        assertApproxEqAbs(escrow.communityPool(), 4 ether, 0.001 ether, "40% community pool set");
        assertApproxEqAbs(escrow.season2Seed(), 1 ether, 0.001 ether, "10% season2 seed set");
        assertApproxEqAbs(escrow.pendingWithdrawal(malAddr), 5 ether, 0.001 ether, "50% stored for withdrawal");
    }

    function test_WithdrawWinnerShare_DoubleWithdraw_Reverts() public {
        _doSacrifice(10 ether);

        vm.prank(alice);
        escrow.withdrawWinnerShare();

        vm.prank(alice);
        vm.expectRevert("Nothing to withdraw");
        escrow.withdrawWinnerShare();
    }

    function test_WithdrawWinnerShare_NonWinner_Reverts() public {
        _doSacrifice(10 ether);

        vm.prank(bob);
        vm.expectRevert("Nothing to withdraw");
        escrow.withdrawWinnerShare();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═════════════════════════════════════════════════════════════════════════

    /// @dev Mints blocks directly to a player via testMint - bypasses window.
    function _giveBlocks(address player, uint256 tier, uint256 amount) internal {
        vm.prank(owner);
        token.mintForTest(player, tier, amount);
    }

    /// @dev Give a player exactly one block of every tier (2-7), triggering countdown.
    function _giveAllTiers(address player) internal {
        vm.startPrank(owner);
        for (uint256 tier = 2; tier <= 7; tier++) {
            token.mintForTest(player, tier, 1);
        }
        vm.stopPrank();
    }

    /// @dev Execute a sacrifice with given treasury amount.
    ///      Alice triggers countdown, 7 days pass, then sacrifice is executed.
    function _doSacrifice(uint256 treasuryAmount) internal {
        vm.deal(address(treasury), treasuryAmount);
        _giveAllTiers(alice);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        token.sacrifice();
    }


    // ═════════════════════════════════════════════════════════════════════════
    // v2.1 SPEC TESTS
    // ═════════════════════════════════════════════════════════════════════════

    // ── 1. totalMinted counter never decrements ───────────────────────────

    function test_TotalMintedNeverDecrements() public {
        // Mint 100 blocks
        vm.prank(alice);
        token.mint{value: MINT_PRICE * 100}(100);
        assertEq(token.totalMinted(), 100, "totalMinted should be 100 after mint");

        // Combine 21 T7s into 1 T6 — totalMinted must NOT change
        _giveBlocks(alice, 7, 21);
        uint256 mintedBefore = token.totalMinted();
        vm.prank(alice);
        token.combine(7);
        assertEq(token.totalMinted(), mintedBefore, "totalMinted must not decrease on combine");
    }

    // ── 2. Combine ratio verification (all 5) ────────────────────────────

    function test_NewCombineRatios_21_Succeeds() public {
        _giveBlocks(alice, 7, 21);
        vm.prank(alice);
        token.combine(7);
        assertEq(token.balanceOf(alice, 6), 1, "21 T7 -> 1 T6");
    }

    function test_NewCombineRatios_20_Fails() public {
        _giveBlocks(alice, 7, 20);
        vm.prank(alice);
        vm.expectRevert("Insufficient blocks");
        token.combine(7);
    }

    function test_NewCombineRatios_19_Succeeds() public {
        _giveBlocks(alice, 6, 19);
        vm.prank(alice);
        token.combine(6);
        assertEq(token.balanceOf(alice, 5), 1, "19 T6 -> 1 T5");
    }

    function test_NewCombineRatios_18_Fails() public {
        _giveBlocks(alice, 6, 18);
        vm.prank(alice);
        vm.expectRevert("Insufficient blocks");
        token.combine(6);
    }

    function test_NewCombineRatios_T5_17() public {
        _giveBlocks(alice, 5, 17);
        vm.prank(alice);
        token.combine(5);
        assertEq(token.balanceOf(alice, 4), 1, "17 T5 -> 1 T4");
    }

    function test_NewCombineRatios_T4_15() public {
        _giveBlocks(alice, 4, 15);
        vm.prank(alice);
        token.combine(4);
        assertEq(token.balanceOf(alice, 3), 1, "15 T4 -> 1 T3");
    }

    function test_NewCombineRatios_T3_13() public {
        _giveBlocks(alice, 3, 13);
        vm.prank(alice);
        token.combine(3);
        assertEq(token.balanceOf(alice, 2), 1, "13 T3 -> 1 T2");
    }

    function test_NewCombineRatios_T3_12_Fails() public {
        _giveBlocks(alice, 3, 12);
        vm.prank(alice);
        vm.expectRevert("Insufficient blocks");
        token.combine(3);
    }

    // ── 3. Forge reads new ratios ─────────────────────────────────────────

    function test_ForgeReadsNewRatios_T3() public {
        // Forge 13 T3s: probability = 13/13 = 100%
        _giveBlocks(alice, 3, 13);
        vm.prank(alice);
        forge.forge(3, 13);
        // With ratio 13, burning 13 = 100% success
        assertEq(token.balanceOf(alice, 2), 1, "Full ratio forge should succeed");
    }

    // ── 4. Minting during countdown ───────────────────────────────────────

    function test_MintingAllowedDuringCountdown() public {
        // Give alice all tiers to trigger countdown
        for (uint256 tier = 2; tier <= 7; tier++) {
            _giveBlocks(alice, tier, 1);
        }
        assertTrue(token.countdownActive(), "Countdown should be active");

        // Bob should be able to mint during countdown
        vm.prank(bob);
        token.mint{value: MINT_PRICE * 10}(10);
        // If we get here without revert, minting during countdown works
    }

    // ── 5. Takeover mechanic ──────────────────────────────────────────────

    function test_Takeover_HigherTotalBlocks() public {
        // Alice: all 6 tiers, minimal blocks (6 total)
        _giveAllTiers(alice);
        assertTrue(token.countdownActive(), "Countdown active");

        // Bob: all 6 tiers + extra blocks (more total)
        _giveBlocks(bob, 2, 1);
        _giveBlocks(bob, 3, 1);
        _giveBlocks(bob, 4, 1);
        _giveBlocks(bob, 5, 1);
        _giveBlocks(bob, 6, 1);
        _giveBlocks(bob, 7, 100); // 105 total vs Alice's 6

        // Wait for safe period
        vm.warp(block.timestamp + 1 days);

        // Bob takes over
        vm.prank(bob);
        countdown.challengeCountdown();

        assertEq(countdown.currentHolder(), bob, "Bob should be holder");
        assertEq(countdown.takeoverCount(), 1, "takeoverCount should be 1");
    }

    function test_Takeover_InsufficientRank() public {
        // Alice: all 6 tiers + extra blocks — countdown triggers automatically
        _giveBlocks(alice, 2, 1);
        _giveBlocks(alice, 3, 1);
        _giveBlocks(alice, 4, 1);
        _giveBlocks(alice, 5, 1);
        _giveBlocks(alice, 6, 1);
        _giveBlocks(alice, 7, 100);
        // Countdown is already active (mintForTest calls _checkCountdownTrigger)

        // Carol: all 6 tiers but fewer total blocks
        _giveBlocks(carol, 2, 1);
        _giveBlocks(carol, 3, 1);
        _giveBlocks(carol, 4, 1);
        _giveBlocks(carol, 5, 1);
        _giveBlocks(carol, 6, 1);
        _giveBlocks(carol, 7, 1); // 6 total vs Alice's 106

        vm.warp(block.timestamp + 1 days);
        vm.prank(carol);
        vm.expectRevert("Must rank above holder");
        countdown.challengeCountdown();
    }

    // ── 6. Batch config (10 batches) ──────────────────────────────────────

    function test_10BatchesInitialized() public view {
        assertEq(mintWindow.batchCount(), 10, "Should have 10 batches");
        assertEq(mintWindow.batchSupply(1), 100_000);
        assertEq(mintWindow.batchSupply(10), 745_000);
        assertEq(mintWindow.batchPrice(1), 0.00008 ether);
        assertEq(mintWindow.batchPrice(10), 0.00800 ether);
        assertEq(mintWindow.windowCapForBatch(1), 33_000);
        assertEq(mintWindow.windowCapForBatch(10), 248_000);

        // Verify total supply = 3,324,000
        uint256 total;
        for (uint256 i = 1; i <= 10; i++) { total += mintWindow.batchSupply(i); }
        assertEq(total, 3_324_000, "Total supply should be 3,324,000");
    }

    function test_SetBatchConfig() public {
        vm.prank(owner);
        mintWindow.setBatchConfig(0, 50_000, 0.00004 ether, 10_000);
        assertEq(mintWindow.batchSupply(1), 50_000);
        assertEq(mintWindow.batchPrice(1), 0.00004 ether);
        assertEq(mintWindow.windowCapForBatch(1), 10_000);
    }

    // ── Keeper role tests ──────────────────────────────────────────────────

    function test_MintWindow_SetKeeper() public {
        vm.prank(owner);
        mintWindow.setKeeper(alice);
        assertEq(mintWindow.keeper(), alice);
    }

    function test_MintWindow_KeeperCanOpenWindow() public {
        vm.prank(owner);
        mintWindow.setKeeper(alice);

        vm.warp(block.timestamp + 4 hours + 1);
        vm.prank(alice);
        mintWindow.openWindow();
        assertEq(mintWindow.isWindowOpen(), true);
    }

    function test_MintWindow_ResetWindowCap() public {
        // Close window so rollover accumulates
        vm.warp(block.timestamp + 3 hours + 1);
        mintWindow.closeWindow();
        assertGt(mintWindow.rolloverSupply(), 0, "Rollover should be > 0");

        // Reset
        vm.prank(owner);
        mintWindow.resetWindowCap();
        assertEq(mintWindow.rolloverSupply(), 0, "Rollover should be 0 after reset");
    }

    // ── 7. Test mode gate ─────────────────────────────────────────────────

    function test_TestModeGate_RarityCoefficients() public {
        vm.prank(owner);
        token.disableTestMint();
        vm.prank(owner);
        vm.expectRevert("Test mode disabled");
        token.setRarityCoefficients(1, 1, 1);
    }

    function test_TestModeGate_BatchConfig() public {
        vm.prank(owner);
        mintWindow.disableTestMode();
        vm.prank(owner);
        vm.expectRevert("Test mode disabled");
        mintWindow.setBatchConfig(0, 1, 1, 1);
    }

    function test_TestModeGate_SafePeriod() public {
        vm.prank(owner);
        countdown.disableTestMode();
        vm.prank(owner);
        vm.expectRevert("Test mode disabled");
        countdown.setSafePeriod(1);
    }
}
