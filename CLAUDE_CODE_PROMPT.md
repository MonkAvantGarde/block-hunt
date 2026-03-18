# Claude Code Prompt — Block Hunt v2.1

Copy-paste this into Claude Code (Opus) from the `/Users/bhuri/Desktop/block-hunt` directory.

---

## The Prompt

```
Read the file CONTRACT_CHANGES_v2_1.md in the project root. This is the complete implementation spec for 5 changes across 3 smart contracts.

Before making any changes:
1. Read the current BlockHuntToken contract source (ERC-1155 core with mint, combine, forge, VRF callback)
2. Read the current BlockHuntMintWindow contract source
3. Read the current BlockHuntCountdown contract source
4. Read the current BlockHuntForge contract source (for combine ratio references)
5. Understand how the contracts reference each other

Then implement in this order:

**Change 2: Combine Ratios**
Update from 20/20/30/30/50 to 21/19/17/15/13. Check BOTH Token AND Forge contracts for ratio definitions. Forge probability = burnCount / combineRatio — same ratios must be used. Run forge test.

**Change 1: Continuous Probability**
Replace fixed rarity table in VRF callback with continuous formulas. T6=20% fixed, T5=2% fixed. T4 and T3 grow linearly with totalMinted. T2 grows QUADRATICALLY (power of 2, NOT cubic). Add a totalMinted counter that increments on mint but NEVER decrements on burns. Use DENOM of 10 billion for precision. Default coefficients: t4Coeff=960000, t3Coeff=128000, t2Coeff=6997. Add setRarityCoefficients() gated on testMode. Run forge test.

**Change 3: Remove Countdown Mint Lock**
Search ALL contracts for anything preventing minting during countdown. Remove those checks. Search for: countdownActive, isCountdownActive, any require in mint path referencing countdown. Check both Token and MintWindow. Run forge test.

**Change 5: 10-Batch Config**
Replace hardcoded 6-batch structure with configurable array supporting 10 batches. Initialize with the values from the spec table. The 10 batches are: 100K/$0.20, 100K/$0.30, 150K/$0.50, 200K/$0.80, 250K/$1.40, 300K/$2.50, 400K/$4.50, 500K/$8.00, 500K/$13.00, 400K/$20.00. Window caps: 25K, 25K, 25K, 50K, 50K, 50K, 100K, 100K, 200K, 200K. Add setBatchConfig() and setAllBatchConfigs() gated on testMode. Update all functions reading batch config. Change any hardcoded "6" batch count to use configurable batchCount. Run forge test.

**Change 4: Takeover Mechanic**
Add challengeCountdown() to BlockHuntCountdown. Challenger needs all 6 tiers AND ranks above holder (primary: distinct tiers held, tiebreaker: total blocks held across T2-T7). 24-hour safe period after each trigger/takeover. Add configurable safePeriod and countdownDuration. Run forge test.

After ALL changes, run full forge test suite. Add new tests for each change per the testing checklist in the spec (10 test scenarios documented).

IMPORTANT:
- All setters gated on testMode
- Do NOT change Treasury, Migration, SeasonRegistry contracts
- Forge contract: only update combine ratio references
- The totalMinted counter must NEVER decrease (not on combine, not on forge, not on burn)
- T2 uses QUADRATIC (s * s), NOT cubic
- t2Coeff default = 6997 (this produces first T2 at ~350K supply)
- Use sed -i '' for sed on macOS
- Batch count is now 10, not 6 — update ALL hardcoded references
```

---

## Setup

```bash
cd /Users/bhuri/Desktop/block-hunt

# Commit or stash rewards work if uncommitted
git stash  # or: git add -A && git commit -m "WIP: rewards"

# Create new branch from main
git checkout main
git checkout -b feature/v2.1-game-mechanics

# Copy spec into repo root
cp [download path]/CONTRACT_CHANGES_v2_1.md .

# Verify current tests pass
forge test

# Then paste the prompt above into Claude Code
```

---

## After Running — Verification

1. `forge test` — all pass
2. Verify totalMinted never decrements (check combine + forge functions)
3. Verify T2 uses QUADRATIC: `s * s` (NOT `s * s * s`)
4. Verify t2Coeff = 6997
5. Verify combine ratios are 21/19/17/15/13 in BOTH Token and Forge
6. Verify 10 batches initialized with correct prices
7. Verify no countdown checks remain in mint path
8. Verify challengeCountdown exists on Countdown

Any failures → share error output back in Claude.ai chat to debug together.
