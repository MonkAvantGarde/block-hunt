# Block Hunt — Mainnet / Next Redeploy Changes

Tracks all contract changes discussed but deferred. Frontend-only fixes are NOT listed here — they ship independently via Vercel.

---

## BlockHuntToken.sol (REDEPLOY REQUIRED)

### 1. VRF Callback Revert Protection
**Problem:** `fulfillRandomWords` reverts when `recordMint()` fails (cooldown/cap race condition). Chainlink considers the request fulfilled, ETH stays stuck permanently.
**Root cause:** Rate-limit checks (cooldown, daily cap, cycle cap) happen inside the VRF callback via `recordMint()`, not at `mint()` time. Multiple back-to-back requests pass `mint()` but the second callback reverts.
**Fix options (pick one or combine):**
- Wrap `recordMint()` call in try/catch inside `fulfillRandomWords` so callback never reverts
- Move per-player rate-limit checks into `mint()` (request time) instead of callback time
- Limit pending requests per player: `require(pendingRequestsByPlayer[msg.sender].length < 3)` in `mint()`

**Impact:** 88 wallets, 177 stuck requests, ~12 ETH stuck on testnet. This is the #1 priority fix.

### 2. On-Chain Progression Score (via Countdown contract — see below)
**Problem:** Leaderboard depends on subgraph `progressionScore`. When subgraph is down, leaderboard goes stale.
**Fix:** Token contract calls `countdown.recordProgression(player, points)` on every mint/combine/forge. See Countdown section below.

---

## BlockHuntCountdown.sol (REDEPLOY REQUIRED)

### 3. On-Chain Progression Score Storage
**Problem:** `progressionScore` only exists in the subgraph. Leaderboard breaks when subgraph is down/rate-limited.
**Fix:** Add to Countdown contract:
```solidity
mapping(address => uint256) public progressionScore;
address[] public allPlayers; // for enumeration
mapping(address => bool) private isPlayer;

function recordProgression(address player, uint256 points) external onlyToken {
    if (!isPlayer[player]) {
        isPlayer[player] = true;
        allPlayers.push(player);
    }
    progressionScore[player] += points;
}

function getLeaderboard(uint256 offset, uint256 limit) external view returns (
    address[] memory addrs, uint256[] memory scores
) { ... }
```
**Called from Token:**
- `mint()` → record points based on quantity * tier weights
- `combine()` → record points for the combine action
- `forge()` / `resolveForge()` → record points for forge attempts/successes

**Benefit:** Frontend can read leaderboard directly from contract. Subgraph becomes optional (nice-to-have for history, not required for live data).

---

## BlockHuntToken.sol — VRF Gas Constants (REDEPLOY REQUIRED)

### 4. VRF Callback Gas Limit Too Low (ROOT CAUSE OF STUCK MINTS)
**Problem:** `VRF_GAS_PER_BLOCK = 3,000` and `VRF_GAS_MAX = 2,500,000` are `constant` — can't be changed without redeploy. Actual gas needed per block in `fulfillRandomWords` is ~28,000 (ERC-1155 mint + tier roll + storage). Every mint above ~1 block OOGs, Chainlink marks request fulfilled (won't retry), ETH gets stuck.

**Current behavior:**
- 1 block mint: needs ~178k gas, gets 153k → OOG
- 20 block mint: needs ~710k gas, gets 210k → OOG
- ALL VRF mints are broken regardless of size

**Temporary fix (no redeploy):** Owner calls `configureVRF()` to bump `vrfCallbackGasLimit` from 150k to 2,000,000. This makes mints up to ~70 blocks work (2M base + qty*3k ≤ 2.5M max). Frontend caps quantity at 70.

**Permanent fix for mainnet — make ALL VRF gas params dynamic:**
```solidity
// Change from constant to configurable state variables:
uint32 public vrfGasPerBlock = 28_000;     // was: constant 3_000
uint32 public vrfGasMax = 15_000_000;      // was: constant 2_500_000
// vrfCallbackGasLimit already configurable (currently 150_000, should default to 200_000)

function setVrfGasParams(uint32 _gasPerBlock, uint32 _gasMax) external onlyOwner {
    vrfGasPerBlock = _gasPerBlock;
    vrfGasMax = _gasMax;
}
```

**Recommended mainnet defaults:**
- `vrfCallbackGasLimit`: 200,000 (base overhead)
- `vrfGasPerBlock`: 28,000 (per-block cost in callback)
- `vrfGasMax`: 15,000,000 (supports up to 500-block mints)
- `MINT_REQUEST_TTL`: make configurable too (currently hardcoded 1 hour)

**LINK budget (Base mainnet):**
- ~0.005 LINK per mint (~$0.08) regardless of size (Base L2 gas is negligible)
- 10,000 mints ≈ 50 LINK ($750)
- Start subscription with 10-20 LINK, top up as needed

**Impact:** This is the primary cause of ALL stuck mints on testnet. Every VRF-enabled mint fails because callback gas is insufficient.

### 5. MINT_REQUEST_TTL Should Be Configurable
**Problem:** `MINT_REQUEST_TTL = 1 hours` is a constant. If VRF is consistently slow, players wait a full hour before they can cancel. If VRF becomes fast and reliable, 1 hour is overly cautious.
**Fix:** Make it a configurable state variable with an owner setter.
```solidity
uint256 public mintRequestTTL = 1 hours; // was: constant MINT_REQUEST_TTL

function setMintRequestTTL(uint256 _ttl) external onlyOwner {
    require(_ttl >= 10 minutes && _ttl <= 24 hours, "TTL out of range");
    mintRequestTTL = _ttl;
}
```

---

## BlockHuntMarketplace.sol (ALREADY REDEPLOYED — 2026-03-25)

### 4. Seller Balance Check ✅ DONE
- Added `require(sellerBal >= quantity)` in `buyListing()`
- Auto-corrects stale listing quantity to seller's actual balance
- Added `deactivateStaleListings()` — permissionless cleanup of dead listings
- **Deployed:** `0x1E70AA16553E0df8Ab85190B3755f5BFE3f4eF6a` (verified)

---

## Gas Optimization (REDEPLOY REQUIRED)

### 6. Struct Packing — MintRequest & ForgeRequest
**Problem:** `MintRequest` uses 5 storage slots, `ForgeRequest` uses 4 slots. Every VRF request pays ~60k extra gas in unnecessary SSTOREs.
**Fix:**
- Pack `MintRequest` to 2 slots: `address(20)+uint32+uint32` | `uint128+uint64`
- Pack `ForgeRequest` to 1 slot: `address(20)+uint8+uint16+bool`
**Contracts:** BlockHuntToken.sol, BlockHuntForge.sol

### 7. ReentrancyGuardTransient (EIP-1153)
**Problem:** Standard `ReentrancyGuard` uses SSTORE/SLOAD (~5,000 gas per `nonReentrant` call). Base supports Cancun opcodes.
**Fix:** Swap to OpenZeppelin 5.1+ `ReentrancyGuardTransient` — uses TSTORE/TLOAD (~100 gas). One import change per contract.
**Contracts:** All contracts using `nonReentrant`

### 8. Custom Errors (Replace require strings)
**Problem:** `require(condition, "string")` stores strings in bytecode, costs gas to deploy and revert.
**Fix:** Replace all requires with custom errors. Already partially done in Forge (`InvalidTierForForge`).
**Contracts:** All contracts

### 9. Batch Burns in Endgame Functions
**Problem:** `claimTreasury()`, `sacrifice()`, `executeDefaultOnExpiry()` each loop tiers 2-7 calling `_burn` individually (6 calls).
**Fix:** Use `_burnBatch` with pre-built arrays — 6 operations → 1.
**Contract:** BlockHuntToken.sol

### 10. Cache Tier Thresholds in VRF Callback
**Problem:** `_assignTier()` calls `_getTierThresholds()` on every block in the loop. 500-block mint = 500 recomputations with identical inputs.
**Fix:** Compute thresholds once before the loop, pass them in.
**Contract:** BlockHuntToken.sol

### 11. Pseudo-Random Nonce — Write Once Not Per-Block
**Problem:** `_rollTier()` increments `_nonce` (SSTORE) on every iteration. 500-block mint = 500 storage writes.
**Fix:** Use a memory counter in the loop, write `_nonce` once at the end.
**Contract:** BlockHuntToken.sol

### 12. pendingRequestsByPlayer — O(n) Removal
**Problem:** `_removePendingRequest()` does linear scan of the player's pending array.
**Fix:** Replace with a mapping-based approach for O(1) removal.
**Contract:** BlockHuntToken.sol

### 13. Batch combineMany Burns/Mints
**Problem:** `combineMany()` calls `_burn` and `_mint` per-tier in a loop.
**Fix:** Aggregate into arrays, call `_burnBatch` + `_mintBatch` once each.
**Contract:** BlockHuntToken.sol

### 14. Forge Batch — Defer Countdown Check
**Problem:** Each `resolveForge()` in a batch triggers `_checkCountdownTrigger()` which loops tiers 2-7. 20-attempt batch = 120 `balanceOf` calls.
**Fix:** Call `_checkCountdownTrigger()` once after all attempts resolve.
**Contracts:** BlockHuntForge.sol, BlockHuntToken.sol

### 15. Clean Up Forge Storage
**Problem:** `vrfForgeRequests` and `vrfBatchRequests`/`batchAttempts` are marked resolved but never deleted. No gas refund.
**Fix:** `delete` resolved forge requests (Token already does this for mint requests).
**Contract:** BlockHuntForge.sol

---

## VRF Scaling for High-Throughput Minting (MAINNET PRIORITY)

### 16. Lazy Reveal Pattern
**Problem:** VRF callback does tier assignment, supply updates, treasury transfer, batch mint, recordMint, and countdown check — all in one call. If any step reverts, LINK is wasted and mint is stuck.
**Fix:** Two-phase approach:
1. Callback only stores the VRF seed and marks request fulfilled (very cheap, ~50k gas)
2. Player (or keeper) calls `claimMint(requestId)` to execute the heavy logic
**Benefit:** Dramatically reduces callback gas, prevents wasted LINK on reverts, spreads gas cost across user transactions.
**Contract:** BlockHuntToken.sol

### 17. Mint Queue — Batch Users into Single VRF Request
**Problem:** 500 concurrent minters = 500 VRF requests = 500 LINK charges.
**Fix:** Users call `queueMint()`, when queue hits threshold (e.g. 50 mints or 30s timeout), trigger one VRF request. Single seed derives per-user randomness. Reduces VRF costs ~50x.
**Tradeoff:** Added latency, more complex state. Cap total tokens per batch (~300) to stay under gas limit.
**Contract:** BlockHuntToken.sol (architecture change)
**Reference:** Tubby Cats batch-nft-reveal pattern (`tubby-cats/batch-nft-reveal` on GitHub)

### 18. Reduce VRF Request Confirmations on Base
**Problem:** Both Token and Forge use `requestConfirmations: 3`. Base has single sequencer, 2s blocks, reorgs near-impossible.
**Fix:** Reduce to 1 confirmation (~2s fulfillment vs ~6s).
**Contracts:** BlockHuntToken.sol, BlockHuntForge.sol

### 19. VRF Subscription Management for Mainnet
**Action items:**
- Over-fund subscription (10x expected daily peak in LINK)
- Set up automated top-up via Gelato/Chainlink Automation keeper
- Monitor subscription balance with alerts
- Evaluate LINK vs native payment — LINK has lower premium in V2.5

### 20. Rate-Limit Check at Request Time (Related to #1)
**Problem:** `recordMint()` rate-limit checks run in VRF callback. Multiple back-to-back requests pass `mint()` individually but callback reverts when collective limits exceeded.
**Fix:** Move per-player rate-limit checks to `mint()` (request time), not callback time. Complementary to the try/catch fix in #1.
**Contracts:** BlockHuntToken.sol, BlockHuntMintWindow.sol

---

## Deployment Checklist (for next redeploy)

### Pre-deploy
- [ ] Apply Token fixes (#1, #2, #4, #5 — VRF gas constants + TTL must be configurable)
- [ ] Apply Countdown fix (#3)
- [ ] Apply gas optimizations (#6–#15)
- [ ] Apply VRF scaling changes (#16–#18, #20)
- [ ] Run full test suite (424+ tests)
- [ ] Benchmark VRF callback gas on Base fork (validate gas constants)
- [ ] Dry-run deploy script

### Deploy
- [ ] Deploy new Countdown contract
- [ ] Deploy new Token contract
- [ ] Wire all cross-references (Token↔Treasury, Token↔MintWindow, Token↔Forge, Token↔Countdown, Token↔Escrow)
- [ ] Configure VRF on both Token and Forge (subscription, key hash, gas limits)
- [ ] Add Token + Forge as VRF consumers on Chainlink dashboard
- [ ] Enable VRF: `token.setVrfEnabled(true)`, `forge.setVrfEnabled(true)`

### Post-deploy
- [ ] Update `frontend/src/config/wagmi.js` with new TOKEN + COUNTDOWN addresses
- [ ] Update `subgraph/subgraph.yaml` with new Token address + startBlock
- [ ] Redeploy subgraph
- [ ] Set keeper addresses on MintWindow, Countdown, Rewards
- [ ] Verify all contracts on Basescan
- [ ] Test mint/combine/forge/countdown flows on new contracts
- [ ] Migrate any stuck ETH: old Token contract still holds user funds — users need to cancel on old contract

### Frontend (pre-mainnet)
- [ ] Upgrade Vite v5 → v8 to resolve moderate esbuild dev server vulnerability (GHSA-67mh-4wv8-2f99). Dev-only, not production. Also upgrade `@vitejs/plugin-react` to compatible version. Current: vite 5.4.21.

### Mainnet-specific
- [ ] Disable `testMintEnabled` on Token: `token.disableTestMint()`
- [ ] Disable test mode on Treasury: `treasury.disableTestMode()`
- [ ] Disable test mode on MintWindow: `mintWindow.disableTestMode()`
- [ ] Disable test mode on Countdown: `countdown.disableTestMode()`
- [ ] Disable test mode on Escrow: `escrow.disableTestMode()`
- [ ] Remove `mintForTest()` or ensure it's locked
- [ ] Audit all `onlyOwner` functions — consider transferring ownership to multisig
- [ ] Fund Chainlink VRF subscription with LINK on mainnet (10x daily peak — see #19)
- [ ] Set up automated VRF subscription top-up keeper (#19)
- [ ] Set correct batch prices for mainnet economics
- [ ] Set keeper addresses (Gelato/Chainlink Automation)

---

## BlockHuntCountdown.sol + BlockHuntToken.sol — Countdown Duration Sync (MAINNET PRIORITY)

### 21. Token and Countdown Must Share Single Source of Truth for Countdown Duration
**Problem:** Both `BlockHuntToken.sol` and `BlockHuntCountdown.sol` have independent `countdownDuration` state variables. On testnet, updating Countdown's duration to 1 hour while Token retained 7 days caused `sacrifice()` to revert with "Countdown still running" — Countdown said expired, Token said 6 days left.
**Fix:** Token should read countdown duration from the Countdown contract instead of storing its own copy. Replace Token's `countdownDuration` with a call to `IBlockHuntCountdown(countdownContract).countdownDuration()` in the sacrifice/claim expiry check. Alternatively, have `setCountdownDuration` on either contract propagate to the other.
**Contracts:** BlockHuntToken.sol, BlockHuntCountdown.sol

### 22. Challenge Ranking Must Use Weighted Score (Not Raw Block Count)
**Problem:** `_ranksAbove()` in Countdown used `_totalBlocks()` (raw token count) as tiebreaker, while the leaderboard uses `calculateScore()` (weighted by tier). Players ranked higher on the leaderboard couldn't challenge because the holder had more low-tier tokens.
**Fix (applied on testnet):** Changed `_ranksAbove()` tiebreaker from `_totalBlocks(challenger) > _totalBlocks(holder)` to `calculateScore(challenger) > calculateScore(holder)`.
**Contract:** BlockHuntCountdown.sol

---

## Session Log

### 2026-03-25 Session
- Investigated stuck VRF mints: 88 wallets, 177 requests, ~12 ETH stuck
- Root cause: VRF callback reverts on `recordMint()` rate-limit checks
- Investigated stuck marketplace trades: 2 stale listings (seller balance dropped)
- Redeployed marketplace with balance checks + stale listing cleanup
- Added frontend mint guard (blocks minting while VRF pending)
- Added stuck ETH recovery UI with refund button
- Fixed gas limit on `cancelMintRequest` calls (was causing wallet rejection)
- Fixed stale localStorage cleanup (was causing "Request not found" reverts)
- Moved all subgraph queries server-side (Vercel API routes) — ~600 queries/day vs 14,400
- Added full leaderboard page with search and "YOUR RANK" indicator
- Fixed leaderboard player click → now opens clicked player's profile, not your own
- Wrote 344 new tests (424 total across all suites, all passing)
- Corrected sacrifice text: 50% winner + Origin / 40% top 100 / 10% S2 seed
- Discussed on-chain progressionScore for subgraph independence
