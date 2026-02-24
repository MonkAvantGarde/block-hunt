// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║         THE BLOCK HUNT — MIGRATION CONTRACT              ║
 * ║                                                          ║
 * ║  Handles the Season 1 → Season 2 transition.            ║
 * ║  Players burn all Season 1 blocks to receive            ║
 * ║  Season 2 starter blocks (Tiers 3–7 only).             ║
 * ║                                                          ║
 * ║  Tiers:    100–499 blocks → 100 starters               ║
 * ║            500–999 blocks → 150 starters               ║
 * ║            1000+   blocks → 200 starters               ║
 * ║                                                          ║
 * ║  Migration window: 30 days after season end.            ║
 * ║  Unburned Season 1 blocks become genesis collectibles.  ║
 * ╚══════════════════════════════════════════════════════════╝
 */

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ── Interfaces ────────────────────────────────────────────────────────────────

interface IBlockHuntTokenV1 {
    function balanceOf(address account, uint256 id) external view returns (uint256);
    function balancesOf(address player) external view returns (uint256[8] memory);
    function burnForMigration(address player, uint256[] calldata ids, uint256[] calldata amounts) external;
}

interface IBlockHuntTokenV2 {
    function mintMigrationStarters(address player, uint256[] calldata ids, uint256[] calldata amounts) external;
}

// ── Contract ──────────────────────────────────────────────────────────────────

contract BlockHuntMigration is Ownable, ReentrancyGuard {

    // ── Constants ──────────────────────────────────────────────────────────

    uint256 public constant MIGRATION_WINDOW   = 30 days;
    uint256 public constant MIN_BLOCKS         = 100;

    // Starter allocations by tier of total holdings
    uint256 public constant TIER_LOW_MAX       = 499;   // 100–499  → 100 starters
    uint256 public constant TIER_MID_MAX       = 999;   // 500–999  → 150 starters
    // 1000+                                            → 200 starters

    uint256 public constant REWARD_LOW         = 100;
    uint256 public constant REWARD_MID         = 150;
    uint256 public constant REWARD_HIGH        = 200;

    // ── State ──────────────────────────────────────────────────────────────

    address public tokenV1;   // Season 1 token contract
    address public tokenV2;   // Season 2 token contract

    uint256 public migrationOpenAt;   // timestamp when window opened
    uint256 public migrationCloseAt;  // timestamp when window closes
    bool    public migrationOpen;

    // Track who has already migrated — one migration per wallet
    mapping(address => bool) public hasMigrated;
    mapping(address => uint256) public migrationReward; // how many starters they received

    // Stats
    uint256 public totalMigrated;      // total players who migrated
    uint256 public totalBlocksBurned;  // total Season 1 blocks burned
    uint256 public totalStartersGiven; // total Season 2 starters minted

    uint256 private _nonce;

    // ── Events ────────────────────────────────────────────────────────────

    event MigrationWindowOpened(uint256 openAt, uint256 closeAt);
    event MigrationWindowClosed(uint256 closedAt);
    event PlayerMigrated(address indexed player, uint256 blocksBurned, uint256 startersReceived);

    // ── Constructor ───────────────────────────────────────────────────────

    constructor(address tokenV1_) Ownable(msg.sender) {
        tokenV1 = tokenV1_;
    }

    // ── Admin ─────────────────────────────────────────────────────────────

    function setTokenV1(address addr) external onlyOwner {
        tokenV1 = addr;
    }

    function setTokenV2(address addr) external onlyOwner {
        tokenV2 = addr;
    }

    /**
     * @notice Opens the 30-day migration window.
     *         Called by owner after Season 1 ends.
     */
    function openMigrationWindow() external onlyOwner {
        require(!migrationOpen, "Migration already open");
        require(tokenV2 != address(0), "Season 2 token not set");

        migrationOpen    = true;
        migrationOpenAt  = block.timestamp;
        migrationCloseAt = block.timestamp + MIGRATION_WINDOW;

        emit MigrationWindowOpened(migrationOpenAt, migrationCloseAt);
    }

    /**
     * @notice Manually close the migration window early if needed.
     *         After close, Season 1 blocks remain as genesis collectibles.
     */
    function closeMigrationWindow() external onlyOwner {
        require(migrationOpen, "Migration not open");
        migrationOpen = false;
        emit MigrationWindowClosed(block.timestamp);
    }

    // ── Migration ─────────────────────────────────────────────────────────

    /**
     * @notice Burn all Season 1 blocks to receive Season 2 starter blocks.
     *
     *         Rules:
     *         - Migration window must be open
     *         - Player must hold 100+ Season 1 blocks total
     *         - Player can only migrate once
     *         - ALL blocks are burned (not just 100)
     *         - Starters are Tiers 3–7 only (random)
     *
     *         Reward tiers:
     *         - 100–499 blocks → 100 starters
     *         - 500–999 blocks → 150 starters
     *         - 1000+   blocks → 200 starters
     */
    function migrate() external nonReentrant {
        require(migrationOpen, "Migration window not open");
        require(block.timestamp <= migrationCloseAt, "Migration window closed");
        require(!hasMigrated[msg.sender], "Already migrated");

        // Count total Season 1 blocks held (tiers 1–7)
        uint256[8] memory balances = IBlockHuntTokenV1(tokenV1).balancesOf(msg.sender);

        uint256 totalBlocks = 0;
        for (uint256 tier = 1; tier <= 7; tier++) {
            totalBlocks += balances[tier];
        }

        require(totalBlocks >= MIN_BLOCKS, "Need at least 100 Season 1 blocks");

        // Calculate reward
        uint256 starterCount = _calculateReward(totalBlocks);

        // Mark as migrated before external calls
        hasMigrated[msg.sender]      = true;
        migrationReward[msg.sender]  = starterCount;

        // Build burn arrays (all tiers that have balance)
        uint256[] memory burnIds     = new uint256[](7);
        uint256[] memory burnAmounts = new uint256[](7);
        uint256 burnCount = 0;

        for (uint256 tier = 1; tier <= 7; tier++) {
            if (balances[tier] > 0) {
                burnIds[burnCount]     = tier;
                burnAmounts[burnCount] = balances[tier];
                burnCount++;
            }
        }

        // Trim arrays to actual length
        uint256[] memory trimmedIds     = new uint256[](burnCount);
        uint256[] memory trimmedAmounts = new uint256[](burnCount);
        for (uint256 i = 0; i < burnCount; i++) {
            trimmedIds[i]     = burnIds[i];
            trimmedAmounts[i] = burnAmounts[i];
        }

        // Burn Season 1 blocks
        IBlockHuntTokenV1(tokenV1).burnForMigration(msg.sender, trimmedIds, trimmedAmounts);

        // Roll random Season 2 starters (Tiers 3–7 only)
        uint256[] memory starterIds     = new uint256[](starterCount);
        uint256[] memory starterAmounts = new uint256[](starterCount);

        for (uint256 i = 0; i < starterCount; i++) {
            starterIds[i]     = _rollStarterTier(i);
            starterAmounts[i] = 1;
        }

        // Consolidate into batch (group same tiers together)
        (uint256[] memory batchIds, uint256[] memory batchAmounts) = _consolidate(starterIds, starterAmounts);

        // Mint Season 2 starters
        IBlockHuntTokenV2(tokenV2).mintMigrationStarters(msg.sender, batchIds, batchAmounts);

        // Update stats
        totalMigrated++;
        totalBlocksBurned  += totalBlocks;
        totalStartersGiven += starterCount;

        emit PlayerMigrated(msg.sender, totalBlocks, starterCount);
    }

    // ── Internal helpers ──────────────────────────────────────────────────

    /**
     * @dev Calculate starter reward based on total blocks held.
     */
    function _calculateReward(uint256 totalBlocks) internal pure returns (uint256) {
        if (totalBlocks >= 1000) return REWARD_HIGH;
        if (totalBlocks >= 500)  return REWARD_MID;
        return REWARD_LOW;
    }

    /**
     * @dev Roll a random starter tier (3–7 only, no Tier 1 or 2).
     *
     *      Probabilities:
     *      Tier 7 (The Inert)      ~82%
     *      Tier 6 (The Restless)   ~15%
     *      Tier 5 (The Remembered) ~2.5%
     *      Tier 4 (The Ordered)    ~0.4%
     *      Tier 3 (The Chaotic)    ~0.1%
     *
     *      WARNING: Uses pseudo-randomness.
     *      Replace with Chainlink VRF before mainnet.
     */
    function _rollStarterTier(uint256 salt) internal returns (uint256) {
        _nonce++;
        uint256 rand = uint256(keccak256(abi.encodePacked(
            block.prevrandao,
            block.timestamp,
            msg.sender,
            _nonce,
            salt
        ))) % 100000;

        if (rand < 100)    return 3; // 0.1%  — The Chaotic
        if (rand < 500)    return 4; // 0.4%  — The Ordered
        if (rand < 3000)   return 5; // 2.5%  — The Remembered
        if (rand < 18000)  return 6; // 15%   — The Restless
        return 7;                    // 82%   — The Inert
    }

    /**
     * @dev Consolidate individual tier rolls into a batch mint array.
     *      e.g. [7,7,6,7,6] → ids:[7,6] amounts:[3,2]
     *      Saves gas on the Season 2 mint call.
     */
    function _consolidate(
        uint256[] memory ids,
        uint256[] memory amounts
    ) internal pure returns (uint256[] memory, uint256[] memory) {
        // Count tiers 3–7
        uint256[8] memory tierCounts;
        for (uint256 i = 0; i < ids.length; i++) {
            tierCounts[ids[i]] += amounts[i];
        }

        // Build output arrays
        uint256 uniqueCount = 0;
        for (uint256 tier = 3; tier <= 7; tier++) {
            if (tierCounts[tier] > 0) uniqueCount++;
        }

        uint256[] memory outIds     = new uint256[](uniqueCount);
        uint256[] memory outAmounts = new uint256[](uniqueCount);
        uint256 idx = 0;

        for (uint256 tier = 3; tier <= 7; tier++) {
            if (tierCounts[tier] > 0) {
                outIds[idx]     = tier;
                outAmounts[idx] = tierCounts[tier];
                idx++;
            }
        }

        return (outIds, outAmounts);
    }

    // ── View ──────────────────────────────────────────────────────────────

    function getMigrationStatus() external view returns (
        bool isOpen,
        uint256 openAt,
        uint256 closeAt,
        uint256 timeRemaining,
        uint256 playersMigrated,
        uint256 blocksBurned,
        uint256 startersGiven
    ) {
        isOpen          = migrationOpen && block.timestamp <= migrationCloseAt;
        openAt          = migrationOpenAt;
        closeAt         = migrationCloseAt;
        timeRemaining   = (isOpen && block.timestamp < migrationCloseAt)
                          ? migrationCloseAt - block.timestamp
                          : 0;
        playersMigrated = totalMigrated;
        blocksBurned    = totalBlocksBurned;
        startersGiven   = totalStartersGiven;
    }

    function getPlayerMigrationInfo(address player) external view returns (
        bool migrated,
        uint256 startersReceived
    ) {
        migrated         = hasMigrated[player];
        startersReceived = migrationReward[player];
    }

    /**
     * @notice Preview how many starters a player would receive
     *         without actually migrating. Useful for the UI.
     */
    function previewReward(address player) external view returns (
        uint256 totalBlocks,
        uint256 starterReward,
        bool eligible
    ) {
        uint256[8] memory balances = IBlockHuntTokenV1(tokenV1).balancesOf(player);

        for (uint256 tier = 1; tier <= 7; tier++) {
            totalBlocks += balances[tier];
        }

        eligible     = totalBlocks >= MIN_BLOCKS && !hasMigrated[player];
        starterReward = eligible ? _calculateReward(totalBlocks) : 0;
    }
}
