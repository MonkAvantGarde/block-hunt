// RewardsPanel.jsx — Rewards V2: tabbed interface with 5 reward categories
import { useState } from 'react'
import { useReadContract } from 'wagmi'
import { formatEther } from 'viem'
import { useRewards } from '../hooks/useRewards'
import { CONTRACTS } from '../config/wagmi'
import { REWARDS_ABI } from '../abis'
import TierBountyTab from '../components/rewards/TierBountyTab'
import LotteryTab from '../components/rewards/LotteryTab'
import StreakTab from '../components/rewards/StreakTab'
import LeaderboardTab from '../components/rewards/LeaderboardTab'
import ReferralTab from '../components/rewards/ReferralTab'

const fp = { fontFamily: "'Press Start 2P', monospace" }
const fv = { fontFamily: "'VT323', monospace" }

const REWARDS_CSS = `
  @keyframes progressPulse { 0%,100% { opacity:0.7; } 50% { opacity:1; } }
`

const TABS = [
  { key: 'tier', label: 'TIER REWARDS' },
  { key: 'lottery', label: 'DAILY LOTTERY' },
  { key: 'streak', label: 'STREAK REWARDS' },
  { key: 'leaderboard', label: 'DAILY LEADERBOARD' },
  { key: 'referral', label: 'REFERRAL BONUS' },
]

export default function RewardsPanel({ address, blocks, currentBatch }) {
  const [activeTab, setActiveTab] = useState('tier')
  const [refreshing, setRefreshing] = useState(false)
  const rewards = useRewards()

  const handleTabSwitch = (key) => {
    setActiveTab(key)
    rewards.refetchAll?.()
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await rewards.refetchAll?.()
    setTimeout(() => setRefreshing(false), 500)
  }

  const {
    season, streak, lastMintDay,
    tierBounties, milestones,
    referralsActive, referralAmount, referralThreshold,
    leaderboardAmounts, isLoading, refetchAll,
  } = rewards

  // Total available: vault balance (all rewards pot)
  const { data: vaultRaw } = useReadContract({
    address: CONTRACTS.REWARDS,
    abi: REWARDS_ABI,
    chainId: 84532,
    functionName: 'vaultBalance',
    query: { staleTime: Infinity, refetchOnMount: true },
  })

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <div style={{ ...fp, fontSize: 8, color: 'rgba(240,234,214,0.4)', letterSpacing: 2, animation: 'progressPulse 1.5s infinite' }}>LOADING REWARDS...</div>
        <style>{REWARDS_CSS}</style>
      </div>
    )
  }
  const vaultEth = vaultRaw ? Number(formatEther(vaultRaw)) : 0

  // Also sum up tier bounties + leaderboard for context
  const tierBountyTotal = tierBounties.reduce((sum, b) => sum + Number(formatEther(b.amount)), 0)
  const leaderboardTotal = leaderboardAmounts.reduce((sum, a) => sum + Number(formatEther(a)), 0)

  const totalDisplay = vaultEth > 0 ? vaultEth.toFixed(3) : '0.000'

  return (
    <div>
      <style>{REWARDS_CSS}</style>

      {/* Header: AVAILABLE REWARDS + total */}
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            ...fp, fontSize: 8,
            color: 'rgba(240,234,214,0.55)',
            letterSpacing: 2,
          }}>AVAILABLE REWARDS</div>
          <button
            onClick={handleRefresh}
            title="Refresh rewards data"
            style={{
              background: 'transparent', border: '1px solid rgba(240,234,214,0.2)',
              color: 'rgba(240,234,214,0.5)', cursor: 'pointer', padding: '4px 8px',
              fontSize: 14, lineHeight: 1, borderRadius: 3,
              transform: refreshing ? 'rotate(360deg)' : 'none',
              transition: 'transform 0.5s ease',
            }}
          >&#x21bb;</button>
        </div>
        <div style={{
          ...fv, fontSize: 56,
          color: '#f0d868',
          textShadow: '0 0 20px rgba(200,168,75,0.5), 0 0 60px rgba(200,168,75,0.2)',
          marginBottom: 6,
        }}>{totalDisplay} ETH</div>
        <div style={{
          ...fv, fontSize: 20,
          color: 'rgba(240,234,214,0.45)',
          marginBottom: 20,
        }}>across tier bounties, lottery, streaks, leaderboard & referrals</div>
      </div>

      {/* Navigation tabs */}
      <div style={{
        display: 'flex',
        gap: 0,
        marginBottom: 22,
        borderBottom: '2px solid rgba(255,255,255,0.08)',
        overflowX: 'auto',
      }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => handleTabSwitch(tab.key)}
              style={{
                ...fp, fontSize: 7,
                color: isActive ? '#0a1a0f' : 'rgba(240,234,214,0.7)',
                background: isActive ? '#f0d868' : 'rgba(240,234,214,0.06)',
                border: isActive ? '1px solid #f0d868' : '1px solid rgba(240,234,214,0.12)',
                borderBottom: isActive ? '1px solid #0e2a1a' : '1px solid rgba(240,234,214,0.12)',
                padding: '10px 14px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                letterSpacing: 0.5,
                flexShrink: 0,
                transition: 'all 0.15s',
                marginBottom: -2,
              }}
              onMouseEnter={e => { if (!isActive) { e.target.style.background = 'rgba(240,234,214,0.12)'; e.target.style.color = 'rgba(240,234,214,0.9)' }}}
              onMouseLeave={e => { if (!isActive) { e.target.style.background = 'rgba(240,234,214,0.06)'; e.target.style.color = 'rgba(240,234,214,0.7)' }}}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'tier' && (
        <TierBountyTab
          tierBounties={tierBounties}
          address={address}
          season={season}
          currentBatch={currentBatch || 1}
        />
      )}

      {activeTab === 'lottery' && (
        <LotteryTab lottery={{
          prize: 0.075, // TODO: Wire from useRewardsData lottery.prize when available
          yesterdayWinner: null,
        }} />
      )}

      {activeTab === 'streak' && (
        <StreakTab
          streak={streak}
          lastMintDay={lastMintDay}
          milestones={milestones}
          season={season}
          refetchAll={refetchAll}
        />
      )}

      {activeTab === 'leaderboard' && (
        <LeaderboardTab
          leaderboardAmounts={leaderboardAmounts}
          address={address}
        />
      )}

      {activeTab === 'referral' && (
        <ReferralTab
          address={address}
          referralsActive={referralsActive}
          referralAmount={referralAmount}
          referralThreshold={referralThreshold}
        />
      )}
    </div>
  )
}
