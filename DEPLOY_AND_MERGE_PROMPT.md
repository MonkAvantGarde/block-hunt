# Claude Code Prompt — Deploy v2.1 + Merge All Branches

Copy-paste this into Claude Code (Opus) from the `/Users/bhuri/Desktop/block-hunt` directory.

---

## Pre-flight

```bash
# Confirm current branch and status
git status
git branch

# Should be on: feature/v2.1-game-mechanics
# Should show: 300 tests passing (forge test already confirmed)
```

---

## The Prompt

```
This is a multi-step deployment and merge task for The Block Hunt. Do each step in order. Stop and report if any step fails.

## STEP 1: Deploy v2.1 contracts to Base Sepolia

Deploy these 3 modified contracts to Base Sepolia (chain ID 84532):
- BlockHuntToken (continuous rarity, new ratios, open countdown, totalMinted counter)
- BlockHuntMintWindow (10-batch config)
- BlockHuntCountdown (takeover mechanic)

The following contracts are UNCHANGED and already deployed — do NOT redeploy:
- BlockHuntTreasury: 0xD7f6B8357ea1C8504378E83a60C361917CA589E2
- BlockHuntForge: 0x6CCBD030Eab2020326d3D76725F8361ffD354303
- BlockHuntEscrow: 0x932E827BA9B8d708C75295E1b8258e6c924F0FF5
- BlockHuntMigration: 0xfD44677e950a77972a46FAe024e587dcD1Bd9eD5
- BlockHuntSeasonRegistry: 0x43944fc7Fe8dce7997Ba1609a13Cf298eFD6622f

Use the existing deploy script pattern (check script/ folder) or forge create. The deployer private key is in .env as PRIVATE_KEY. RPC URL is in .env as BASE_SEPOLIA_RPC_URL.

After deploying each contract, verify it on BaseScan using forge verify-contract. The BaseScan API key is in .env as BASESCAN_API_KEY. Use the Etherscan API V2 endpoint for Base Sepolia verification.

Record all 3 new addresses.

## STEP 2: Wire contracts together

Using cast send (private key from .env, RPC from .env), call these functions on the NEW contracts:

On NEW BlockHuntToken:
- setTreasuryContract(0xD7f6B8357ea1C8504378E83a60C361917CA589E2)
- setMintWindowContract(<NEW_MINT_WINDOW_ADDRESS>)
- setForgeContract(0x6CCBD030Eab2020326d3D76725F8361ffD354303)
- setCountdownContract(<NEW_COUNTDOWN_ADDRESS>)

On NEW BlockHuntMintWindow:
- setTokenContract(<NEW_TOKEN_ADDRESS>)

On NEW BlockHuntCountdown:
- setTokenContract(<NEW_TOKEN_ADDRESS>)

On EXISTING BlockHuntTreasury (0xD7f6B8357ea1C8504378E83a60C361917CA589E2):
- setTokenContract(<NEW_TOKEN_ADDRESS>) — NOTE: check if this is already locked (one-time use). If it reverts, we need to redeploy Treasury too.

On EXISTING BlockHuntForge (0x6CCBD030Eab2020326d3D76725F8361ffD354303):
- setTokenContract(<NEW_TOKEN_ADDRESS>) — same caveat as Treasury

If Treasury or Forge setTokenContract reverts because it's locked, redeploy those contracts too and wire everything fresh.

## STEP 3: Open first mint window

Call openWindow() on the new MintWindow contract via cast send.

## STEP 4: Commit and merge

```bash
git add -A
git commit -m "feat: v2.1 deployed - continuous rarity, 10 batches, takeover mechanic"

# Merge v2.1 into main
git checkout main
git merge feature/v2.1-game-mechanics

# Merge rewards branch
git merge rewards-system
# If merge conflicts, resolve them:
# - wagmi.js: keep BOTH the new v2.1 contract addresses AND the REWARDS address
# - abis/index.js: keep BOTH new ABIs AND REWARDS_ABI
# - For any other conflicts, prefer the v2.1 version for contract files, keep both for frontend additions

git add -A
git commit -m "merge: v2.1 game mechanics + rewards system"
```

## STEP 5: Update frontend

In frontend/src/config/wagmi.js:
- Update TOKEN address to the new deployed address
- Update MINT_WINDOW address to the new deployed address  
- Update COUNTDOWN address to the new deployed address
- Keep TREASURY, FORGE, ESCROW, MIGRATION, SEASON_REGISTRY addresses unchanged
- Keep REWARDS address from the rewards branch (0xEfD6e50be55b8eA31019eCFd44b72D77C5bd840d)
- Update BATCH_PRICES_ETH to reflect 10 batches:
  [0.00008, 0.00012, 0.00020, 0.00032, 0.00056, 0.00100, 0.00180, 0.00320, 0.00520, 0.00800]
- Update getMintPrice() helper if it has hardcoded 6-batch logic — now 10 batches
- Update TOTAL_BATCHES or equivalent constant from 6 to 10

In frontend/src/abis/index.js:
- Update TOKEN_ABI with the new ABI from out/ (includes totalMinted, t2Coeff, t4Coeff, t3Coeff, setRarityCoefficients, and updated rarity functions)
- Update MINT_WINDOW_ABI with the new ABI (includes batchConfigs, batchCount, setBatchConfig, setAllBatchConfigs, batchPrice)
- Update COUNTDOWN_ABI with the new ABI (includes challengeCountdown, takeoverCount, safePeriod, countdownDuration, setSafePeriod, setCountdownDuration)
- Keep REWARDS_ABI unchanged
- Keep other ABIs unchanged

In frontend/src/config/design-tokens.js:
- If COMBINE_RATIOS exists, update from [20,20,30,30,50] to [21,19,17,15,13]
- If BATCH_SUPPLY exists, update to 10 batches: [100000, 100000, 150000, 200000, 250000, 300000, 400000, 500000, 500000, 400000]

In frontend/src/hooks/useGameState.js:
- If there are any hardcoded references to 6 batches, update to 10

Check ALL frontend files for hardcoded "6" batch references or old batch prices and update them.

## STEP 6: Build and verify

```bash
cd frontend
npm run build
```

Fix any build errors. The build must succeed.

## STEP 7: Commit and push

```bash
cd ..
git add -A
git commit -m "feat: frontend updated for v2.1 - 10 batches, new ABIs, new addresses"
git push origin main
```

## STEP 8: Report

Print a summary table with:
- All contract addresses (new + existing)
- Which contracts were redeployed vs kept
- VRF consumers that need updating (list the new Token and Forge addresses — I'll add them manually at vrf.chain.link)
- Frontend build status
- Any issues encountered

IMPORTANT NOTES:
- Use sed -i '' for sed on macOS (not sed -i)
- When quoting URLs with ? in zsh, use single quotes or escape
- The deployer address is 0x20b3404f054F99dC1D0A0dAA07E44e7E1Fd4cc57
- VRF coordinator: 0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE
- VRF key hash: 0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71
- VRF subscription ID: 57750058386053786990998297633685375559871666481243777791923539169896613845120
```

---

## After Claude Code Finishes

1. **VRF consumers** — Go to https://vrf.chain.link, find your subscription, remove old Token/Forge consumers, add new Token address as consumer
2. **Verify on BaseScan** — Check all new contracts show verified source code
3. **Test mint** — Call `mintForTest` on new Token via BaseScan to verify blocks appear
4. **Check Vercel** — Push to main triggers auto-deploy at block-hunt-eta.vercel.app
5. **Share the deployment summary** back in Claude.ai chat

---

## After Deployment — Animations Session

The animations work is documented in SECOND_ORDER_POLISH.md (produced in Session 16). Build order:

1. Prize Pool Heartbeat (~15 lines JS)
2. Combine Collapse (CSS transitions, satisfying crunch)
3. Forge Roulette (probability bar with bouncing marker)
4. VRF Oracle Drum Roll (accelerating spin during VRF wait)
5. Mint Reveal Cascade (cards fall like slot machine coins)
6. Collection Completion Cascade (6-card ceremony, once per game)
Then micro-interactions: B1-B5

The SECOND_ORDER_POLISH.md file should be in the frontend/ folder or downloaded separately. If Claude Code can't find it, ask in the Claude.ai chat for the full animation specs.
