// RewardToast.jsx — Notification toast for reward events
import { GOLD, REWARDS_ACCENT } from '../../config/design-tokens'

const fp = { fontFamily: "'Press Start 2P', monospace" }
const fv = { fontFamily: "'VT323', monospace" }

export default function RewardToast({ message, type, onDismiss }) {
  if (!message) return null

  const isGold = type === 'gold'
  const accent = isGold ? GOLD : REWARDS_ACCENT
  const bg = isGold ? 'rgba(60,40,10,0.95)' : 'rgba(10,40,40,0.95)'

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', bottom: 32, right: 24, zIndex: 8000,
        background: bg,
        border: `2px solid ${accent}`,
        borderRadius: 4, padding: '12px 20px', cursor: 'pointer',
        boxShadow: `0 4px 20px ${isGold ? 'rgba(200,168,75,0.3)' : 'rgba(78,205,196,0.3)'}`,
        animation: 'fadeInDown 0.3s ease-out',
        display: 'flex', alignItems: 'center', gap: 10,
      }}
    >
      <span style={{ ...fv, fontSize: 28, color: accent }}>★</span>
      <div>
        <div style={{ ...fp, fontSize: 7, color: accent, letterSpacing: 1 }}>REWARD</div>
        <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{message}</div>
      </div>
    </div>
  )
}
