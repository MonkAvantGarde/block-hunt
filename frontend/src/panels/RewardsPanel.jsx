// RewardsPanel.jsx — Rewards V2: tabbed interface with 5 reward categories
import { useState } from 'react'
import { formatEther } from 'viem'
import { useRewards } from '../hooks/useRewards'
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
  const rewards = useRewards()

  const {
    season, streak, lastMintDay,
    tierBounties, milestones,
    referralsActive, referralAmount, referralThreshold,
    leaderboardAmounts, isLoading,
  } = rewards

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <div style={{ ...fp, fontSize: 8, color: 'rgba(240,234,214,0.4)', letterSpacing: 2, animation: 'progressPulse 1.5s infinite' }}>LOADING REWARDS...</div>
        <style>{REWARDS_CSS}</style>
      </div>
    )
  }

  // Calculate total available rewards (sum of claimable tier bounties)
  const totalClaimableEth = tierBounties
    .filter(b => b.winner && address && b.winner.toLowerCase() === address.toLowerCase() && !b.claimed)
    .reduce((sum, b) => sum + Number(formatEther(b.amount)), 0)

  // Also add leaderboard amounts for display
  const leaderboardTotal = leaderboardAmounts.reduce((sum, a) => sum + Number(formatEther(a)), 0)

  const totalDisplay = totalClaimableEth > 0 ? totalClaimableEth.toFixed(3) : '0.000'

  return (
    <div>
      <style>{REWARDS_CSS}</style>

      {/* Header: AVAILABLE REWARDS + total */}
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{
          ...fp, fontSize: 8,
          color: 'rgba(240,234,214,0.55)',
          letterSpacing: 2,
          marginBottom: 8,
        }}>AVAILABLE REWARDS</div>
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
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              ...fp, fontSize: 7,
              color: activeTab === tab.key ? '#f0d868' : 'rgba(240,234,214,0.5)',
              background: 'transparent',
              border: 'none',
              padding: '12px 14px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              letterSpacing: 0.5,
              position: 'relative',
              flexShrink: 0,
              transition: 'color 0.2s',
              borderBottom: activeTab === tab.key ? '2px solid #f0d868' : '2px solid transparent',
              marginBottom: -2,
            }}
            onMouseEnter={e => { if (activeTab !== tab.key) e.target.style.color = 'rgba(240,234,214,0.85)' }}
            onMouseLeave={e => { if (activeTab !== tab.key) e.target.style.color = 'rgba(240,234,214,0.5)' }}
          >
            {tab.label}
          </button>
        ))}
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
