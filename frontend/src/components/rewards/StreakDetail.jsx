import { GOLD, GOLD_LT, GOLD_DK, REWARDS_ACCENT } from '../../config/design-tokens'

const fp = { fontFamily: "'Press Start 2P', monospace" }
const fv = { fontFamily: "'VT323', monospace" }

export default function StreakDetail({ rewards }) {
  const { streak, currentStreakTier, nextStreakTier, streakTiers, timeline } = rewards

  return (
    <div style={{ animation: 'fadeInUp 0.25s ease-out' }}>
      {/* Main streak display */}
      <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(78,205,196,0.1)', padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ ...fv, fontSize: 52, color: GOLD_LT, lineHeight: 1, textShadow: '0 0 20px rgba(200,168,75,0.4)' }}>{streak}</div>
            <div style={{ ...fp, fontSize: 7, color: 'rgba(200,168,75,0.6)', letterSpacing: 1, marginTop: 4 }}>DAY STREAK</div>
          </div>
          {currentStreakTier && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', border: `1px solid ${GOLD}`, background: 'rgba(0,0,0,0.2)' }}>
              <div style={{ width: 32, height: 32, border: `2px solid ${GOLD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 12px rgba(200,168,75,0.3)' }}>
                <span style={{ ...fv, fontSize: 20, color: GOLD }}>✦</span>
              </div>
              <div>
                <div style={{ ...fp, fontSize: 8, color: GOLD, letterSpacing: 1 }}>{currentStreakTier.name}</div>
                <div style={{ ...fp, fontSize: 5, color: 'rgba(200,168,75,0.5)', marginTop: 2 }}>GOLD FRAME</div>
              </div>
            </div>
          )}
        </div>

        {/* Progress to next tier */}
        {nextStreakTier && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ ...fp, fontSize: 6, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>NEXT: {nextStreakTier.name} ({nextStreakTier.days} DAYS)</div>
              <div style={{ ...fp, fontSize: 6, color: GOLD, letterSpacing: 1 }}>{streak} / {nextStreakTier.days}</div>
            </div>
            <div style={{ height: 8, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min((streak / nextStreakTier.days) * 100, 100)}%`, background: `linear-gradient(90deg,${GOLD_DK},${GOLD})` }} />
            </div>
          </div>
        )}

        {/* 7-day timeline */}
        <div style={{ display: 'flex', gap: 0, marginTop: 20 }}>
          {timeline.map((day, i) => (
            <div key={i} style={{
              flex: 1, textAlign: 'center', padding: '8px 4px',
              border: '1px solid rgba(255,255,255,0.04)',
              ...(day.done && !day.isToday ? { background: 'rgba(78,205,196,0.08)', borderColor: 'rgba(78,205,196,0.15)' } : {}),
              ...(day.isToday ? { background: 'rgba(200,168,75,0.1)', borderColor: 'rgba(200,168,75,0.3)' } : {}),
            }}>
              <div style={{ ...fp, fontSize: 5, color: day.isToday ? 'rgba(200,168,75,0.6)' : 'rgba(255,255,255,0.3)', marginBottom: 4 }}>{day.label}</div>
              {day.done && !day.isToday && <div style={{ ...fv, fontSize: 18, color: REWARDS_ACCENT }}>✓</div>}
              {day.isToday && <div style={{ ...fv, fontSize: 18, color: GOLD, animation: 'goldPulse 2s infinite' }}>⬡</div>}
              {!day.done && !day.isToday && <div style={{ ...fv, fontSize: 18, color: 'rgba(255,255,255,0.1)' }}>·</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Streak tiers */}
      <div style={{ ...fp, fontSize: 7, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: 12 }}>STREAK TIERS</div>
      <div style={{ display: 'flex', gap: 0 }}>
        {streakTiers.map((tier, i) => {
          const earned = streak >= tier.days
          const isCurrent = currentStreakTier?.name === tier.name
          const locked = !earned && !isCurrent

          let cellStyle = {
            flex: 1, padding: '12px 8px', textAlign: 'center',
            border: '1px solid rgba(255,255,255,0.04)',
            background: 'rgba(0,0,0,0.2)',
          }
          if (earned && !isCurrent) {
            cellStyle.background = 'rgba(78,205,196,0.04)'
            cellStyle.borderColor = 'rgba(78,205,196,0.1)'
          }
          if (isCurrent) {
            cellStyle.background = 'rgba(200,168,75,0.08)'
            cellStyle.border = '2px solid rgba(200,168,75,0.4)'
            cellStyle.boxShadow = '0 0 12px rgba(200,168,75,0.15)'
          }
          if (locked) {
            cellStyle.opacity = 0.35
          }

          return (
            <div key={i} style={cellStyle}>
              <div style={{ fontSize: 18, marginBottom: 2 }}>{tier.icon}</div>
              <div style={{ ...fp, fontSize: 5, color: locked ? 'rgba(255,255,255,0.4)' : (isCurrent ? GOLD : tier.color) }}>{tier.name}</div>
              <div style={{ ...fv, fontSize: 13, color: isCurrent ? GOLD : (locked ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.3)') }}>{tier.days} days</div>
              {earned && !isCurrent && <div style={{ ...fp, fontSize: 5, color: 'rgba(78,205,196,0.6)', marginTop: 3 }}>✓</div>}
              {isCurrent && <div style={{ ...fp, fontSize: 5, color: GOLD, marginTop: 3 }}>◆ NOW</div>}
              {tier.permanent && locked && <div style={{ ...fp, fontSize: 5, color: 'rgba(200,168,75,0.3)', marginTop: 3 }}>PERMANENT</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
