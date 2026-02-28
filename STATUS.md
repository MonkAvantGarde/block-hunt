# The Block Hunt — Project Status
> **Last updated:** February 2026
> **Stage:** Late Pre-Testnet — All 7 contracts written, 126/126 tests passing, nothing deployed

---

## What Is Done

### Game Design
- [x] Core concept, game loop, tier structure fully designed (GDD v0.3)
- [x] Pricing model: $0.00025 ETH per mint, 6 batches, demand-driven progression
- [x] Combine ratios: 20:1 (7→6, 6→5), 30:1 (5→4, 4→3), 50:1 (3→2), 100:1 (2→1)
- [x] Forge mechanics: 10–99 blocks burned = 10–99% success chance
- [x] Endgame defined: 7-day countdown, Claim (100%) or Sacrifice (50/50 + The Origin)
- [x] Season 2 migration mechanics defined: 30-day window, tiered starter rewards
- [x] **Pre-select mechanic confirmed** — purely frontend. Holder pre-selects Claim or Sacrifice in UI; frontend calls the right function when timer hits zero. No contract changes required for the pre-select UX itself.
- [x] **Holder's live choice stays private** — not surfaced to spectators. Community vote (Claim vs Sacrifice) is the public signal. Holder's choice is the reveal at zero.
- [x] **Sacrifice is the default** — if the holder takes no action after 7 days, `executeDefaultOnExpiry()` triggers Sacrifice automatically via Gelato keeper.

### Smart Contracts (7 of 7 written + endgame mechanics locked)
- [x] `BlockHuntToken.sol` — ERC-1155 core: mint, combine, forge, claim, sacrifice
  - **NEW:** 7-day window enforced on-chain — `claimTreasury()` and `sacrifice()` revert if called before timer expires
  - **NEW:** `executeDefaultOnExpiry()` — callable by anyone (Gelato keeper) after expiry, executes Sacrifice on holder's behalf
  - **NEW:** `claimHolderStatus()` — allows a player who already holds all 6 tiers to activate countdown without minting/combining
  - **NEW:** `countdownStartTime` stored in Token for on-chain enforcement
  - **NEW:** `countdownContract` address wired — Token notifies Countdown on start and after every endgame execution
- [x] `BlockHuntTreasury.sol` — ETH custody, 5% creator fee, claim/sacrifice payouts
- [x] `BlockHuntMintWindow.sol` — 8hr windows, daily caps, rollover, batch tracking
- [x] `BlockHuntForge.sol` — Probabilistic upgrades (pseudo-random, VRF pending)
- [x] `BlockHuntCountdown.sol` — 7-day timer, community vote, holder status check
  - **NEW:** `syncReset()` — called by Token after any endgame execution, fixes pre-existing bug where `isActive` stayed `true` permanently after game ended
  - **NEW:** `CountdownEnded` event emitted on sync reset
- [x] `BlockHuntMigration.sol` — Season 1→2 transition, block burning, starter minting
- [x] `BlockHuntSeasonRegistry.sol` — registers season contracts, tracks outcomes, authorises seed destination

### Testing
- [x] Test file written: `test/BlockHunt.t.sol`
- [x] `forge test` passing — **126/126 green** (February 2026)
- [x] Bugs found and fixed across all test runs:
  - `BlockHuntToken.sol` — `claimTreasury()` was not resetting `countdownActive` / `countdownHolder` after payout (fixed in previous thread)
  - `BlockHuntMintWindow.sol` — `recordMint()` was tracking against `tx.origin` instead of `player` (fixed in previous thread)
  - `BlockHuntCountdown.sol` — `isActive` never reset after game ended (fixed this thread via `syncReset()`)
  - `BlockHuntToken.sol` — no on-chain enforcement of 7-day window (fixed this thread)
  - `BlockHuntToken.sol` — no default action on expiry (fixed this thread via `executeDefaultOnExpiry()`)

### UX & Design
- [x] UX Flow v2 — consolidated to 3 screens + 4 modals (from original 10 screens)
- [x] Design system established (`design/prototypes/blokhunt-design-system-v2.html`)
- [x] Game UI prototype (`design/prototypes/blokhunt-game-v2.html`)
- [x] Button → contract function map documented
- [x] Landing page prototype (`design/prototypes/blokhunt-landing-v2.html`)
- [x] Countdown screen — Spectator view (`design/prototypes/blokhunt-countdown-spectator-v1.html`)
- [x] Countdown screen — Holder view (`design/prototypes/blokhunt-countdown-holder-v2.html`)
  - Pre-select mechanic: holder can select Claim or Sacrifice at any time, change freely, frontend auto-executes on-chain when timer hits zero
- [x] Modals prototype (`design/prototypes/blokhunt-modals-v1.html`)
- [ ] Frontend not connected to any contract

### Design Decisions Locked (this thread)
- **Pre-select mechanic** — purely frontend. No contract changes needed for the UX. The holder's selection is stored in the browser; the frontend calls `claimTreasury()` or `sacrifice()` at zero. The contracts enforce the 7-day window regardless.
- **Holder's live choice is private** — not shown to spectators. The community vote is the public engagement mechanism.
- **Sacrifice is the on-chain default** — `executeDefaultOnExpiry()` runs if the holder takes no action. Claim requires an active choice. Inaction does not reward the holder maximally.
- **7-day window is enforced on-chain** — the holder cannot claim or sacrifice early, even if they wanted to.
- **Frontend security confirmed** — the frontend is decoration. All treasury protection lives in the contracts. A compromised frontend cannot access funds.

### Documentation
- [x] Contract architecture document
- [x] Transparency document (owner rights & limitations) — community-facing
- [ ] Deployment scripts — not written
- [ ] README needs updating (currently just Foundry boilerplate)

---

## What Is NOT Done (Ordered by Priority)

### Immediate Next Step — Testnet Deployment (Base Sepolia)
- Write deployment scripts (note: `setCountdownContract` must be included in the wiring step)
- Deploy all 7 contracts
- Wire them together
- Play the game manually end-to-end

### Step 2 — Chainlink VRF Integration
Replace `block.prevrandao` in `BlockHuntForge.sol` with Chainlink VRF V2.5. This is a significant refactor — async request/callback pattern. Tests for Forge will need updating after this change. Do NOT do this before testnet baseline is confirmed working.

### Step 3 — Frontend Build
Connect the existing UI prototypes to deployed testnet contracts using viem/wagmi. Screens needed: Landing, Game (main), Countdown/Endgame + 4 modals.

Prototype files live in `design/prototypes/`. All are standalone HTML — developer rebuilds in React using these as the visual and interaction spec.

Remaining design work before build:
- 4 modals: Onboarding carousel, Leaderboard, Profile, Game Rules
- Spectator vs holder view logic for countdown screen
- Mobile layout pass on game screen

### Step 4 — Security Audit
Engage auditing firm. Contracts must be stable and frozen before audit begins. Audit scope: all 7 contracts, treasury fund flow, randomness manipulation, reentrancy, owner privileges, migration security.

### Step 5 — Mainnet Launch
Execute pre-mainnet checklist (see TRANSPARENCY.md). Transfer ownership to Gnosis Safe multisig.

---

## Open Questions / Unresolved Design Decisions

- [x] ~~**Pre-select mechanic**~~ — resolved. Purely frontend. Contracts enforce the 7-day window independently.
- [x] ~~**Countdown expiry grace period**~~ — resolved. `executeDefaultOnExpiry()` handles expiry with no action. Gelato keeper triggers it.
- [ ] **Token-side reset when holder loses a tier** — `checkHolderStatus()` on Countdown resets the Countdown contract, but `BlockHuntToken.countdownActive` is NOT reset by this path. Currently, if the holder loses a tier mid-countdown, Token still thinks countdown is active until a new endgame function runs. A `resetExpiredHolder()` function on Token (callable when Countdown detects the holder lost qualification) is needed. Deferred to next contract thread.
- [ ] **Player display names** — ENS support or raw wallet addresses only?
- [ ] **In-app notifications** — "Window opens in 1 hour" style alerts?
- [ ] **Landing page art** — video concept, who produces it? (Static version ships first, video swapped in later)
- [ ] **SeasonRegistry deployment timing** — exactly when does the owner need to register Season 2 before Season 1 can end?
- [ ] **Keeper automation provider** — Gelato confirmed, or still evaluating Chainlink Automation?
- [ ] **Tier card art** — what do the 7 tiers actually look like? Currently placeholder in all prototypes.

---

## Known Limitations in Current Contracts (Pre-Audit)

- `_rollTier()` in BlockHuntToken uses `block.prevrandao` — manipulable by validators
- `BlockHuntForge` pseudo-random is insecure — VRF integration pending
- `emergencyWithdraw()` in Treasury is owner-only — should become multisig before mainnet
- Window open/close is manual — keeper automation not yet configured
- `mintForTest()` exists in BlockHuntToken — must call `disableTestMint()` before mainnet
- `setTokenContract()` in Treasury is already locked to one-time use ✓
- No upgrade mechanism by design (immutable contracts = community trust)
- **Token-side countdown reset on holder-loss not yet implemented** — see open questions above

---

## Pre-Mainnet Checklist (from Transparency Doc)
- [ ] `disableTestMint()` called and verified on-chain
- [ ] `emergencyWithdraw()` removed after audit
- [ ] Gnosis Safe multisig deployed with published signer list (owner holds ≤2 of 5 keys)
- [ ] Ownership of all contracts transferred to Gnosis Safe
- [ ] SeasonRegistry deployed with Season 2 treasury address registered
- [ ] Independent security audit completed and report published
- [ ] Chainlink VRF integrated and tested
- [ ] Keeper automation configured for mint window scheduling and `executeDefaultOnExpiry`
- [ ] All contract addresses published on BaseScan

---

## Prototype File Index

All prototype files belong in `design/prototypes/`:

| File | What it is |
|------|-----------|
| `blokhunt-design-system-v2.html` | Colours, fonts, components — the visual source of truth |
| `blokhunt-game-v2.html` | Main game screen — 7 tier slots, Mint/Forge/Trade panels |
| `blokhunt-landing-v2.html` | Landing page — animated block, 5 actions, treasury counter |
| `blokhunt-countdown-spectator-v1.html` | Countdown screen — community/spectator view |
| `blokhunt-countdown-holder-v2.html` | Countdown screen — holder-specific view with pre-select mechanic |
| `blokhunt-modals-v1.html` | All 3 modals: Onboarding carousel, Leaderboard, Profile |

---

## Contract Addresses (TBD at deployment)

| Contract | Testnet (Base Sepolia) | Mainnet (Base) |
|---|---|---|
Testnet Addresses
BlockHuntTreasury:        0x290e85b931ce53B0CA252383ae94Bc8BEA7eb5D9
BlockHuntMintWindow:      0xfbD928FbE4E7197DDe11E958F9c1944a594bbB0b
BlockHuntCountdown:       0x5DbCc0E57cB6DA320f81B8108B98b1b793119b2D
BlockHuntForge:           0x1A72BA9Ef0B6D2a2fFe9da99F1129564519dA571
BlockHuntToken:           0xf292091848d2F09622b89DB20004D1cFccB60Ff6
BlockHuntMigration:       0xEF1E65D7974412F32Dcf5DBB0e84dD873a19d2e6
BlockHuntSeasonRegistry:  0x0577BAf6af9E0a045f28c44a217BA09aA96C4331