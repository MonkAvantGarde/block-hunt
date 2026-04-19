// ─────────────────────────────────────────────────────────────────────────────
// abis/index.js — Contract ABIs for The Block Hunt
//
// Updated: March 18, 2026 — v2.1 (Game Mechanics Update)
// Changes:
//   - Token: continuous rarity curve (totalMinted, t2Coeff/t3Coeff/t4Coeff),
//            new combine ratios (21/19/17/15/13), setRarityCoefficients
//   - MintWindow: 10-batch config (batchConfigs, batchCount, setBatchConfig)
//   - Countdown: takeover mechanic (takeoverCount, safePeriod, countdownDuration)
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
  // v2.1: continuous rarity curve
  { name: 'totalMinted', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 't2Coeff', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 't3Coeff', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 't4Coeff', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'combineRatio', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tier', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }] },
  // ── VRF Recovery ──
  { name: 'getPendingRequests', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }] },
  { name: 'vrfMintRequests', type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'player', type: 'address' }, { name: 'quantity', type: 'uint32' },
      { name: 'fulfilled', type: 'bool' }, { name: 'claimed', type: 'bool' },
      { name: 'amountPaid', type: 'uint128' }, { name: 'requestedAt', type: 'uint64' },
      { name: 'seed', type: 'uint256' },
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
  // ── ERC-1155 approval (for marketplace) ──
  { name: 'setApprovalForAll', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }], outputs: [] },
  { name: 'isApprovedForAll', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }, { name: 'operator', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }] },

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
  // v2.1: 10-batch config
  { name: 'batchCount', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'batchConfigs', type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'supply', type: 'uint256' }, { name: 'price', type: 'uint256' },
      { name: 'windowCap', type: 'uint256' },
    ] },
  { name: 'batchPrice', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'batch', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }] },
  // Always-open mint: per-player cooldown reads
  { name: 'playerMintInfo', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [
      { name: 'canMint', type: 'bool' },
      { name: 'mintedThisCycle', type: 'uint256' },
      { name: 'cycleCap', type: 'uint256' },
      { name: 'cooldownUntil', type: 'uint256' },
      { name: 'mintsRemaining', type: 'uint256' },
      { name: 'playerDailyMints', type: 'uint256' },
      { name: 'dailyCapValue', type: 'uint256' },
      { name: 'dailyResetsAt', type: 'uint256' },
    ] },
  { name: 'batches', type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'id', type: 'uint256' },
      { name: 'startDay', type: 'uint256' },
      { name: 'totalMinted', type: 'uint256' },
    ] },
  { name: 'canPlayerMint', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }] },
  { name: 'cooldownDuration', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'perCycleCap', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'dailyCap', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
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
    ] },
  { name: 'checkHolderStatus', type: 'function', stateMutability: 'nonpayable',
    inputs: [], outputs: [] },
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
  { name: 'countdownRound', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'holderScore', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'lastChallengeTime', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  // v2.1: takeover mechanic
  { name: 'takeoverCount', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'safePeriod', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'countdownDuration', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },

  // ── Leaderboard reads ──
  { name: 'getPlayers', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    outputs: [{ name: 'addrs', type: 'address[]' }, { name: 'scores', type: 'uint256[]' }] },
  { name: 'totalPlayers', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'currentSeason', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'seasonScore', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'season', type: 'uint256' }, { name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },

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


// ── REWARDS CONTRACT (BlockHuntRewards) ──────────────────────────────────────

export const REWARDS_ABI = [
  // ── Read ──
  { name: 'currentSeason', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'vaultBalance', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'tierBountyWinner', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'season', type: 'uint256' }, { name: 'batch', type: 'uint8' }, { name: 'tier', type: 'uint8' }],
    outputs: [{ name: '', type: 'address' }] },
  { name: 'tierBountyAmount', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'season', type: 'uint256' }, { name: 'batch', type: 'uint8' }, { name: 'tier', type: 'uint8' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { name: 'tierBountyClaimed', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'season', type: 'uint256' }, { name: 'batch', type: 'uint8' }, { name: 'tier', type: 'uint8' }],
    outputs: [{ name: '', type: 'bool' }] },
  { name: 'streakDay', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'season', type: 'uint256' }, { name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'uint16' }] },
  { name: 'lastMintDay', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'season', type: 'uint256' }, { name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'uint32' }] },
  { name: 'streakMilestones', type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'daysRequired', type: 'uint16' }, { name: 'slotsTotal', type: 'uint16' },
      { name: 'slotsClaimed', type: 'uint16' }, { name: 'blockReward', type: 'uint16' },
    ] },
  { name: 'getStreakMilestoneCount', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'streakClaimed', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'season', type: 'uint256' }, { name: 'player', type: 'address' }, { name: 'index', type: 'uint8' }],
    outputs: [{ name: '', type: 'bool' }] },
  { name: 'referrerOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'referee', type: 'address' }],
    outputs: [{ name: '', type: 'address' }] },
  { name: 'totalMintedByPlayer', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { name: 'snapshotAmount', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'referee', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { name: 'referralPaid', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'referee', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }] },
  { name: 'referralAmount', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'referralThreshold', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'referralsActive', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'bool' }] },
  { name: 'leaderboardAmounts', type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { name: 'dailyEligible', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'season', type: 'uint256' }, { name: 'day', type: 'uint32' }, { name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }] },

  // ── Write ──
  { name: 'claimBounty', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'batch', type: 'uint8' }, { name: 'tier', type: 'uint8' }], outputs: [] },
  { name: 'claimStreak', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'milestoneIndex', type: 'uint8' }], outputs: [] },
  { name: 'setReferrer', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'referrer', type: 'address' }], outputs: [] },
  { name: 'claimReferral', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'referee', type: 'address' }], outputs: [] },

  // ── Events ──
  { name: 'TierBountyWon', type: 'event', inputs: [
    { name: 'season', type: 'uint256', indexed: false },
    { name: 'batch', type: 'uint8', indexed: false },
    { name: 'tier', type: 'uint8', indexed: false },
    { name: 'winner', type: 'address', indexed: true }] },
  { name: 'LotteryDistributed', type: 'event', inputs: [
    { name: 'season', type: 'uint256', indexed: false },
    { name: 'day', type: 'uint32', indexed: false },
    { name: 'winner', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false }] },
  { name: 'StreakClaimed', type: 'event', inputs: [
    { name: 'season', type: 'uint256', indexed: false },
    { name: 'player', type: 'address', indexed: true },
    { name: 'milestoneIndex', type: 'uint8', indexed: false },
    { name: 'blocks', type: 'uint16', indexed: false }] },
  { name: 'ReferrerLinked', type: 'event', inputs: [
    { name: 'referee', type: 'address', indexed: true },
    { name: 'referrer', type: 'address', indexed: true }] },
  { name: 'ReferralClaimed', type: 'event', inputs: [
    { name: 'referrer', type: 'address', indexed: true },
    { name: 'referee', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false }] },
];


// ── MARKETPLACE CONTRACT (BlockHuntMarketplace) ────────────────────────────────

export const MARKETPLACE_ABI = [
  { name: 'createListing', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'tier', type: 'uint256' }, { name: 'quantity', type: 'uint256' },
      { name: 'pricePerBlock', type: 'uint256' }, { name: 'duration', type: 'uint256' },
    ],
    outputs: [{ name: 'listingId', type: 'uint256' }] },
  { name: 'buyListing', type: 'function', stateMutability: 'payable',
    inputs: [{ name: 'listingId', type: 'uint256' }, { name: 'quantity', type: 'uint256' }],
    outputs: [] },
  { name: 'cancelListing', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'listingId', type: 'uint256' }], outputs: [] },
  { name: 'getListing', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'listingId', type: 'uint256' }],
    outputs: [
      { name: 'seller', type: 'address' }, { name: 'tier', type: 'uint256' },
      { name: 'quantity', type: 'uint256' }, { name: 'pricePerBlock', type: 'uint256' },
      { name: 'createdAt', type: 'uint256' }, { name: 'expiresAt', type: 'uint256' },
      { name: 'active', type: 'bool' },
    ] },
  { name: 'getActiveListings', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    outputs: [
      { name: 'ids', type: 'uint256[]' }, { name: 'sellers', type: 'address[]' },
      { name: 'tiers', type: 'uint256[]' }, { name: 'quantities', type: 'uint256[]' },
      { name: 'prices', type: 'uint256[]' }, { name: 'expiresAts', type: 'uint256[]' },
    ] },
  { name: 'nextListingId', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'protocolFeeBps', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },

  // Events
  { name: 'ListingCreated', type: 'event', inputs: [
    { name: 'listingId', type: 'uint256', indexed: true },
    { name: 'seller', type: 'address', indexed: true },
    { name: 'tier', type: 'uint256', indexed: false },
    { name: 'quantity', type: 'uint256', indexed: false },
    { name: 'pricePerBlock', type: 'uint256', indexed: false },
    { name: 'expiresAt', type: 'uint256', indexed: false }] },
  { name: 'ListingFilled', type: 'event', inputs: [
    { name: 'listingId', type: 'uint256', indexed: true },
    { name: 'buyer', type: 'address', indexed: true },
    { name: 'quantity', type: 'uint256', indexed: false },
    { name: 'totalPaid', type: 'uint256', indexed: false }] },
  { name: 'ListingCancelled', type: 'event', inputs: [
    { name: 'listingId', type: 'uint256', indexed: true }] },

  // ── Buy-side offers ──
  { name: 'createOffer', type: 'function', stateMutability: 'payable',
    inputs: [
      { name: 'tier', type: 'uint256' }, { name: 'quantity', type: 'uint256' },
      { name: 'pricePerBlock', type: 'uint256' }, { name: 'duration', type: 'uint256' },
    ],
    outputs: [{ name: 'offerId', type: 'uint256' }] },
  { name: 'fillOffer', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'offerId', type: 'uint256' }, { name: 'quantity', type: 'uint256' }],
    outputs: [] },
  { name: 'cancelOffer', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'offerId', type: 'uint256' }], outputs: [] },
  { name: 'getOffer', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'offerId', type: 'uint256' }],
    outputs: [
      { name: 'buyer', type: 'address' }, { name: 'tier', type: 'uint256' },
      { name: 'quantity', type: 'uint256' }, { name: 'pricePerBlock', type: 'uint256' },
      { name: 'createdAt', type: 'uint256' }, { name: 'expiresAt', type: 'uint256' },
      { name: 'active', type: 'bool' },
    ] },
  { name: 'getActiveOffers', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    outputs: [
      { name: 'ids', type: 'uint256[]' }, { name: 'buyers', type: 'address[]' },
      { name: 'tiers', type: 'uint256[]' }, { name: 'quantities', type: 'uint256[]' },
      { name: 'prices', type: 'uint256[]' }, { name: 'expiresAts', type: 'uint256[]' },
    ] },
  { name: 'nextOfferId', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },

  // Offer events
  { name: 'OfferCreated', type: 'event', inputs: [
    { name: 'offerId', type: 'uint256', indexed: true },
    { name: 'buyer', type: 'address', indexed: true },
    { name: 'tier', type: 'uint256', indexed: false },
    { name: 'quantity', type: 'uint256', indexed: false },
    { name: 'pricePerBlock', type: 'uint256', indexed: false },
    { name: 'expiresAt', type: 'uint256', indexed: false }] },
  { name: 'OfferFilled', type: 'event', inputs: [
    { name: 'offerId', type: 'uint256', indexed: true },
    { name: 'seller', type: 'address', indexed: true },
    { name: 'quantity', type: 'uint256', indexed: false },
    { name: 'totalPaid', type: 'uint256', indexed: false }] },
  { name: 'OfferCancelled', type: 'event', inputs: [
    { name: 'offerId', type: 'uint256', indexed: true },
    { name: 'ethReturned', type: 'uint256', indexed: false }] },
];
