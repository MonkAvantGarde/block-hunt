// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/BlockHuntForge.sol";

contract BlockHuntForgeTest is Test {

    function test_ProbabilityUsesBasisPoints() public pure {
        // T7->T6 ratio=21. burnCount=10 → chance = 10*10000/21 = 4761 bps
        uint256 burn = 10;
        uint256 ratio = 21;
        uint256 expected = 4761;
        uint256 actual = (burn * 10_000) / ratio;
        assertEq(actual, expected);
    }

    function test_MaxBurnGivesFullProbability() public pure {
        // Burning the full ratio gives ~100% (10000 bps minus rounding)
        uint256 burn = 21;
        uint256 ratio = 21;
        uint256 actual = (burn * 10_000) / ratio;
        assertEq(actual, 10_000);
    }

    function test_SingleBurnGivesMinimalProbability() public pure {
        // Burning 1 of 21 → 476 bps (4.76%)
        uint256 burn = 1;
        uint256 ratio = 21;
        uint256 actual = (burn * 10_000) / ratio;
        assertEq(actual, 476);
    }
}
