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

// Prefer env-injected RPC (Vercel: set VITE_RPC_URL to your Alchemy/Infura URL).
// Falls back to Base's public RPC — rate-limited, fine for dev/preview.
export const BASE_SEPOLIA_RPC =
  import.meta.env.VITE_RPC_URL || 'https://sepolia.base.org'

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
  TOKEN:     '0x7e04Dd24447f3504678085B85C5ee2F0c517eB1c',
  TREASURY:  '0x36E206F954bFb363A7BD136f8716e7bC0628e01F',
  WINDOW:    '0xC9c3ed2ed975AAC0cC4e87520aA8629045e4c209',
  FORGE:     '0x8DD3B7ADdEe9e48afD389f10E18C40e88537dFe7',
  COUNTDOWN: '0x6f50775F6684626a8D1aEEee7D33D132e276888E',
  ESCROW:    '0xD15033654D367d2CDbEfff0348B27ff01B3D35f8',
  REWARDS:   '0xd2c48004C2209248980c921CEBEEA9daAbCca349',
  MARKETPLACE: '0xCf0F10801dA69f0770000E2085C1f7601F3b8476',
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
