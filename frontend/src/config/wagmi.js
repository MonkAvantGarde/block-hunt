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

export const BASE_SEPOLIA_RPC = 'https://base-sepolia.g.alchemy.com/v2/gEjkk1lRRfOpVr2RCtTzl'

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
  TOKEN:     '0x89D2bA134287B406DEE136B5af22D6d9A1DC0E81',
  TREASURY:  '0xD6640C2336BBca2C025dC5F73955176ac6Ca6284',
  WINDOW:    '0x412326d5ba3bDC4Ae6315c3Ea8dEDed5C6fC9Bfa',
  FORGE:     '0xd298cF13CF319ae7a13a5Bd98E8F8Ba815469150',
  COUNTDOWN: '0x4447a4d4b3bc5Ec419E86Ef9e360D861e91bc0D2',
  ESCROW:    '0x1f8d4501e012024537E31d8d87aD55D0E12Cb641',
  REWARDS:   '0xd999b4F51c14203Dd4CFEfb375fddA1B33af543b',
  MARKETPLACE: '0x1E70AA16553E0df8Ab85190B3755f5BFE3f4eF6a',
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
