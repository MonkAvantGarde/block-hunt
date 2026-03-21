import { useState, useEffect } from 'react'
import { GOLD, GOLD_LT, GOLD_DK, REWARDS_ACCENT, GREEN } from '../../config/design-tokens'

const fp = { fontFamily: "'Press Start 2P', monospace" }
const fv = { fontFamily: "'VT323', monospace" }

function useCountdown(closeAt) {
  const [display, setDisplay] = useState('--:--:--')
  useEffect(() => {
    if (!closeAt) return
    function tick() {
      const now = Math.floor(Date.now() / 1000)
      if (closeAt <= now) { setDisplay('PENDING'); return }
      const secs = closeAt - now
      const h = String(Math.floor(secs / 3600)).padStart(2, '0')
      const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0')
      const s = String(secs % 60).padStart(2, '0')
      setDisplay(`${h}:${m}:${s}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [closeAt])
  return display
}

const cardBase = {
  background: 'rgba(0,0,0,0.25)',
  border: '1px solid rgba(78,205,196,0.08)',
  padding: 16,
  cursor: 'pointer',
  transition: 'all 0.2s',
  position: 'relative',
}

function Card({ children, onClick, style, delay = 0 }) {
  return (
    <div
      onClick={onClick}
      style={{
        ...cardBase,
        animation: `fadeInUp 0.3s ease-out ${delay}s both`,
        ...style,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(78,205,196,0.25)'
        e.currentTarget.style.background = 'rgba(78,205,196,0.03)'
        e.currentTarget.style.transform = 'translateY(-1px)'
        const arrow = e.currentTarget.querySelector('.card-arrow')
        if (arrow) arrow.style.opacity = '1'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'rgba(78,205,196,0.08)'
        e.currentTarget.style.background = 'rgba(0,0,0,0.25)'
        e.currentTarget.style.transform = 'translateY(0)'
        const arrow = e.currentTarget.querySelector('.card-arrow')
        if (arrow) arrow.style.opacity = '0'
      }}
    >
      {children}
    </div>
  )
}

export default function RewardsOverview({ rewards, onNavigate }) {
  const { streak, currentStreakTier, nextStreakTier, milestones, totalEarned, totalInProgress, lottery, bounty, hallOfFame } = rewards
  const drawCountdown = useCountdown(lottery.windowCloseAt)

  // Earned milestone badges for display
  const earnedBadges = []
  let nextBadge = null
  Object.values(milestones).forEach(cat => {
    cat.badges.forEach(b => {
      if (cat.current >= b.count) earnedBadges.push({ name: b.name, earned: true })
      else if (!nextBadge) nextBadge = { name: b.name, earned: false }
    })
  })

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* STREAK CARD */}
        <Card onClick={() => onNavigate('streak')} delay={0}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>DAILY STREAK</div>
            <div className="card-arrow" style={{ ...fp, fontSize: 8, color: REWARDS_ACCENT, opacity: 0, transition: 'opacity 0.2s' }}>→</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{ ...fv, fontSize: 42, color: GOLD_LT, lineHeight: 1, animation: 'streakFire 2s infinite' }}>{streak}</div>
            <div>
              <div style={{ ...fp, fontSize: 8, color: 'rgba(200,168,75,0.6)' }}>DAYS</div>
              {currentStreakTier && (
                <div style={{ ...fp, fontSize: 8, color: GOLD, marginTop: 3 }}>{currentStreakTier.name} ✦</div>
              )}
            </div>
          </div>
          {nextStreakTier && (
            <div style={{ marginTop: 10 }}>
              <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.3)', marginBottom: 3 }}>NEXT: {nextStreakTier.name} ({nextStreakTier.days} days)</div>
              <div style={{ height: 4, background: 'rgba(0,0,0,0.5)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min((streak / nextStreakTier.days) * 100, 100)}%`, background: `linear-gradient(90deg,${GOLD_DK},${GOLD})` }} />
              </div>
            </div>
          )}
        </Card>

        {/* LOTTERY CARD */}
        <Card onClick={() => onNavigate('lottery')} delay={0.05}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>TODAY'S LOTTERY</div>
            <div className="card-arrow" style={{ ...fp, fontSize: 8, color: REWARDS_ACCENT, opacity: 0, transition: 'opacity 0.2s' }}>→</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{ ...fv, fontSize: 42, color: REWARDS_ACCENT, lineHeight: 1, textShadow: '0 0 20px rgba(78,205,196,0.4)' }}>{lottery.prize.toFixed(2)}</div>
            <div style={{ ...fv, fontSize: 24, color: 'rgba(78,205,196,0.6)' }}>Ξ</div>
          </div>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: lottery.eligible ? GREEN : 'rgba(255,255,255,0.2)' }} />
            <div style={{ ...fp, fontSize: 8, color: lottery.eligible ? GREEN : 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>
              {lottery.eligible ? `ELIGIBLE · ${lottery.wallets} WALLETS · DRAW IN ${drawCountdown}` : `${lottery.wallets} WALLETS · MINT TO ENTER`}
            </div>
          </div>
        </Card>

        {/* MILESTONES CARD */}
        <Card onClick={() => onNavigate('milestones')} delay={0.1}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>MILESTONES</div>
            <div className="card-arrow" style={{ ...fp, fontSize: 8, color: REWARDS_ACCENT, opacity: 0, transition: 'opacity 0.2s' }}>→</div>
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
            {earnedBadges.slice(-2).map((b, i) => (
              <div key={i} style={{ padding: '3px 7px', background: 'rgba(78,205,196,0.1)', border: '1px solid rgba(78,205,196,0.2)' }}>
                <span style={{ ...fp, fontSize: 8, color: REWARDS_ACCENT }}>{b.name}</span>
              </div>
            ))}
            {nextBadge && (
              <div style={{ padding: '3px 7px', background: 'rgba(200,168,75,0.1)', border: '1px solid rgba(200,168,75,0.2)' }}>
                <span style={{ ...fp, fontSize: 8, color: GOLD }}>{nextBadge.name} ◇</span>
              </div>
            )}
          </div>
          <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>{totalEarned} EARNED · {totalInProgress} IN PROGRESS</div>
        </Card>

        {/* BATCH BOUNTY CARD */}
        <Card onClick={() => onNavigate('bounty')} delay={0.15}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>BATCH {bounty.currentBatch} BOUNTY</div>
            <div className="card-arrow" style={{ ...fp, fontSize: 8, color: REWARDS_ACCENT, opacity: 0, transition: 'opacity 0.2s' }}>→</div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>{bounty.minted.toLocaleString()} / {bounty.total.toLocaleString()}</div>
              <div style={{ ...fv, fontSize: 20, color: '#f0ead6' }}>{Math.round((bounty.minted / bounty.total) * 100)}%</div>
            </div>
            <div style={{ height: 6, background: 'rgba(0,0,0,0.5)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(bounty.minted / bounty.total) * 100}%`, background: 'linear-gradient(90deg,rgba(78,205,196,0.4),rgba(78,205,196,0.7))' }} />
            </div>
          </div>
          <div style={{ ...fp, fontSize: 8, color: REWARDS_ACCENT }}>{bounty.bountyAmount.toFixed(2)} Ξ BOUNTY · {bounty.userEligible ? "YOU'RE ELIGIBLE" : 'MINT TO QUALIFY'}</div>
        </Card>

        {/* HALL OF FAME CARD — full width */}
        <Card onClick={() => onNavigate('hof')} delay={0.2} style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>HALL OF FAME</div>
            <div className="card-arrow" style={{ ...fp, fontSize: 8, color: REWARDS_ACCENT, opacity: 0, transition: 'opacity 0.2s' }}>→</div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {hallOfFame.legends.filter(l => l.wallet).slice(0, 2).map((l, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {i > 0 && <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.08)' }} />}
                <div style={{ width: 24, height: 24, background: `linear-gradient(135deg,${GOLD_DK},${GOLD})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ ...fv, fontSize: 20, color: '#0a0705' }}>★</span>
                </div>
                <div>
                  <div style={{ ...fp, fontSize: 8, color: GOLD_LT }}>{l.title}</div>
                  <div style={{ ...fv, fontSize: 16, color: 'rgba(255,255,255,0.4)' }}>{l.wallet}{l.isYou ? ' (YOU)' : ''}</div>
                </div>
              </div>
            ))}
            <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ ...fp, fontSize: 8, color: 'rgba(200,168,75,0.4)', letterSpacing: 1 }}>
              + {hallOfFame.legends.filter(l => !l.wallet).length} UNCLAIMED LEGENDARY FIRSTS
            </div>
            <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ ...fp, fontSize: 8, color: 'rgba(78,205,196,0.5)', letterSpacing: 1 }}>
              {hallOfFame.batchFirsts.filter(b => !b.wallet).length + hallOfFame.batchTierDiscovery.filter(b => !b.wallet).length} BATCH FIRSTS AVAILABLE
            </div>
          </div>
        </Card>
      </div>

      <div style={{ textAlign: 'center', marginTop: 16, animation: 'fadeIn 0.5s ease-out 0.4s both' }}>
        <div style={{ ...fp, fontSize: 8, color: 'rgba(78,205,196,0.35)', letterSpacing: 2 }}>TAP ANY CARD TO LEARN MORE →</div>
      </div>
    </div>
  )
}
