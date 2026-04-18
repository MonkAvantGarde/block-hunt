# Season 2 Migration Design Spec

**Date:** 2026-04-18
**Status:** Approved — implement when Season 2 transition begins
**Depends on:** `seasonWon` flag (implemented), Escrow season2Seed flow, Migration contract

---

## Migration Mechanic

**Burn N Season 1 blocks (any tier, any mix) → receive floor(N/10) Season 2 blocks**

- **Ratio:** 10:1 (configurable by owner)
- **Max cap:** 100 Season 2 starters per player (configurable by owner)
- **Tier assignment:** VRF-minted — same probability curve as fresh Season 2 mints. No tier-for-tier transfer.
- **Any tier burns equally:** 10 T2 blocks = 10 T7 blocks = 1 S2 starter each. The value difference is already reflected in how hard it was to get them.

## Example

| Player burns | S2 blocks received | Tiers |
|---|---|---|
| 50 T7 | 5 random | VRF roll (could be 4 T7 + 1 T5) |
| 200 T7 + 30 T6 + 20 T5 = 250 total | 25 random (not 100, under cap) | VRF roll |
| 1500 mixed | 100 random (capped, even though 1500/10=150) | VRF roll |

## Contract Interface

```solidity
// On BlockHuntMigration.sol or new Season2Migration contract

uint256 public migrationRatio = 10;    // burn N → get N/ratio
uint256 public maxStarterCap = 100;    // per-player cap
bool    public migrationOpen;

mapping(address => uint256) public startersReceived;  // track per-player cap

function migrate(uint256[] calldata tiers, uint256[] calldata amounts) external {
    require(migrationOpen, "Migration not open");
    
    uint256 totalBurned;
    for (uint256 i = 0; i < tiers.length; i++) {
        require(tiers[i] >= 2 && tiers[i] <= 7, "Invalid tier");
        token.burnForMigration(msg.sender, tiers[i], amounts[i]);
        totalBurned += amounts[i];
    }
    
    uint256 starters = totalBurned / migrationRatio;
    uint256 remaining = maxStarterCap - startersReceived[msg.sender];
    if (starters > remaining) starters = remaining;
    require(starters > 0, "Nothing to mint");
    
    startersReceived[msg.sender] += starters;
    
    // VRF mint into Season 2 token (same probability curve)
    season2Token.rewardMint(msg.sender, uint32(starters));
    // OR: trigger VRF mint for true randomness
}

function setMigrationRatio(uint256 ratio) external onlyOwner {
    require(ratio >= 1 && ratio <= 100, "Out of range");
    migrationRatio = ratio;
}

function setMaxStarterCap(uint256 cap) external onlyOwner {
    require(cap >= 1, "Zero cap");
    maxStarterCap = cap;
}
```

## Season 2 Transition Flow

1. Season 1 ends (`seasonWon = true`)
2. 30-day claim window for Escrow leaderboard rewards
3. Owner calls `escrow.releaseSeason2Seed()` → sends 10% to Season 2 treasury
4. Owner deploys Season 2 token (or resets existing) + opens migration
5. Players burn S1 blocks → receive S2 starters (VRF-minted)
6. Players who don't migrate keep S1 cards as memorabilia
7. Owner calls `resetSeasonWon()` + `treasury.startNextSeason()` + `countdown.advanceSeason()` + `rewards.advanceSeason()`
8. Season 2 minting opens

## Open Questions (decide at S2 time)

- Same token contract for S2 (reset state) or fresh deploy?
- Migration window duration (30 days? permanent?)
- Do S1 cards retain any utility in S2 (display only, or tradeable cross-season)?

---

*This spec is saved for future implementation. No code changes needed now.*
