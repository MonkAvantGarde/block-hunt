# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Block Hunt is an on-chain game deployed on Base (L2). Players mint ERC-1155 tokens across 7 tiers, combine/forge them up tiers, and compete for a treasury prize pool. The game has seasons, a 7-day endgame countdown, and uses Chainlink VRF for randomness.

**Target chain:** Base Sepolia (testnet), Base mainnet (production)

## Build & Test Commands

### Smart Contracts (Foundry)
```bash
forge build                    # Compile all contracts
forge test                     # Run all tests (test file currently backed up at test/BlockHunt.t.sol.bak — needs rewrite for Phase 2 changes)
forge test --match-test test_FunctionName -vvvv  # Run single test with traces
forge test --match-contract BlockHuntTokenTest    # Run tests for one contract
forge test --gas-report        # Run tests with gas reporting
```

### Deploy (Base Sepolia)
```bash
# Dry run
forge script script/Deploy.s.sol:Deploy --rpc-url $BASE_SEPOLIA_RPC_URL -vvvv

# Deploy + verify
forge script script/Deploy.s.sol:Deploy --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY -vvvv
```

### Frontend (React + Vite)
```bash
cd frontend
npm run dev      # Local dev server
npm run build    # Production build
```

### Subgraph (The Graph)
```bash
cd subgraph
graph codegen && graph build                   # Build
graph deploy --studio blok-hunt                # Deploy to Graph Studio
```

## Architecture

### Smart Contracts (8 contracts in `src/`)

The contracts communicate through setter-based wiring (each contract holds references to the others, set during deployment):

- **BlockHuntToken.sol** — ERC-1155 core. Mint (VRF-randomized tiers), combine (deterministic burn N:1), forge (probabilistic upgrade via ForgeContract), claim/sacrifice endgame. Central hub that all other contracts interact with.
- **BlockHuntTreasury.sol** — Holds all mint ETH. 10% creator fee on mint, remainder held until endgame. Claim pays 100% to winner; sacrifice splits 50/40/10 (winner/leaderboard/season2 seed).
- **BlockHuntMintWindow.sol** — Two 6-hour windows per day. Batch-scaled caps. Supply-based batch advancement (6 batches). Rollover of unminted supply.
- **BlockHuntForge.sol** — Probabilistic tier upgrades using Chainlink VRF V2.5. Ratio-anchored probability (burn N of M = N/M% chance). T2→T1 forge disabled.
- **BlockHuntCountdown.sol** — 7-day endgame timer triggered when a player holds all tiers 2-7. Community vote (social signal only). Leaderboard entitlements stored on-chain for sacrifice distribution.
- **BlockHuntMigration.sol** — Season 1→2 player transition.
- **BlockHuntSeasonRegistry.sol** — Season lifecycle and seed destination tracking.
- **BlockHuntEscrow.sol** — Escrow functionality (in progress)

### Deployment Wiring Order
Deploy: Treasury → MintWindow → Countdown → Forge → Token → Migration → Registry. Then wire cross-references (Token↔Treasury, Token↔MintWindow, etc.). See `script/Deploy.s.sol` for the full sequence.

### Frontend (`frontend/`)
React 18 + Vite + wagmi v3 + viem + TanStack Query. Deployed on Vercel (auto-deploys on push to main).

Key files:
- `src/config/wagmi.js` — Single source of truth for contract addresses, chain config, game constants (prices, combine ratios, tier names)
- `src/hooks/useGameState.js` — All on-chain reads (balances, window state, countdown)
- `src/abis/index.js` — Contract ABIs
- `src/screens/Game.jsx` — Main game screen with mint/combine/forge flows

### Subgraph (`subgraph/`)
Indexes BlockHuntToken events (TransferSingle, TransferBatch, MintFulfilled) on Base Sepolia. Tracks per-player tier balances, progression scores (weighted by combine ratios), and leaderboard rankings. Query endpoint in STATUS.md.

## Key Game Mechanics

- **Token tiers:** 1 (Origin, sacrifice-only) through 7 (Inert, most common)
- **Combine ratios:** 20:1 (T7→T6, T6→T5), 30:1 (T5→T4, T4→T3), 50:1 (T3→T2). T2→T1 disabled.
- **Mint pricing:** Batch-scaled from 0.00008 ETH (Batch 1) to 0.002 ETH (Batch 6)
- **VRF:** Both Token (mint randomness) and Forge (upgrade randomness) use Chainlink VRF V2.5. VRF is disabled by default and must be enabled post-deploy.

## Environment Variables

Required in `.env` for deployment:
- `PRIVATE_KEY` — Deployer wallet key
- `CREATOR_WALLET` — Address receiving creator fees
- `BASE_SEPOLIA_RPC_URL` — RPC endpoint
- `BASESCAN_API_KEY` — For contract verification

## Important Notes

- Contract addresses after redeployment must be updated in both `frontend/src/config/wagmi.js` and `subgraph/subgraph.yaml`
- STATUS.md contains the full project state, deployed addresses, session history, and known issues
- Chrome has SES lockdown conflicts with wagmi — use Safari for local frontend dev
- The `blockhunt/` directory is a legacy/alternate frontend scaffold (not the active frontend)
- Library dependencies are git submodules in `lib/`: OpenZeppelin, Chainlink, forge-std
