// useRewardsData.js — All rewards data fetching (subgraph + contract reads)
import { useState, useEffect, useMemo } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import { formatEther } from 'viem'
import { CONTRACTS } from '../config/wagmi'
import { REWARDS_ABI, WINDOW_ABI } from '../abis'

const SUBGRAPH_URL = "https://api.studio.thegraph.com/query/1744131/blok-hunt/version/latest"

// ── Achievement ID mapping (0-12) per batch ─────────────────────────────────
// IDs 0-3: general firsts, 4-8: tier discoveries, 9-12: advanced firsts
const ACHIEVEMENT_META = [
  { id: 0, title: 'PIONEER',          desc: 'First Mint',         type: 'general' },
  { id: 1, title: 'COMBINER',         desc: 'First Combine',      type: 'general' },
  { id: 2, title: 'SMITH',            desc: 'First Forge',        type: 'general' },
  { id: 3, title: 'CENTURION',        desc: 'First 100 Mints',    type: 'general' },
  { id: 4, title: 'RESTLESS REVEAL',  desc: 'First T6 Reveal',    type: 'tier', tier: 6, tierName: 'RESTLESS' },
  { id: 5, title: 'REMEMBERED REVEAL',desc: 'First T5 Reveal',    type: 'tier', tier: 5, tierName: 'REMEMBERED' },
  { id: 6, title: 'ORDERED REVEAL',   desc: 'First T4 Reveal',    type: 'tier', tier: 4, tierName: 'ORDERED' },
  { id: 7, title: 'CHAOTIC REVEAL',   desc: 'First T3 Reveal',    type: 'tier', tier: 3, tierName: 'CHAOTIC' },
  { id: 8, title: 'WILLFUL REVEAL',   desc: 'First T2 Reveal',    type: 'tier', tier: 2, tierName: 'WILLFUL' },
  { id: 9, title: 'FIVE HUNDRED',     desc: 'First 500 Mints',    type: 'general' },
  { id: 10, title: 'THE THOUSAND',    desc: 'First 1,000 Mints',  type: 'general' },
  { id: 11, title: 'CONTENDER',       desc: 'First 5 Tiers Held', type: 'general' },
  { id: 12, title: 'COUNTDOWN THREAT',desc: 'First 6 Tiers Held', type: 'general' },
]

// Legend mapping: batch 1 achievements presented as all-time legends
const LEGEND_IDS = [0, 2, 10, 12]  // Pioneer, Smith, The Thousand, Countdown Threat
const LEGEND_TITLES = {
  0: 'THE PIONEER', 2: 'THE FIRST SPARK', 10: 'THE THOUSAND', 12: 'THE FIRST THREAT',
}
const LEGEND_DESCS = {
  0: 'First Mint', 2: 'First Forge', 10: 'First 1,000 Mints', 12: 'First 6 Tiers',
}

// Tier discovery IDs (4-8)
const TIER_DISCOVERY_IDS = [4, 5, 6, 7, 8]

function calcStreak(dates) {
  if (!dates.length) return 0
  const sorted = [...new Set(dates)].sort().reverse()
  const today = utcDateStr(new Date())
  const yesterday = utcDateStr(new Date(Date.now() - 86400000))
  if (sorted[0] !== today && sorted[0] !== yesterday) return 0
  let streak = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00Z')
    const curr = new Date(sorted[i] + 'T00:00:00Z')
    const diff = (prev - curr) / 86400000
    if (diff === 1) streak++
    else break
  }
  return streak
}

function utcDateStr(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

// Format a shortened address: 0x1234...cdef
function shortAddr(addr) {
  if (!addr || addr === '0x0000000000000000000000000000000000000000') return null
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

const STREAK_TIERS = [
  { name: 'ACTIVE', days: 3, icon: '🥉', color: '#cd7f32' },
  { name: 'COMMITTED', days: 7, icon: '🥈', color: '#c0c0c0' },
  { name: 'DEDICATED', days: 14, icon: '🏆', color: '#c8a84b' },
  { name: 'RELENTLESS', days: 30, icon: '🔥', color: '#ff6622' },
  { name: 'LEGENDARY', days: 60, icon: '⭐', color: '#c8a84b', permanent: true },
]

const MILESTONE_DEFS = {
  minting: {
    icon: '⬡', color: '#6eff8a', label: 'MINTING',
    badges: [
      { name: 'NOVICE', icon: '⬡', count: 10 },
      { name: 'BRONZE', icon: '⬡⬡', count: 100 },
      { name: 'SILVER', icon: '⬡⬡⬡', count: 500 },
      { name: 'GOLD', icon: '🏅', count: 1000 },
      { name: 'DIAMOND', icon: '💎', count: 5000 },
      { name: 'OBSIDIAN', icon: '🖤', count: 10000 },
    ],
  },
  forging: {
    icon: '⚡', color: '#b86bff', label: 'FORGING',
    badges: [
      { name: 'FIRST SPARK', icon: '🔥', count: 1 },
      { name: 'TINKERER', icon: '🔧', count: 5 },
      { name: 'SMITH', icon: '⚒️', count: 20 },
      { name: 'FORGEMASTER', icon: '🏗️', count: 50 },
      { name: 'LEGENDARY', icon: '👑', count: 100 },
    ],
  },
  collection: {
    icon: '◆', color: '#c8a84b', label: 'COLLECTION',
    badges: [
      { name: 'COLLECTOR', icon: '◇◇', count: 2 },
      { name: 'HUNTER', icon: '◇◇◇', count: 3 },
      { name: 'SEEKER', icon: '◆◆◆◆', count: 4 },
      { name: 'CONTENDER', icon: '◆◆◆◆◆', count: 5 },
      { name: 'COUNTDOWN THREAT', icon: '★', count: 6 },
    ],
  },
}

export function useRewardsData(address, blocks, currentBatch) {
  const [subgraphData, setSubgraphData] = useState(null)
  const [loading, setLoading] = useState(true)

  const batch = currentBatch ? Number(currentBatch) : 1

  // ── Contract reads: lottery ──────────────────────────────────────────────
  const { data: dailyPrizeRaw } = useReadContract({
    address: CONTRACTS.REWARDS,
    abi: REWARDS_ABI,
    functionName: 'dailyPrize',
    args: [BigInt(batch)],
    query: { refetchInterval: 120_000 },
  })

  const { data: lotteryPoolRaw } = useReadContract({
    address: CONTRACTS.REWARDS,
    abi: REWARDS_ABI,
    functionName: 'lotteryPool',
    args: [BigInt(batch)],
    query: { refetchInterval: 120_000 },
  })

  // ── Contract reads: bounty ───────────────────────────────────────────────
  const { data: batchConfigRaw } = useReadContract({
    address: CONTRACTS.REWARDS,
    abi: REWARDS_ABI,
    functionName: 'batchConfigs',
    args: [BigInt(batch)],
    query: { refetchInterval: 120_000 },
  })

  const { data: bountyPoolRaw } = useReadContract({
    address: CONTRACTS.REWARDS,
    abi: REWARDS_ABI,
    functionName: 'bountyPool',
    args: [BigInt(batch)],
    query: { refetchInterval: 120_000 },
  })

  const { data: batchBountiesRaw } = useReadContract({
    address: CONTRACTS.REWARDS,
    abi: REWARDS_ABI,
    functionName: 'batchBounties',
    args: [BigInt(batch)],
    query: { refetchInterval: 120_000 },
  })

  // ── Contract reads: pools for total rewards ──────────────────────────────
  const { data: firstsPoolRaw } = useReadContract({
    address: CONTRACTS.REWARDS,
    abi: REWARDS_ABI,
    functionName: 'firstsPool',
    args: [BigInt(batch)],
    query: { refetchInterval: 120_000 },
  })

  // ── Contract reads: batch firsts (13 per batch, batch 1 for legends) ───
  const batchFirstsContracts = useMemo(() => {
    const calls = []
    // Batch 1 firsts (legends + all-time tier discovery)
    for (let i = 0; i < 13; i++) {
      calls.push({
        address: CONTRACTS.REWARDS, abi: REWARDS_ABI,
        functionName: 'batchFirsts', args: [BigInt(1), BigInt(i)],
      })
    }
    // Current batch firsts (if batch > 1)
    if (batch > 1) {
      for (let i = 0; i < 13; i++) {
        calls.push({
          address: CONTRACTS.REWARDS, abi: REWARDS_ABI,
          functionName: 'batchFirsts', args: [BigInt(batch), BigInt(i)],
        })
      }
    }
    return calls
  }, [batch])

  const { data: batchFirstsRaw } = useReadContracts({
    contracts: batchFirstsContracts,
    query: { refetchInterval: 120_000 },
  })

  // ── Contract read: getClaimable for connected wallet ───────────────────
  const { data: claimableRaw, refetch: refetchClaimable } = useReadContract({
    address: CONTRACTS.REWARDS,
    abi: REWARDS_ABI,
    functionName: 'getClaimable',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 120_000 },
  })

  // ── Contract read: current day (for lottery draw lookups) ────────────────
  const { data: currentDayRaw } = useReadContract({
    address: CONTRACTS.WINDOW,
    abi: WINDOW_ABI,
    functionName: 'currentDay',
    query: { refetchInterval: 60_000 },
  })

  // ── Contract read: window info (for lottery countdown) ───────────────────
  const { data: windowInfoRaw } = useReadContract({
    address: CONTRACTS.WINDOW,
    abi: WINDOW_ABI,
    functionName: 'getWindowInfo',
    query: { refetchInterval: 30_000 },
  })

  // ── Contract reads: today's draw + recent draws ──────────────────────────
  const currentDay = currentDayRaw ? Number(currentDayRaw) : 0

  const { data: todayDrawRaw } = useReadContract({
    address: CONTRACTS.REWARDS,
    abi: REWARDS_ABI,
    functionName: 'dailyDraws',
    args: [BigInt(Math.max(currentDay, 0))],
    query: { enabled: currentDay > 0, refetchInterval: 120_000 },
  })

  const { data: yesterdayDrawRaw } = useReadContract({
    address: CONTRACTS.REWARDS,
    abi: REWARDS_ABI,
    functionName: 'dailyDraws',
    args: [BigInt(Math.max(currentDay - 1, 0))],
    query: { enabled: currentDay > 0, refetchInterval: 120_000 },
  })

  const { data: draw2Raw } = useReadContract({
    address: CONTRACTS.REWARDS,
    abi: REWARDS_ABI,
    functionName: 'dailyDraws',
    args: [BigInt(Math.max(currentDay - 2, 0))],
    query: { enabled: currentDay > 1, refetchInterval: 120_000 },
  })

  const { data: draw3Raw } = useReadContract({
    address: CONTRACTS.REWARDS,
    abi: REWARDS_ABI,
    functionName: 'dailyDraws',
    args: [BigInt(Math.max(currentDay - 3, 0))],
    query: { enabled: currentDay > 2, refetchInterval: 120_000 },
  })

  // ── Subgraph fetch (player stats + streaks + season stats) ───────────────
  useEffect(() => {
    if (!address) { setLoading(false); return }
    let cancelled = false

    async function fetchData() {
      try {
        const query = `{
          player(id: "${address.toLowerCase()}") {
            totalMints
            totalCombines
            totalForges
            totalForgeSuccesses
            tiersUnlocked
          }
          playerActivities(
            where: { player: "${address.toLowerCase()}" }
            orderBy: date
            orderDirection: desc
            first: 90
          ) {
            date
            hasMint
            hasCombine
            hasForge
          }
          seasonStat(id: "season-1") {
            totalMinted
            uniquePlayers
          }
          allPlayers: players(first: 1000, where: { totalMints_gt: "0" }) {
            id
          }
        }`
        const res = await fetch(SUBGRAPH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        })
        if (!res.ok) throw new Error('Rate limited')
        const json = await res.json()
        if (!cancelled) {
          setSubgraphData(json?.data || null)
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 300_000) // 5 min — conserve subgraph quota
    return () => { cancelled = true; clearInterval(interval) }
  }, [address])

  const rewards = useMemo(() => {
    const player = subgraphData?.player
    const activities = subgraphData?.playerActivities || []
    const seasonStat = subgraphData?.seasonStat

    // ── Streak calculation from PlayerActivity entities ──
    const activityDates = activities.map(a => a.date)
    const streak = calcStreak(activityDates)

    // Streak tier
    let currentStreakTier = null
    let nextStreakTier = STREAK_TIERS[0]
    for (let i = STREAK_TIERS.length - 1; i >= 0; i--) {
      if (streak >= STREAK_TIERS[i].days) {
        currentStreakTier = STREAK_TIERS[i]
        nextStreakTier = STREAK_TIERS[i + 1] || null
        break
      }
    }

    // 7-day timeline from activity data
    const today = new Date()
    const timeline = []
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
    const activityDateSet = new Set(activityDates)
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setUTCDate(d.getUTCDate() - i)
      const key = utcDateStr(d)
      timeline.push({
        label: i === 0 ? 'TODAY' : dayNames[d.getUTCDay()],
        done: activityDateSet.has(key),
        isToday: i === 0,
      })
    }

    // ── Milestones from real subgraph data ──
    const totalMints = player?.totalMints ? Number(player.totalMints) : 0
    const totalForges = player?.totalForges ? Number(player.totalForges) : 0
    const totalCombines = player?.totalCombines ? Number(player.totalCombines) : 0
    const tiersHeld = blocks ? [2, 3, 4, 5, 6, 7].filter(t => (blocks[t] || 0) > 0).length : 0

    const milestones = {
      minting: { ...MILESTONE_DEFS.minting, current: totalMints },
      forging: { ...MILESTONE_DEFS.forging, current: totalForges },
      collection: { ...MILESTONE_DEFS.collection, current: tiersHeld },
    }

    // Count earned/in-progress milestones
    let totalEarned = 0
    let totalInProgress = 0
    Object.values(milestones).forEach(cat => {
      let foundNext = false
      cat.badges.forEach(b => {
        if (cat.current >= b.count) totalEarned++
        else if (!foundNext) { totalInProgress++; foundNext = true }
      })
    })

    // Minted today check (for lottery eligibility)
    const todayStr = utcDateStr(new Date())
    const todayActivity = activities.find(a => a.date === todayStr)
    const mintedToday = todayActivity?.hasMint || false

    // Bounty progress from real SeasonStat
    const totalMinted = seasonStat?.totalMinted ? Number(seasonStat.totalMinted) : 0
    // uniquePlayers from seasonStat may be 0 (subgraph mapping bug) — fall back to player count
    const allPlayersCount = subgraphData?.allPlayers?.length || 0
    const uniquePlayers = (seasonStat?.uniquePlayers && Number(seasonStat.uniquePlayers) > 0)
      ? Number(seasonStat.uniquePlayers)
      : allPlayersCount

    // ── Lottery data from contract reads ──
    const dailyPrize = dailyPrizeRaw != null ? Number(formatEther(dailyPrizeRaw)) : 0
    const lotteryPoolTotal = lotteryPoolRaw != null ? Number(formatEther(lotteryPoolRaw)) : 0

    // Lottery countdown: pass raw closeAt timestamp so components can tick live
    let windowCloseAt = 0
    if (windowInfoRaw) {
      const [, , , closeAt] = windowInfoRaw
      windowCloseAt = Number(closeAt)
    }

    // Parse draw results from contract
    function parseDraw(drawRaw, dayNum, userAddr) {
      if (!drawRaw) return null
      const [, prize, winner, resolvedAt, claimed] = drawRaw
      if (!winner || winner === '0x0000000000000000000000000000000000000000') return null
      const prizeEth = Number(formatEther(prize))
      const isYou = userAddr && winner.toLowerCase() === userAddr.toLowerCase()
      // Approximate date from day number (each day is a window day)
      const resolvedTs = Number(resolvedAt)
      const dateStr = resolvedTs > 0
        ? new Date(resolvedTs * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
        : `DAY ${dayNum}`
      return { date: dateStr, winner: shortAddr(winner), wallets: uniquePlayers, prize: prizeEth, isYou, claimed, day: dayNum }
    }

    const todayDraw = parseDraw(todayDrawRaw, currentDay, address)
    const yesterdayDraw = parseDraw(yesterdayDrawRaw, currentDay - 1, address)
    const latestDraw = todayDraw || yesterdayDraw
    const recentDraws = [
      todayDraw,
      yesterdayDraw,
      parseDraw(draw2Raw, currentDay - 2, address),
      parseDraw(draw3Raw, currentDay - 3, address),
    ].filter(Boolean)

    const lottery = {
      prize: dailyPrize,
      pool: lotteryPoolTotal,
      wallets: uniquePlayers || 0,
      eligible: mintedToday,
      windowCloseAt,
      todayDrawResolved: !!todayDraw,
      latestWinner: latestDraw ? latestDraw.winner : null,
      latestDate: latestDraw ? latestDraw.date : null,
      latestIsYou: latestDraw ? latestDraw.isYou : false,
      yesterdayWinner: yesterdayDraw ? yesterdayDraw.winner : null,
      yesterdayDate: yesterdayDraw ? yesterdayDraw.date : null,
      recentDraws,
    }

    // ── Bounty data from contract reads ──
    // batchConfigs returns: [totalDeposit, lotteryBps, firstsBps, bountyBps, active, settled]
    const batchActive = batchConfigRaw ? batchConfigRaw[4] : false
    const totalDeposit = batchConfigRaw ? Number(formatEther(batchConfigRaw[0])) : 0
    const bountyBps = batchConfigRaw ? Number(batchConfigRaw[3]) : 0
    const bountyPoolTotal = bountyPoolRaw != null ? Number(formatEther(bountyPoolRaw)) : 0

    // batchBounties returns: [totalRecipients, perWalletShare, setAt, distributed]
    const bountyDistributed = batchBountiesRaw ? batchBountiesRaw[3] : false
    const bountyPerWallet = batchBountiesRaw && batchBountiesRaw[1] > 0n
      ? Number(formatEther(batchBountiesRaw[1]))
      : (uniquePlayers > 0 && bountyPoolTotal > 0 ? bountyPoolTotal / uniquePlayers : 0)

    // Batch target: derive from batchConfigs on the window contract if available
    // For now use the on-chain supply targets per batch
    const BATCH_SUPPLY_TARGETS = [0, 50000, 100000, 150000, 200000, 250000, 300000, 350000, 400000, 450000, 500000]
    const batchTarget = BATCH_SUPPLY_TARGETS[batch] || 500000

    const bounty = {
      currentBatch: batch,
      minted: totalMinted,
      total: batchTarget,
      bountyAmount: bountyPoolTotal,
      eligibleWallets: uniquePlayers || 0,
      perWallet: bountyPerWallet,
      userEligible: totalMints > 0,
      distributed: bountyDistributed,
      completedBatches: [], // TODO: Phase 4 — query previous batch bounties from subgraph
    }

    // ── Rewards Pool: sum of sub-pools from contract ──
    const firstsPoolTotal = firstsPoolRaw != null ? Number(formatEther(firstsPoolRaw)) : 0
    const rewardsPool = lotteryPoolTotal + firstsPoolTotal + bountyPoolTotal

    // Default prize per batch first (firstsPool / 13)
    const defaultFirstPrize = firstsPoolTotal > 0 ? firstsPoolTotal / 13 : 0

    // ── Hall of Fame: parse batch firsts from contract reads ──
    function parseBatchFirst(raw, achievementId, forBatch) {
      if (!raw || raw.status === 'failure') return null
      const result = raw.result || raw
      // batchFirsts returns: [winner, prize, awardedAt, claimed]
      const winner = result[0]
      const prize = result[1]
      const awardedAt = result[2]
      const claimed = result[3]
      const isZero = !winner || winner === '0x0000000000000000000000000000000000000000'
      const prizeEth = prize ? Number(formatEther(prize)) : defaultFirstPrize
      const isYou = !isZero && address && winner.toLowerCase() === address.toLowerCase()
      return {
        achievementId,
        batch: forBatch,
        winner: isZero ? null : shortAddr(winner),
        winnerFull: isZero ? null : winner,
        prize: prizeEth,
        claimed: Boolean(claimed),
        isYou,
        claimType: 'batchFirst',
        claimArgs: { batch: forBatch, achievementId },
      }
    }

    // Parse batch 1 firsts (indices 0-12)
    const batch1Firsts = []
    if (batchFirstsRaw) {
      for (let i = 0; i < 13; i++) {
        batch1Firsts.push(parseBatchFirst(batchFirstsRaw[i], i, 1))
      }
    }

    // Parse current batch firsts (indices 13-25, if batch > 1)
    const currentBatchFirsts = []
    if (batchFirstsRaw && batch > 1) {
      for (let i = 0; i < 13; i++) {
        currentBatchFirsts.push(parseBatchFirst(batchFirstsRaw[13 + i], i, batch))
      }
    } else {
      // If batch is 1, current batch firsts = batch 1 firsts
      batch1Firsts.forEach(bf => currentBatchFirsts.push(bf))
    }

    // Build legends from batch 1 achievement IDs [0, 2, 10, 12]
    const legends = LEGEND_IDS.map(id => {
      const bf = batch1Firsts[id]
      return {
        title: LEGEND_TITLES[id],
        desc: LEGEND_DESCS[id],
        wallet: bf?.winner || null,
        isYou: bf?.isYou || false,
        claimed: bf?.claimed || false,
        claimType: 'batchFirst',
        claimArgs: { batch: 1, achievementId: id },
      }
    })

    // Build all-time tier discovery from batch 1 achievement IDs [4, 5, 6, 7, 8]
    const tierDiscovery = TIER_DISCOVERY_IDS.map(id => {
      const meta = ACHIEVEMENT_META[id]
      const bf = batch1Firsts[id]
      return {
        tier: meta.tier,
        name: meta.tierName,
        wallet: bf?.winner || null,
        isYou: bf?.isYou || false,
        claimed: bf?.claimed || false,
        claimType: 'batchFirst',
        claimArgs: { batch: 1, achievementId: id },
      }
    })

    // Build current batch general firsts (IDs 0-3 + 9-12)
    const generalIds = [0, 1, 2, 3, 9, 10, 11, 12]
    const batchFirstsList = generalIds.map((id, idx) => {
      const meta = ACHIEVEMENT_META[id]
      const bf = currentBatchFirsts[id]
      return {
        rank: idx + 1,
        achievementId: id,
        title: `BATCH ${batch} ${meta.title}`,
        wallet: bf?.winner || null,
        isYou: bf?.isYou || false,
        prize: bf?.prize || defaultFirstPrize,
        claimed: bf?.claimed || false,
        claimType: 'batchFirst',
        claimArgs: { batch, achievementId: id },
      }
    })

    // Build current batch tier discovery (IDs 4-8)
    const batchTierDiscovery = TIER_DISCOVERY_IDS.map(id => {
      const meta = ACHIEVEMENT_META[id]
      const bf = currentBatchFirsts[id]
      return {
        tier: meta.tier,
        name: meta.tierName,
        achievementId: id,
        wallet: bf?.winner || null,
        isYou: bf?.isYou || false,
        prize: bf?.prize || defaultFirstPrize,
        claimed: bf?.claimed || false,
        claimType: 'batchFirst',
        claimArgs: { batch, achievementId: id },
      }
    })

    const hallOfFame = {
      legends,
      tierDiscovery,
      batchFirsts: batchFirstsList,
      batchTierDiscovery,
      currentBatch: batch,
    }

    // ── Claimable rewards for connected wallet ──
    const claimable = { lottery: [], batchFirsts: [], bounty: [] }
    if (claimableRaw) {
      const c = claimableRaw
      // Lottery wins
      if (c.wonDays) {
        for (let i = 0; i < c.wonDays.length; i++) {
          claimable.lottery.push({
            day: Number(c.wonDays[i]),
            amount: Number(formatEther(c.wonAmounts[i])),
          })
        }
      }
      // Batch firsts
      if (c.firstBatches) {
        for (let i = 0; i < c.firstBatches.length; i++) {
          claimable.batchFirsts.push({
            batch: Number(c.firstBatches[i]),
            achievementId: Number(c.firstIds[i]),
            amount: Number(formatEther(c.firstAmounts[i])),
          })
        }
      }
      // Bounties
      if (c.bountyBatches) {
        for (let i = 0; i < c.bountyBatches.length; i++) {
          claimable.bounty.push({
            batch: Number(c.bountyBatches[i]),
            amount: Number(formatEther(c.bountyAmounts[i])),
          })
        }
      }
    }

    return {
      streak,
      currentStreakTier,
      nextStreakTier,
      streakTiers: STREAK_TIERS,
      timeline,
      milestones,
      totalEarned,
      totalInProgress,
      mintedToday,
      lottery,
      bounty,
      hallOfFame,
      rewardsPool,
      claimable,
    }
  }, [subgraphData, blocks, dailyPrizeRaw, lotteryPoolRaw, batchConfigRaw, bountyPoolRaw,
      batchBountiesRaw, firstsPoolRaw, currentDayRaw, windowInfoRaw,
      todayDrawRaw, yesterdayDrawRaw, draw2Raw, draw3Raw, address, currentDay, batch,
      batchFirstsRaw, claimableRaw])

  return { rewards, loading, refetchClaimable }
}
