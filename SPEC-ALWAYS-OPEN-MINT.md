# SPEC: Always-Open Mint with Per-Player Cooldown

**Status:** Approved
**Date:** 2026-03-22
**Risk level:** Medium — requires MintWindow redeployment only (Token untouched)

---

## 1. Summary

Replace the global mint window system with always-open minting using a two-tier cap:

1. **Cycle cap (500):** After minting 500 blocks, a 3-hour cooldown activates. When it expires, the cycle counter resets.
2. **Daily cap (5000):** Hard limit on total mints in a rolling 24-hour period. Even if cooldowns expire, the player can't mint past this until the 24h period resets.

A player can do at most 10 cycles (500 × 10) per day. All values are configurable.

**Rhythm:** Mint 500 → 3h cooldown → Mint 500 → 3h cooldown → ... → 5000 daily cap → wait for 24h reset

---

## 2. Contract: BlockHuntMintWindow.sol — REWRITE

### 2.1 New State

```solidity
uint256 public cooldownDuration = 3 hours;    // configurable
uint256 public perCycleCap = 500;             // configurable
uint256 public dailyCap = 5000;               // configurable
uint256 public dailyPeriod = 24 hours;        // configurable

struct PlayerMintState {
    uint256 cycleMints;       // mints in current cycle (resets after cooldown)
    uint256 cooldownUntil;    // timestamp when cooldown expires (0 = no cooldown)
    uint256 dailyMints;       // mints in current 24h period
    uint256 dailyPeriodStart; // timestamp when current 24h period began
}

mapping(address => PlayerMintState) public playerState;
```

Two-tier cap: cycle (500 → 3h cooldown → reset) + daily (5000 → hard stop until 24h expires).

### 2.2 Core Logic

**`isWindowOpen()`** — always returns `true` (Token compat)

**`canPlayerMint(address player)`** — returns `false` if on cycle cooldown OR daily cap hit

**`recordMint(address player, uint256 quantity)`:**
1. If daily period expired → reset `dailyMints` to 0, reset `dailyPeriodStart` to now
2. If cooldown has expired → reset `cycleMints` to 0, clear cooldown
3. Reject if on active cooldown
4. Reject if `dailyMints + quantity > dailyCap`
5. Enforce `cycleMints + quantity <= perCycleCap`
6. Increment `cycleMints` and `dailyMints`
7. If `cycleMints >= perCycleCap` → set `cooldownUntil = now + cooldownDuration`
8. Increment `batches[currentBatch].totalMinted`, check batch advancement

**`playerMintInfo(address player)`** — view function for frontend:
- `canMint` (bool) — false if on cooldown OR daily cap hit
- `mintedThisCycle` (uint256)
- `cycleCap` (uint256)
- `cooldownUntil` (uint256) — 0 if not on cooldown
- `mintsRemaining` (uint256) — min of cycle remaining and daily remaining
- `dailyMints` (uint256)
- `dailyCapValue` (uint256)
- `dailyResetsAt` (uint256) — 0 if no active period

**`windowCapForBatch(uint256 batch)`** — returns `type(uint256).max` (disables Token's internal cap check)

### 2.3 Kept Unchanged
- Batch config system (`batchConfigs`, `batchSupply`, `batchPrice`, `_checkBatchAdvancement`)
- `currentBatch`, `batches` mapping
- `tokenContract`, `setTokenContract()`
- `testModeEnabled`, `disableTestMode()`

### 2.4 Removed
- `Window` struct, `windows` mapping, `currentDay`, `rolloverSupply`
- `openWindow()`, `forceOpenWindow()`, `closeWindow()`, `_closeWindow()`
- `WINDOW_DURATION`, `MIN_WINDOW_GAP` constants
- `getWindowInfo()` — replaced with backward-compat stub
- `userDayMints` mapping — replaced by `playerState`

### 2.5 Configurable Setters
```solidity
function setCooldownDuration(uint256 _duration) external onlyOwner {
    cooldownDuration = _duration;
}

function setPerCycleCap(uint256 _cap) external onlyOwner {
    perCycleCap = _cap;
}

function setDailyCap(uint256 _cap) external onlyOwner {
    dailyCap = _cap;
}

function setDailyPeriod(uint256 _period) external onlyOwner {
    dailyPeriod = _period;
}
```

---

## 3. Token Contract — NO CHANGES

Token.sol stays deployed as-is. Here's why each call works:

| Token.sol call | With new MintWindow |
|---|---|
| `isWindowOpen()` | Returns `true` — gate always passes |
| `recordMint(player, qty)` | Enforces per-player cooldown, reverts if on cooldown |
| `windowCapForBatch(batch)` | Returns `uint256.max` — Token's `dayRemaining` check is effectively a no-op |
| `currentBatch()` | Unchanged |
| `batchPrice(batch)` | Unchanged |

**Token's `windowDayMinted` variable:** Since the new MintWindow never calls `resetDailyWindow()`, this accumulates. But since `windowCapForBatch()` returns `uint256.max`, the check `dayRemaining = windowCap - windowDayMinted` always passes (max - anything = huge number). No issue.

---

## 4. Deployment

### 4.1 Script
1. Deploy new `BlockHuntMintWindow`
2. Wire: `newMintWindow.setTokenContract(token)`
3. Wire: `token.setMintWindowContract(newMintWindow)` (allowed while `testMintEnabled = true`)
4. Done — no `forceOpenWindow()` needed (always open)

### 4.2 Rollback
- Redeploy old MintWindow from git
- `token.setMintWindowContract(oldMintWindow)`
- `oldMintWindow.forceOpenWindow()`

### 4.3 Unchanged Contracts
Token, Treasury, Forge, Countdown, Escrow, Migration, Registry — all untouched.

---

## 5. Frontend Changes

### 5.1 useGameState.js

**Remove:** `getWindowInfo` read, `userDayMints` read, `perUserDayCap` read
**Add:** `playerMintInfo` read

```javascript
const mintStatus = {
    canMint:         playerMintRaw[0],
    mintedThisCycle: Number(playerMintRaw[1]),
    cycleCap:        Number(playerMintRaw[2]),
    cooldownUntil:   Number(playerMintRaw[3]),
    mintsRemaining:  Number(playerMintRaw[4]),
    dailyMints:      Number(playerMintRaw[5]),
    dailyCap:        Number(playerMintRaw[6]),
    dailyResetsAt:   Number(playerMintRaw[7]),
}
```

**Keep:** `windowOpen` derived as `mintStatus.canMint` (for prop compat).

### 5.2 MintPanel.jsx

| Current | New |
|---|---|
| "● WINDOW OPEN / ○ WINDOW CLOSED" | "● MINTING OPEN" or "⏳ COOLDOWN HH:MM:SS" |
| Timer: "closes in HH:MM:SS" | Timer: "cooldown ends in HH:MM:SS" (only when on cooldown) |
| "MINTED THIS WINDOW" progress bar | "MINTED THIS CYCLE" progress bar (mintedThisCycle / cycleCap) |
| "MINT CAP REACHED — Wait for next window" | "COOLDOWN — mint again in HH:MM" or "DAILY CAP — resets in HH:MM" |
| Button: "✕ WINDOW CLOSED" | Remove — mint is always open |
| Button: "✕ WINDOW CAP REACHED" | "⏳ ON COOLDOWN" or "⏳ DAILY CAP REACHED" |
| "XX mints left this window" | "XX mints left this cycle · XXXX / 5000 today" |

### 5.3 GameStatusBar.jsx
- Remove window open/closed indicator
- Show cooldown countdown only when player is on cooldown

### 5.4 abis/index.js
- Add `playerMintInfo`, `canPlayerMint`, `cooldownDuration`, `perUserCycleCap` to WINDOW_ABI
- Keep `currentBatch`, `batchPrice`, `batchSupply` (unchanged)

### 5.5 Game.jsx
- Replace `windowOpen` with `mintStatus.canMint`
- Update props to MintPanel

---

## 6. Files Changed

| File | Scope | Action |
|---|---|---|
| `src/BlockHuntMintWindow.sol` | Heavy | Rewrite |
| `script/DeployMintWindow.s.sol` | New | Deploy + wire script |
| `frontend/src/hooks/useGameState.js` | Moderate | Replace window reads with playerMintInfo |
| `frontend/src/panels/MintPanel.jsx` | Moderate | Cooldown UI |
| `frontend/src/components/GameStatusBar.jsx` | Light | Cooldown indicator |
| `frontend/src/screens/Game.jsx` | Light | Prop changes |
| `frontend/src/abis/index.js` | Light | ABI additions |
| `frontend/src/config/wagmi.js` | Light | New WINDOW address |
| `subgraph/subgraph.yaml` | None | No MintWindow events indexed |

**NOT changed:** Token, Treasury, Forge, Countdown, Escrow, Migration, Registry, Subgraph mappings.

---

## 7. Player Experience

```
Player connects → Minting is open → Mints up to 500 blocks
  ↓ hits 500 (cycle cap)
3-hour cooldown starts → Timer shown in UI
  ↓ 3 hours pass
Cycle counter resets → Can mint 500 more (daily counter keeps accumulating)
  ↓ repeats...
  ↓ hits 5000 total in 24h (daily cap)
Hard stop → Must wait for 24h period to expire
  ↓ 24h period expires
Both counters reset → Fresh start
```

No global windows. No coordination with other players. No keeper needed.
Max throughput: 10 cycles × 500 = 5000 per day per player.

---

## 8. Testing Checklist

- [ ] Fresh player can mint (no prior state)
- [ ] Mint counter increments correctly
- [ ] Hitting 500 triggers cooldown
- [ ] Mint reverts during active cooldown ("Player on cooldown")
- [ ] Cooldown expiry resets counter to 0
- [ ] Player can mint again after cooldown
- [ ] Multiple players mint simultaneously (no global lock)
- [ ] Batch advancement still works
- [ ] VRF mint path works
- [ ] Pseudo-random mint path works
- [ ] Frontend shows correct cooldown timer
- [ ] Frontend shows mints remaining
- [ ] Token.sol `isWindowOpen()` call works (returns true)
- [ ] Token.sol `windowCapForBatch()` returns max (no global cap)
- [ ] Rollback works: re-wire to old MintWindow

---

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Token needs redeployment | High | Avoided — `isWindowOpen()` → true, `windowCapForBatch()` → max |
| `windowDayMinted` blocks mints | High | `windowCapForBatch()` returns `uint256.max`, making the check a no-op |
| Bot abuse (500 every 3h) | Low | Same throughput as current system. Cooldown adds friction. |
| Subgraph breaks | None | No MintWindow events indexed |
