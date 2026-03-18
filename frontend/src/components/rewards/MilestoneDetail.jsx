import { GOLD, REWARDS_ACCENT } from '../../config/design-tokens'

const fp = { fontFamily: "'Press Start 2P', monospace" }
const fv = { fontFamily: "'VT323', monospace" }

export default function MilestoneDetail({ rewards }) {
  const { milestones } = rewards

  return (
    <div style={{ animation: 'fadeInUp 0.25s ease-out' }}>
      {/* Tab selector (static for now — overall only) */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20 }}>
        <button style={{ ...fp, flex: 1, padding: 10, fontSize: 7, letterSpacing: 1, color: REWARDS_ACCENT, background: 'rgba(78,205,196,0.08)', border: '1px solid rgba(78,205,196,0.2)', borderBottom: `2px solid ${REWARDS_ACCENT}`, cursor: 'pointer' }}>OVERALL</button>
        <button style={{ ...fp, flex: 1, padding: 10, fontSize: 7, letterSpacing: 1, color: 'rgba(255,255,255,0.4)', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', borderBottom: '2px solid transparent', cursor: 'pointer' }}>BATCH 2</button>
      </div>

      {Object.entries(milestones).map(([key, cat]) => {
        const earned = cat.badges.filter(b => cat.current >= b.count).length
        return (
          <div key={key} style={{ marginBottom: 12, animation: 'fadeInUp 0.3s ease-out' }}>
            {/* Category header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', background: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(78,205,196,0.08)',
            }}>
              <div style={{ ...fv, fontSize: 22, color: cat.color, width: 28, textAlign: 'center' }}>{cat.icon}</div>
              <div style={{ ...fp, fontSize: 7, color: 'rgba(255,255,255,0.7)', letterSpacing: 1, flex: 1 }}>{cat.label}</div>
              <div style={{ ...fv, fontSize: 18, color: REWARDS_ACCENT }}>{earned} / {cat.badges.length}</div>
            </div>

            {/* Badges */}
            <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
              {cat.badges.map((badge, i) => {
                const isEarned = cat.current >= badge.count
                const isNext = !isEarned && (i === 0 || cat.current >= cat.badges[i - 1].count)
                const isLocked = !isEarned && !isNext

                let badgeStyle = {
                  flex: 1, minWidth: 100, padding: '12px 8px',
                  background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.03)',
                  textAlign: 'center', transition: 'all 0.2s',
                }
                if (isEarned) {
                  badgeStyle.background = 'rgba(78,205,196,0.06)'
                  badgeStyle.borderColor = 'rgba(78,205,196,0.15)'
                }
                if (isNext) {
                  badgeStyle.background = 'rgba(200,168,75,0.04)'
                  badgeStyle.borderColor = 'rgba(200,168,75,0.15)'
                }
                if (isLocked) {
                  badgeStyle.opacity = 0.35
                }

                const countLabel = key === 'collection' ? `${badge.count} tier${badge.count !== 1 ? 's' : ''}` : String(badge.count).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

                return (
                  <div key={i} style={badgeStyle}>
                    <div style={{ fontSize: 20, marginBottom: 3, ...(isLocked ? { filter: 'grayscale(1) brightness(0.5)' } : {}) }}>{badge.icon}</div>
                    <div style={{ ...fp, fontSize: 5, color: isEarned ? REWARDS_ACCENT : (isNext ? GOLD : 'rgba(255,255,255,0.4)'), marginBottom: 2 }}>{badge.name}</div>
                    <div style={{ ...fv, fontSize: 14, color: isEarned ? 'rgba(78,205,196,0.6)' : (isNext ? GOLD : 'rgba(255,255,255,0.2)') }}>
                      {isEarned ? `${countLabel} ✓` : countLabel}
                    </div>
                    {isNext && (
                      <div style={{ marginTop: 5, paddingTop: 5, borderTop: '1px solid rgba(200,168,75,0.15)' }}>
                        <div style={{ ...fp, fontSize: 5, color: 'rgba(200,168,75,0.6)' }}>{cat.current.toLocaleString()} / {badge.count.toLocaleString()}</div>
                        <div style={{ height: 4, background: 'rgba(0,0,0,0.5)', overflow: 'hidden', marginTop: 3 }}>
                          <div style={{ height: '100%', width: `${Math.min((cat.current / badge.count) * 100, 100)}%`, background: GOLD }} />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
