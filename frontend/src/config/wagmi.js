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
  TOKEN:     '0x57Efa000E28313ed47213C6faF13719500038D75',
  TREASURY:  '0x1442EBD149Ac1842e40c72e89cCCD2653F16D39D',
  WINDOW:    '0xAD0C5f56324ed2116b9Ebc18E4de2794412867BD',
  FORGE:     '0x99c1F1c9D738528a4Bba537E70f13596cBB599E7',
  COUNTDOWN: '0xaeBa69BBF66d670EB98Bc59Bc71EF8690f639466',
}

// ── GAME CONSTANTS ────────────────────────────────────────────────────────────
// Mirror the values locked in the contracts.
// Used throughout the UI for display and validation.

export const MINT_PRICE_ETH = 0.00025   // per block

export const COMBINE_RATIOS = {
  7: 20,   // 20 Tier-7 → 1 Tier-6
  6: 20,   // 20 Tier-6 → 1 Tier-5
  5: 30,
  4: 30,
  3: 50,
  2: 100,  // 100 Tier-2 → 1 Tier-1 (via sacrifice path only)
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
