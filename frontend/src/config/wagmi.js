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

const BASE_SEPOLIA_RPC = 'https://sepolia.base.org'

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
  TOKEN:     '0x23A15aE0bF86B1227614A1175A1D3A12f8FA747b',
  TREASURY:  '0xEd9a0A9DD424aa9CBCe6edd9b5b56236d6e9F4f2',
  WINDOW:    '0xCf130CBe110980fcb3e0223833Ab005736A2d6dA',
  FORGE:     '0xA4865336E3e760f6738B0Dea009B574f3d8e0BbC',
  COUNTDOWN: '0x124de60d7d465BA404c8AAD71709efc5A0209D35',
  ESCROW:    '0x932E827BA9B8d708C75295E1b8258e6c924F0FF5',
}

// ── GAME CONSTANTS ────────────────────────────────────────────────────────────
// Mirror the values locked in the contracts.
// Used throughout the UI for display and validation.

// Mint price is batch-dependent — read current batch from contract, then look up here.
// Keys are batch numbers (1–6) matching the on-chain batch index.
export const BATCH_PRICES_ETH = {
  1: 0.00008,
  2: 0.00016,
  3: 0.00032,
  4: 0.00080,
  5: 0.00160,
  6: 0.00200,
}

// Helper — pass the current batch number returned by the contract
export const getMintPrice = (batch) => BATCH_PRICES_ETH[batch] ?? BATCH_PRICES_ETH[1]

// Combine ratios — T7 down to T2 only.
// T2→T1 (The Origin) is NOT available via combine. The Origin is sacrifice-only.
export const COMBINE_RATIOS = {
  7: 20,   // 20 Tier-7 → 1 Tier-6
  6: 20,   // 20 Tier-6 → 1 Tier-5
  5: 30,   // 30 Tier-5 → 1 Tier-4
  4: 30,   // 30 Tier-4 → 1 Tier-3
  3: 50,   // 50 Tier-3 → 1 Tier-2
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
