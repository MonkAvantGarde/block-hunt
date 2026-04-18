// TierBountyTab.jsx — Tier Race Bounties (T6-T2), OPEN/WON-CLAIM/CLAIMED states
import { useState, useEffect } from 'react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatEther } from 'viem'
import { CONTRACTS } from '../../config/wagmi'
import { REWARDS_ABI } from '../../abis'

const fp = { fontFamily: "'Press Start 2P', monospace" }
const fv = { fontFamily: "'VT323', monospace" }
const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

// Display tiers in order T6, T5, T4, T3, T2 (index 0=T2..4=T6 in bounties array, reversed for display)
const DISPLAY_TIERS = [6, 5, 4, 3, 2]

export default function TierBountyTab({ tierBounties, address, season, currentBatch }) {
  const [claimingTier, setClaimingTier] = useState(null)
  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (isSuccess) {
      setTimeout(() => { setClaimingTier(null); reset() }, 2000)
    }
  }, [isSuccess])

  useEffect(() => {
    if (writeError) {
      setTimeout(() => { setClaimingTier(null); reset() }, 3000)
    }
  }, [writeError])

  function handleClaim(tier) {
    setClaimingTier(tier)
    writeContract({
      address: CONTRACTS.REWARDS,
      abi: REWARDS_ABI,
      chainId: 84532,
      functionName: 'claimBounty',
      args: [currentBatch, tier],
      gas: BigInt(300_000),
    })
  }

  function getBountyForTier(tier) {
    return tierBounties.find(b => b.tier === tier) || { tier, winner: ZERO_ADDR, amount: BigInt(0), claimed: false }
  }

  function getStatus(bounty) {
    if (bounty.claimed) return 'claimed'
    if (bounty.winner && bounty.winner !== ZERO_ADDR) {
      if (address && bounty.winner.toLowerCase() === address.toLowerCase()) return 'won'
      return 'claimed' // someone else won it
    }
    return 'open'
  }

  return (
    <div style={{
      background: '#0e2a1a',
      border: '1px solid rgba(200,168,75,0.18)',
      padding: 24,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, transparent, rgba(200,168,75,0.35), transparent)',
      }} />

      <div style={{ ...fp, fontSize: 10, color: '#e0c060', letterSpacing: 2, marginBottom: 16 }}>
        TIER RACE BOUNTIES
      </div>
      <div style={{ ...fv, fontSize: 22, color: 'rgba(240,234,214,0.7)', marginBottom: 14 }}>
        First to mint each tier in this batch wins
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 10,
      }}>
        {DISPLAY_TIERS.map(tier => {
          const bounty = getBountyForTier(tier)
          const status = getStatus(bounty)
          const prizeEth = bounty.amount > 0 ? Number(formatEther(bounty.amount)).toFixed(3) : '---'
          const isClaiming = claimingTier === tier && (isPending || isConfirming)

          return (
            <div key={tier} style={{
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.1)',
              padding: '16px 10px',
              textAlign: 'center',
            }}>
              <div style={{ ...fp, fontSize: 9, color: '#a0b8d8', marginBottom: 8 }}>
                T{tier}
              </div>
              <div style={{ ...fv, fontSize: 28, color: '#f0d868', marginBottom: 10 }}>
                {prizeEth}
              </div>

              {status === 'open' && (
                <div style={{
                  ...fp, fontSize: 7, padding: '6px 10px',
                  color: 'rgba(240,234,214,0.55)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  display: 'inline-block',
                }}>OPEN</div>
              )}

              {status === 'won' && (
                <button
                  onClick={() => handleClaim(tier)}
                  disabled={isClaiming}
                  style={{
                    ...fp, fontSize: 7, padding: '6px 10px',
                    color: '#0a1a0f',
                    background: '#e0c060',
                    border: '1px solid #e0c060',
                    cursor: isClaiming ? 'default' : 'pointer',
                    fontWeight: 'bold',
                    opacity: isClaiming ? 0.6 : 1,
                  }}
                >{isClaiming ? 'CLAIMING...' : 'YOU WON - CLAIM'}</button>
              )}

              {status === 'claimed' && (
                <div style={{
                  ...fp, fontSize: 7, padding: '6px 10px',
                  color: 'rgba(240,234,214,0.4)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  textDecoration: 'line-through',
                  display: 'inline-block',
                }}>CLAIMED</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
