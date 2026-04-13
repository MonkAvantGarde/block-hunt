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
