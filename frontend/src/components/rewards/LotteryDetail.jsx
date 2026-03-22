import { useState, useEffect } from 'react'
import { GOLD, GOLD_LT, GOLD_DK, GREEN, INK, CREAM, REWARDS_ACCENT } from '../../config/design-tokens'

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

export default function LotteryDetail({ rewards, onClaim }) {
  const { lottery, claimable } = rewards
  const drawCountdown = useCountdown(lottery.windowCloseAt)

  return (
    <div style={{ animation: 'fadeInUp 0.25s ease-out' }}>
      {/* Today's prize card */}
      <div style={{ animation: 'lotteryGlow 3s infinite', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(78,205,196,0.12)', padding: 20, marginBottom: 16 }}>
        <div style={{ textAlign: 'center', marginBottom: 20, padding: '16px 0' }}>
          <div style={{ ...fp, fontSize: 8, color: 'rgba(78,205,196,0.5)', letterSpacing: 2, marginBottom: 8 }}>TODAY'S PRIZE</div>
          <div style={{ ...fv, fontSize: 64, color: REWARDS_ACCENT, textShadow: '0 0 30px rgba(78,205,196,0.5)', lineHeight: 1 }}>{lottery.prize.toFixed(2)} Ξ</div>
          <div style={{ ...fp, fontSize: 8, color: 'rgba(78,205,196,0.4)', letterSpacing: 2, marginTop: 6 }}>~$50 AT CURRENT RATE</div>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, border: '1px solid rgba(78,205,196,0.08)' }}>
          <div style={{ padding: 14, textAlign: 'center', background: 'rgba(0,0,0,0.2)' }}>
            <div style={{ ...fv, fontSize: 28, color: CREAM }}>{lottery.wallets}</div>
            <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, marginTop: 2 }}>WALLETS TODAY</div>
          </div>
          <div style={{ padding: 14, textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderLeft: '1px solid rgba(78,205,196,0.08)' }}>
            <div style={{ ...fv, fontSize: 28, color: CREAM }}>{lottery.wallets > 0 ? (100 / lottery.wallets).toFixed(1) : '0.0'}%</div>
            <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, marginTop: 2 }}>YOUR ODDS</div>
          </div>
          <div style={{ padding: 14, textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderLeft: '1px solid rgba(78,205,196,0.08)' }}>
            <div style={{ ...fv, fontSize: 28, color: CREAM }}>{drawCountdown}</div>
            <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, marginTop: 2 }}>DRAW IN</div>
          </div>
        </div>

        {/* Eligibility status */}
        <div style={{
          marginTop: 16, padding: '12px 16px',
          background: lottery.eligible ? 'rgba(78,205,196,0.06)' : 'rgba(255,255,255,0.02)',
          border: `1px solid ${lottery.eligible ? 'rgba(78,205,196,0.15)' : 'rgba(255,255,255,0.06)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <div style={{ ...fv, fontSize: 24, color: lottery.eligible ? GREEN : 'rgba(255,255,255,0.2)' }}>{lottery.eligible ? '✓' : '✗'}</div>
          <div style={{ ...fp, fontSize: 8, color: lottery.eligible ? GREEN : 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>
            {lottery.eligible ? "YOU MINTED TODAY — YOU'RE IN THE DRAW" : "MINT TODAY TO ENTER THE DRAW"}
          </div>
        </div>
      </div>

      {/* Latest winner */}
      <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: 12 }}>
        {lottery.todayDrawResolved ? "TODAY'S WINNER" : "YESTERDAY'S WINNER"}
      </div>
      {lottery.latestWinner ? (
        <div style={{
          padding: '14px 16px',
          background: 'linear-gradient(135deg,rgba(200,168,75,0.08),rgba(78,205,196,0.05))',
          border: `1px solid ${lottery.latestIsYou ? 'rgba(110,255,138,0.4)' : 'rgba(200,168,75,0.2)'}`,
          display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16,
        }}>
          <div style={{ width: 36, height: 36, background: `linear-gradient(135deg,${GOLD_DK},${GOLD})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ ...fv, fontSize: 20, color: INK }}>★</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ ...fp, fontSize: 8, color: 'rgba(200,168,75,0.6)', letterSpacing: 1, marginBottom: 3 }}>WINNER — {lottery.latestDate}</div>
            <div style={{ ...fv, fontSize: 20, color: CREAM }}>{lottery.latestWinner}{lottery.latestIsYou ? ' (YOU!)' : ''}</div>
          </div>
          <div style={{ ...fv, fontSize: 24, color: GOLD_LT, textShadow: '0 0 8px rgba(200,168,75,0.3)' }}>+{lottery.prize.toFixed(2)} Ξ</div>
        </div>
      ) : (
        <div style={{
          padding: '14px 16px',
          background: 'rgba(0,0,0,0.2)',
          border: '1px solid rgba(255,255,255,0.04)',
          marginBottom: 16, textAlign: 'center',
        }}>
          <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.2)', letterSpacing: 1 }}>NO DRAW YET</div>
        </div>
      )}

      {/* Recent draws */}
      <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: 12 }}>RECENT DRAWS</div>
      {lottery.recentDraws.length === 0 && (
        <div style={{ padding: 16, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
          <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.2)', letterSpacing: 1 }}>NO DRAWS YET</div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {lottery.recentDraws.map((draw, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', padding: '10px 14px',
            background: i % 2 === 0 ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.15)',
            border: `1px solid rgba(255,255,255,${i % 2 === 0 ? '0.04' : '0.03'})`,
          }}>
            <div style={{ ...fv, fontSize: 20, color: 'rgba(255,255,255,0.4)', width: 90 }}>{draw.date}</div>
            <div style={{ ...fv, fontSize: 20, color: 'rgba(255,255,255,0.5)', flex: 1 }}>
              {draw.winner}
              {draw.isYou && <span style={{ ...fp, fontSize: 8, color: GOLD, marginLeft: 4 }}>YOU!</span>}
            </div>
            <div style={{ ...fv, fontSize: 20, color: 'rgba(255,255,255,0.3)', width: 80 }}>{draw.wallets} wallets</div>
            <div style={{ ...fv, fontSize: 20, color: draw.isYou ? GOLD_LT : REWARDS_ACCENT, width: draw.isYou && !draw.claimed ? 'auto' : 80, textAlign: 'right', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
              {draw.prize.toFixed(2)} Ξ{draw.isYou && draw.claimed ? ' ✓' : ''}
              {draw.isYou && !draw.claimed && onClaim && (
                <button
                  onClick={e => { e.stopPropagation(); onClaim({ name: `Lottery Win — Day ${draw.day}`, amount: draw.prize, claimType: 'lottery', claimArgs: { day: draw.day } }) }}
                  style={{
                    fontFamily: "'Press Start 2P', monospace", fontSize: 8, letterSpacing: 1, padding: '3px 8px',
                    color: '#0a0705', background: 'linear-gradient(135deg,#8a6820,#c8a84b)',
                    border: '1px solid #c8a84b', cursor: 'pointer', flexShrink: 0,
                  }}
                >CLAIM</button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginTop: 14, letterSpacing: 1 }}>
        WINNER SELECTED VIA CHAINLINK VRF · PROVABLY FAIR · 1 WALLET = 1 TICKET
      </div>
    </div>
  )
}
