// ─────────────────────────────────────────────────────────────────────────────
// abis/index.js — Contract ABIs for The Block Hunt
//
// Updated: March 12, 2026 — Session 15
// Changes:
//   - Removed old MINT_PRICE (replaced by currentMintPrice + batch pricing)
//   - Added currentMintPrice() on Token
//   - Updated sacrifice() and executeDefaultOnExpiry() — NO params (Phase 2)
//   - Added forgeBatch() on Forge
//   - Added currentBatch(), windowCapForBatch() on MintWindow
//   - Added castVote(), burnVotes/claimVotes to Countdown
//   - Added full BlockHuntEscrow ABI (new contract)
// ─────────────────────────────────────────────────────────────────────────────


// ── TOKEN CONTRACT (BlockHuntToken) ───────────────────────────────────────────

export const TOKEN_ABI = [
  // ── Read ──
  { name: 'currentMintPrice', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'countdownStartTime', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'balancesOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[8]' }] },
  { name: 'hasAllTiers', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }] },
  { name: 'countdownActive', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'bool' }] },
  { name: 'countdownHolder', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'address' }] },
  // ── VRF Recovery ──
  { name: 'getPendingRequests', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }] },
  { name: 'vrfMintRequests', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'requestId', type: 'uint256' }],
    outputs: [
      { name: 'player', type: 'address' }, { name: 'quantity', type: 'uint256' },
      { name: 'amountPaid', type: 'uint256' }, { name: 'requestedAt', type: 'uint256' },
      { name: 'windowDay', type: 'uint256' },
    ] },

  // ── Write ──
  { name: 'mint', type: 'function', stateMutability: 'payable',
    inputs: [{ name: 'quantity', type: 'uint256' }], outputs: [] },
  { name: 'cancelMintRequest', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'requestId', type: 'uint256' }], outputs: [] },
  { name: 'combine', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'fromTier', type: 'uint256' }], outputs: [] },
  { name: 'combineMany', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'fromTiers', type: 'uint256[]' }], outputs: [] },
  { name: 'claimTreasury', type: 'function', stateMutability: 'nonpayable',
    inputs: [], outputs: [] },
  // Phase 2: sacrifice takes NO params
  { name: 'sacrifice', type: 'function', stateMutability: 'nonpayable',
    inputs: [], outputs: [] },
  // Phase 2: permissionless default action after countdown expires
  { name: 'executeDefaultOnExpiry', type: 'function', stateMutability: 'nonpayable',
    inputs: [], outputs: [] },
  { name: 'claimHolderStatus', type: 'function', stateMutability: 'nonpayable',
    inputs: [], outputs: [] },

  // ── Events ──
  { name: 'MintRequested', type: 'event', inputs: [
    { name: 'requestId', type: 'uint256', indexed: true },
    { name: 'player', type: 'address', indexed: true },
    { name: 'quantity', type: 'uint256', indexed: false }] },
  { name: 'MintFulfilled', type: 'event', inputs: [
    { name: 'requestId', type: 'uint256', indexed: true },
    { name: 'player', type: 'address', indexed: true },
    { name: 'quantity', type: 'uint256', indexed: false }] },
  { name: 'MintCancelled', type: 'event', inputs: [
    { name: 'requestId', type: 'uint256', indexed: true },
    { name: 'player', type: 'address', indexed: true }] },
  { name: 'BlockMinted', type: 'event', inputs: [
    { name: 'to', type: 'address', indexed: true },
    { name: 'quantity', type: 'uint256', indexed: false }] },
  { name: 'BlocksCombined', type: 'event', inputs: [
    { name: 'by', type: 'address', indexed: true },
    { name: 'fromTier', type: 'uint256', indexed: true },
    { name: 'toTier', type: 'uint256', indexed: true }] },
  { name: 'CountdownTriggered', type: 'event', inputs: [
    { name: 'holder', type: 'address', indexed: true }] },
  { name: 'CountdownHolderReset', type: 'event', inputs: [
    { name: 'previousHolder', type: 'address', indexed: true }] },
];


// ── MINT WINDOW CONTRACT (BlockHuntMintWindow) ────────────────────────────────

export const WINDOW_ABI = [
  { name: 'getWindowInfo', type: 'function', stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'isOpen', type: 'bool' }, { name: 'day', type: 'uint256' },
      { name: 'openAt', type: 'uint256' }, { name: 'closeAt', type: 'uint256' },
      { name: 'allocated', type: 'uint256' }, { name: 'minted', type: 'uint256' },
      { name: 'remaining', type: 'uint256' }, { name: 'rollover', type: 'uint256' },
    ] },
  { name: 'isWindowOpen', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'bool' }] },
  // Phase 2: batch number (1-6), advances when supply exhausted
  { name: 'currentBatch', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'windowCapForBatch', type: 'function', stateMutability: 'pure',
    inputs: [{ name: 'batch', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }] },
];


// ── TREASURY CONTRACT (BlockHuntTreasury) ─────────────────────────────────────

export const TREASURY_ABI = [
  { name: 'treasuryBalance', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
];


// ── COUNTDOWN CONTRACT (BlockHuntCountdown) ───────────────────────────────────

export const COUNTDOWN_ABI = [
  { name: 'getCountdownInfo', type: 'function', stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'active', type: 'bool' }, { name: 'holder', type: 'address' },
      { name: 'startTime', type: 'uint256' }, { name: 'endTime', type: 'uint256' },
      { name: 'remaining', type: 'uint256' },
      { name: 'burnVotes', type: 'uint256' }, { name: 'claimVotes', type: 'uint256' },
    ] },
  { name: 'checkHolderStatus', type: 'function', stateMutability: 'nonpayable',
    inputs: [], outputs: [] },
  { name: 'castVote', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'burnVote', type: 'bool' }], outputs: [] },
  { name: 'timeRemaining', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'hasExpired', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'bool' }] },
];


// ── FORGE CONTRACT (BlockHuntForge) ───────────────────────────────────────────

export const FORGE_ABI = [
  { name: 'forge', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'fromTier', type: 'uint256' },
      { name: 'burnCount', type: 'uint256' },
    ], outputs: [] },
  // Phase 2: batch forge — N attempts, 1 VRF word
  { name: 'forgeBatch', type: 'function', stateMutability: 'payable',
    inputs: [
      { name: 'fromTiers', type: 'uint256[]' },
      { name: 'burnCounts', type: 'uint256[]' },
    ], outputs: [] },
  // Events
  { name: 'ForgeRequested', type: 'event', inputs: [
    { name: 'requestId', type: 'uint256', indexed: true },
    { name: 'player', type: 'address', indexed: true },
    { name: 'fromTier', type: 'uint256', indexed: false },
    { name: 'burnCount', type: 'uint256', indexed: false }] },
  { name: 'ForgeResolved', type: 'event', inputs: [
    { name: 'requestId', type: 'uint256', indexed: true },
    { name: 'player', type: 'address', indexed: true },
    { name: 'fromTier', type: 'uint256', indexed: false },
    { name: 'success', type: 'bool', indexed: false }] },
];


// ── ESCROW CONTRACT (BlockHuntEscrow) — NEW ──────────────────────────────────

export const ESCROW_ABI = [
  { name: 'getEscrowInfo', type: 'function', stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'sacrificeExecuted', type: 'bool' },
      { name: 'entitlementsSet', type: 'bool' },
      { name: 'pool', type: 'uint256' },
      { name: 'seed', type: 'uint256' },
      { name: 'claimExpiry', type: 'uint256' },
      { name: 'seedReleased', type: 'bool' },
    ] },
  { name: 'claimLeaderboardReward', type: 'function', stateMutability: 'nonpayable',
    inputs: [], outputs: [] },
  { name: 'leaderboardEntitlement', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { name: 'hasClaimed', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }] },
  { name: 'communityPool', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
];
