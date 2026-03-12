# Session 15 — Delivery Notes
## Session A: Foundation (Bug Fixes + Refactors)

### File Placement

Drop these files into your project at these paths:

```
frontend/src/config/design-tokens.js   ← NEW FILE
frontend/src/abis/index.js             ← REPLACES existing
frontend/src/hooks/useGameState.js      ← REPLACES existing
frontend/src/screens/Game.jsx           ← REPLACES existing
frontend/src/screens/Landing.jsx        ← REPLACES existing
```

### What Changed

#### NEW: `config/design-tokens.js`
- Extracted all shared colours (FELT, GOLD, CREAM, etc.) from 6 files into one source of truth
- Includes TIER_NAMES, TIERS array, TMAP lookup, COMBINE_RATIOS, FORGE_RATIOS
- Includes BATCH_PRICES_ETH, BATCH_SUPPLY, and game constants
- Includes `getMintPrice(batch)` helper
- **T2→T1 combine removed** — COMBINE_RATIOS only has T7 through T3

#### UPDATED: `abis/index.js`
- Removed old `MINT_PRICE` function (replaced by `currentMintPrice()`)
- Added `currentMintPrice()` on Token
- Added `executeDefaultOnExpiry()` on Token (no params — Phase 2)
- Added `currentBatch()` and `windowCapForBatch()` on MintWindow
- Added `forgeBatch(uint256[], uint256[])` on Forge
- Added `castVote(bool)`, `timeRemaining()`, `hasExpired()` on Countdown
- Added `burnVotes` and `claimVotes` to `getCountdownInfo` outputs
- **NEW: Full `ESCROW_ABI` export** — getEscrowInfo, claimLeaderboardReward, etc.

#### UPDATED: `hooks/useGameState.js`
- Added `currentBatch` read from MintWindow (was incorrectly showing window day)
- Added `mintPrice` (formatted ETH number) and `mintPriceWei` (bigint) from Token
- Added `escrowInfo` read from Escrow contract
- Renamed `treasuryBalance` → `prizePool` (kept backwards compat alias)
- Added `countdownInfo.burnVotes` and `countdownInfo.claimVotes`
- Added `refetchBatch()`, `refetchMintPrice()`, `refetchEscrow()` to `refetchAll()`

#### UPDATED: `screens/Game.jsx`
- **C1 Fixed:** Mint price now uses batch-scaled pricing from `currentMintPrice()` instead of hardcoded 0.00025
- **C4 Fixed:** Removed T2→T1 combine ratio (2:100). The Origin is sacrifice-only.
- **C6 Fixed:** Progress bar off-by-one — reordered `all6held` before `have6` computation
- **H2 Fixed:** Forge probability now ratio-anchored (burn N of M = N/M%) instead of flat (N = N%)
- **E3 Done:** "TREASURY" → "PRIZE POOL" in all player-facing labels
- **E12 Done:** Forge warning upgraded to "IF THIS FAILS: X× [Name] — GONE FOREVER"
- **M2 Fixed:** Moved countdown navigation from render-time side effects to `useEffect` hooks
- **M5 Fixed:** Batch stat box shows `currentBatch` from MintWindow, not window day
- VRFMintPanel now receives `mintPrice`, `mintPriceWei`, `currentBatch`, `prizePool` as props

#### UPDATED: `screens/Landing.jsx`
- **E3 Done:** "TREASURY" → "PRIZE POOL" in the top bar label

### NOT YET CHANGED (remaining screens)
These screens still use local design tokens and old "treasury" references. They work fine but will be updated in the next batch:
- `screens/CountdownSpectator.jsx` — already uses "PRIZE POOL" in most places
- `screens/CountdownHolder.jsx` — already uses "PRIZE POOL" in most places
- `components/Modals.jsx` — Game Rules modal still has outdated numbers (item H4, next session)

### Important: wagmi.js needs ESCROW address
Make sure your `frontend/src/config/wagmi.js` has the ESCROW contract address:

```js
export const CONTRACTS = {
  TOKEN:     '0x275481247272Df32A1834716FfD180E45d1BFC91',
  TREASURY:  '0xD7f6B8357ea1C8504378E83a60C361917CA589E2',
  WINDOW:    '0x7Bf0a5CF6d4657B65E2e571ED609a07ACA40bb46',
  FORGE:     '0x6CCBD030Eab2020326d3D76725F8361ffD354303',
  COUNTDOWN: '0x6a1b44287D1BDee8ED462a00839a94be47E6A4e7',
  ESCROW:    '0x932E827BA9B8d708C75295E1b8258e6c924F0FF5',  // ← ADD THIS
}
```

### Next Session: Session B (Core Engagement)
Items 11-20 from the improvement plan — prize pool centrepiece component, mint remaining bar, batch price ladder, micro-goals, leaderboard reframe, spectator routing, and language changes.
