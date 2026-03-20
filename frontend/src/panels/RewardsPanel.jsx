import { useState } from 'react'
import { REWARDS_ACCENT, REWARDS_BG } from '../config/design-tokens'
import { useRewardsData } from '../hooks/useRewardsData'
import RewardsOverview from '../components/rewards/RewardsOverview'
import StreakDetail from '../components/rewards/StreakDetail'
import MilestoneDetail from '../components/rewards/MilestoneDetail'
import LotteryDetail from '../components/rewards/LotteryDetail'
import BountyDetail from '../components/rewards/BountyDetail'
import HallOfFameDetail from '../components/rewards/HallOfFameDetail'

const fp = { fontFamily: "'Press Start 2P', monospace" }
const fv = { fontFamily: "'VT323', monospace" }

const REWARDS_CSS = `
  @keyframes fadeInUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  @keyframes goldPulse { 0%,100% { color:#c8a84b; text-shadow:0 0 6px rgba(200,168,75,0.3); } 50% { color:#e8c86b; text-shadow:0 0 12px rgba(200,168,75,0.5); } }
  @keyframes streakFire { 0%,100% { text-shadow:0 0 4px #ff6622, 0 0 8px #ff662244; } 50% { text-shadow:0 0 8px #ff6622, 0 0 16px #ff662266; } }
  @keyframes lotteryGlow { 0%,100% { box-shadow:0 0 8px rgba(78,205,196,0.15); } 50% { box-shadow:0 0 20px rgba(78,205,196,0.3); } }
  @keyframes progressPulse { 0%,100% { opacity:0.7; } 50% { opacity:1; } }
`

const VIEW_LABELS = {
  streak: 'DAILY STREAK',
  lottery: 'DAILY LOTTERY',
  milestones: 'MILESTONES',
  bounty: 'BATCH BOUNTY',
  hof: 'HALL OF FAME',
}

export default function RewardsPanel({ address, blocks, currentBatch }) {
  const [view, setView] = useState('overview')
  const { rewards, loading } = useRewardsData(address, blocks, currentBatch)

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <div style={{ ...fp, fontSize: 7, color: 'rgba(78,205,196,0.4)', letterSpacing: 2, animation: 'progressPulse 1.5s infinite' }}>LOADING REWARDS...</div>
      </div>
    )
  }

  return (
    <div>
      <style>{REWARDS_CSS}</style>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, paddingBottom: 14,
        borderBottom: '1px solid rgba(78,205,196,0.12)',
      }}>
        <div style={{ ...fp, fontSize: 11, color: REWARDS_ACCENT, letterSpacing: 2, textShadow: '0 0 12px rgba(78,205,196,0.3)' }}>REWARDS</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(78,205,196,0.06)', border: '1px solid rgba(78,205,196,0.15)', padding: '8px 16px' }}>
          <div>
            <div style={{ ...fp, fontSize: 6, color: 'rgba(78,205,196,0.6)', letterSpacing: 1 }}>REWARDS POOL</div>
            {/* TODO: Replace with contract read when BlockHuntRewards.sol is deployed */}
            <div style={{ ...fv, fontSize: 24, color: REWARDS_ACCENT, textShadow: '0 0 8px rgba(78,205,196,0.4)' }}>{rewards.rewardsPool.toFixed(4)} Ξ</div>
          </div>
        </div>
      </div>

      {/* Breadcrumb (detail views only) */}
      {view !== 'overview' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, animation: 'fadeIn 0.2s' }}>
          <button
            onClick={() => setView('overview')}
            style={{
              ...fp, fontSize: 6, color: 'rgba(255,255,255,0.35)', letterSpacing: 1,
              cursor: 'pointer', transition: 'color 0.15s',
              background: 'none', border: 'none', padding: 0,
            }}
            onMouseEnter={e => { e.target.style.color = REWARDS_ACCENT }}
            onMouseLeave={e => { e.target.style.color = 'rgba(255,255,255,0.35)' }}
          >★ REWARDS</button>
          <span style={{ ...fp, fontSize: 6, color: 'rgba(255,255,255,0.15)' }}>›</span>
          <span style={{ ...fp, fontSize: 6, color: REWARDS_ACCENT, letterSpacing: 1 }}>{VIEW_LABELS[view]}</span>
        </div>
      )}

      {/* Content */}
      {view === 'overview' && <RewardsOverview rewards={rewards} onNavigate={setView} />}
      {view === 'streak' && <StreakDetail rewards={rewards} />}
      {view === 'milestones' && <MilestoneDetail rewards={rewards} />}
      {view === 'lottery' && <LotteryDetail rewards={rewards} />}
      {view === 'bounty' && <BountyDetail rewards={rewards} />}
      {view === 'hof' && <HallOfFameDetail rewards={rewards} />}
    </div>
  )
}
