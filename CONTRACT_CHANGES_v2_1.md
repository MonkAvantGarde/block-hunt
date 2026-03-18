# CONTRACT_CHANGES_v2.1 — Final Implementation Spec

> **For:** Claude Code (Opus) implementation
> **Repo:** `/Users/bhuri/Desktop/block-hunt`
> **Contracts:** Foundry/Solidity 0.8.33
> **Network:** Base Sepolia (chain ID 84532)
> **Test command:** `forge test`

---

## Summary

Five changes across three contracts. No new contracts.

| # | Change | Contract | Complexity |
|---|--------|----------|-----------|
| 1 | Replace fixed rarity tables with continuous probability formula | BlockHuntToken | Medium |
| 2 | Update combine ratios from 20/20/30/30/50 to 21/19/17/15/13 | BlockHuntToken + BlockHuntForge | Trivial |
| 3 | Remove countdown mint lock | BlockHuntToken + BlockHuntMintWindow | Trivial |
| 4 | Add leaderboard-based takeover mechanic | BlockHuntCountdown | Medium |
| 5 | Configurable batch params — 10 batches, new prices/supply | BlockHuntMintWindow | Low |

**Untouched:** BlockHuntTreasury, BlockHuntForge (except ratio refs), BlockHuntMigration, BlockHuntSeasonRegistry.

---

## Change 1: Continuous Probability Formula (BlockHuntToken)

### Current: 3 fixed rarity tables selected by batch pair.

### New: T6 and T5 fixed. T4 and T3 linear. T2 QUADRATIC. All based on totalMinted.

**The formulas:**
```
T6 = 20% (fixed)
T5 = 2% (fixed)
T4 = coefficient × (totalMinted / 100K)        — linear growth
T3 = coefficient × (totalMinted / 100K)        — linear growth
T2 = coefficient × (totalMinted / 100K)²       — QUADRATIC growth
T7 = remainder (100% minus all above)
```

**Why quadratic for T2:** Quadratic gives the ideal balance: T2 is technically possible from the very first mint (probability ~1 in 1.4 billion at 100K supply), but practically impossible until Batch 3 (~350K supply). Once the first T2 appears, the quadratic curve naturally produces ~2.4 more T2s in the following 7 days — a real cluster, not a lonely event. The rate then accelerates steadily. Later batches produce many T2s, but at $4.50–$20.00 per block, each one cost the community tens of thousands of dollars to produce.

**Three difficulty modes (one coefficient change):**
- **EASY:** coefficient 37,500 → first T2 in Batch 2 ($45K treasury)
- **MEDIUM (default):** coefficient 6,997 → first T2 in Batch 3 ($113K treasury)
- **HARD:** coefficient 1,803 → first T2 in Batch 4 ($257K treasury)

Deploy with MEDIUM. Tune via test-mode setter during testing.

**Solidity implementation:**

```solidity
// ── Denominator: 10 billion = 100% ──
uint256 public constant DENOM = 10_000_000_000;
uint256 public constant SCALE = 100_000; // supply divisor

// ── Fixed tiers (in DENOM units) ──
uint256 public constant T6_THRESHOLD = 2_000_000_000; // 20%
uint256 public constant T5_THRESHOLD = 200_000_000;   // 2%

// ── Configurable coefficients (test mode) ──
uint256 public t4Coeff = 960_000;     // linear:  T4 prob = 960,000 × s / DENOM
uint256 public t3Coeff = 128_000;     // linear:  T3 prob = 128,000 × s / DENOM
uint256 public t2Coeff = 6_997;       // quadratic: T2 prob = 6,997 × s² / DENOM
// where s = totalMinted / SCALE (integer)

// ── Cumulative mints counter (NEVER decremented) ──
uint256 public totalMinted; // increment in mint callback only

function _getTierThresholds() internal view returns (
    uint256 t2T, uint256 t3T, uint256 t4T
) {
    uint256 s = totalMinted / SCALE; // totalMinted / 100K (integer division)
    
    t4T = t4Coeff * s;              // linear
    t3T = t3Coeff * s;              // linear
    t2T = t2Coeff * s * s;          // QUADRATIC (s²)
    
    // Safety cap: rare tiers cannot exceed 50% total
    uint256 totalRare = t2T + t3T + t4T + T5_THRESHOLD + T6_THRESHOLD;
    if (totalRare > DENOM / 2) {
        uint256 dynTotal = t2T + t3T + t4T;
        uint256 maxDyn = DENOM / 2 - T5_THRESHOLD - T6_THRESHOLD;
        t4T = t4T * maxDyn / dynTotal;
        t3T = t3T * maxDyn / dynTotal;
        t2T = t2T * maxDyn / dynTotal;
    }
}

function _assignTier(uint256 randomWord) internal view returns (uint256) {
    (uint256 t2T, uint256 t3T, uint256 t4T) = _getTierThresholds();
    
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
```

**CRITICAL: totalMinted counter.** Must track ALL blocks ever minted. Must NOT decrease when blocks are burned via combine or forge. If the contract doesn't have this counter, add one and increment it in the VRF callback where blocks are minted.

**Test-mode setter:**
```solidity
function setRarityCoefficients(
    uint256 _t4Coeff, uint256 _t3Coeff, uint256 _t2Coeff
) external onlyOwner {
    require(testMode, "Test mode only");
    t4Coeff = _t4Coeff;
    t3Coeff = _t3Coeff;
    t2Coeff = _t2Coeff;
    emit RarityCoefficientsUpdated(_t4Coeff, _t3Coeff, _t2Coeff);
}
```

### Verification Table (Medium Mode, t2Coeff = 6,997)

| totalMinted | s (÷100K) | T4 Prob | T3 Prob | T2 Prob | Cumul T2s |
|-------------|-----------|---------|---------|---------|-----------|
| 100K | 1 | 0.0096% | 0.00128% | 0.000070% | ~0 |
| 200K | 2 | 0.0192% | 0.00256% | 0.000280% | ~0.2 |
| 350K | 3.5 | 0.0336% | 0.00448% | 0.000857% | ~1.0 |
| 550K | 5.5 | 0.0528% | 0.00704% | 0.002117% | ~3.9 |
| 800K | 8 | 0.0768% | 0.01024% | 0.004478% | ~12 |
| 1.1M | 11 | 0.1056% | 0.01408% | 0.008463% | ~31 |
| 1.5M | 15 | 0.1440% | 0.01920% | 0.015743% | ~79 |
| 2.0M | 20 | 0.1920% | 0.02560% | 0.027988% | ~187 |
| 2.5M | 25 | 0.2400% | 0.03200% | 0.043731% | ~364 |
| 2.9M | 29 | 0.2784% | 0.03712% | 0.058829% | ~569 |

### Expected T2 Emergence per Batch

| Batch | Supply | $/Block | Treasury | New T2s | Total T2s |
|-------|--------|---------|----------|---------|-----------|
| 1 | 100K | $0.20 | $18K | 0 | 0 |
| 2 | 100K | $0.30 | $45K | 0.2 | 0.2 |
| 3 | 150K | $0.50 | $113K | 0.8 | 1.0 |
| 4 | 200K | $0.80 | $257K | 2.9 | 3.9 |
| 5 | 250K | $1.40 | $572K | 8.1 | 11.9 |
| 6 | 300K | $2.50 | $1.25M | 19.1 | 31.0 |
| 7 | 400K | $4.50 | $2.87M | 47.7 | 78.7 |
| 8 | 500K | $8.00 | $6.47M | 107.9 | 186.6 |
| 9 | 500K | $13.00 | $12.3M | 177.8 | 364.4 |
| 10 | 400K | $20.00 | $19.5M | 204.4 | 568.8 |

### T2 Clustering Behavior

After the first T2 (~350K supply): ~2.4 more T2s appear in the next 7 days. Gap between T2 #1 and #2 is ~91K blocks (~3.6 days, ~$73K community minting cost). By T2 #10, new T2s appear daily.

### Difficulty Mode Coefficients (for test-mode tuning)

| Mode | t2Coeff | First T2 | T2s at B6 ($1.25M) | Total at end |
|------|---------|----------|--------------------|----|
| EASY | 37,500 | Batch 2 | 166 | 3,049 |
| MEDIUM | 6,997 | Batch 3 | 31 | 569 |
| HARD | 1,803 | Batch 4 | 8 | 147 |

---

## Change 2: Combine Ratios

### Current: 20, 20, 30, 30, 50

### New: 21, 19, 17, 15, 13

```
T7 → T6: 21:1
T6 → T5: 19:1
T5 → T4: 17:1
T4 → T3: 15:1
T3 → T2: 13:1
```

Descending by 2 each step. "Fewer blocks, higher stakes."

**Update in ALL locations:** Search for `combineRatio`, `COMBINE_RATIO`, `ratio` in both BlockHuntToken AND BlockHuntForge. Forge probability = burnCount / combineRatio — these ratios must match in both contracts.

### Whale Combine Timeline (1,500 blocks/day)

| Tier | Output/day | Time to first |
|------|-----------|--------------|
| T6 | ~56 | minutes |
| T5 | ~19 | minutes |
| T4 | ~2.9 | <1 day |
| T3 | 0.19 | ~5.2 days |
| T2 | 0.015 | ~68 days |

### Forge Probabilities with New Ratios

| Forge | Ratio | Burn 1 | Burn Half (50%) |
|-------|-------|--------|-----------------|
| T7 → T6 | 21:1 | 4.8% | Burn 10–11 |
| T6 → T5 | 19:1 | 5.3% | Burn 9–10 |
| T5 → T4 | 17:1 | 5.9% | Burn 8–9 |
| T4 → T3 | 15:1 | 6.7% | Burn 7–8 |
| T3 → T2 | 13:1 | 7.7% | Burn 6–7 |

---

## Change 3: Remove Countdown Mint Lock

Search ALL contracts for any require/check that prevents minting when countdown is active. Remove them.

**Search for:** `countdownActive`, `isCountdownActive`, `countdown.active`, or any require in mint(), openWindow(), isWindowOpen() referencing countdown state.

**Remove from:** BlockHuntToken mint path and BlockHuntMintWindow if present.

---

## Change 4: Leaderboard-Based Takeover (BlockHuntCountdown)

### New function: challengeCountdown()

```solidity
uint256 public safePeriod = 1 days;
uint256 public countdownDuration = 7 days;
uint256 public takeoverCount;

function challengeCountdown() external {
    require(countdownActive, "No active countdown");
    require(msg.sender != currentHolder, "Already holder");
    require(
        block.timestamp >= countdownStartTime + safePeriod,
        "Safe period active"
    );
    require(_holdsAllTiers(msg.sender), "Must hold T2-T7");
    require(_ranksAbove(msg.sender, currentHolder), "Must rank above holder");
    
    address prev = currentHolder;
    currentHolder = msg.sender;
    countdownStartTime = block.timestamp;
    takeoverCount++;
    
    emit CountdownTakeover(msg.sender, prev, takeoverCount);
}

// Primary: distinct tiers held. Tiebreaker: total blocks held.
function _ranksAbove(address challenger, address holder) internal view returns (bool) {
    uint256 cTiers = _countDistinctTiers(challenger);
    uint256 hTiers = _countDistinctTiers(holder);
    if (cTiers > hTiers) return true;
    if (cTiers < hTiers) return false;
    return _totalBlocks(challenger) > _totalBlocks(holder);
}

function _countDistinctTiers(address player) internal view returns (uint256) {
    uint256 count = 0;
    for (uint256 t = 2; t <= 7; t++) {
        if (tokenContract.balanceOf(player, t) > 0) count++;
    }
    return count;
}

function _totalBlocks(address player) internal view returns (uint256) {
    uint256 total = 0;
    for (uint256 t = 2; t <= 7; t++) {
        total += tokenContract.balanceOf(player, t);
    }
    return total;
}

function _holdsAllTiers(address player) internal view returns (bool) {
    return _countDistinctTiers(player) == 6;
}
```

Total blocks held as tiebreaker enables guild takeovers — members transfer blocks to champion, pushing total holdings above the current holder.

**Test-mode setters:**
```solidity
function setSafePeriod(uint256 _safePeriod) external onlyOwner {
    require(testMode, "Test mode only");
    safePeriod = _safePeriod;
}

function setCountdownDuration(uint256 _duration) external onlyOwner {
    require(testMode, "Test mode only");
    countdownDuration = _duration;
}
```

---

## Change 5: Configurable 10-Batch Structure (BlockHuntMintWindow)

### Current: 6 batches, hardcoded.

### New: 10 batches, configurable via struct array.

```solidity
struct BatchConfig {
    uint256 supply;
    uint256 price;      // in wei
    uint256 windowCap;
}

uint256 public batchCount = 10;
BatchConfig[] public batchConfigs;
```

**Default values (initialize in constructor):**

| Batch | Supply | Price (ETH) | $/Block | Window Cap |
|-------|--------|-------------|---------|-----------|
| 1 | 100,000 | 0.00008 | $0.20 | 25,000 |
| 2 | 100,000 | 0.00012 | $0.30 | 25,000 |
| 3 | 150,000 | 0.00020 | $0.50 | 25,000 |
| 4 | 200,000 | 0.00032 | $0.80 | 50,000 |
| 5 | 250,000 | 0.00056 | $1.40 | 50,000 |
| 6 | 300,000 | 0.00100 | $2.50 | 50,000 |
| 7 | 400,000 | 0.00180 | $4.50 | 100,000 |
| 8 | 500,000 | 0.00320 | $8.00 | 100,000 |
| 9 | 500,000 | 0.00520 | $13.00 | 200,000 |
| 10 | 400,000 | 0.00800 | $20.00 | 200,000 |

**Total supply: 2,900,000 blocks. Max treasury (90%): ~$19.5M.**

**Setter functions:**
```solidity
function setBatchConfig(
    uint256 batchIndex, uint256 supply, uint256 price, uint256 windowCap
) external onlyOwner {
    require(testMode, "Test mode only");
    require(batchIndex < batchCount, "Invalid batch");
    batchConfigs[batchIndex] = BatchConfig(supply, price, windowCap);
    emit BatchConfigUpdated(batchIndex, supply, price, windowCap);
}

function setAllBatchConfigs(
    uint256[] calldata supplies,
    uint256[] calldata prices,
    uint256[] calldata windowCaps
) external onlyOwner {
    require(testMode, "Test mode only");
    require(supplies.length == prices.length && prices.length == windowCaps.length, "Length mismatch");
    delete batchConfigs;
    batchCount = supplies.length;
    for (uint256 i = 0; i < supplies.length; i++) {
        batchConfigs.push(BatchConfig(supplies[i], prices[i], windowCaps[i]));
    }
    emit AllBatchConfigsUpdated(batchCount);
}
```

Update `getMintPrice()`, `getWindowCap()`, `getBatchSupply()`, `currentBatch()` to read from `batchConfigs[]`. Replace any hardcoded `6` or `< 6` batch count references with `batchCount`.

---

## New Events

```solidity
// BlockHuntToken
event RarityCoefficientsUpdated(uint256 t4Coeff, uint256 t3Coeff, uint256 t2Coeff);

// BlockHuntCountdown
event CountdownTakeover(address indexed newHolder, address indexed prevHolder, uint256 takeoverCount);

// BlockHuntMintWindow
event BatchConfigUpdated(uint256 indexed batchIndex, uint256 supply, uint256 price, uint256 windowCap);
event AllBatchConfigsUpdated(uint256 batchCount);
```

---

## Testing Checklist

### 1. Rarity formula
- Set totalMinted to 350,000 (via mintForTest or state). Mint 10,000 blocks.
- Expected: ~34 T4, ~4.5 T3, ~0.9 T2. T2 should occasionally appear.
- Set totalMinted to 1,500,000. Mint 10,000 blocks.
- Expected: ~144 T4, ~19 T3, ~16 T2.

### 2. Quadratic T2 verification
- At totalMinted = 100K (s=1): T2 threshold = 6,997. Roll space = 10 billion. Prob = 0.000070%.
- At totalMinted = 500K (s=5): T2 threshold = 174,925. Prob = 0.00175%.
- At totalMinted = 1M (s=10): T2 threshold = 699,700. Prob = 0.007%.
- Verify T2 probability QUADRUPLES when supply doubles (s² relationship).

### 3. totalMinted counter
- Mint 100 blocks. Verify totalMinted = 100.
- Combine 21 T7s into 1 T6. Verify totalMinted still = 100 (NOT reduced).
- Forge and fail. Verify totalMinted unchanged.

### 4. Combine ratios
- 21 T7s → combine → 1 T6. 20 T7s → combine → revert.
- 19 T6s → combine → 1 T5. 18 T6s → combine → revert.
- 17 T5s → combine → 1 T4. 16 T5s → combine → revert.
- 15 T4s → combine → 1 T3. 14 T4s → combine → revert.
- 13 T3s → combine → 1 T2. 12 T3s → combine → revert.

### 5. Forge ratios
- Forge 1 T3: probability = 1/13 = 7.69%.
- Forge 13 T3s: probability = 100%.
- Verify forge reads new combine ratios, not old ones.

### 6. Minting during countdown
- Trigger countdown via mintForTest (give wallet all 6 tiers).
- Another wallet calls mint(). Should succeed, NOT revert.

### 7. Takeover
- Wallet A: all 6 tiers, 100 total blocks. Triggers countdown.
- Wallet B: all 6 tiers, 200 total blocks. Waits for safe period.
- B calls challengeCountdown(). B becomes holder. Countdown resets.
- Verify takeoverCount = 1.

### 8. Takeover — insufficient rank
- Wallet C: all 6 tiers, 50 total blocks (less than holder).
- C calls challengeCountdown(). Should revert.

### 9. Batch config (10 batches)
- Verify 10 batches initialized with correct prices/supply.
- Verify batch advancement works through all 10.
- Call setBatchConfig(0, 50000, 0.00004 ether, 10000).
- Verify getMintPrice() returns new price.

### 10. Test mode gate
- Call disableTestMode(). Verify all setters revert.

---

## Deploy Sequence

Redeploy modified:
1. **BlockHuntToken** — rarity formula, ratios, mint lock removed, totalMinted counter
2. **BlockHuntMintWindow** — 10-batch config, setters
3. **BlockHuntCountdown** — takeover mechanic

Re-link contracts, register VRF consumers, update subgraph and frontend.

## Implementation Order

1. Combine ratios (Change 2) — smallest, fewest dependencies
2. Rarity formula (Change 1) — self-contained in Token
3. Remove mint lock (Change 3) — delete code
4. Batch config (Change 5) — self-contained in MintWindow
5. Takeover (Change 4) — needs Token reference

Run `forge test` after each. Fix broken tests before proceeding.
