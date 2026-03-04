// ─────────────────────────────────────────────────────────────────────────────
// abis/index.js — Contract ABIs for The Block Hunt
//
// An ABI is the "menu" that tells your frontend what functions a contract has
// and what arguments they take. Wagmi uses these to build the actual calls.
//
// Only the functions the frontend actually calls are included here.
// Full ABIs can be generated from the contracts with `forge inspect` if needed.
// ─────────────────────────────────────────────────────────────────────────────


// ── TOKEN CONTRACT (BlockHuntToken) ───────────────────────────────────────────

export const TOKEN_ABI = [
  // Read
  {
    name: 'balancesOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[8]' }],
  },
  {
    name: 'hasAllTiers',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'countdownActive',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'countdownHolder',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'MINT_PRICE',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },

  // Write
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'quantity', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'combine',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'fromTier', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'combineMany',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'fromTiers', type: 'uint256[]' }],
    outputs: [],
  },
  {
    name: 'claimTreasury',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'sacrifice',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },

  // Events
  {
    name: 'BlockMinted',
    type: 'event',
    inputs: [
      { name: 'to',       type: 'address', indexed: true },
      { name: 'quantity', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'BlocksCombined',
    type: 'event',
    inputs: [
      { name: 'by',       type: 'address', indexed: true },
      { name: 'fromTier', type: 'uint256', indexed: true },
      { name: 'toTier',   type: 'uint256', indexed: true },
    ],
  },
  {
    name: 'CountdownTriggered',
    type: 'event',
    inputs: [
      { name: 'holder', type: 'address', indexed: true },
    ],
  },
  {
    // Emitted when holder loses a tier mid-countdown — critical for frontend alert
    name: 'CountdownHolderReset',
    type: 'event',
    inputs: [
      { name: 'previousHolder', type: 'address', indexed: true },
    ],
  },
]


// ── MINT WINDOW CONTRACT (BlockHuntMintWindow) ────────────────────────────────

export const WINDOW_ABI = [
  {
    name: 'getWindowInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'isOpen',    type: 'bool'    },
      { name: 'day',       type: 'uint256' },
      { name: 'openAt',    type: 'uint256' },
      { name: 'closeAt',   type: 'uint256' },
      { name: 'allocated', type: 'uint256' },
      { name: 'minted',    type: 'uint256' },
      { name: 'remaining', type: 'uint256' },
      { name: 'rollover',  type: 'uint256' },
    ],
  },
  {
    name: 'isWindowOpen',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
]


// ── TREASURY CONTRACT (BlockHuntTreasury) ─────────────────────────────────────

export const TREASURY_ABI = [
  {
    name: 'treasuryBalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
]


// ── COUNTDOWN CONTRACT (BlockHuntCountdown) ───────────────────────────────────

export const COUNTDOWN_ABI = [
  {
    name: 'getCountdownInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'active',     type: 'bool'    },
      { name: 'holder',     type: 'address' },
      { name: 'startTime',  type: 'uint256' },
      { name: 'endTime',    type: 'uint256' },
      { name: 'timeLeft',   type: 'uint256' },
    ],
  },
  {
    name: 'checkHolderStatus',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'claimHolderStatus',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
]


// ── FORGE CONTRACT (BlockHuntForge) ───────────────────────────────────────────

export const FORGE_ABI = [
  {
    name: 'forge',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'fromTier',  type: 'uint256' },
      { name: 'burnCount', type: 'uint256' },
    ],
    outputs: [],
  },
]
