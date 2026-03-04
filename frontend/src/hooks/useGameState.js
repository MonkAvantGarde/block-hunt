// ─────────────────────────────────────────────────────────────────────────────
// useGameState.js — Master hook that reads all on-chain state
//
// This hook is the bridge between the blockchain and the UI.
// Import it in any component that needs to display live game data.
//
// What it returns:
//   balances        — the connected player's block counts per tier (array of 8)
//   windowInfo      — mint window status: open/closed, timer, slots remaining
//   countdownInfo   — countdown: active?, who holds it, time left
//   treasuryBalance — current prize pool in ETH (as a formatted string)
//   isLoading       — true while any data is still fetching
//   refetchAll      — call this after any transaction to refresh everything
// ─────────────────────────────────────────────────────────────────────────────

import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { formatEther } from 'viem'
import { CONTRACTS } from '../config/wagmi'
import { TOKEN_ABI, WINDOW_ABI, TREASURY_ABI, COUNTDOWN_ABI } from '../abis'

export function useGameState() {
  const { address, isConnected } = useAccount()

  // ── PLAYER BALANCES ────────────────────────────────────────────────────────
  // Returns uint256[8] — index 0 unused, indices 1–7 are tier balances
  // Only fetches when a wallet is connected

  const {
    data: balancesRaw,
    isLoading: balancesLoading,
    refetch: refetchBalances,
  } = useReadContract({
    address: CONTRACTS.TOKEN,
    abi: TOKEN_ABI,
    functionName: 'balancesOf',
    args: [address],
    query: { enabled: isConnected && !!address },
  })

  // ── MINT WINDOW INFO ───────────────────────────────────────────────────────
  // Polled every 30 seconds — window status changes slowly

  const {
    data: windowRaw,
    isLoading: windowLoading,
    refetch: refetchWindow,
  } = useReadContract({
    address: CONTRACTS.WINDOW,
    abi: WINDOW_ABI,
    functionName: 'getWindowInfo',
    query: {
      refetchInterval: 30_000,  // every 30s
    },
  })

  // ── COUNTDOWN INFO ─────────────────────────────────────────────────────────
  // Polled every 10 seconds when countdown is active

  const {
    data: countdownRaw,
    isLoading: countdownLoading,
    refetch: refetchCountdown,
  } = useReadContract({
    address: CONTRACTS.COUNTDOWN,
    abi: COUNTDOWN_ABI,
    functionName: 'getCountdownInfo',
    query: {
      refetchInterval: 10_000,  // every 10s
    },
  })

  // ── TREASURY BALANCE ───────────────────────────────────────────────────────
  // Polled every 60 seconds — updates on each mint

  const {
    data: treasuryRaw,
    isLoading: treasuryLoading,
    refetch: refetchTreasury,
  } = useReadContract({
    address: CONTRACTS.TREASURY,
    abi: TREASURY_ABI,
    functionName: 'treasuryBalance',
    query: {
      refetchInterval: 60_000,
    },
  })

  // ── SHAPE THE DATA ─────────────────────────────────────────────────────────
  // Transform raw contract return values into something easy to use in the UI

  // balancesRaw is uint256[8] — convert bigints to regular numbers
  // Index 0 is always 0 (unused). Tiers 1–7 are indices 1–7.
  const balances = balancesRaw
    ? Array.from(balancesRaw).map(n => Number(n))
    : [0, 0, 0, 0, 0, 0, 0, 0]

  // windowRaw comes back as an object with named fields
  const windowInfo = windowRaw
    ? {
        isOpen:    windowRaw.isOpen,
        day:       Number(windowRaw.day),
        openAt:    Number(windowRaw.openAt),
        closeAt:   Number(windowRaw.closeAt),
        allocated: Number(windowRaw.allocated),
        minted:    Number(windowRaw.minted),
        remaining: Number(windowRaw.remaining),
        rollover:  Number(windowRaw.rollover),
      }
    : null

  const countdownInfo = countdownRaw
    ? {
        active:    countdownRaw.active,
        holder:    countdownRaw.holder,
        startTime: Number(countdownRaw.startTime),
        endTime:   Number(countdownRaw.endTime),
        timeLeft:  Number(countdownRaw.timeLeft),   // seconds
      }
    : null

  // Format treasury as a human-readable ETH string e.g. "12.4"
  const treasuryBalance = treasuryRaw
    ? parseFloat(formatEther(treasuryRaw)).toFixed(4)
    : '0.0000'

  // How many tiers (2–7) does the connected player currently hold at least 1 of?
  const tiersHeld = isConnected
    ? [2, 3, 4, 5, 6, 7].filter(tier => balances[tier] > 0).length
    : 0

  const isLoading = balancesLoading || windowLoading || countdownLoading || treasuryLoading

  // Call this after any write transaction to refresh all data
  function refetchAll() {
    refetchBalances()
    refetchWindow()
    refetchCountdown()
    refetchTreasury()
  }

  return {
    // Wallet
    address,
    isConnected,

    // Game state
    balances,        // e.g. [0, 0, 3, 0, 12, 0, 47, 200] — index = tier
    tiersHeld,       // 0–6 (Tier 1 excluded — only obtainable by winning)
    windowInfo,
    countdownInfo,
    treasuryBalance,

    // Utils
    isLoading,
    refetchAll,
  }
}
