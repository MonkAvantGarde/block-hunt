// useRewardsData.js — All rewards data fetching (subgraph + contract reads)
import { useState, useEffect, useMemo } from 'react'

const SUBGRAPH_URL = "https://api.studio.thegraph.com/query/1744131/blok-hunt/version/latest"

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

export function useRewardsData(address, blocks) {
  const [subgraphData, setSubgraphData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!address) { setLoading(false); return }
    let cancelled = false

    async function fetchData() {
      try {
        // Query player stats + daily activity for streaks
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
        }`
        const res = await fetch(SUBGRAPH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        })
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
    const interval = setInterval(fetchData, 120_000)
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
    const uniquePlayers = seasonStat?.uniquePlayers || 0

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
      // TODO: Replace with contract read when BlockHuntRewards.sol is deployed
      lottery: {
        prize: 0.02,
        wallets: uniquePlayers || 47,
        eligible: mintedToday,
        drawCountdown: '04:22:18',
        yesterdayWinner: '0x7a3f...8b2c',
        yesterdayDate: 'MAR 15, 2026',
        recentDraws: [
          { date: 'Mar 15', winner: '0x7a3f...8b2c', wallets: 52, prize: 0.02, isYou: false },
          { date: 'Mar 14', winner: '0x20b3...0c57', wallets: 38, prize: 0.02, isYou: true },
          { date: 'Mar 13', winner: '0x9c21...4f7a', wallets: 29, prize: 0.02, isYou: false },
        ],
      },
      // TODO: Replace with contract read when BlockHuntRewards.sol is deployed
      bounty: {
        currentBatch: 2,
        minted: totalMinted,
        total: 500000,
        bountyAmount: 0.20,
        eligibleWallets: uniquePlayers || 312,
        perWallet: uniquePlayers > 0 ? 0.20 / uniquePlayers : 0.00064,
        userEligible: totalMints > 0,
        completedBatches: [
          { batch: 1, total: 500000, bounty: 0.10, claimed: true, claimedAmount: 0.0005 },
        ],
      },
      // TODO: Replace with contract read when BlockHuntRewards.sol is deployed
      hallOfFame: {
        legends: [
          { title: 'THE PIONEER', desc: 'First Mint', wallet: '0x20b3...0c57', isYou: true, claimed: true },
          { title: 'THE FIRST SPARK', desc: 'First Forge', wallet: '0x7a3f...8b2c', isYou: false, claimed: true },
          { title: 'THE THOUSAND', desc: 'First 1,000 Mints', wallet: null, claimed: false },
          { title: 'THE FIRST THREAT', desc: 'First 6 Tiers', wallet: null, claimed: false },
        ],
        tierDiscovery: [
          { tier: 6, name: 'RESTLESS', wallet: '0x20b3...0c57', isYou: true, claimed: true },
          { tier: 5, name: 'REMEMBERED', wallet: '0x7a3f...8b2c', isYou: false, claimed: true },
          { tier: 4, name: 'ORDERED', wallet: null, claimed: false },
          { tier: 3, name: 'CHAOTIC', wallet: null, claimed: false },
          { tier: 2, name: 'WILLFUL', wallet: null, claimed: false },
        ],
        batchFirsts: [
          { rank: 1, title: 'BATCH 2 PIONEER', wallet: '0x20b3...0c57', isYou: true, prize: 0.02, claimed: true },
          { rank: 2, title: 'BATCH 2 COMBINER', wallet: '0x9c21...4f7a', isYou: false, prize: 0.02, claimed: false },
          { rank: 3, title: 'BATCH 2 SMITH', wallet: null, prize: 0.02, claimed: false },
          { rank: 4, title: 'BATCH 2 CENTURION', wallet: null, prize: 0.02, claimed: false },
        ],
        batchTierDiscovery: [
          { tier: 6, name: 'RESTLESS', wallet: '0x20b3...0c57', isYou: true, prize: 0.02, claimed: true },
          { tier: 5, name: 'REMEMBERED', wallet: '0x9c21...4f7a', isYou: false, prize: 0.02, claimed: false },
          { tier: 4, name: 'ORDERED', wallet: null, prize: 0.02, claimed: false },
          { tier: 3, name: 'CHAOTIC', wallet: null, prize: 0.02, claimed: false },
          { tier: 2, name: 'WILLFUL', wallet: null, prize: 0.02, claimed: false },
        ],
      },
      // TODO: Replace with contract read when BlockHuntRewards.sol is deployed
      rewardsPool: 0.5000,
    }
  }, [subgraphData, blocks])

  return { rewards, loading }
}
