# The Block Hunt — Project Status
> **Last updated:** March 12, 2026 — Session 14 (redeploy, VRF consumers updated, wagmi.js updated)
> **Stage:** All 7 contracts redeployed on Base Sepolia. VRF live. Frontend address update complete. Subgraph redeploy pending.
> **Vercel:** block-hunt-eta.vercel.app (auto-deploys on push to main)

---

## What Is Done

### Game Design
- [x] Core concept, game loop, tier structure fully designed
- [x] Pricing model: batch-scaled, starts at 0.00008 ETH ($0.20), doubles per batch to 0.002 ETH ($5.00)
- [x] Combine ratios: 20:1 (7→6, 6→5), 30:1 (5→4, 4→3), 50:1 (3→2). T2→T1 combine is disabled — The Origin is sacrifice-only.
- [x] Forge mechanics: ratio-anchored probability. Burning N of M blocks = N/M × 100% chance. Ratios: T7/T6=20, T5/T4=30, T3=50. T2→T1 forge not possible.
- [x] Endgame defined: 7-day countdown, Claim (100%) or Sacrifice (50/40/10 split + The Origin)
- [x] Sacrifice distribution: 50% winner, 40% top-100 leaderboard pool (30-day claim window), 10% Season 2 seed
- [x] Entitlement calculation is off-chain (keeper bot reads subgraph, computes shares, passes arrays to `executeDefaultOnExpiry`)
- [x] Winner calls `sacrifice()` with empty arrays — keeper bot handles community pool entitlements via `executeDefaultOnExpiry`
- [x] Season 2 migration mechanics defined: 30-day window, tiered starter rewards
- [x] No holder queue — accepted design decision. First-to-call race on `claimHolderStatus()`.
- [x] Sacrifice is the default — `executeDefaultOnExpiry()` triggers via Gelato keeper
- [x] Batch-scaled rarity confirmed — 3 probability tables (Batches 1–2, 3–4, 5–6)
- [x] Supply-based batch advancement — batch advances when fully minted, not on a timer
- [x] Two 6-hour mint windows per day (08:00–14:00 UTC and 20:00–02:00 UTC)
- [x] Creator fee: 10% of every mint
- [x] Royalty: 10% on secondary sales

### Smart Contracts (7 contracts, 200/200 tests passing — REDEPLOY REQUIRED)

- [x] `BlockHuntToken.sol` — ERC-1155 core: mint, combine, forge, claim, sacrifice
- [x] `BlockHuntTreasury.sol` — ETH custody, 10% creator fee, claim/sacrifice payouts
- [x] `BlockHuntMintWindow.sol` — 6hr windows, batch-scaled caps, supply-based batch advancement
- [x] `BlockHuntForge.sol` — Probabilistic upgrades, ratio-anchored probability, VRF V2.5 integrated
- [x] `BlockHuntCountdown.sol` — 7-day timer, community vote, holder status check, entitlement-based community pool
- [x] `BlockHuntMigration.sol` — Season 1→2 transition
- [x] `BlockHuntSeasonRegistry.sol` — season lifecycle, seed destination verification

#### Changes made in Session 13 (require redeploy)

| Contract | Change |
|----------|--------|
| `BlockHuntForge.sol` | Forge probability overhaul: ratio-anchored (burn N of M = N/M% chance), was flat 10–99% |
| `BlockHuntForge.sol` | T2→T1 forge disabled (Origin only via sacrifice) |
| `BlockHuntToken.sol` | Matching forge tier/burnCount validation updated |
| `BlockHuntToken.sol` | `sacrifice(players[], amounts[])` — winner passes empty arrays; keeper provides entitlements |
| `BlockHuntToken.sol` | `executeDefaultOnExpiry(players[], amounts[])` — keeper passes top-100 entitlements |
| `BlockHuntToken.sol` | VRF gas optimisation: dynamic gas limit scales with quantity, tier aggregation (~70% gas reduction on large mints) |
| `BlockHuntTreasury.sol` | `sacrificePayout()` sends 100% to Countdown (was split internally) |
| `BlockHuntCountdown.sol` | Sacrifice distribution: `initiateSacrifice(winner, players[], amounts[])` writes entitlements to storage |
| `BlockHuntCountdown.sol` | `claimLeaderboardReward()` — zero arguments, reads `leaderboardEntitlement[msg.sender]` |
| `BlockHuntCountdown.sol` | `sweepUnclaimedRewards()` — permissionless, sweeps unclaimed pool to season2SeedAddress after 30 days |
| `BlockHuntCountdown.sol` | `hasVoted` bug fixed — `_voterList` array clears votes on countdown reset so voters can participate again |
| `BlockHuntCountdown.sol` | Merkle proof approach removed entirely (was over-engineered for this scale) |

#### Changes made in Session 12 (require redeploy)

| Contract | Change |
|----------|--------|
| `BlockHuntToken.sol` | Batch pricing: starts at 0.00008 ETH (was 0.0001 ETH) |
| `BlockHuntToken.sol` | Batch-scaled rarity: 3 tables (early/mid/late batches) |
| `BlockHuntToken.sol` | Bug fix: T1 (Origin) removed from VRF roll — was silently mintable at 0.001% |
| `BlockHuntMintWindow.sol` | Window duration: 6 hours (was 24 hours) |
| `BlockHuntMintWindow.sol` | Window cap: batch-scaled via `windowCapForBatch()` (was fixed 50k) |
| `BlockHuntMintWindow.sol` | Batch advancement: supply-based (was time-based / 30-day fixed) |
| `BlockHuntMintWindow.sol` | Batch struct: `endDay` removed |
| `BlockHuntTreasury.sol` | Creator fee: 10% (already correct in deployed version — verify) |

#### Pricing table (locked)

| Batch | ETH | USD (~$2500/ETH) | Supply |
|-------|-----|-----------------|--------|
| 1 | 0.00008 | $0.20 | 500,000 |
| 2 | 0.00016 | $0.40 | 500,000 |
| 3 | 0.00032 | $0.80 | 1,000,000 |
| 4 | 0.00080 | $2.00 | 2,000,000 |
| 5 | 0.00160 | $4.00 | 4,000,000 |
| 6 | 0.00200 | $5.00 | 2,000,000 |

**Full sellout projection:** ~$31M total → ~$27.9M prize pool, ~$3.1M creator

#### Rarity table (batch-scaled)

| Tier | Batch 1–2 | Batch 3–4 | Batch 5–6 |
|------|-----------|-----------|-----------|
| T2 (Willful) | 0.005% | 0.030% | 0.150% |
| T3 (Chaotic) | 0.050% | 0.200% | 0.800% |
| T4 (Ordered) | 0.300% | 1.000% | 3.000% |
| T5 (Remembered) | 2.000% | 4.000% | 8.000% |
| T6 (Restless) | 10.000% | 14.000% | 18.000% |
| T7 (Inert) | remainder | remainder | remainder |

---

### Deployment (Base Sepolia — Session 14, March 12 2026)

> ✅ All 7 contracts redeployed. VRF consumers updated. wagmi.js updated. Subgraph redeploy pending.
> ⚠️ BaseScan verification failed during deploy — fix `BASESCAN_API_KEY` in `.env` and re-run `--verify`.
> ⚠️ Old VRF consumer addresses left active until frontend confirmed working — remove them after first successful mint.

| Contract | Address | Status |
|---|---|---|
| BlockHuntToken | 0x275481247272Df32A1834716FfD180E45d1BFC91 | ✅ Live |
| BlockHuntTreasury | 0xD7f6B8357ea1C8504378E83a60C361917CA589E2 | ✅ Live |
| BlockHuntMintWindow | 0x7Bf0a5CF6d4657B65E2e571ED609a07ACA40bb46 | ✅ Live |
| BlockHuntForge | 0x6CCBD030Eab2020326d3D76725F8361ffD354303 | ✅ Live |
| BlockHuntCountdown | 0x6a1b44287D1BDee8ED462a00839a94be47E6A4e7 | ✅ Live |
| BlockHuntMigration | 0xfD44677e950a77972a46FAe024e587dcD1Bd9eD5 | ✅ Live |
| BlockHuntSeasonRegistry | 0x43944fc7Fe8dce7997Ba1609a13Cf298eFD6622f | ✅ Live |
| Deployer | 0x20b3404f054F99dC1D0A0dAA07E44e7E1Fd4cc57 | — |

**VRF config (unchanged — same subscription, same coordinator):**
- Coordinator: `0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE`
- Key hash (30 gwei lane): `0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71`
- Subscription ID: `57750058386053786990998297633685375559871666481243777791923539169896613845120`
- Balance: ~14.98 LINK (healthy)
- ✅ New Token + Forge added as VRF consumers. Old addresses still active — remove after first confirmed mint.

---

### Subgraph (The Graph Studio)
- [x] Deployed to Graph Studio — `blok-hunt` on Base Sepolia
- [x] Current version: `v0.0.5`
- [x] Query URL: `https://api.studio.thegraph.com/query/1744131/blok-hunt/version/latest`
- ⚠️ After redeploy: update contract address in `subgraph.yaml` and redeploy subgraph

---

### Frontend (Sessions 5–11, partially wired)

#### Screens
- [x] Landing page
- [x] Game screen — fully live data
- [x] AllTiersTrigger — full-screen takeover
- [x] CountdownHolder screen — built + routed
- [ ] CountdownSpectator screen — built, **routing not yet wired**

#### Modals
- [x] Game Rules modal
- [x] Leaderboard modal — live via subgraph
- [ ] Profile modal — UI built, data still hardcoded

#### Live data & transactions
- [x] Wallet connect — multi-wallet picker
- [x] Mint — VRF flow, multi-mint, cancel stuck mint
- [x] Combine, Forge, Treasury balance, Mint window timer
- [x] Player balances, all-6-tiers detection, active holder detection

#### Known frontend bugs
- [ ] Collection progress bar shows 5/6 when all 6 tiers held (off-by-one)
- [ ] T7.png art typo: "TEIR 7" → "TIER 7" (fix before mainnet)
- [ ] VRF recovery not appearing on wallet connect (workaround: BaseScan Write Contract)
- [ ] WalletConnect deprecated packages + 2 moderate npm vulnerabilities

---

## What Is NOT Done (Ordered by Priority)

### Immediate — Redeploy thread
1. ✅ Update `Deploy.s.sol` royalty: 500 → 1000 bps (was already 1000)
2. ✅ Run `forge script script/Deploy.s.sol --broadcast` on Base Sepolia
3. ✅ Re-add BlockHuntToken + BlockHuntForge as VRF consumers at vrf.chain.link
4. Call `treasury.setCountdownContract(address(countdown))` — owner post-deploy call ⬅ check if needed
5. Call `countdown.setSeason2SeedAddress(address)` — owner post-deploy call (use a safe holding address for now)
6. ✅ Update addresses in `wagmi.js` and `STATUS.md`
7. Update subgraph `subgraph.yaml` with new token address, redeploy subgraph as `v0.0.6` ⬅ Next
8. Call `openWindow()` manually to confirm new 6-hour window works (auto-opened on deploy — verify via BaseScan)
9. Manual playthrough to confirm mint/combine/forge flow

### Keeper bot thread (critical pre-mainnet)
1. **`openWindow()` keeper** — fires twice daily at 08:00 + 20:00 UTC via Gelato
2. **`checkHolderStatus()` keeper** — polls for expired countdowns, resets them on-chain
3. **`executeDefaultOnExpiry()` keeper** — fires at countdown zero. This keeper must:
   - Query the subgraph for the top-100 leaderboard players and their scores at the moment the countdown expires
   - Calculate each player's proportional share of the 40% community pool (score / total top-100 score × pool)
   - Pass the resulting `players[]` and `amounts[]` arrays to `executeDefaultOnExpiry()`
   - ⚠️ This is the most complex keeper — entitlement calculation logic must be correct and auditable. Document the formula in TRANSPARENCY.md before mainnet.
4. **`sweepUnclaimedRewards()` keeper** — fires 30 days after sacrifice if community pool has unclaimed funds
5. Configure all keepers on Gelato (testnet first, then mainnet)

### Frontend & game improvements thread
1. Wire CountdownSpectator routing
2. Profile modal live data (from subgraph)
3. Fix progress bar off-by-one bug
4. Mint remaining bar (visual progress within current window)
5. Batch price ladder UI (all 6 batches, current highlighted)
6. Treasury as live character (milestone announcements, centrepiece)
7. T2 reveal moment — full-screen event animation
8. CountdownHolderReset alert via WebSocket
9. Mobile layout pass
10. Fix T7.png art typo

### Documents to update before mainnet
- [ ] GDD Section 6 forge table — still shows old flat 10–99% system. Update to ratio-anchored table.
- [ ] TRANSPARENCY.md — document the entitlement calculation formula used by the `executeDefaultOnExpiry` keeper (score-proportional share of 40% pool). Players should be able to verify the keeper's output independently.

### Pre-Mainnet (unchanged)
- [ ] `disableTestMint()` called and verified on-chain
- [ ] `emergencyWithdraw()` removed after audit
- [ ] Gnosis Safe multisig deployed, ownership transferred
- [ ] `creatorWallet` updated from deployer to cold wallet
- [ ] SeasonRegistry with Season 2 treasury address
- [ ] Independent security audit
- [ ] WalletConnect packages updated
- [ ] Subgraph published to decentralised network
- [ ] Validate 10% fee flow on-chain via `FundsReceived` events
- [ ] All contract addresses published on BaseScan

---

## Known Issues

- **Subgraph not yet redeployed** — leaderboard and subgraph queries pointing at old token address
- **BaseScan verification failed** — fix `BASESCAN_API_KEY` in `.env`, re-run verify
- **treasury.setCountdownContract not confirmed** — check if Deploy.s.sol wires this or needs manual call
- **countdown.setSeason2SeedAddress not set** — needs owner call post-deploy
- **Old VRF consumer addresses still active** — remove after first confirmed mint
- **Mint window requires manual `openWindow()` call** — no keeper configured yet (window auto-opened on deploy, expires in ~6hrs)
- **Countdown reset requires manual `checkHolderStatus()` call** — critical pre-mainnet
- **`executeDefaultOnExpiry` entitlement calculation not yet built** — keeper must query subgraph and compute proportional shares before mainnet
- **Chrome blocked** — use Safari for local dev (MetaMask SES lockdown conflicts with wagmi eval)
- **VRF recovery not appearing** — on-chain query works, UI recovery not populating

---

## Frontend File Index

| File | Status |
|------|--------|
| `frontend/src/App.jsx` | ✅ All routes wired, useAccount for connectedAddress |
| `frontend/src/main.jsx` | ✅ WagmiProvider live |
| `frontend/src/screens/Landing.jsx` | ✅ Done |
| `frontend/src/screens/Game.jsx` | ✅ Fully live, multi-mint, cancel flow, wallet picker |
| `frontend/src/screens/AllTiersTrigger.jsx` | ✅ Full implementation |
| `frontend/src/screens/CountdownHolder.jsx` | ✅ Built + routed |
| `frontend/src/screens/CountdownSpectator.jsx` | ✅ Built, not routed |
| `frontend/src/components/Modals.jsx` | ✅ Leaderboard live, profile hardcoded |
| `frontend/src/components/WalletButton.jsx` | ✅ Multi-wallet picker |
| `frontend/src/hooks/useGameState.js` | ✅ Live |
| `frontend/src/config/wagmi.js` | ✅ Live (WalletConnect commented out) |
| `frontend/src/abis/index.js` | ✅ Full ABI including VRF recovery |

---

## Session Notes

### Session 14 (March 12, 2026)
- Full redeploy on Base Sepolia — all 7 contracts at new addresses (see Deployment section)
- Deploy.s.sol royalty was already 1000 bps — no change needed
- VRF consumers: new Token + Forge added; old addresses left active until frontend confirmed
- wagmi.js updated: all 5 contract addresses swapped; `MINT_PRICE_ETH` replaced with `BATCH_PRICES_ETH` table + `getMintPrice(batch)` helper so price always reflects current batch
- BaseScan verification failed during deploy — BASESCAN_API_KEY in .env needs fixing
- First mint window auto-opened on deploy (25,000 cap, 6-hour window)
- Subgraph redeploy still pending (Step 7)
- Note: STATUS (21).md was the correct latest file — STATUS (20).md was one session behind

### Session 13 (March 12, 2026)
- Forge probability overhauled: ratio-anchored (burn N of M blocks = N/M% chance). Old flat 10–99% system removed.
- T2→T1 forge disabled permanently — The Origin is sacrifice-only.
- Sacrifice redesigned: `sacrifice(players[], amounts[])` and `executeDefaultOnExpiry(players[], amounts[])`.
- Design decision: winner calls `sacrifice()` with empty arrays and receives 50% immediately. Keeper bot is responsible for computing and submitting top-100 entitlements via `executeDefaultOnExpiry()`. This removes winner's ability to manipulate community pool entitlements.
- Entitlement storage: `leaderboardEntitlement[address]` mapping written at sacrifice time. `claimLeaderboardReward()` takes zero arguments — contract reads entitlement directly.
- Merkle proof approach removed — over-engineered for this scale. On-chain storage of entitlements costs ~$5–15 on Base, negligible vs. prize pool size.
- VRF gas optimisation: dynamic gas limit scales with quantity, tier aggregation reduces mintBatch entries from N to max 6 (~70% gas reduction on large mints).
- `hasVoted` bug fixed: `_voterList` array now cleared on countdown reset so voters can re-participate in future countdowns.
- 200/200 tests passing. 1 new test added (`test_Sacrifice_EntitlementsExceedPool_Reverts`).
- Open item: `executeDefaultOnExpiry` keeper entitlement calculation logic not yet built — this is the most complex keeper and must be documented in TRANSPARENCY.md before mainnet.

### Session 12 (March 12, 2026)
- Batch pricing updated: starts at 0.00008 ETH ($0.20), not 0.0001 ETH ($0.25)
- Batch-scaled rarity implemented: 3 probability tables across 6 batches
- Bug fixed: T1 Origin was silently mintable via VRF at 0.001% — removed
- Window duration: 6 hours (two windows/day via keeper), was 24 hours
- Window cap: batch-scaled via `windowCapForBatch()`, was fixed 50k
- Batch advancement: supply-based (batch advances when fully sold), was 30-day timer
- Per-user cap: 500 blocks/window (already correct in uploaded file)
- Creator fee: confirmed 10% in Treasury (already correct)
- 177/177 tests passing after all updates
- Test file updated: MINT_PRICE, rollover cap, window expiry time, Batch struct destructure, insufficient payment test
- Deploy.s.sol: royalty line needs updating 500 → 1000 (not yet done — do in redeploy thread)
