# The Block Hunt — Project Status
> **Last updated:** March 14, 2026 — Session 17 (contract changes: challenge mechanic, 3hr windows, setter audit)
> **Stage:** Contract development complete. Ready for redeploy + audit. Frontend redesign complete from Session 16.
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
- [x] Season 2 migration mechanics defined: 30-day window, tiered starter rewards
- [x] Sacrifice is the default — `executeDefaultOnExpiry()` triggers via Gelato keeper
- [x] Batch-scaled rarity confirmed — 3 probability tables (Batches 1–2, 3–4, 5–6)
- [x] Supply-based batch advancement — batch advances when fully minted, not on a timer
- [x] **Three 3-hour mint windows per day** — 10:00, 18:00, 02:00 UTC (updated Session 17)
- [x] Creator fee: 10% of every mint
- [x] Royalty: 10% on secondary sales
- [x] **Countdown challenge mechanic** — player with all 6 tiers + higher score can take over the countdown (new Session 17)
- [x] **Scoring system** — weighted by tier: T2=10,000 / T3=2,000 / T4=500 / T5=100 / T6=20 / T7=1 (new Session 17)
- [x] **24-hour safe period** between challenges, full 7-day reset on successful challenge (new Session 17)
- [x] No holder queue — replaced by challenge mechanic. First-to-call race on initial `claimHolderStatus()`, then score-based challenges during countdown.

### Smart Contracts (8 contracts, 264 tests passing)

- [x] `BlockHuntToken.sol` — ERC-1155 core: mint, combine, forge, claim, sacrifice, `updateCountdownHolder` (new)
- [x] `BlockHuntTreasury.sol` — ETH custody, 10% creator fee, claim/sacrifice payouts. `testModeEnabled` added for re-callable setter.
- [x] `BlockHuntMintWindow.sol` — **3hr windows, 4hr min gap**, `forceOpenWindow()` test override, `testModeEnabled`
- [x] `BlockHuntForge.sol` — Probabilistic upgrades, ratio-anchored probability, VRF V2.5 integrated
- [x] `BlockHuntCountdown.sol` — 7-day timer, community vote, **challenge mechanic**, `calculateScore()`, `challengeCountdown()`
- [x] `BlockHuntEscrow.sol` — Sacrifice funds, 50/40/10 split, leaderboard entitlements. `testModeEnabled` added.
- [x] `BlockHuntMigration.sol` — Season 1→2 transition. `setMigrationContract` re-callable in test mode.
- [x] `BlockHuntSeasonRegistry.sol` — season lifecycle, seed destination verification

#### Pricing table (locked)

| Batch | ETH | USD (~$2500/ETH) | Supply |
|-------|-----|-----------------|--------|
| 1 | 0.00008 | $0.20 | 500,000 |
| 2 | 0.00016 | $0.40 | 500,000 |
| 3 | 0.00032 | $0.80 | 1,000,000 |
| 4 | 0.00080 | $2.00 | 2,000,000 |
| 5 | 0.00160 | $4.00 | 4,000,000 |
| 6 | 0.00200 | $5.00 | 2,000,000 |

#### Rarity table (batch-scaled)

| Tier | Batch 1–2 | Batch 3–4 | Batch 5–6 |
|------|-----------|-----------|-----------|
| T2 (Willful) | 0.005% | 0.030% | 0.150% |
| T3 (Chaotic) | 0.050% | 0.200% | 0.800% |
| T4 (Ordered) | 0.300% | 1.000% | 3.000% |
| T5 (Remembered) | 2.000% | 4.000% | 8.000% |
| T6 (Restless) | 10.000% | 14.000% | 18.000% |
| T7 (Inert) | remainder | remainder | remainder |

#### Scoring weights (new Session 17)

| Tier | Weight | Rationale |
|------|--------|-----------|
| T2 (Willful) | 10,000 | ~1 in 20,000 blocks in Batch 1 |
| T3 (Chaotic) | 2,000 | ~1 in 2,000 blocks |
| T4 (Ordered) | 500 | ~1 in 333 blocks |
| T5 (Remembered) | 100 | ~1 in 50 blocks |
| T6 (Restless) | 20 | ~1 in 10 blocks |
| T7 (Inert) | 1 | Most common (~87.6%) |
| T1 (Origin) | NOT SCORED | Sacrifice-only, excluded from competition |

---

### Deployment — LIVE (Phase 5, March 14, 2026)

**Deployed contracts on Base Sepolia:**

| Contract | Address |
|---|---|
| BlockHuntToken | `0x5A5335f138950C127Dc9baaA2618e89ADEce09aC` |
| BlockHuntTreasury | `0x6c264D2aBc88bB52D8D1B8769360cad71cB6730f` |
| BlockHuntMintWindow | `0xd6041d73C9B5C8dde6df6a1b35F7d22C1A087aEa` |
| BlockHuntCountdown | `0x7360590aD91AFE35e9e678842a79B0720F0425e7` |
| BlockHuntEscrow | `0xBA346012cc45BBD3aB66E953C6D5914a8E40D923` |
| BlockHuntSeasonRegistry | `0x95E89adB34A5C01E5C57a69fc80E45d1b66e9434` |
| BlockHuntForge | `0xA4865336E3e760f6738B0Dea009B574f3d8e0BbC` |
| BlockHuntMigration | `0xfD44677e950a77972a46FAe024e587dcD1Bd9eD5` |

All contracts verified on BaseScan.

**VRF config:**
- Coordinator: `0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE`
- Key hash: `0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71`
- Callback gas limit: `2500000` (Token), `300000` (Forge)
- Subscription ID: `57750058386053786990998297633685375559871666481243777791923539169896613845120`
- VRF consumers: Token + Forge

---

### Subgraph (The Graph Studio)
- [x] Deployed to Graph Studio — `blok-hunt` on Base Sepolia
- [x] Current version: `v0.0.8`
- [x] Query URL: `https://api.studio.thegraph.com/query/1744131/blok-hunt/version/latest`
- ⚠️ "PLAYERS: 0" bug — `uniquePlayers` stat entity returns 0 despite players being indexed
- ⚠️ Will need redeployment after contract redeploy (new addresses)

---

### Frontend (Sessions 5–16, fully redesigned)

#### Architecture (Session 16 module split)
```
frontend/src/
├── screens/
│   ├── Game.jsx (559 lines — layout shell)
│   ├── Landing.jsx
│   ├── AllTiersTrigger.jsx
│   ├── CountdownHolder.jsx
│   └── CountdownSpectator.jsx
├── components/
│   ├── GameUI.jsx (Btn, StatBox, TxErrorPanel, Skeleton, etc.)
│   ├── GameStatusBar.jsx
│   ├── TierCard.jsx + TierSlot.jsx
│   ├── RevealMoment.jsx + CombineCeremony.jsx
│   ├── ErrorBoundary.jsx
│   ├── WalletButton.jsx
│   └── Modals.jsx
├── panels/
│   ├── MintPanel.jsx (447 lines)
│   ├── ForgePanel.jsx (632 lines)
│   └── TradePanel.jsx (73 lines)
├── hooks/useGameState.js
├── config/wagmi.js + design-tokens.js
├── abis/index.js
└── assets/T1.png–T7.png
```

Frontend needs updates after contract redeploy:
- [ ] Update all contract addresses in wagmi.js
- [ ] Update ABIs if function signatures changed
- [ ] Add challenge UI to CountdownSpectator (score display, challenge button)
- [ ] Add score to leaderboard
- [ ] Update window timing display (6hr → 3hr)

---

## What Is NOT Done (Ordered by Priority)

### Immediate — Redeploy + Test
1. **Run Claude Code audit** (SPEC_AUDIT.md ready) — comprehensive security review before redeploy
2. **Fix any audit findings** — critical and high must be resolved
3. **Redeploy all 5 contracts** — Token, Treasury, MintWindow, Countdown, Escrow
4. **Wire contracts** — full wiring sequence per Deploy.s.sol
5. **Update Forge + Migration** — call setTokenContract with new Token address
6. **Add new Token + Forge to VRF subscription** — remove old consumers
7. **Call `forceOpenWindow()`** — test the mint flow
8. **Manual end-to-end playthrough** — mint → combine → forge → trigger countdown → challenge → claim/sacrifice

### Frontend Updates (after redeploy)
1. Update wagmi.js with new contract addresses
2. Update ABIs for changed contracts
3. Build challenge countdown UI — score display, challenge button, shift notifications
4. Update window timing in UI (3hr windows)

### Animations — SECOND_ORDER_POLISH.md
Build order:
1. Prize Pool Heartbeat
2. Combine Collapse
3. Forge Roulette
4. VRF Oracle Drum Roll
5. Mint Reveal Cascade
6. Collection Completion Cascade
Then micro-interactions: B1–B5

### Keeper Bot Thread (critical pre-mainnet)
1. `openWindow()` keeper — fires at 10:00, 18:00, 02:00 UTC via Gelato
2. `checkHolderStatus()` keeper — polls for expired countdowns
3. `executeDefaultOnExpiry()` keeper — fires at countdown zero, queries subgraph for top-100 entitlements
4. `sweepUnclaimedRewards()` keeper — fires 30 days after sacrifice

### Subgraph
- Redeploy to new contract addresses after redeploy
- Fix "PLAYERS: 0" bug
- Index new events: `CountdownChallenged`, `CountdownShifted`, `CountdownHolderUpdated`

---

## Setter Audit Results (Session 17)

31 setter functions audited across 8 contracts. 6 were one-time locked:

| Category | Setter | Contract | Action |
|----------|--------|----------|--------|
| A — Keep locked | registerSeason() | SeasonRegistry | No change |
| A — Keep locked | markSeasonLaunched() | SeasonRegistry | No change |
| A — Keep locked | markSeasonEnded() | SeasonRegistry | No change |
| B — Test-mode gate | setTokenContract() | Treasury | Re-callable when testModeEnabled ✅ |
| B — Test-mode gate | setTokenContract() | Escrow | Re-callable when testModeEnabled ✅ |
| B — Test-mode gate | setMigrationContract() | Token | Re-callable when testMintEnabled ✅ |

---

## Known Issues

- **T7.png "TEIR 7" typo** — art edit required before mainnet
- **"PLAYERS: 0" in leaderboard** — subgraph uniquePlayers stat returns 0
- **BaseScan verification failed** — fix `BASESCAN_API_KEY` in `.env`, re-run verify
- **Chrome blocked** — Safari required for local dev (MetaMask SES lockdown)
- **WalletConnect deprecated packages** — 2 moderate npm vulnerabilities
- **Subgraph needs redeploy** — new contract addresses + new events after redeploy

### Documents to update before mainnet
- [x] GDD — updated Session 17 (3hr windows, challenge mechanic, scoring)
- [x] STATUS.md — updated Session 17
- [x] TRANSPARENCY.md — updated Session 17 (contract addresses, challenge mechanic, VRF)
- [ ] CHAT_RULES.md — still references old pricing, fees, windows

### Pre-Mainnet Checklist
- [ ] Claude Code audit (SPEC_AUDIT.md) complete
- [ ] All audit findings resolved
- [ ] `disableTestMint()` called and verified on Token
- [ ] `disableTestMode()` called on Treasury, Escrow, MintWindow
- [ ] `emergencyWithdraw()` removed after professional audit
- [ ] Gnosis Safe multisig deployed, ownership transferred
- [ ] `creatorWallet` updated from deployer to cold wallet
- [ ] Independent security audit by professional firm
- [ ] WalletConnect packages updated
- [ ] Subgraph published to decentralised network
- [ ] Validate 10% fee flow on-chain
- [ ] All contract addresses verified on BaseScan
- [ ] Keeper automation configured for all 4 keeper functions
- [ ] VRF subscription funded for expected volume

---

## Session Notes

### Session 17 (March 14, 2026) — Contract Changes + Challenge Mechanic
- **Countdown challenge mechanic designed and implemented**: players with all 6 tiers + higher weighted score can take over the countdown
- **Scoring weights**: T2=10,000 / T3=2,000 / T4=500 / T5=100 / T6=20 / T7=1 (T1 excluded)
- **24-hour safe period** between challenges, full 7-day reset on successful challenge
- **Token modified**: `updateCountdownHolder(address)` — callable only by Countdown contract
- **MintWindow updated**: 3hr windows (was 6hr), 4hr minimum gap (was 12hr), `forceOpenWindow()` added
- **Window schedule**: 10:00 / 18:00 / 02:00 UTC — optimized for Japan/Korea, Europe, US evenings
- **Setter audit**: 31 functions across 8 contracts. 3 one-time setters made re-callable in test mode (Treasury, Escrow, Token migration)
- **VRF gas limit issue diagnosed and fixed**: 500k was too low for 500-block mints (needs 1.65M). Raised to 2.5M.
- **VRF stuck mint resolved**: cancelMintRequest after 1hr TTL
- **Game economics modeled**: 100-player and 1,000-player scenarios, treasury projections, batch progression analysis
- **Late-game design discussed**: forge as late-game engine, secondary market dynamics, guild/DAO vs solo player dynamics
- Tests: 222 → 264 (all passing)
- Spec documents produced: SPEC_00, SPEC_01, SPEC_02_v2, SPEC_AUDIT, CONTRACT_CHANGES_MASTER_v2

### Session 16 (March 13-14, 2026) — Frontend UI/UX Redesign
- Complete frontend redesign: 47 plan items + 8 user feedback fixes + 3 window experience features
- Game.jsx split from 2068→559 lines across 7 new component/panel files
- 12 design frameworks applied
- Documents: UI_UX_REDESIGN_PLAN_v3.1.md, SECOND_ORDER_POLISH.md, IMPROVEMENTS_ROADMAP.md

### Session 15 (March 13, 2026) — Frontend Code Review
- 6 critical, 8 high, 6 medium, 4 low issues identified and fixed
- Engagement roadmap produced with 22 framework-backed recommendations

### Session 14 (March 12, 2026)
- Full redeploy on Base Sepolia — all 7 contracts
- VRF consumers updated, subgraph redeployed as v0.0.8

### Session 13 (March 12, 2026)
- Forge probability overhauled: ratio-anchored
- Sacrifice redesigned with entitlement-based community pool
- 200/200 tests passing

### Session 12 (March 12, 2026)
- Batch pricing, batch-scaled rarity, supply-based advancement
- T1 Origin removed from VRF roll
- 177/177 tests passing
