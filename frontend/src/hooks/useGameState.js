// ─────────────────────────────────────────────────────────────────────────────
// useGameState.js — Master hook that reads all on-chain state
//
// Updated: Session 15 — March 12, 2026
// Changes:
//   - Added currentBatch from MintWindow (was showing window day as batch)
//   - Added currentMintPrice from Token contract
//   - Added Escrow reads (sacrifice state, entitlements)
//   - Renamed treasuryBalance → prizePool (language change: "prize pool" not "treasury")
//   - Added mintPrice in ETH (formatted for display)
//
// What it returns:
//   balances        — player's block counts per tier (array of 8)
//   windowInfo      — mint window status: open/closed, timer, slots, minted/allocated
//   countdownInfo   — countdown: active?, holder, time left, votes
//   prizePool       — current prize pool in ETH (formatted string)
//   currentBatch    — current batch number (1-6)
//   mintPrice       — price per block for current batch (formatted ETH string)
//   mintPriceWei    — price per block as bigint (for transaction value)
//   escrowInfo      — sacrifice distribution state (null if not yet sacrificed)
//   isLoading       — true while any data is still fetching
//   refetchAll      — call after any transaction to refresh everything
// ─────────────────────────────────────────────────────────────────────────────

import { useAccount, useReadContract } from 'wagmi'
import { formatEther } from 'viem'
import { CONTRACTS } from '../config/wagmi'
import { TOKEN_ABI, WINDOW_ABI, TREASURY_ABI, COUNTDOWN_ABI, ESCROW_ABI } from '../abis'

export function useGameState() {
  const { address, isConnected } = useAccount()

  // ── PLAYER BALANCES ────────────────────────────────────────────────────────
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
  const {
    data: windowRaw,
    isLoading: windowLoading,
    refetch: refetchWindow,
  } = useReadContract({
    address: CONTRACTS.WINDOW,
    abi: WINDOW_ABI,
    functionName: 'getWindowInfo',
    query: { refetchInterval: 30_000 },
  })

  // ── CURRENT BATCH (1-6) ────────────────────────────────────────────────────
  const {
    data: batchRaw,
    isLoading: batchLoading,
    refetch: refetchBatch,
  } = useReadContract({
    address: CONTRACTS.WINDOW,
    abi: WINDOW_ABI,
    functionName: 'currentBatch',
    query: { refetchInterval: 60_000 },
  })

  // ── CURRENT MINT PRICE ─────────────────────────────────────────────────────
  const {
    data: mintPriceRaw,
    isLoading: mintPriceLoading,
    refetch: refetchMintPrice,
  } = useReadContract({
    address: CONTRACTS.TOKEN,
    abi: TOKEN_ABI,
    functionName: 'currentMintPrice',
    query: { refetchInterval: 60_000 },
  })

  // ── COUNTDOWN INFO ─────────────────────────────────────────────────────────
  const {
    data: countdownRaw,
    isLoading: countdownLoading,
    refetch: refetchCountdown,
  } = useReadContract({
    address: CONTRACTS.COUNTDOWN,
    abi: COUNTDOWN_ABI,
    functionName: 'getCountdownInfo',
    query: { refetchInterval: 10_000 },
  })

  // ── PRIZE POOL (was "treasury balance") ────────────────────────────────────
  const {
    data: treasuryRaw,
    isLoading: treasuryLoading,
    refetch: refetchTreasury,
  } = useReadContract({
    address: CONTRACTS.TREASURY,
    abi: TREASURY_ABI,
    functionName: 'treasuryBalance',
    query: { refetchInterval: 60_000 },
  })

  // ── ESCROW INFO (sacrifice distribution state) ─────────────────────────────
  const {
    data: escrowRaw,
    refetch: refetchEscrow,
  } = useReadContract({
    address: CONTRACTS.ESCROW,
    abi: ESCROW_ABI,
    functionName: 'getEscrowInfo',
    query: { refetchInterval: 30_000 },
  })

  // ── SHAPE THE DATA ─────────────────────────────────────────────────────────

  const balances = balancesRaw
    ? Array.from(balancesRaw).map(n => Number(n))
    : [0, 0, 0, 0, 0, 0, 0, 0]

  const windowInfo = windowRaw
    ? {
        isOpen:    windowRaw[0],
        day:       Number(windowRaw[1]),
        openAt:    Number(windowRaw[2]),
        closeAt:   Number(windowRaw[3]),
        allocated: Number(windowRaw[4]),
        minted:    Number(windowRaw[5]),
        remaining: Number(windowRaw[6]),
        rollover:  Number(windowRaw[7]),
      }
    : null

  const countdownInfo = countdownRaw
    ? {
        active:     countdownRaw[0],
        holder:     countdownRaw[1],
        startTime:  Number(countdownRaw[2]),
        endTime:    Number(countdownRaw[3]),
        remaining:  Number(countdownRaw[4]),
        burnVotes:  Number(countdownRaw[5]),
        claimVotes: Number(countdownRaw[6]),
      }
    : null

  const prizePool = treasuryRaw
    ? parseFloat(formatEther(treasuryRaw)).toFixed(4)
    : '0.0000'

  // Batch number: 1-6
  const currentBatch = batchRaw ? Number(batchRaw) : 1

  // Mint price: from contract (wei bigint) and formatted ETH string
  const mintPriceWei = mintPriceRaw || BigInt(0)
  const mintPrice = mintPriceRaw
    ? parseFloat(formatEther(mintPriceRaw))
    : 0.00008  // Batch 1 default

  // Escrow state (only populated after sacrifice)
  const escrowInfo = escrowRaw
    ? {
        sacrificeExecuted: escrowRaw[0],
        entitlementsSet:   escrowRaw[1],
        pool:              Number(escrowRaw[2]),
        seed:              Number(escrowRaw[3]),
        claimExpiry:       Number(escrowRaw[4]),
        seedReleased:      escrowRaw[5],
      }
    : null

  // How many tiers (2-7) does the connected player hold at least 1 of?
  const tiersHeld = isConnected
    ? [2, 3, 4, 5, 6, 7].filter(tier => balances[tier] > 0).length
    : 0

  const isLoading = balancesLoading || windowLoading || countdownLoading
                 || treasuryLoading || batchLoading || mintPriceLoading

  function refetchAll() {
    refetchBalances()
    refetchWindow()
    refetchCountdown()
    refetchTreasury()
    refetchBatch()
    refetchMintPrice()
    refetchEscrow()
  }

  return {
    // Wallet
    address,
    isConnected,

    // Game state
    balances,
    tiersHeld,
    windowInfo,
    countdownInfo,
    prizePool,              // renamed from treasuryBalance
    treasuryBalance: prizePool,  // backwards compat — remove after all screens updated
    currentBatch,
    mintPrice,              // number in ETH (e.g. 0.00008)
    mintPriceWei,           // bigint for transaction value
    escrowInfo,

    // Utils
    isLoading,
    refetchAll,
  }
}
