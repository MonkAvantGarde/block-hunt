// ─────────────────────────────────────────────────────────────────────────────
// abis/index.js — Contract ABIs for The Block Hunt
//
// Updated: March 14, 2026 — Phase 5 (Audit Fixes)
// Regenerated from compiled artifacts after:
//   - H-1: Token setter guards (test-mode-gated)
//   - H-3: Countdown round-based voting (countdownRound, challengeCountdown)
//   - H-4: Royalty 10% cap
//   - M-1: Escrow pull-payment (withdrawWinnerShare)
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
    inputs: [{ name: '', type: 'uint256' }],
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
  { name: 'sacrifice', type: 'function', stateMutability: 'nonpayable',
    inputs: [], outputs: [] },
  { name: 'executeDefaultOnExpiry', type: 'function', stateMutability: 'nonpayable',
    inputs: [], outputs: [] },
  { name: 'claimHolderStatus', type: 'function', stateMutability: 'nonpayable',
    inputs: [], outputs: [] },

  // ── Events ──
  { name: 'MintRequested', type: 'event', inputs: [
    { name: 'player', type: 'address', indexed: true },
    { name: 'requestId', type: 'uint256', indexed: true },
    { name: 'quantity', type: 'uint256', indexed: false }] },
  { name: 'MintFulfilled', type: 'event', inputs: [
    { name: 'player', type: 'address', indexed: true },
    { name: 'requestId', type: 'uint256', indexed: true },
    { name: 'quantity', type: 'uint256', indexed: false }] },
  { name: 'MintCancelled', type: 'event', inputs: [
    { name: 'player', type: 'address', indexed: true },
    { name: 'requestId', type: 'uint256', indexed: true },
    { name: 'refundAmount', type: 'uint256', indexed: false }] },
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
    { name: 'formerHolder', type: 'address', indexed: true }] },
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
  { name: 'currentBatch', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'currentDay', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'windowCapForBatch', type: 'function', stateMutability: 'pure',
    inputs: [{ name: 'batch', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { name: 'perUserDayCap', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'userDayMints', type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }, { name: '', type: 'address' }],
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
  // Phase 5: challenge mechanic — any player with higher score can take holder slot
  { name: 'challengeCountdown', type: 'function', stateMutability: 'nonpayable',
    inputs: [], outputs: [] },
  // Phase 5: on-chain score calculation (weighted tier balances)
  { name: 'calculateScore', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
  // Phase 5: round-based voting (H-3 fix — replaces voter list)
  { name: 'countdownRound', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'hasVoted', type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }, { name: '', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }] },
  { name: 'holderScore', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'lastChallengeTime', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },

  // ── Events ──
  { name: 'CountdownStarted', type: 'event', inputs: [
    { name: 'holder', type: 'address', indexed: true },
    { name: 'startTime', type: 'uint256', indexed: false },
    { name: 'endTime', type: 'uint256', indexed: false }] },
  { name: 'CountdownChallenged', type: 'event', inputs: [
    { name: 'challenger', type: 'address', indexed: true },
    { name: 'challengerScore', type: 'uint256', indexed: false },
    { name: 'previousHolder', type: 'address', indexed: true },
    { name: 'previousHolderScore', type: 'uint256', indexed: false },
    { name: 'success', type: 'bool', indexed: false }] },
  { name: 'CountdownShifted', type: 'event', inputs: [
    { name: 'newHolder', type: 'address', indexed: true },
    { name: 'previousHolder', type: 'address', indexed: true },
    { name: 'newScore', type: 'uint256', indexed: false },
    { name: 'timestamp', type: 'uint256', indexed: false }] },
  { name: 'CountdownReset', type: 'event', inputs: [
    { name: 'formerHolder', type: 'address', indexed: true }] },
  { name: 'VoteCast', type: 'event', inputs: [
    { name: 'voter', type: 'address', indexed: true },
    { name: 'burnVote', type: 'bool', indexed: false }] },
];


// ── FORGE CONTRACT (BlockHuntForge) ───────────────────────────────────────────

export const FORGE_ABI = [
  { name: 'forge', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'fromTier', type: 'uint256' },
      { name: 'burnCount', type: 'uint256' },
    ], outputs: [] },
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


// ── ESCROW CONTRACT (BlockHuntEscrow) ─────────────────────────────────────────

export const ESCROW_ABI = [
  { name: 'getEscrowInfo', type: 'function', stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'isSacrificeExecuted', type: 'bool' },
      { name: 'areEntitlementsSet', type: 'bool' },
      { name: 'pool', type: 'uint256' },
      { name: 'seed', type: 'uint256' },
      { name: 'claimExpiry', type: 'uint256' },
      { name: 'seedReleased', type: 'bool' },
    ] },
  { name: 'claimLeaderboardReward', type: 'function', stateMutability: 'nonpayable',
    inputs: [], outputs: [] },
  { name: 'leaderboardEntitlement', type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { name: 'hasClaimed', type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }] },
  { name: 'communityPool', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  // Phase 5: pull-payment for winner's 50% (M-1 fix)
  { name: 'withdrawWinnerShare', type: 'function', stateMutability: 'nonpayable',
    inputs: [], outputs: [] },
  { name: 'pendingWithdrawal', type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },

  // ── Events ──
  { name: 'SacrificeReceived', type: 'event', inputs: [
    { name: 'winner', type: 'address', indexed: true },
    { name: 'winnerShare', type: 'uint256', indexed: false },
    { name: 'communityPool', type: 'uint256', indexed: false },
    { name: 'season2Seed', type: 'uint256', indexed: false }] },
  { name: 'LeaderboardRewardClaimed', type: 'event', inputs: [
    { name: 'player', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false }] },
  { name: 'WinnerShareWithdrawn', type: 'event', inputs: [
    { name: 'winner', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false }] },
  { name: 'Season2SeedReleased', type: 'event', inputs: [
    { name: 'to', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false }] },
  { name: 'UnclaimedRewardsSwept', type: 'event', inputs: [
    { name: 'to', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false }] },
];
