// ClaimModal.jsx — Confirmation modal for reward claims
// TODO: Wire useWriteContract for claim functions when BlockHuntRewards.sol is deployed
import { GOLD, GOLD_DK, INK, CREAM, REWARDS_ACCENT } from '../../config/design-tokens'

const fp = { fontFamily: "'Press Start 2P', monospace" }
const fv = { fontFamily: "'VT323', monospace" }

export default function ClaimModal({ reward, onConfirm, onClose }) {
  if (!reward) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0a1520',
          border: `2px solid ${REWARDS_ACCENT}`,
          padding: 28, maxWidth: 400, width: '90%',
          boxShadow: `0 0 40px rgba(78,205,196,0.2)`,
        }}
      >
        <div style={{ ...fp, fontSize: 9, color: REWARDS_ACCENT, letterSpacing: 2, marginBottom: 16 }}>CLAIM REWARD</div>

        <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(78,205,196,0.1)', padding: 16, marginBottom: 16 }}>
          <div style={{ ...fp, fontSize: 6, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, marginBottom: 6 }}>REWARD</div>
          <div style={{ ...fv, fontSize: 22, color: CREAM }}>{reward.name}</div>
          {reward.amount && (
            <>
              <div style={{ ...fp, fontSize: 6, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, marginBottom: 4, marginTop: 12 }}>AMOUNT</div>
              <div style={{ ...fv, fontSize: 28, color: REWARDS_ACCENT, textShadow: '0 0 12px rgba(78,205,196,0.3)' }}>{reward.amount} Ξ</div>
            </>
          )}
          <div style={{ ...fp, fontSize: 5, color: 'rgba(255,255,255,0.25)', marginTop: 10 }}>EST. GAS: ~0.0001 Ξ</div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '12px 0',
              ...fp, fontSize: 7, letterSpacing: 1,
              color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
            }}
          >CANCEL</button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: '12px 0',
              ...fp, fontSize: 7, letterSpacing: 1,
              color: INK, background: `linear-gradient(135deg,${GOLD_DK},${GOLD})`,
              border: `1px solid ${GOLD}`, cursor: 'pointer',
            }}
          >CONFIRM CLAIM</button>
        </div>
      </div>
    </div>
  )
}
