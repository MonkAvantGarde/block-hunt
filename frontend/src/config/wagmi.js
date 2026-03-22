// ─────────────────────────────────────────────────────────────────────────────
// wagmi.js — Blockchain connection config for The Block Hunt
//
// This file does three things:
//   1. Defines Base Sepolia as the only chain the app talks to
//   2. Sets up wallet connectors (MetaMask / injected, WalletConnect)
//   3. Creates the wagmi client that wraps the whole app
//
// Nothing here needs to change until mainnet. At that point swap
// baseSepolia → base and update the RPC URL.
// ─────────────────────────────────────────────────────────────────────────────

import { createConfig, http } from 'wagmi'
import { baseSepolia } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

// ── CHAIN ─────────────────────────────────────────────────────────────────────
// Base Sepolia testnet. Chain ID 84532.
// Public RPC for now — replace with a dedicated Alchemy/Infura key before mainnet.

const BASE_SEPOLIA_RPC = 'https://base-sepolia.g.alchemy.com/v2/gEjkk1lRRfOpVr2RCtTzl'

// ── WALLETCONNECT ─────────────────────────────────────────────────────────────
// Needed for mobile wallets (Rainbow, MetaMask mobile, etc.)
// Get a free project ID from https://cloud.walletconnect.com
// The app will still work without this — MetaMask desktop will connect fine.

const WALLETCONNECT_PROJECT_ID = 'YOUR_WALLETCONNECT_PROJECT_ID'

// ── WAGMI CONFIG ──────────────────────────────────────────────────────────────

export const config = createConfig({
  chains: [baseSepolia],
  connectors: [
    injected(),                                                // MetaMask + browser wallets
    // walletConnect({ projectId: WALLETCONNECT_PROJECT_ID }),    // Mobile wallets
  ],
  transports: {
    [baseSepolia.id]: http(BASE_SEPOLIA_RPC),
  },
})

// ── CONTRACT ADDRESSES ────────────────────────────────────────────────────────
// Single source of truth. Import CONTRACTS wherever you need an address.
// Never hardcode addresses anywhere else in the app.

export const CONTRACTS = {
  TOKEN:     '0x541a85733d98F720A3b7C15f2fdc2f157599B9dc',
  TREASURY:  '0x45D2573111aBA594f457cCe7A49B0856D0FD7E0f',
  WINDOW:    '0x9d20809853b1e341E7880f1dC915FE20CDB1Efb0',
  FORGE:     '0xCCFcadA80ba90fe305DD60A1b6374F8b53e86c55',
  COUNTDOWN: '0x6E8d989e1d649aba16e0bB20965Db7AA78ec22bc',
  ESCROW:    '0x1eD5d60CFc919eAf99e12731b8B37d972fBb2231',
  REWARDS:   '0x834CEf549b311233b99D1a1fc46CDa2C87C0317B',
}

// ── GAME CONSTANTS ────────────────────────────────────────────────────────────
// Mirror the values locked in the contracts.
// Used throughout the UI for display and validation.

// Mint price is batch-dependent — read current batch from contract, then look up here.
// Keys are batch numbers (1–10) matching the on-chain batch index.
export const BATCH_PRICES_ETH = {
  1: 0.00008,
  2: 0.00012,
  3: 0.00020,
  4: 0.00032,
  5: 0.00056,
  6: 0.00100,
  7: 0.00180,
  8: 0.00320,
  9: 0.00520,
  10: 0.00800,
}

// Helper — pass the current batch number returned by the contract
export const getMintPrice = (batch) => BATCH_PRICES_ETH[batch] ?? BATCH_PRICES_ETH[1]

// Combine ratios — T7 down to T2 only (v2.1 updated ratios).
// T2→T1 (The Origin) is NOT available via combine. The Origin is sacrifice-only.
export const COMBINE_RATIOS = {
  7: 21,   // 21 Tier-7 → 1 Tier-6
  6: 19,   // 19 Tier-6 → 1 Tier-5
  5: 17,   // 17 Tier-5 → 1 Tier-4
  4: 15,   // 15 Tier-4 → 1 Tier-3
  3: 13,   // 13 Tier-3 → 1 Tier-2
}

export const TIER_NAMES = {
  1: 'The Origin',
  2: 'The Willful',
  3: 'The Chaotic',
  4: 'The Ordered',
  5: 'The Remember',
  6: 'The Restless',
  7: 'The Inert',
}

// Matches --t1 through --t7 in the design system
export const TIER_COLORS = {
  1: '#c8a84b',
  2: '#b86b2a',
  3: '#9b6b6b',
  4: '#8f8b6b',
  5: '#7a8f6b',
  6: '#6b7fa8',
  7: '#7a8a8f',
}

export const TIER_SYMBOLS = {
  1: '👑', 2: '🔥', 3: '⚡', 4: '🌀', 5: '🌿', 6: '💧', 7: '🪨',
}
