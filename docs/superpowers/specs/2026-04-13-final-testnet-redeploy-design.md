# Block Hunt — Final Testnet Redeploy Design Spec

**Date:** 2026-04-13
**Target:** Base Sepolia (final testnet before mainnet)
**Approach:** Phased — Phase 1 (contracts), Phase 2 (frontend + subgraph), Phase 3 (rewards, separate spec)

---

## Phase 1: Contract Changes

### 1.1 VRF Gas Fix (BlockHuntToken.sol) — CRITICAL

**Problem:** `VRF_GAS_PER_BLOCK = 3,000` is a constant. Actual callback cost is ~28,000/block. All VRF mints OOG, Chainlink marks fulfilled, ETH stuck permanently. 88 wallets, 177 stuck requests, ~12 ETH locked on testnet.

**Fix:** Make all VRF gas params owner-configurable state variables:

```solidity
uint32 public vrfGasPerBlock = 28_000;     // was: constant 3_000
uint32 public vrfGasMax = 15_000_000;      // was: constant 2_500_000
// vrfCallbackGasLimit already configurable, default to 200_000

function setVrfGasParams(uint32 _gasPerBlock, uint32 _gasMax) external onlyOwner {
    vrfGasPerBlock = _gasPerBlock;
    vrfGasMax = _gasMax;
}
```

**Post-optimization callback gas estimates:**

| Batch Size | Estimated Gas |
|------------|---------------|
| 1          | ~121k         |
| 50         | ~145k         |
| 100        | ~170k         |
| 200        | ~220k         |
| 500        | ~370k         |

### 1.2 VRF Callback Revert Protection (BlockHuntToken.sol) — CRITICAL

**Problem:** `fulfillRandomWords` calls `recordMint()` which can revert on cooldown/cap race conditions. Callback revert = ETH stuck.

**Fix (two-part):**
1. Move rate-limit pre-checks into `mint()` (request time) so obvious violations are caught before VRF request
2. Wrap `recordMint()` in try/catch inside `fulfillRandomWords` so callback never reverts

```solidity
// In fulfillRandomWords:
try IBlockHuntMint(mintWindowContract).recordMint(req.player, allocated) {
    // success
} catch {
    // log event, don't revert — blocks still mint, rate-limit missed this once
    emit RecordMintFailed(req.player, allocated);
}
```

### 1.3 Hybrid Mint — Single Callback + Lazy Reveal (BlockHuntToken.sol)

**Design:** Single-callback for most mints. Lazy reveal activates above an admin-configurable batch threshold.

```solidity
uint32 public lazyRevealThreshold;  // 0 = disabled, all mints single callback
                                     // e.g., 200 = lazy reveal for mints > 200

function setLazyRevealThreshold(uint32 _threshold) external onlyOwner {
    lazyRevealThreshold = _threshold;
}
```

**Single callback path (quantity <= threshold or threshold = 0):**
- VRF callback assigns tiers, mints, records — same as today but with gas optimizations
- Player experience: one transaction, blocks appear after ~10-30s

**Lazy reveal path (quantity > threshold):**
- VRF callback only stores the seed + marks `fulfilled = true` (~50k gas)
- Frontend auto-prompts player to sign `claimMint(requestId)` — tier assignment runs on player's gas
- Player sees: "Large batch mints may require a second signature to reveal your blocks"

```solidity
function claimMint(uint256 requestId) external nonReentrant {
    MintRequest storage req = vrfMintRequests[requestId];
    require(req.fulfilled && !req.claimed, "Not claimable");
    // No msg.sender check — anyone can call (permissionless fallback)
    // Blocks always mint to req.player
    req.claimed = true;
    // ... tier assignment loop, _mintBatch, recordMint, countdown check
}
```

**Permissionless `claimMint`:** No `msg.sender == req.player` check. Blocks always mint to `req.player`. This allows fallback claim by anyone if the player's frontend fails, but the primary path is the frontend auto-prompting the player's wallet.

**Updated MintRequest struct (packed, 3 slots):**

```solidity
struct MintRequest {
    address player;        // 20 bytes
    uint32  quantity;      // 4 bytes
    bool    fulfilled;     // 1 byte (lazy reveal: seed stored)
    bool    claimed;       // 1 byte (lazy reveal: player claimed)
    // --- slot boundary ---
    uint128 amountPaid;    // 16 bytes
    uint64  requestedAt;   // 8 bytes
    // --- slot boundary ---
    uint256 seed;          // 32 bytes (only written in lazy reveal mode)
}
```

### 1.4 Refund TTL (BlockHuntToken.sol)

**Change:** Configurable TTL, default 10 minutes (was 1 hour constant).

```solidity
uint256 public mintRequestTTL = 10 minutes;

function setMintRequestTTL(uint256 _ttl) external onlyOwner {
    require(_ttl >= 5 minutes && _ttl <= 1 hours, "TTL out of range");
    mintRequestTTL = _ttl;
}
```

**Cancel logic — two paths:**

*Single callback path:* Both `fulfillRandomWords` and `cancelMintRequest` delete the request as their first action. If VRF already fulfilled (blocks minted), cancel fails with "Request not found". If cancel runs first, VRF callback exits early (`req.player == address(0) → return`). No double-dip possible.

*Lazy reveal path:* `fulfillRandomWords` does NOT delete the request — it stores the seed and sets `fulfilled = true`. Cancel must check: if `fulfilled == true`, cancel is only allowed if `claimed == false`. Cancel deletes the request (discarding the seed), refunds ETH. If `claimed == true`, cancel fails (blocks already minted). The `claimMint` function must also check that the request hasn't been cancelled (i.e., `req.player != address(0)`).

**LINK is consumed regardless** of cancel — Chainlink already did the VRF work.

### 1.5 Mint Fee — 20% (BlockHuntTreasury.sol)

Creator fee on mint: 10% → 20%. Secondary royalty (ERC-2981) stays at 10%.

Update the fee constant/variable in `receiveMintFunds()`.

### 1.6 Remove emergencyWithdraw (BlockHuntTreasury.sol, BlockHuntRewards.sol)

Both `emergencyWithdraw` functions removed. Flagged as HIGH in both audit reports. Post-mainnet emergency access goes through multisig + timelock.

### 1.7 Countdown — Cumulative Defense (BlockHuntCountdown.sol)

**New mechanic:** Total defense required is 7 days cumulative across all stints, not 7 days from last claim.

**State:**

```solidity
mapping(address => uint256) public cumulativeDefenseTime;  // seconds defended
uint256 public constant REQUIRED_DEFENSE = 7 days;

address public currentHolder;
uint256 public holderSince;
uint256 public lastChallengeTime;
```

**When a player becomes holder** (trigger or successful challenge):
- `holderSince = block.timestamp`
- Cumulative clock is NOT reset — keeps banked time

**When a player loses** (challenged):
- `cumulativeDefenseTime[loser] += (block.timestamp - holderSince)`
- New holder: `holderSince = block.timestamp`

**Win condition:**
- `cumulativeDefenseTime[holder] + (block.timestamp - holderSince) >= 7 days`
- When true, holder can claim/sacrifice

**Challenge cooldown:**
- Normal: 24 hours between challenges
- Last 24 hours of holder's remaining defense time: 6 hours between challenges
- "Last 24 hours" = `REQUIRED_DEFENSE - (cumulativeDefenseTime[holder] + elapsed) <= 24 hours`

**Countdown duration sync fix (#21):** Token reads duration from Countdown contract, does not store its own copy.

**Example flow:**

```
Day 0:  Alice triggers countdown         → cumulative: 0, needs 7 days
Day 2:  Bob challenges, wins              → Alice banks 2 days, Bob starts at 0/7
Day 4:  Alice challenges Bob, wins        → Bob banks 2 days, Alice resumes at 2/7
Day 8.5: Alice at 6.5/7                   → enters "last 24hr" zone, 6hr challenge cooldown
Day 9:  Alice hits 7/7                    → can claim/sacrifice
```

### 1.8 On-Chain Progression Score + Leaderboard (BlockHuntCountdown.sol)

**State:**

```solidity
mapping(address => uint256) public progressionScore;
address[] public allPlayers;
mapping(address => bool) private isPlayer;

function recordProgression(address player, uint256 points) external onlyToken {
    if (!isPlayer[player]) {
        isPlayer[player] = true;
        allPlayers.push(player);
    }
    progressionScore[player] += points;
}
```

**Reads:**

```solidity
function totalPlayers() external view returns (uint256) {
    return allPlayers.length;
}

function getPlayers(uint256 offset, uint256 limit)
    external view returns (address[] memory addrs, uint256[] memory scores)

function getPlayerScore(address player) external view returns (uint256)
```

**Scoring triggers** (called from Token):
- Mint: points = quantity
- Combine: points = quantity x tier weight
- Forge attempt: base points, bonus on success

**Sorting:** Done client-side by the frontend. Contract returns raw unsorted data via paginated reads. For 80-1000 players, this is 1-10 RPC calls and instant client-side sort.

**"Jump to my position":** Frontend finds the connected wallet's rank in the sorted list and scrolls to it.

### 1.9 MintWindow Fixes (BlockHuntMintWindow.sol)

**Cycle auto-reset:** Currently if a player mints 400 and walks away, their `cycleMints` stays at 400 with no timer. After 3 hours they should have all 500 available. Fix: track `cycleStartedAt`, reset cycle if 3 hours have passed since first mint in that cycle.

**Setter bounds:** Add minimum/maximum validation on config setters to prevent fat-finger bricks:

```solidity
require(_duration >= 1 minutes && _duration <= 24 hours);
require(_cap >= 1 && _cap <= 10000);
```

### 1.10 Gas Optimizations (All Contracts)

**High impact:**

| # | Optimization | Contract | Savings |
|---|-------------|----------|---------|
| 10 | Cache tier thresholds before loop | Token | ~5k/block in callback |
| 11 | Single nonce write after loop | Token | ~20k/block in callback |

**Medium impact:**

| # | Optimization | Contract | Savings |
|---|-------------|----------|---------|
| 6 | Struct packing (MintRequest 5→3 slots, ForgeRequest 4→1) | Token, Forge | ~40-60k/request |
| 9 | Batch burns in endgame (6 `_burn` → 1 `_burnBatch`) | Token | ~120k/endgame action |
| 12 | O(1) pending request removal (swap-and-pop) | Token | Scales with concurrent requests |
| 13 | Batch `combineMany` (`_burnBatch` + `_mintBatch`) | Token | Scales with tiers |
| 14 | Defer countdown check in forge batch (1 check, not 20) | Forge | ~600 SLOAD saved per 20-batch |

**Low impact:**

| # | Optimization | Contract | Savings |
|---|-------------|----------|---------|
| 7 | ReentrancyGuardTransient (EIP-1153 TSTORE/TLOAD) | All | ~4.9k/nonReentrant call |
| 8 | Custom errors (replace require strings) | All | ~200-500/revert + smaller bytecode |
| 15 | Delete resolved forge requests | Forge | Gas refund per request |

**Cleanup:**
- Remove dead `windowDayMinted` from Token (~5k gas saved per mint)

### 1.11 Known Edge Case: Batch Boundary Pricing

When a mint straddles a batch boundary (e.g., batch 3 at 99,999 supply, player mints 500), all blocks are priced at the current batch price. Batch advancement happens in `recordMint` after the price is locked. Players near the boundary get a minor discount.

**Decision:** Accepted as a minor leak for this deploy. Batch sizes are 100k+ so the window is small. Documenting for mainnet review.

---

## Phase 2: Frontend + Subgraph

### 2.1 Frontend

**Contract integration:**
- Update `wagmi.js` with new addresses + ABIs
- Remove `windowDayMinted` references

**Mint flow:**
- Always-open minting (no window countdown)
- Per-player cooldown timer (3hr cycle, daily cap) from `playerMintInfo()`
- Lazy reveal: if mint > threshold, show notice before minting, auto-prompt `claimMint` when seed arrives
- Refund button appears after configured TTL (5-10 min)

**Leaderboard:**
- Paginated `getPlayers()` from Countdown contract
- Client-side sort by progression score
- "Jump to my position" for connected wallet
- Full leaderboard — show all players

**Countdown display:**
- Cumulative defense time: "X of 7 days defended"
- Challenge cooldown: 24hr normal, 6hr in last 24 hours
- "Danger zone" visual when holder enters last 24hr

**Cards + animation:**
- Lottie JSON (preferred) or WebM with alpha per tier
- T7 (Inert): static image, no animation
- T6: 2-second loop
- T5: 3-second loop
- T4: 4-second loop
- T3, T2, T1: progressively longer loops
- Sound effects: TBD (direction from user)

**Rewards panel:** TBD — waiting on new rewards spec

### 2.2 Subgraph

- **Phase 0:** Update Token address in `subgraph.yaml`, redeploy to Graph Studio
- **Phase 1:** Add Forge datasource (ForgeRequest entity tracking)
- **Phase 2:** Add Rewards datasource (when new contract is ready)
- **Phase 3:** Index new events (cumulative defense, progression score — for history)

### 2.3 NFT Art + Metadata

**Hosting:** IPFS via Pinata

**Per-tier assets:**
- Static PNG for `image` field (wallet thumbnails, universal support)
- Animated MP4 for `animation_url` field (OpenSea detail view)
- Lottie JSON for frontend card display (performance optimized)

**Metadata format (per OpenSea standard):**

```json
{
  "name": "Chaotic Block",
  "description": "Tier 3 - Block Hunt Season 1",
  "image": "ipfs://QmCID/images/t3.png",
  "animation_url": "ipfs://QmCID/animations/t3.mp4",
  "attributes": [
    { "trait_type": "Tier", "value": 3 },
    { "trait_type": "Season", "value": 1 }
  ]
}
```

**Contract URI:** `ipfs://QmCID/{id}.json`

**Art fix:** T7.png "TEIR 7" typo → "TIER 7" before upload.

---

## Phase 3: Rewards

New rewards system design TBD. Separate spec will be created when user shares the updated requirements. Also: royalty increase to 20% on mint fee is in Phase 1 (section 1.5).

---

## Deploy + Wiring Sequence

```
1. Deploy Treasury (20% mint fee, no emergencyWithdraw)
2. Deploy MintWindow (carry forward with cycle reset fix + setter bounds)
3. Deploy Countdown (cumulative defense, on-chain scores, leaderboard reads)
4. Deploy Forge (gas optimizations: deferred countdown, struct packing, storage cleanup)
5. Deploy Token (VRF fixes, hybrid mint, gas optimizations, try/catch callback)
6. Deploy Escrow (carry forward)
7. Deploy Migration + SeasonRegistry (carry forward)

8. Wire cross-references:
   Token ↔ Treasury
   Token ↔ MintWindow
   Token ↔ Countdown
   Token ↔ Forge
   Token ↔ Escrow
   Countdown.onlyToken ← Token address

9. Post-deploy config:
   - Add Token + Forge to VRF subscription
   - Fund subscription with LINK
   - setVrfGasParams(28000, 15000000)
   - setLazyRevealThreshold(0)  // disabled initially
   - setMintRequestTTL(10 minutes)
   - Verify all contracts on BaseScan

10. Frontend deploy:
    - Update wagmi.js (addresses + ABIs)
    - Deploy to Vercel

11. Subgraph:
    - Update subgraph.yaml (new addresses)
    - Redeploy to Graph Studio
```

---

## Out of Scope (This Spec)

- Rewards system redesign (Phase 3, separate spec)
- Mainnet deployment (separate spec after testnet validation)
- Multisig setup + ownership transfer (mainnet only)
- Keeper bot configuration (post-deploy operational task)
- Sound design specifics (direction TBD)
- Specific animation durations for T3, T2, T1 (artist deliverable)

---

## Security Hardening (added 2026-04-15)

Cross-reviewed against `unaddressed_bugs.md` and `bug_priority_verdict.md`. Items below are additive to the Phase 1 scope above and ship in the same redeploy.

### SH-1. BlockHuntCountdown — `holderSince` initialization guard *(NEW-A, P0)*

Every path that assigns `currentHolder` MUST also set `holderSince = block.timestamp`. Add an invariant check in the challenge function and a test-suite assertion.

```solidity
require(holderSince > 0, "Holder session not initialized");
// And in every assignment path:
currentHolder = newHolder;
holderSince  = block.timestamp;  // never rely on default
```

**Invariant test:** `assert(currentHolder == address(0) || holderSince > 0)`.

### SH-2. BlockHuntToken — `setVrfGasParams` bounds *(NEW-G, P0)*

Extends §1.1. Without bounds, the fix recreates the original ETH-locking bug.

```solidity
function setVrfGasParams(uint32 _gasPerBlock, uint32 _gasMax) external onlyOwner {
    require(_gasPerBlock >= 10_000 && _gasPerBlock <= 100_000, "gasPerBlock out of range");
    require(_gasMax >= 500_000 && _gasMax <= 30_000_000, "gasMax out of range");
    vrfGasPerBlock = _gasPerBlock;
    vrfGasMax = _gasMax;
    emit VrfGasParamsUpdated(_gasPerBlock, _gasMax);
}
```

### SH-3. BlockHuntToken — try/catch ALL external calls in `fulfillRandomWords` *(NEW-B + rewards, P0)*

§1.2 covered `recordMint`. Extend to every external call in the VRF callback:

```solidity
// recordMint (from §1.2) — already covered
try IBlockHuntMint(mintWindowContract).recordMint(req.player, allocated) {}
catch { emit RecordMintFailed(req.player, allocated); }

// recordProgression — new
try IBlockHuntCountdown(countdownContract).recordProgression(req.player, mintedCount) {}
catch { emit RecordProgressionFailed(req.player, mintedCount); }

// rewards.onMint — new, required once rewards contract is wired
try IBlockHuntRewards(rewardsContract).onMint(req.player, amountPaid, tiers, batch) {}
catch { emit RewardsOnMintFailed(req.player, amountPaid); }
```

**Rule:** no bare external call in `fulfillRandomWords`. Every future hook added here inherits the try/catch requirement.

### SH-4. BlockHuntToken — `executeDefaultOnExpiry` holder grace period *(BUG-14, P0)*

15-minute holder-exclusive window before the function becomes permissionless.

```solidity
function executeDefaultOnExpiry() external nonReentrant {
    require(countdownActive, "No countdown active");
    uint256 expiry = countdownStartTime + countdownDuration;
    require(block.timestamp >= expiry, "Not expired");

    // Holder-exclusive grace period
    if (block.timestamp < expiry + 15 minutes) {
        require(msg.sender == countdownHolder, "Holder grace period active");
    }
    // ... rest of sacrifice execution
}
```

**Decision recorded:** use stored `countdownHolder` as-is during grace. Do NOT re-verify `hasAllTiers` — adds race complexity for a rare scenario. Document inline.

### SH-5. BlockHuntToken + BlockHuntCountdown — forge sandwich protection *(BUG-16, P0)*

Counter-based approach (not time-lock). Track pending forge burns as logically-still-held.

```solidity
// BlockHuntToken
mapping(address => mapping(uint8 => uint256)) public pendingForgeBurns;

// When forge starts (burn happens):
pendingForgeBurns[player][fromTier] += burnCount;

// When forge resolves (success or fail):
pendingForgeBurns[player][fromTier] -= burnCount;

// When forge is cancelled / times out — SAME decrement path:
pendingForgeBurns[req.player][req.fromTier] -= req.burnCount;
```

```solidity
// BlockHuntCountdown.hasAllTiers
for (uint8 t = 2; t <= 7; t++) {
    if (balanceOf(player, t) + pendingForgeBurns[player][t] == 0) return false;
}
return true;
```

**Critical:** cleanup on forge cancel/expire is mandatory — without it, a stuck forge request leaves the holder permanently un-challengeable (inverted exploit).

### SH-6. BlockHuntToken — burn exactly 1 of each tier on claim/sacrifice *(BUG-9, P0)*

```solidity
// Replace full-balance burn loop with:
uint256[] memory ids = new uint256[](6);
uint256[] memory amounts = new uint256[](6);
for (uint256 i = 0; i < 6; i++) {
    ids[i] = i + 2;
    amounts[i] = 1;
    tierTotalSupply[i + 2] -= 1;
}
_burnBatch(msg.sender, ids, amounts);
```

Frontend must display: *"Burning 6 blocks (1 per tier). You keep: X T7, Y T6, …"* before confirmation.

### SH-7. BlockHuntToken — `combineMany` length cap *(BUG-4, P0)*

```solidity
function combineMany(uint256[] calldata fromTiers) external nonReentrant whenNotPaused {
    require(fromTiers.length > 0 && fromTiers.length <= 50, "Invalid length");
    // ...
}
```

Frontend auto-chunks larger requests into sequential 50-item batches.

### SH-8. BlockHuntForge — basis-point probability *(BUG-3, P0)*

```solidity
uint256 successChance = (singleReq.burnCount * 10_000) / ratio;
bool success = (randomWords[0] % 10_000) < successChance;
```

Displayed odds now match actual odds exactly.

### SH-9. BlockHuntEscrow — explicit amount on sacrifice *(BUG-5, P1)*

```solidity
// Treasury:
IBlockHuntEscrow(escrow).initiateSacrifice(winner, totalPrizePool);

// Escrow:
function initiateSacrifice(address winner, uint256 amount) external onlyToken {
    uint256 winnerShare   = amount * 50 / 100;
    uint256 communityShare = amount * 40 / 100;
    uint256 s2Share       = amount * 10 / 100;
    // ...
}
```

Removes reliance on `address(this).balance`.

### SH-10. BlockHuntCountdown — season-indexed leaderboard state *(NEW-F, P1)*

Replace flat mappings with season-indexed ones. Applies to `progressionScore`, `allPlayers`, `isPlayer`, and any other rewards-adjacent state that should reset between seasons.

```solidity
uint256 public currentSeason;
mapping(uint256 => address[]) public seasonPlayers;
mapping(uint256 => mapping(address => uint256)) public seasonScore;
mapping(uint256 => mapping(address => bool)) public isSeasonPlayer;

function recordProgression(address player, uint256 points) external onlyToken {
    if (!isSeasonPlayer[currentSeason][player]) {
        isSeasonPlayer[currentSeason][player] = true;
        seasonPlayers[currentSeason].push(player);
    }
    seasonScore[currentSeason][player] += points;
}

function advanceSeason() external onlyOwner {
    currentSeason += 1;
    emit SeasonAdvanced(currentSeason);
}
```

### SH-11. BlockHuntToken + BlockHuntCountdown — eliminate player on claim/sacrifice *(NEW-E, P1)*

After the endgame burn, Token calls:

```solidity
IBlockHuntCountdown(countdownContract).eliminatePlayer(msg.sender);

// Countdown:
function eliminatePlayer(address player) external onlyToken {
    seasonScore[currentSeason][player] = 0;
    isEliminated[currentSeason][player] = true;
    emit PlayerEliminated(currentSeason, player);
}
```

No ghost leaderboard entries after endgame.

### SH-12. BlockHuntTreasury — creator fee floor + event *(BUG-11, P1)*

```solidity
uint256 public constant MIN_CREATOR_FEE = 500;  // 5% floor
event CreatorFeeUpdated(uint256 oldBps, uint256 newBps);

function setCreatorFee(uint256 bps) external onlyOwner {
    require(bps >= MIN_CREATOR_FEE, "Below minimum");
    require(bps <= MAX_CREATOR_FEE, "Exceeds max");
    emit CreatorFeeUpdated(creatorFeeBps, bps);
    creatorFeeBps = bps;
}
```

### SH-13. BlockHuntCountdown — remove `castVote` *(BUG-8, decision)*

Remove `castVote()`, `votesBurn`, `votesClaim`, and `hasVoted` state + events. Remove vote display from frontend. Community signal moves to off-chain (Discord/Twitter).

### Deferred with tracking

- **NEW-C** (lazy reveal + contract wallets): mitigated by shipping `lazyRevealThreshold = 0` at deploy. Revisit before enabling.
- **BUG-10** (Marketplace CEI): fold into next marketplace iteration, separate deploy.

### Updated Deploy Checklist additions

Add to existing checklist:

- [ ] SH-1 through SH-8 applied + unit tests green
- [ ] SH-9 through SH-13 applied + unit tests green
- [ ] Invariant test: `assert(currentHolder == address(0) || holderSince > 0)` in countdown suite
- [ ] Invariant test: pendingForgeBurns cleanup on forge cancel/timeout path
- [ ] Confirm `lazyRevealThreshold = 0` in post-deploy config
- [ ] Confirm `castVote` removed from Countdown + frontend
