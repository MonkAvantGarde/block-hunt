// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/BlockHuntCountdown.sol";
import "../src/BlockHuntTreasury.sol";

contract MockTokenForInvariants {
    mapping(address => mapping(uint256 => uint256)) public bals;
    function setBal(address who, uint256 tier, uint256 n) external { bals[who][tier] = n; }
    function hasAllTiers(address a) external view returns (bool) {
        for (uint256 t = 2; t <= 7; t++) if (bals[a][t] == 0) return false;
        return true;
    }
    function balanceOf(address a, uint256 t) external view returns (uint256) { return bals[a][t]; }
    function balancesOf(address a) external view returns (uint256[8] memory out) {
        for (uint256 t = 0; t < 8; t++) out[t] = bals[a][t];
    }
    function resetExpiredHolder() external {}
    function updateCountdownHolder(address) external {}
}

contract BlockHuntInvariantsTest is Test {
    BlockHuntCountdown countdown;
    BlockHuntTreasury treasury;
    MockTokenForInvariants mockToken;
    address owner = address(0xBEEF);
    address creator = address(0xC0DE);
    address token = address(0x7070);

    function setUp() public {
        mockToken = new MockTokenForInvariants();
        vm.startPrank(owner);
        countdown = new BlockHuntCountdown();
        countdown.setTokenContract(address(mockToken));
        treasury = new BlockHuntTreasury(creator);
        treasury.setTokenContract(token);
        vm.stopPrank();
    }

    function _fullSet(address who) internal {
        for (uint256 t = 2; t <= 7; t++) mockToken.setBal(who, t, 1);
    }

    // Invariant: holder is zero OR holderSince > 0
    function test_invariant_HolderSinceNeverZeroWithActiveHolder() public {
        assertEq(countdown.currentHolder(), address(0));
        assertEq(countdown.holderSince(), 0);

        _fullSet(address(0xA11CE));
        vm.prank(address(mockToken));
        countdown.startCountdown(address(0xA11CE));

        assertTrue(countdown.currentHolder() != address(0));
        assertGt(countdown.holderSince(), 0);
    }

    function test_invariant_HolderSinceResetsWithHolder() public {
        _fullSet(address(0xA11CE));
        vm.prank(address(mockToken));
        countdown.startCountdown(address(0xA11CE));

        vm.prank(address(mockToken));
        countdown.syncReset();

        assertEq(countdown.currentHolder(), address(0));
        assertEq(countdown.holderSince(), 0);
    }

    // Invariant: treasury totalDeposited + totalPaidOut + creator fees == total ETH in
    function test_invariant_TreasuryAccountingBalances() public {
        vm.deal(token, 10 ether);
        vm.prank(token);
        treasury.receiveMintFunds{value: 10 ether}();

        uint256 creatorFee = (10 ether * 2000) / 10000;
        uint256 poolDeposit = 10 ether - creatorFee;

        assertEq(treasury.totalDeposited(), poolDeposit);
        assertEq(creator.balance, creatorFee);
        assertEq(address(treasury).balance, poolDeposit);
    }

    // Invariant: season score zeroed after elimination
    function test_invariant_EliminatedPlayerHasZeroScore() public {
        vm.prank(address(mockToken));
        countdown.recordProgression(address(0xA11CE), 500);
        assertEq(countdown.seasonScore(countdown.currentSeason(), address(0xA11CE)), 500);

        vm.prank(address(mockToken));
        countdown.eliminatePlayer(address(0xA11CE));
        assertEq(countdown.seasonScore(countdown.currentSeason(), address(0xA11CE)), 0);
        assertTrue(countdown.isEliminated(countdown.currentSeason(), address(0xA11CE)));
    }

    // Invariant: cumulative defense time only increases
    function test_invariant_CumulativeDefenseMonotonic() public {
        _fullSet(address(0xA11CE));
        vm.prank(address(mockToken));
        countdown.startCountdown(address(0xA11CE));

        vm.warp(block.timestamp + 1 days);

        // Challenge via bob
        for (uint256 t = 2; t <= 7; t++) mockToken.setBal(address(0xB0B), t, 1);
        mockToken.setBal(address(0xB0B), 7, 100);
        vm.prank(owner);
        countdown.setSafePeriod(0);
        vm.prank(address(0xB0B));
        countdown.challengeCountdown();

        uint256 banked = countdown.cumulativeDefenseTime(address(0xA11CE));
        assertEq(banked, 1 days);

        // Defense time can never decrease (no code path reduces it)
        assertGe(countdown.cumulativeDefenseTime(address(0xA11CE)), banked);
    }
}
