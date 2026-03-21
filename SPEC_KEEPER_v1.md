# SPEC_KEEPER_v1 — Keeper Bot + Contract Changes
**Project:** The Block Hunt  
**Date:** March 2026  
**For:** Claude Code (Opus) — autonomous implementation  
**Repo:** MonkAvantGarde/block-hunt  
**Local path:** /Users/bhuri/Desktop/block-hunt

---

## Overview

This spec covers three things in a single implementation session:

1. **Contract changes** — add keeper role + batch config update across three contracts
2. **Gelato Web3 Function: openWindow** — cron keeper that opens mint windows
3. **Gelato Web3 Function: rewards** — keeper that handles all three reward types

Work in a new branch: `keeper-bot`

---

## Part 1 — Contract Changes

### 1A. BlockHuntMintWindow.sol

#### Change 1: Add keeper role

Add the following state variable and modifier pattern, consistent with the existing `onlyOwner` pattern:

```solidity
address public keeper;

modifier onlyOwnerOrKeeper() {
    require(msg.sender == owner() || msg.sender == keeper, "Not authorized");
    _;
}

function setKeeper(address _keeper) external onlyOwner {
    keeper = _keeper;
    emit KeeperUpdated(_keeper);
}

event KeeperUpdated(address indexed keeper);
```

Apply `onlyOwnerOrKeeper` to: `openWindow()`

`setKeeper()` remains `onlyOwner` — only the owner can designate a keeper.

#### Change 2: Add resetWindowCap()

```solidity
function resetWindowCap() external onlyOwner {
    windowMinted = 0;
    emit WindowCapReset();
}

event WindowCapReset();
```

This zeroes the accumulated rollover from previous unfinished windows. Called once by the owner before handing off to testers.

#### Change 3: Update batch config — 25% growth, 10 batches

Replace the existing batch supply array with 10 batches using 25% geometric growth starting at 100K, rounded to nearest 1K:

| Batch | Supply |
|-------|--------|
| 1 | 100,000 |
| 2 | 125,000 |
| 3 | 156,000 |
| 4 | 195,000 |
| 5 | 244,000 |
| 6 | 305,000 |
| 7 | 381,000 |
| 8 | 477,000 |
| 9 | 596,000 |
| 10 | 745,000 |

**Total supply: 3,324,000**

Keep the existing mint prices array (10 prices already in GDD v2.0):
`[0.00008, 0.00012, 0.00020, 0.00032, 0.00056, 0.00100, 0.00180, 0.00320, 0.00520, 0.00800]`

Window caps scale proportionally with batch size. Window cap = batchSupply / 3 (three windows per day, equal cap per window). Round to nearest 1K.

| Batch | Window Cap |
|-------|-----------|
| 1 | 33,000 |
| 2 | 42,000 |
| 3 | 52,000 |
| 4 | 65,000 |
| 5 | 81,000 |
| 6 | 102,000 |
| 7 | 127,000 |
| 8 | 159,000 |
| 9 | 199,000 |
| 10 | 248,000 |

---

### 1B. BlockHuntCountdown.sol

#### Change: Add keeper role

Same pattern as MintWindow:

```solidity
address public keeper;

modifier onlyOwnerOrKeeper() {
    require(msg.sender == owner() || msg.sender == keeper, "Not authorized");
    _;
}

function setKeeper(address _keeper) external onlyOwner {
    keeper = _keeper;
    emit KeeperUpdated(_keeper);
}

event KeeperUpdated(address indexed keeper);
```

Apply `onlyOwnerOrKeeper` to:
- `checkHolderStatus(address holder)`
- `executeDefaultOnExpiry(address[] calldata players, uint256[] calldata amounts)`

---

### 1C. BlockHuntRewards.sol

#### Change 1: Fix MAX_BATCHES constant

```solidity
uint256 public constant MAX_BATCHES = 10;  // was 6
```

#### Change 2: Add keeper role

Same pattern as above. Apply `onlyOwnerOrKeeper` to:
- `resolveDailyDraw()`
- `setBatchFirstWinner()`
- `addBatchBountyRecipients()`
- `finalizeBatchBounty()`

---

### 1D. Tests

After all contract changes, update and run the full test suite:

```bash
forge test
```

All 281+ existing tests must remain passing. Add new tests for:
- `setKeeper()` sets keeper address correctly
- `onlyOwnerOrKeeper` allows keeper to call gated functions
- `onlyOwnerOrKeeper` rejects unauthorized callers
- `resetWindowCap()` zeroes windowMinted
- New batch config: verify total supply = 3,324,000
- `MAX_BATCHES` is 10 in BlockHuntRewards

---

## Part 2 — Gelato Web3 Functions

Create a new top-level directory in the repo:

```
/keeper/
  package.json
  tsconfig.json
  web3-functions/
    open-window/
      index.ts
    rewards/
      index.ts
      schema.json (for Gelato user args)
```

### Setup

```bash
npm install -g @gelatonetwork/web3-functions-sdk
```

`package.json` dependencies:
```json
{
  "dependencies": {
    "@gelatonetwork/web3-functions-sdk": "^2.0.0",
    "ethers": "^6.0.0"
  }
}
```

---

### 2A. open-window keeper

**File:** `keeper/web3-functions/open-window/index.ts`

**Trigger:** Time-based cron — fires at 10:00, 18:00, 02:00 UTC daily

**Logic:**
1. Connect to BlockHuntMintWindow contract
2. Check if a window is already open (`isWindowOpen()` or equivalent view)
3. If not open, call `openWindow()`
4. If already open, do nothing (log and exit cleanly)

**Contract:** BlockHuntMintWindow  
**Address (Base Sepolia):** `0xCf130CBe110980fcb3e0223833Ab005736A2d6dA`  
**Function:** `openWindow()`

**ABI fragment needed:**
```json
[
  "function openWindow() external",
  "function isWindowOpen() external view returns (bool)",
  "function windowEnd() external view returns (uint256)"
]
```

If `isWindowOpen()` does not exist on the contract, check `windowEnd() > block.timestamp` as the open signal.

**Gelato schema (index.ts structure):**
```typescript
import { Web3Function, Web3FunctionContext } from "@gelatonetwork/web3-functions-sdk";
import { Contract, JsonRpcProvider } from "ethers";

Web3Function.onRun(async (context: Web3FunctionContext) => {
  const { userArgs, gelatoArgs } = context;
  // provider, contract, check, call
});
```

**User args (passed at Gelato registration):**
- `mintWindowAddress`: contract address string
- `chainId`: 84532 for Base Sepolia, 8453 for mainnet

---

### 2B. rewards keeper

**File:** `keeper/web3-functions/rewards/index.ts`

**Trigger:** Time-based cron — fires once per day at 00:05 UTC (5 minutes after UTC midnight)

**Persistent storage:** Uses Gelato's `storage` API to track state between runs and avoid double-awarding.

#### Storage keys used:
- `lastProcessedDay` — UTC day number last processed for lottery
- `awardedFirsts_{batch}_{achievementId}` — boolean, whether this first has been awarded
- `bountyFinalized_{batch}` — boolean, whether batch bounty has been finalized

#### Logic — runs sequentially each trigger:

**Step 1: Daily Lottery**

1. Compute current UTC day: `Math.floor(Date.now() / 86400000)`
2. Read `lastProcessedDay` from storage
3. If current day === lastProcessedDay, skip (already run today)
4. Query subgraph for wallets that minted during yesterday's UTC day:
   ```graphql
   query {
     mintEvents(
       where: { timestamp_gte: $dayStart, timestamp_lt: $dayEnd }
     ) {
       player
     }
   }
   ```
   Deduplicate to unique wallet list.
5. If no wallets, skip and log.
6. Determine current batch from MintWindow contract.
7. Generate random seed: `BigInt(ethers.id(Date.now().toString() + wallets.join()))` — note this is not VRF, it is a deterministic seed from public data. Sufficient for testnet; upgrade to on-chain VRF before mainnet.
8. Call `resolveDailyDraw(day, batch, wallets, randomSeed)`
9. Write `lastProcessedDay = currentDay` to storage.

**Step 2: Batch Firsts**

For each of the 13 achievement IDs, check if it has been awarded yet. Use storage key `awardedFirsts_{batch}_{id}`.

Achievement definitions and subgraph queries:

| ID | Name | Trigger | Subgraph query |
|----|------|---------|----------------|
| 0 | Pioneer | First mint in batch | First `MintFulfilled` where `batch == currentBatch` |
| 1 | Combiner | First combine in batch | First `CombineExecuted` where `batch == currentBatch` |
| 2 | Smith | First forge in batch | First `ForgeResolved` where `batch == currentBatch` |
| 3 | Centurion | First wallet to reach 100 total mints in batch | Sum of `MintFulfilled.amount` per wallet in batch, first to hit 100 |
| 4 | Five Hundred | First wallet to reach 500 total mints in batch | Same, threshold 500 |
| 5 | The Thousand | First wallet to reach 1,000 total mints in batch | Same, threshold 1000 |
| 6 | Contender | First wallet to hold all 6 tiers (T2–T7) in batch | `Player` entity where `tier2Bal > 0 && tier3Bal > 0 ... tier7Bal > 0`, earliest timestamp |
| 7 | Countdown Threat | First to trigger countdown in batch | First `CountdownStarted` event where `batch == currentBatch` |
| 8 | First Restless | First T6 minted in batch | First `MintFulfilled` where `tier == 6 && batch == currentBatch` |
| 9 | First Remembered | First T5 minted in batch | First `MintFulfilled` where `tier == 5 && batch == currentBatch` |
| 10 | First Ordered | First T4 minted in batch | First `MintFulfilled` where `tier == 4 && batch == currentBatch` |
| 11 | First Chaotic | First T3 minted in batch | First `MintFulfilled` where `tier == 3 && batch == currentBatch` |
| 12 | First Willful | First T2 minted in batch | First `MintFulfilled` where `tier == 2 && batch == currentBatch` |

For each un-awarded achievement:
1. Run the subgraph query
2. If a winner is found and not yet stored, call `setBatchFirstWinner(batch, achievementId, winnerAddress)`
3. Write `awardedFirsts_{batch}_{achievementId} = true` to storage

**Step 3: Batch Bounty**

1. Check if current batch has changed since last run (batch advanced = previous batch sold out)
2. If a batch just completed and `bountyFinalized_{completedBatch}` is not set:
   a. Query subgraph for ALL unique wallets that minted in the completed batch (paginate in chunks of 1,000)
   b. Call `addBatchBountyRecipients(batch, wallets)` in chunks of 500 wallets per tx (gas safety)
   c. After all chunks submitted, call `finalizeBatchBounty(batch)`
   d. Write `bountyFinalized_{completedBatch} = true` to storage

**Subgraph URL:** `https://api.studio.thegraph.com/query/1744131/blok-hunt/version/latest`

**Contracts needed:**
- BlockHuntRewards (address to be provided at Gelato registration — not yet deployed)
- BlockHuntMintWindow: `0xCf130CBe110980fcb3e0223833Ab005736A2d6dA` (read current batch)

**User args schema** (`schema.json`):
```json
{
  "rewardsAddress": "string",
  "mintWindowAddress": "string",
  "subgraphUrl": "string",
  "chainId": "number"
}
```

---

## Part 3 — Deployment Checklist (for Monk to run after implementation)

These steps happen AFTER Claude Code completes implementation and tests pass. Not part of the automated build — Monk executes these manually.

### Step 1: Deploy updated contracts
```bash
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
```

### Step 2: Set keeper address on each contract

Get Gelato's dedicated sender address for your Web3 Function from the Gelato dashboard after deploying the functions. Then:

```bash
# MintWindow
cast send 0xCf130CBe110980fcb3e0223833Ab005736A2d6dA \
  "setKeeper(address)" GELATO_SENDER_ADDRESS \
  --rpc-url base_sepolia --private-key $PK

# Countdown  
cast send 0x124de60d7d465BA404c8AAD71709efc5A0209D35 \
  "setKeeper(address)" GELATO_SENDER_ADDRESS \
  --rpc-url base_sepolia --private-key $PK

# Rewards (after deployment)
cast send REWARDS_ADDRESS \
  "setKeeper(address)" GELATO_SENDER_ADDRESS \
  --rpc-url base_sepolia --private-key $PK
```

### Step 3: Reset window cap (clean slate for testers)
```bash
cast send 0xCf130CBe110980fcb3e0223833Ab005736A2d6dA \
  "resetWindowCap()" \
  --rpc-url base_sepolia --private-key $PK
```

### Step 4: Deploy Web3 Functions to Gelato
```bash
cd keeper
npx w3f deploy web3-functions/open-window/index.ts
npx w3f deploy web3-functions/rewards/index.ts
```

### Step 5: Register tasks on Gelato dashboard (app.gelato.network)
- open-window: cron `0 10,18,2 * * *` UTC, pass mintWindowAddress + chainId
- rewards: cron `5 0 * * *` UTC, pass rewardsAddress + mintWindowAddress + subgraphUrl + chainId

### Step 6: Fund Gelato balance
Deposit ~0.1 ETH on Base Sepolia into your Gelato balance to cover gas for both tasks.

---

## Key constants for Claude Code

```
SUBGRAPH_URL: https://api.studio.thegraph.com/query/1744131/blok-hunt/version/latest
CHAIN_ID_TESTNET: 84532 (Base Sepolia)
CHAIN_ID_MAINNET: 8453 (Base)
RPC_BASE_SEPOLIA: https://sepolia.base.org

CONTRACT ADDRESSES (Base Sepolia — March 12 2026 deployment):
BlockHuntToken:     0x23A15aE0bF86B1227614A1175A1D3A12f8FA747b
BlockHuntTreasury:  0xEd9a0A9DD424aa9CBCe6edd9b5b56236d6e9F4f2
BlockHuntMintWindow: 0xCf130CBe110980fcb3e0223833Ab005736A2d6dA
BlockHuntForge:     0xA4865336E3e760f6738B0Dea009B574f3d8e0BbC
BlockHuntCountdown: 0x124de60d7d465BA404c8AAD71709efc5A0209D35
BlockHuntEscrow:    0x932E827BA9B8d708C75295E1b8258e6c924F0FF5
BlockHuntMigration: 0x08a808315BBf3014552b1B6f6cCEab51FcB99239

NOTE: BlockHuntRewards is not yet deployed — it will be deployed as part of this session.
```

---

## Implementation order

1. Contract changes (MintWindow → Countdown → Rewards)
2. `forge test` — all tests green
3. Create `/keeper/` directory and scaffold
4. Implement `open-window/index.ts`
5. Implement `rewards/index.ts`
6. Verify TypeScript compiles cleanly: `npx tsc --noEmit`
7. Report complete with summary of all files changed/created
