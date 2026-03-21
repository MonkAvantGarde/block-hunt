// ClaimModal.jsx — Confirmation modal for reward claims with contract writes
import { useState, useEffect } from 'react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { CONTRACTS } from '../../config/wagmi'
import { REWARDS_ABI } from '../../abis'
import { GOLD, GOLD_DK, INK, CREAM, REWARDS_ACCENT, GREEN, EMBER } from '../../config/design-tokens'

const fp = { fontFamily: "'Press Start 2P', monospace" }
const fv = { fontFamily: "'VT323', monospace" }

export default function ClaimModal({ reward, onClose, onSuccess }) {
  if (!reward) return null

  const [claimState, setClaimState] = useState('idle') // idle | confirming | pending | success | error
  const [errorMsg, setErrorMsg] = useState(null)

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  // Track tx lifecycle
  useEffect(() => {
    if (isPending) setClaimState('confirming')
  }, [isPending])

  useEffect(() => {
    if (txHash && isConfirming) setClaimState('pending')
  }, [txHash, isConfirming])

  useEffect(() => {
    if (isSuccess) {
      setClaimState('success')
      if (onSuccess) onSuccess()
    }
  }, [isSuccess])

  useEffect(() => {
    if (writeError) {
      setClaimState('error')
      setErrorMsg(writeError.shortMessage || writeError.message || 'Transaction failed')
    }
  }, [writeError])

  function handleClaim() {
    setClaimState('confirming')
    setErrorMsg(null)

    const { claimType, claimArgs } = reward

    if (claimType === 'lottery') {
      writeContract({
        address: CONTRACTS.REWARDS,
        abi: REWARDS_ABI,
        functionName: 'claimDailyPrize',
        args: [BigInt(claimArgs.day)],
        gas: BigInt(300_000),
      })
    } else if (claimType === 'batchFirst') {
      writeContract({
        address: CONTRACTS.REWARDS,
        abi: REWARDS_ABI,
        functionName: 'claimBatchFirst',
        args: [BigInt(claimArgs.batch), BigInt(claimArgs.achievementId)],
        gas: BigInt(300_000),
      })
    } else if (claimType === 'bounty') {
      writeContract({
        address: CONTRACTS.REWARDS,
        abi: REWARDS_ABI,
        functionName: 'claimBatchBounty',
        args: [BigInt(claimArgs.batch)],
        gas: BigInt(300_000),
      })
    }
  }

  const isActive = claimState === 'confirming' || claimState === 'pending'

  return (
    <div
      onClick={claimState === 'idle' || claimState === 'error' || claimState === 'success' ? onClose : undefined}
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
          background: '#0a1a15',
          border: `2px solid ${claimState === 'success' ? GREEN : claimState === 'error' ? EMBER : REWARDS_ACCENT}`,
          padding: 28, maxWidth: 400, width: '90%',
          boxShadow: `0 0 40px rgba(78,205,196,0.2)`,
        }}
      >
        {/* Success state */}
        {claimState === 'success' && (
          <>
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ ...fv, fontSize: 48, color: GREEN, marginBottom: 12 }}>+{reward.amount} Ξ</div>
              <div style={{ ...fp, fontSize: 10, color: GREEN, letterSpacing: 2, marginBottom: 8 }}>CLAIMED!</div>
              <div style={{ ...fv, fontSize: 20, color: 'rgba(255,255,255,0.4)' }}>{reward.name}</div>
            </div>
            <button
              onClick={onClose}
              style={{
                width: '100%', padding: '12px 0', marginTop: 16,
                ...fp, fontSize: 8, letterSpacing: 1,
                color: INK, background: `linear-gradient(135deg,${GOLD_DK},${GOLD})`,
                border: `1px solid ${GOLD}`, cursor: 'pointer',
              }}
            >DONE</button>
          </>
        )}

        {/* Error state */}
        {claimState === 'error' && (
          <>
            <div style={{ ...fp, fontSize: 10, color: EMBER, letterSpacing: 2, marginBottom: 16 }}>CLAIM FAILED</div>
            <div style={{ background: 'rgba(204,51,34,0.08)', border: `1px solid ${EMBER}33`, padding: 16, marginBottom: 16 }}>
              <div style={{ ...fv, fontSize: 18, color: 'rgba(255,255,255,0.5)', wordBreak: 'break-word' }}>{errorMsg}</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1, padding: '12px 0',
                  ...fp, fontSize: 8, letterSpacing: 1,
                  color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                }}
              >CLOSE</button>
              <button
                onClick={handleClaim}
                style={{
                  flex: 1, padding: '12px 0',
                  ...fp, fontSize: 8, letterSpacing: 1,
                  color: INK, background: `linear-gradient(135deg,${GOLD_DK},${GOLD})`,
                  border: `1px solid ${GOLD}`, cursor: 'pointer',
                }}
              >RETRY</button>
            </div>
          </>
        )}

        {/* Idle + confirming + pending states */}
        {(claimState === 'idle' || claimState === 'confirming' || claimState === 'pending') && (
          <>
            <div style={{ ...fp, fontSize: 10, color: REWARDS_ACCENT, letterSpacing: 2, marginBottom: 16 }}>CLAIM REWARD</div>

            <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(78,205,196,0.1)', padding: 16, marginBottom: 16 }}>
              <div style={{ ...fp, fontSize: 7, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, marginBottom: 6 }}>REWARD</div>
              <div style={{ ...fv, fontSize: 24, color: CREAM }}>{reward.name}</div>
              {reward.amount > 0 && (
                <>
                  <div style={{ ...fp, fontSize: 7, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, marginBottom: 4, marginTop: 12 }}>AMOUNT</div>
                  <div style={{ ...fv, fontSize: 28, color: REWARDS_ACCENT, textShadow: '0 0 12px rgba(78,205,196,0.3)' }}>{reward.amount.toFixed(4)} Ξ</div>
                </>
              )}
              <div style={{ ...fp, fontSize: 7, color: 'rgba(255,255,255,0.25)', marginTop: 10 }}>EST. GAS: ~0.0001 Ξ</div>
            </div>

            {isActive && (
              <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
                <div style={{ ...fp, fontSize: 7, color: REWARDS_ACCENT, letterSpacing: 1, animation: 'progressPulse 1.5s infinite' }}>
                  {claimState === 'confirming' ? 'CONFIRM IN WALLET...' : 'TRANSACTION PENDING...'}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={onClose}
                disabled={isActive}
                style={{
                  flex: 1, padding: '12px 0',
                  ...fp, fontSize: 8, letterSpacing: 1,
                  color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: isActive ? 'default' : 'pointer',
                  opacity: isActive ? 0.4 : 1,
                }}
              >CANCEL</button>
              <button
                onClick={handleClaim}
                disabled={isActive}
                style={{
                  flex: 1, padding: '12px 0',
                  ...fp, fontSize: 8, letterSpacing: 1,
                  color: INK, background: `linear-gradient(135deg,${GOLD_DK},${GOLD})`,
                  border: `1px solid ${GOLD}`,
                  cursor: isActive ? 'default' : 'pointer',
                  opacity: isActive ? 0.6 : 1,
                }}
              >{isActive ? 'CLAIMING...' : 'CONFIRM CLAIM'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
