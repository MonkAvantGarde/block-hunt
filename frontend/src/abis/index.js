// ─────────────────────────────────────────────────────────────────────────────
// abis/index.js — Contract ABIs for The Block Hunt
// ─────────────────────────────────────────────────────────────────────────────


// ── TOKEN CONTRACT (BlockHuntToken) ───────────────────────────────────────────

export const TOKEN_ABI = [
  // ── Read ──────────────────────────────────────────────────────────────────
  { "inputs": [], "name": "countdownStartTime", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  {
  "inputs": [],
  "name": "claimHolderStatus",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
  },
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

  // ── Write ─────────────────────────────────────────────────────────────────
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'quantity', type: 'uint256' }],
    outputs: [],
  },
  {
    // Cancel a pending VRF mint request after the 1-hour timeout
    name: 'cancelMintRequest',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'requestId', type: 'uint256' }],
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

  // ── Events ────────────────────────────────────────────────────────────────
  {
    // Fired when mint() is called — gives us the VRF requestId for cancel
    name: 'MintRequested',
    type: 'event',
    inputs: [
      { name: 'requestId', type: 'uint256', indexed: true },
      { name: 'player',    type: 'address', indexed: true },
      { name: 'quantity',  type: 'uint256', indexed: false },
    ],
  },
  {
    // Fired when Chainlink VRF delivers the mint result
    name: 'MintFulfilled',
    type: 'event',
    inputs: [
      { name: 'requestId', type: 'uint256', indexed: true },
      { name: 'player',    type: 'address', indexed: true },
      { name: 'quantity',  type: 'uint256', indexed: false },
    ],
  },
  {
    // Fired when player cancels after timeout
    name: 'MintCancelled',
    type: 'event',
    inputs: [
      { name: 'requestId', type: 'uint256', indexed: true },
      { name: 'player',    type: 'address', indexed: true },
    ],
  },
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
  {
    // Fired when forge() is called — blocks are burned at this point
    name: 'ForgeRequested',
    type: 'event',
    inputs: [
      { name: 'requestId', type: 'uint256', indexed: true },
      { name: 'player',    type: 'address', indexed: true },
      { name: 'fromTier',  type: 'uint256', indexed: false },
      { name: 'burnCount', type: 'uint256', indexed: false },
    ],
  },
  {
    // Fired when Chainlink VRF resolves the forge result
    name: 'ForgeResolved',
    type: 'event',
    inputs: [
      { name: 'requestId', type: 'uint256', indexed: true },
      { name: 'player',    type: 'address', indexed: true },
      { name: 'fromTier',  type: 'uint256', indexed: false },
      { name: 'success',   type: 'bool',    indexed: false },
    ],
  },
]

// Auto-added: VRF recovery
TOKEN_ABI.push(
  { name: 'getPendingRequests', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }] },
  { name: 'vrfMintRequests', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'requestId', type: 'uint256' }],
    outputs: [
      { name: 'player',      type: 'address' },
      { name: 'quantity',    type: 'uint256' },
      { name: 'amountPaid',  type: 'uint256' },
      { name: 'requestedAt', type: 'uint256' },
      { name: 'windowDay',   type: 'uint256' },
    ] }
)
