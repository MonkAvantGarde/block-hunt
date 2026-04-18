// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library BlockHuntTierLib {
    uint256 internal constant DENOM = 10_000_000_000;
    uint256 internal constant SCALE = 100_000;
    uint256 internal constant T6_THRESHOLD = 2_000_000_000;
    uint256 internal constant T5_THRESHOLD = 200_000_000;

    function getTierThresholds(
        uint256 totalMinted,
        uint256 t4Coeff,
        uint256 t3Coeff,
        uint256 t2Coeff
    ) internal pure returns (uint256 t2T, uint256 t3T, uint256 t4T) {
        uint256 s = totalMinted / SCALE;

        t4T = t4Coeff * s;
        t3T = t3Coeff * s;
        t2T = t2Coeff * s * s;

        uint256 totalRare = t2T + t3T + t4T + T5_THRESHOLD + T6_THRESHOLD;
        if (totalRare > DENOM / 2) {
            uint256 dynTotal = t2T + t3T + t4T;
            uint256 maxDyn = DENOM / 2 - T5_THRESHOLD - T6_THRESHOLD;
            t4T = t4T * maxDyn / dynTotal;
            t3T = t3T * maxDyn / dynTotal;
            t2T = t2T * maxDyn / dynTotal;
        }
    }

    function assignTier(
        uint256 randomWord,
        uint256 t2T,
        uint256 t3T,
        uint256 t4T
    ) internal pure returns (uint256) {
        uint256 roll = randomWord % DENOM;

        if (roll < t2T) return 2;
        roll -= t2T;
        if (roll < t3T) return 3;
        roll -= t3T;
        if (roll < t4T) return 4;
        roll -= t4T;
        if (roll < T5_THRESHOLD) return 5;
        roll -= T5_THRESHOLD;
        if (roll < T6_THRESHOLD) return 6;
        return 7;
    }
}
