import { GOLD, REWARDS_ACCENT, GREEN } from '../../config/design-tokens'

const fp = { fontFamily: "'Press Start 2P', monospace" }
const fv = { fontFamily: "'VT323', monospace" }

export default function BountyDetail({ rewards, onClaim }) {
  const { bounty, claimable } = rewards
  const pct = ((bounty.minted / bounty.total) * 100).toFixed(1)
  const remaining = bounty.total - bounty.minted

  return (
    <div style={{ animation: 'fadeInUp 0.25s ease-out' }}>
      {/* Current batch bounty */}
      <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(78,205,196,0.1)', padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ ...fp, fontSize: 10, color: REWARDS_ACCENT, letterSpacing: 2, textShadow: '0 0 12px rgba(78,205,196,0.3)' }}>BATCH {bounty.currentBatch} BOUNTY</div>
            <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.3)', marginTop: 4, letterSpacing: 1 }}>EVERYONE WHO MINTED SHARES THE PRIZE</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ ...fv, fontSize: 36, color: REWARDS_ACCENT, textShadow: '0 0 20px rgba(78,205,196,0.4)', lineHeight: 1 }}>{bounty.bountyAmount.toFixed(2)} Ξ</div>
            <div style={{ ...fp, fontSize: 8, color: 'rgba(78,205,196,0.5)', letterSpacing: 1 }}>TOTAL BOUNTY</div>
          </div>
        </div>

        {/* Progress */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 }}>BATCH {bounty.currentBatch} PROGRESS</div>
            <div style={{ ...fv, fontSize: 20, color: '#f0ead6' }}>{bounty.minted.toLocaleString()} / {bounty.total.toLocaleString()}</div>
          </div>
          <div style={{ height: 14, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden', position: 'relative' }}>
            <div style={{
              height: '100%', width: `${pct}%`,
              background: 'linear-gradient(90deg,rgba(78,205,196,0.4),rgba(78,205,196,0.7))',
              transition: 'width 0.5s', position: 'relative',
            }}>
              <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 3, background: REWARDS_ACCENT, animation: 'progressPulse 1.5s infinite' }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.25)' }}>{remaining.toLocaleString()} BLOCKS REMAINING</div>
            <div style={{ ...fp, fontSize: 8, color: REWARDS_ACCENT, animation: 'progressPulse 1.5s infinite' }}>{pct}%</div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, border: '1px solid rgba(78,205,196,0.08)' }}>
          <div style={{ padding: 12, textAlign: 'center', background: 'rgba(0,0,0,0.2)' }}>
            <div style={{ ...fv, fontSize: 24, color: REWARDS_ACCENT }}>~{bounty.eligibleWallets}</div>
            <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, marginTop: 2 }}>ELIGIBLE WALLETS</div>
          </div>
          <div style={{ padding: 12, textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderLeft: '1px solid rgba(78,205,196,0.08)' }}>
            <div style={{ ...fv, fontSize: 24, color: REWARDS_ACCENT }}>~{bounty.perWallet.toFixed(5)} Ξ</div>
            <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, marginTop: 2 }}>EST. PER WALLET</div>
          </div>
        </div>

        {/* Eligibility */}
        <div style={{
          marginTop: 16, padding: '12px 16px',
          background: bounty.userEligible ? 'rgba(78,205,196,0.06)' : 'rgba(255,255,255,0.02)',
          border: `1px solid ${bounty.userEligible ? 'rgba(78,205,196,0.15)' : 'rgba(255,255,255,0.06)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <div style={{ ...fv, fontSize: 24, color: bounty.userEligible ? GREEN : 'rgba(255,255,255,0.2)' }}>{bounty.userEligible ? '✓' : '✗'}</div>
          <div style={{ ...fp, fontSize: 8, color: bounty.userEligible ? GREEN : 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>
            {bounty.userEligible ? `YOU MINTED IN BATCH ${bounty.currentBatch} — YOU'RE ELIGIBLE` : `MINT IN BATCH ${bounty.currentBatch} TO QUALIFY`}
          </div>
          {bounty.distributed && bounty.userEligible && claimable?.bounty?.some(b => b.batch === bounty.currentBatch) && onClaim && (
            <button
              onClick={() => onClaim({ name: `Batch ${bounty.currentBatch} Bounty`, amount: bounty.perWallet, claimType: 'bounty', claimArgs: { batch: bounty.currentBatch } })}
              style={{
                fontFamily: "'Press Start 2P', monospace", fontSize: 8, letterSpacing: 1, padding: '6px 14px', marginLeft: 8,
                color: '#0a0705', background: 'linear-gradient(135deg,#8a6820,#c8a84b)',
                border: '1px solid #c8a84b', cursor: 'pointer', flexShrink: 0,
              }}
            >CLAIM BOUNTY</button>
          )}
        </div>
      </div>

      {/* Completed batches */}
      {bounty.completedBatches.map((batch, i) => (
        <div key={i} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(78,205,196,0.06)', padding: 16, opacity: 0.6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div style={{ ...fp, fontSize: 9, color: 'rgba(78,205,196,0.6)', letterSpacing: 1 }}>BATCH {batch.batch} BOUNTY</div>
              <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.2)', marginTop: 3 }}>COMPLETE — {batch.total.toLocaleString()} / {batch.total.toLocaleString()}</div>
            </div>
            <div style={{ ...fv, fontSize: 24, color: 'rgba(78,205,196,0.6)' }}>{batch.bounty.toFixed(2)} Ξ</div>
          </div>
          {batch.claimed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(200,168,75,0.06)', border: '1px solid rgba(200,168,75,0.15)' }}>
              <div style={{ ...fp, fontSize: 8, color: GOLD, letterSpacing: 1 }}>CLAIMED — +{batch.claimedAmount} Ξ</div>
              <div style={{ ...fv, fontSize: 20, color: GOLD }}>✓</div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
