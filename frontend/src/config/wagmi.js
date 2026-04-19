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
  TOKEN:     '0x522672cda4470D3cD3A85d019ed6CcF11DB84B87',
  TREASURY:  '0xb94EB990e21b9c8144bc02Fe7CF2aa19cB8Fa684',
  WINDOW:    '0x1d1bA5Aef207144fD4acd2019a7ed47A7051B24F',
  FORGE:     '0x7673607547D678b421FbEA35A91506F8BcED36b9',
  COUNTDOWN: '0xcc94552173EEeAEa08875e256E178828C26199cB',
  ESCROW:    '0xeAE24483e1F8c5a6bB6714e536b6eCF74673189F',
  REWARDS:   '0x331F078154817945BF03846D1F2564f8F440fcC4',
  MARKETPLACE: '0x84A05C49378A2A85A7D2894DAecbC4b824F66672',
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
