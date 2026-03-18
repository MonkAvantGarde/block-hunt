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
  TOKEN:     '0x5A5335f138950C127Dc9baaA2618e89ADEce09aC',
  TREASURY:  '0x6c264D2aBc88bB52D8D1B8769360cad71cB6730f',
  WINDOW:    '0xd6041d73C9B5C8dde6df6a1b35F7d22C1A087aEa',
  FORGE:     '0xA4865336E3e760f6738B0Dea009B574f3d8e0BbC',
  COUNTDOWN: '0x7360590aD91AFE35e9e678842a79B0720F0425e7',
  ESCROW:    '0xBA346012cc45BBD3aB66E953C6D5914a8E40D923',
  REWARDS:   '0xEfD6e50be55b8eA31019eCFd44b72D77C5bd840d',
}

// ── GAME CONSTANTS ────────────────────────────────────────────────────────────
// Mirror the values locked in the contracts.
// Used throughout the UI for display and validation.

// Mint price is batch-dependent — read current batch from contract, then look up here.
// Keys are batch numbers (1–6) matching the on-chain batch index.
export const BATCH_PRICES_ETH = {
  1: 0.000004,
  2: 0.000008,
  3: 0.000016,
  4: 0.000040,
  5: 0.000080,
  6: 0.000100,
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
