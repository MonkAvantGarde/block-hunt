// ─────────────────────────────────────────────────────────────────────────────
// useRewards.js — Read rewards contract state for the connected player
//
// Reads: season, streak, tier bounties, streak milestones, referral info,
//        leaderboard amounts. Uses useReadContracts for batched multicalls.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { CONTRACTS } from '../config/wagmi'
import { REWARDS_ABI } from '../abis/index.js'

const CHAIN_ID = 84532

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

export function useRewards() {
  const { address, isConnected } = useAccount()
  const enabled = isConnected && !!address

  // ── Single reads (no player arg needed) ──────────────────────────────────

  const { data: seasonRaw, isLoading: seasonLoading, refetch: refetchSeason } = useReadContract({
    address: CONTRACTS.REWARDS,
    abi: REWARDS_ABI,
    chainId: CHAIN_ID,
    functionName: 'currentSeason',
    query: { refetchOnMount: true, staleTime: Infinity },
  })

  const { data: milestoneCountRaw, isLoading: milestoneCountLoading } = useReadContract({
    address: CONTRACTS.REWARDS,
    abi: REWARDS_ABI,
    chainId: CHAIN_ID,
    functionName: 'getStreakMilestoneCount',
    query: { refetchOnMount: true, staleTime: Infinity },
  })

  const { data: referralsActiveRaw } = useReadContract({
    address: CONTRACTS.REWARDS,
    abi: REWARDS_ABI,
    chainId: CHAIN_ID,
    functionName: 'referralsActive',
    query: { refetchOnMount: true, staleTime: Infinity },
  })

  const { data: referralAmountRaw } = useReadContract({
    address: CONTRACTS.REWARDS,
    abi: REWARDS_ABI,
    chainId: CHAIN_ID,
    functionName: 'referralAmount',
    query: { refetchOnMount: true, staleTime: Infinity },
  })

  const { data: referralThresholdRaw } = useReadContract({
    address: CONTRACTS.REWARDS,
    abi: REWARDS_ABI,
    chainId: CHAIN_ID,
    functionName: 'referralThreshold',
    query: { refetchOnMount: true, staleTime: Infinity },
  })

  const season = seasonRaw != null ? Number(seasonRaw) : 0

  // ── Player-specific single reads ─────────────────────────────────────────

  const { data: streakRaw, isLoading: streakLoading, refetch: refetchStreak } = useReadContract({
    address: CONTRACTS.REWARDS,
    abi: REWARDS_ABI,
    chainId: CHAIN_ID,
    functionName: 'streakDay',
    args: [BigInt(season), address],
    query: { enabled: enabled && season > 0, refetchOnMount: true, staleTime: Infinity },
  })

  const { data: lastMintDayRaw } = useReadContract({
    address: CONTRACTS.REWARDS,
    abi: REWARDS_ABI,
    chainId: CHAIN_ID,
    functionName: 'lastMintDay',
    args: [BigInt(season), address],
    query: { enabled: enabled && season > 0, refetchOnMount: true, staleTime: Infinity },
  })

  const { data: referrerRaw } = useReadContract({
    address: CONTRACTS.REWARDS,
    abi: REWARDS_ABI,
    chainId: CHAIN_ID,
    functionName: 'referrerOf',
    args: [address],
    query: { enabled, refetchOnMount: true, staleTime: Infinity },
  })

  // ── Batched reads: tier bounties (tiers 2-7 x 3 calls each = 18 calls) ──

  // We need currentBatch from the Window contract to query bounties.
  // Read it here so the hook is self-contained.
  const { data: currentBatchRaw } = useReadContract({
    address: CONTRACTS.WINDOW,
    abi: [{ name: 'currentBatch', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] }],
    chainId: CHAIN_ID,
    functionName: 'currentBatch',
    query: { refetchOnMount: true, staleTime: Infinity },
  })

  const currentBatch = currentBatchRaw != null ? Number(currentBatchRaw) : 1

  const tierBountyContracts = useMemo(() => {
    if (!season) return []
    const calls = []
    for (let tier = 2; tier <= 7; tier++) {
      calls.push({
        address: CONTRACTS.REWARDS, abi: REWARDS_ABI, chainId: CHAIN_ID,
        functionName: 'tierBountyWinner',
        args: [BigInt(season), currentBatch, tier],
      })
      calls.push({
        address: CONTRACTS.REWARDS, abi: REWARDS_ABI, chainId: CHAIN_ID,
        functionName: 'tierBountyAmount',
        args: [BigInt(season), currentBatch, tier],
      })
      calls.push({
        address: CONTRACTS.REWARDS, abi: REWARDS_ABI, chainId: CHAIN_ID,
        functionName: 'tierBountyClaimed',
        args: [BigInt(season), currentBatch, tier],
      })
    }
    return calls
  }, [season, currentBatch])

  const { data: tierBountyResults, isLoading: tierBountyLoading, refetch: refetchBounties } = useReadContracts({
    contracts: tierBountyContracts,
    query: { enabled: tierBountyContracts.length > 0, refetchOnMount: true, staleTime: Infinity },
  })

  // ── Batched reads: streak milestones (indices 0-5) ───────────────────────

  const milestoneContracts = useMemo(() => {
    const calls = []
    for (let i = 0; i < 6; i++) {
      calls.push({
        address: CONTRACTS.REWARDS, abi: REWARDS_ABI, chainId: CHAIN_ID,
        functionName: 'streakMilestones',
        args: [BigInt(i)],
      })
    }
    return calls
  }, [])

  const { data: milestoneResults, isLoading: milestonesLoading, refetch: refetchMilestones } = useReadContracts({
    contracts: milestoneContracts,
    query: { refetchOnMount: true, staleTime: Infinity },
  })

  // ── Batched reads: streakClaimed for each milestone ──────────────────────

  const streakClaimedContracts = useMemo(() => {
    if (!enabled || !season) return []
    const calls = []
    for (let i = 0; i < 6; i++) {
      calls.push({
        address: CONTRACTS.REWARDS, abi: REWARDS_ABI, chainId: CHAIN_ID,
        functionName: 'streakClaimed',
        args: [BigInt(season), address, i],
      })
    }
    return calls
  }, [season, address, enabled])

  const { data: streakClaimedResults } = useReadContracts({
    contracts: streakClaimedContracts,
    query: { enabled: streakClaimedContracts.length > 0, refetchOnMount: true, staleTime: Infinity },
  })

  // ── Batched reads: leaderboard amounts (indices 0-2) ─────────────────────

  const leaderboardContracts = useMemo(() => {
    const calls = []
    for (let i = 0; i < 3; i++) {
      calls.push({
        address: CONTRACTS.REWARDS, abi: REWARDS_ABI, chainId: CHAIN_ID,
        functionName: 'leaderboardAmounts',
        args: [BigInt(i)],
      })
    }
    return calls
  }, [])

  const { data: leaderboardResults, isLoading: leaderboardLoading, refetch: refetchLeaderboard } = useReadContracts({
    contracts: leaderboardContracts,
    query: { refetchOnMount: true, staleTime: Infinity },
  })

  // ── Shape the data ───────────────────────────────────────────────────────

  const tierBounties = useMemo(() => {
    if (!tierBountyResults) return []
    const bounties = []
    for (let i = 0; i < 6; i++) {
      const tier = i + 2
      const winnerResult = tierBountyResults[i * 3]
      const amountResult = tierBountyResults[i * 3 + 1]
      const claimedResult = tierBountyResults[i * 3 + 2]
      bounties.push({
        tier,
        winner: winnerResult?.result || ZERO_ADDR,
        amount: amountResult?.result || BigInt(0),
        claimed: claimedResult?.result || false,
      })
    }
    return bounties
  }, [tierBountyResults])

  const milestones = useMemo(() => {
    if (!milestoneResults) return []
    return milestoneResults.map((m, index) => {
      const result = m?.result
      const claimed = streakClaimedResults?.[index]?.result || false
      return {
        index,
        daysRequired: result ? Number(result[0]) : 0,
        slotsTotal: result ? Number(result[1]) : 0,
        slotsClaimed: result ? Number(result[2]) : 0,
        blockReward: result ? Number(result[3]) : 0,
        claimed,
      }
    })
  }, [milestoneResults, streakClaimedResults])

  const leaderboardAmounts = useMemo(() => {
    if (!leaderboardResults) return [BigInt(0), BigInt(0), BigInt(0)]
    return leaderboardResults.map(r => r?.result || BigInt(0))
  }, [leaderboardResults])

  const isLoading = seasonLoading || streakLoading || milestoneCountLoading
    || tierBountyLoading || milestonesLoading || leaderboardLoading

  const refetchAll = () => {
    refetchSeason()
    refetchStreak()
    refetchBounties()
    refetchMilestones()
    refetchLeaderboard()
  }

  return {
    season,
    streak: streakRaw != null ? Number(streakRaw) : 0,
    lastMintDay: lastMintDayRaw != null ? Number(lastMintDayRaw) : 0,
    tierBounties,
    milestones,
    referrer: referrerRaw || ZERO_ADDR,
    referralsActive: referralsActiveRaw || false,
    referralAmount: referralAmountRaw || BigInt(0),
    referralThreshold: referralThresholdRaw || BigInt(0),
    leaderboardAmounts,
    isLoading,
    refetchAll,
  }
}
