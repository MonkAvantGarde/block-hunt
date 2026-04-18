// StreakTab.jsx — Streak count + 6 milestone cards with CLAIM/CLAIMED/SLOTS OVER states
import { useState, useEffect } from 'react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { CONTRACTS } from '../../config/wagmi'
import { REWARDS_ABI } from '../../abis'

const fp = { fontFamily: "'Press Start 2P', monospace" }
const fv = { fontFamily: "'VT323', monospace" }

export default function StreakTab({ streak, lastMintDay, milestones, season, refetchAll }) {
  const [claimingIndex, setClaimingIndex] = useState(null)
  const [slotsGoneMsg, setSlotsGoneMsg] = useState(null)
  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (isSuccess) {
      refetchAll?.()
      setTimeout(() => { setClaimingIndex(null); reset() }, 2000)
    }
  }, [isSuccess])

  useEffect(() => {
    if (writeError) {
      setTimeout(() => { setClaimingIndex(null); reset() }, 3000)
    }
  }, [writeError])

  async function handleClaim(index) {
    setClaimingIndex(index)
    setSlotsGoneMsg(null)

    try {
      await refetchAll?.()
      const m = milestones[index]
      if (m && m.slotsClaimed >= m.slotsTotal) {
        setSlotsGoneMsg(index)
        setClaimingIndex(null)
        setTimeout(() => setSlotsGoneMsg(null), 4000)
        return
      }
    } catch (e) {}

    writeContract({
      address: CONTRACTS.REWARDS,
      abi: REWARDS_ABI,
      chainId: 84532,
      functionName: 'claimStreak',
      args: [index],
      gas: BigInt(300_000),
    })
  }

  // Determine last mint status text
  const now = Math.floor(Date.now() / 1000)
  const currentDay = Math.floor(now / 86400)
  const mintedToday = lastMintDay > 0 && lastMintDay >= currentDay
  const lastMintText = mintedToday ? 'LAST MINT: TODAY' : (lastMintDay > 0 ? 'LAST MINT: YESTERDAY' : 'NO MINTS YET')

  return (
    <div style={{
      background: '#0e2a1a',
      border: '1px solid rgba(200,168,75,0.18)',
      padding: 24,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, transparent, rgba(200,168,75,0.35), transparent)',
      }} />

      <div style={{ ...fp, fontSize: 10, color: '#e0c060', letterSpacing: 2, marginBottom: 16 }}>
        DAILY STREAK
      </div>

      {/* Streak header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
      }}>
        <div style={{
          ...fv, fontSize: 36, color: '#ff8844',
          textShadow: '0 0 12px rgba(255,102,34,0.4)',
        }}>
          {streak} days
        </div>
        <div style={{ ...fp, fontSize: 8, color: '#6ee0d8' }}>
          {lastMintText}
        </div>
      </div>

      {/* Milestone grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10,
      }}>
        {milestones.map((m, i) => {
          const slotsOver = m.slotsClaimed >= m.slotsTotal && m.slotsTotal > 0
          const canClaim = !m.claimed && !slotsOver && streak >= m.daysRequired && m.daysRequired > 0
          const isClaiming = claimingIndex === i && (isPending || isConfirming)
          const progressPct = m.slotsTotal > 0 ? Math.min(100, (m.slotsClaimed / m.slotsTotal) * 100) : 0

          return (
            <div key={i} style={{
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.08)',
              padding: 14,
              textAlign: 'center',
              opacity: m.claimed ? 0.6 : slotsOver ? 0.65 : 1,
            }}>
              <div style={{ ...fp, fontSize: 10, color: '#ff8844', marginBottom: 8 }}>
                {m.daysRequired} DAYS
              </div>
              <div style={{ ...fv, fontSize: 26, color: '#f0ead6', marginBottom: 8 }}>
                {m.blockReward} blocks
              </div>
              <div style={{ ...fv, fontSize: 21, color: 'rgba(240,234,214,0.6)', marginBottom: 8 }}>
                {m.slotsClaimed} / {m.slotsTotal} slots
              </div>

              {/* Progress bar */}
              <div style={{
                height: 5,
                background: 'rgba(255,255,255,0.12)',
                borderRadius: 2,
              }}>
                <div style={{
                  height: '100%',
                  background: '#ff8844',
                  borderRadius: 2,
                  width: `${progressPct}%`,
                }} />
              </div>

              {/* Status / action */}
              {canClaim && slotsGoneMsg === i && (
                <div style={{ ...fp, fontSize: 7, color: '#ff6666', marginTop: 10, lineHeight: 1.6 }}>
                  Sorry, the slots got over!<br/>Better luck for the next one!
                </div>
              )}

              {canClaim && slotsGoneMsg !== i && (
                <button
                  onClick={() => handleClaim(i)}
                  disabled={isClaiming}
                  style={{
                    ...fp, fontSize: 7,
                    background: '#e0c060',
                    color: '#0a1a0f',
                    border: '2px solid #0a1a0f',
                    padding: '8px 12px',
                    cursor: isClaiming ? 'default' : 'pointer',
                    marginTop: 10,
                    boxShadow: '2px 2px 0 #0a1a0f',
                    opacity: isClaiming ? 0.6 : 1,
                  }}
                >{isClaiming ? 'CLAIMING...' : `CLAIM ${m.blockReward} BLOCKS`}</button>
              )}

              {m.claimed && (
                <div style={{
                  ...fp, fontSize: 7, color: '#6ee0d8',
                  border: '1px solid rgba(110,224,216,0.45)',
                  padding: '6px 12px',
                  marginTop: 10,
                  display: 'inline-block',
                }}>CLAIMED</div>
              )}

              {slotsOver && !m.claimed && (
                <div style={{
                  ...fp, fontSize: 7, color: '#ff6666',
                  border: '1px solid rgba(255,102,102,0.45)',
                  padding: '6px 12px',
                  marginTop: 10,
                  display: 'inline-block',
                }}>SLOTS OVER</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
