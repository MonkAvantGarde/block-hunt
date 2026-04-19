// ReferralTab.jsx — Referral link, stats, referee list with PENDING/CLAIM, manual referrer input
import { useState, useEffect, useMemo } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContracts } from 'wagmi'
import { formatEther } from 'viem'
import { CONTRACTS } from '../../config/wagmi'
import { REWARDS_ABI } from '../../abis'
import { useReferral } from '../../hooks/useReferral'

const fp = { fontFamily: "'Press Start 2P', monospace" }
const fv = { fontFamily: "'VT323', monospace" }
const CHAIN_ID = 84532
const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

function shortAddr(addr) {
  if (!addr || addr === ZERO_ADDR) return '---'
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export default function ReferralTab({ address, referralsActive, referralAmount, referralThreshold }) {
  const [copied, setCopied] = useState(false)
  const [manualAddr, setManualAddr] = useState('')
  const [claimingReferee, setClaimingReferee] = useState(null)

  const { pendingReferrer, isLinked, linkedReferrer, linkReferrer, isLinking } = useReferral()

  // Write contract for claiming referrals
  const { writeContract: claimWrite, data: claimTxHash, isPending: claimPending, error: claimError, reset: claimReset } = useWriteContract()
  const { isLoading: claimConfirming, isSuccess: claimSuccess } = useWaitForTransactionReceipt({ hash: claimTxHash })

  // Write contract for manual setReferrer
  const { writeContract: setRefWrite, data: setRefTxHash, isPending: setRefPending, error: setRefError } = useWriteContract()
  const { isLoading: setRefConfirming, isSuccess: setRefSuccess } = useWaitForTransactionReceipt({ hash: setRefTxHash })

  useEffect(() => {
    if (claimSuccess) {
      setTimeout(() => { setClaimingReferee(null); claimReset() }, 2000)
    }
  }, [claimSuccess])

  useEffect(() => {
    if (claimError) {
      setTimeout(() => { setClaimingReferee(null); claimReset() }, 3000)
    }
  }, [claimError])

  // Build referral link
  const refLink = address
    ? `${window.location.origin}/?ref=${address}`
    : ''

  function handleCopy() {
    if (!refLink) return
    navigator.clipboard.writeText(refLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleClaimReferral(refereeAddr) {
    setClaimingReferee(refereeAddr)
    claimWrite({
      address: CONTRACTS.REWARDS,
      abi: REWARDS_ABI,
      chainId: CHAIN_ID,
      functionName: 'claimReferral',
      args: [refereeAddr],
      gas: BigInt(300_000),
    })
  }

  function handleSetReferrer() {
    if (!manualAddr || !/^0x[0-9a-fA-F]{40}$/.test(manualAddr)) return
    setRefWrite({
      address: CONTRACTS.REWARDS,
      abi: REWARDS_ABI,
      chainId: CHAIN_ID,
      functionName: 'setReferrer',
      args: [manualAddr],
      gas: BigInt(300_000),
    })
  }

  const refAmountEth = referralAmount ? Number(formatEther(referralAmount)) : 0.002
  const thresholdNum = referralThreshold ? Number(referralThreshold) : 50

  // Fetch referees from subgraph
  const [referees, setReferees] = useState([])
  const [refereesLoading, setRefereesLoading] = useState(false)

  useEffect(() => {
    if (!address) return
    setRefereesLoading(true)
    const query = `{
      referralLinks(where: { referrer: "${address.toLowerCase()}" }, first: 50) {
        referee { id }
        linkedAt
      }
    }`
    fetch('https://api.studio.thegraph.com/query/1744131/blok-hunt/v2.0.1.', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
      .then(r => r.json())
      .then(data => {
        const links = data?.data?.referralLinks || []
        setReferees(links.map(l => l.referee.id))
        setRefereesLoading(false)
      })
      .catch(() => setRefereesLoading(false))
  }, [address])

  // Read on-chain status for each referee: totalMintedByPlayer, snapshotAmount, referralPaid
  const refereeContracts = useMemo(() => {
    if (!referees.length) return []
    const calls = []
    for (const ref of referees) {
      calls.push(
        { address: CONTRACTS.REWARDS, abi: REWARDS_ABI, chainId: CHAIN_ID, functionName: 'totalMintedByPlayer', args: [ref] },
        { address: CONTRACTS.REWARDS, abi: REWARDS_ABI, chainId: CHAIN_ID, functionName: 'snapshotAmount', args: [ref] },
        { address: CONTRACTS.REWARDS, abi: REWARDS_ABI, chainId: CHAIN_ID, functionName: 'referralPaid', args: [ref] },
      )
    }
    return calls
  }, [referees])

  const { data: refereeData } = useReadContracts({
    contracts: refereeContracts,
    query: { enabled: refereeContracts.length > 0, staleTime: Infinity, refetchOnMount: true },
  })

  const refereeList = useMemo(() => {
    if (!referees.length || !refereeData) return []
    return referees.map((addr, i) => {
      const minted = refereeData[i * 3]?.result != null ? Number(refereeData[i * 3].result) : 0
      const snapshot = refereeData[i * 3 + 1]?.result || BigInt(0)
      const paid = refereeData[i * 3 + 2]?.result || false
      const claimable = snapshot > BigInt(0) && !paid
      return { addr, minted, claimable, paid, snapshot }
    })
  }, [referees, refereeData])

  const activeCount = refereeList.length
  const claimableCount = refereeList.filter(r => r.claimable).length

  const isSettingRef = setRefPending || setRefConfirming

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
        REFER A FRIEND
      </div>

      {/* Copy link row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 16,
        background: 'rgba(0,0,0,0.35)',
        padding: '14px 16px',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{
          ...fv, fontSize: 22, color: '#6ee0d8',
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {refLink || 'Connect wallet to get link'}
        </div>
        <button
          onClick={handleCopy}
          disabled={!refLink}
          style={{
            ...fp, fontSize: 7,
            background: 'transparent',
            color: '#6ee0d8',
            border: '1px solid #6ee0d8',
            padding: '7px 12px',
            cursor: refLink ? 'pointer' : 'default',
            opacity: refLink ? 1 : 0.4,
          }}
        >{copied ? 'COPIED!' : 'COPY'}</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
        <div style={{ ...fv, fontSize: 22, color: 'rgba(240,234,214,0.7)' }}>
          Reward: <strong style={{ color: '#f0d868' }}>{refAmountEth} ETH</strong> per friend ({thresholdNum}+ blocks)
        </div>
        <div style={{ ...fv, fontSize: 22, color: 'rgba(240,234,214,0.7)' }}>
          Active: <strong style={{ color: '#f0d868' }}>{activeCount}</strong> {'\u00B7'} Claimable: <strong style={{ color: '#f0d868' }}>{claimableCount}</strong>
        </div>
      </div>

      {/* Referrer status */}
      {isLinked && linkedReferrer && linkedReferrer !== ZERO_ADDR && (
        <div style={{
          background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(110,224,216,0.15)',
          padding: '14px 16px', marginBottom: 16,
        }}>
          <div style={{ ...fp, fontSize: 7, color: '#6ee0d8', marginBottom: 8 }}>YOUR REFERRER</div>
          <div style={{ ...fv, fontSize: 22, color: 'rgba(240,234,214,0.75)' }}>{shortAddr(linkedReferrer)}</div>
        </div>
      )}

      {/* Referee list */}
      {refereesLoading && (
        <div style={{ ...fp, fontSize: 7, color: 'rgba(240,234,214,0.4)', textAlign: 'center', padding: '16px 0' }}>
          LOADING REFERRALS...
        </div>
      )}

      {!refereesLoading && refereeList.length === 0 && (
        <div style={{ ...fv, fontSize: 22, color: 'rgba(240,234,214,0.5)', textAlign: 'center', padding: '16px 0' }}>
          No referrals yet. Share your link to start earning!
        </div>
      )}

      {!refereesLoading && refereeList.length > 0 && (
        <div>
          {refereeList.map((ref, i) => {
            const isClaiming = claimingReferee === ref.addr && (claimPending || claimConfirming)
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '10px 0',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}>
                <div style={{ ...fv, fontSize: 22, color: 'rgba(240,234,214,0.75)', flex: 1 }}>
                  {shortAddr(ref.addr)}
                </div>
                <div style={{ ...fv, fontSize: 22, color: 'rgba(240,234,214,0.55)' }}>
                  {ref.minted} / {thresholdNum} blocks
                </div>
                {ref.paid ? (
                  <span style={{ ...fp, fontSize: 7, color: '#6ee0d8', border: '1px solid rgba(110,224,216,0.3)', padding: '5px 10px' }}>CLAIMED</span>
                ) : ref.claimable ? (
                  <button
                    onClick={() => handleClaimReferral(ref.addr)}
                    disabled={isClaiming}
                    style={{
                      ...fp, fontSize: 7,
                      background: '#e0c060', color: '#0a1a0f',
                      border: '2px solid #0a1a0f', padding: '7px 12px',
                      cursor: isClaiming ? 'default' : 'pointer',
                      boxShadow: '2px 2px 0 #0a1a0f',
                      opacity: isClaiming ? 0.6 : 1,
                    }}
                  >{isClaiming ? 'CLAIMING...' : `CLAIM ${refAmountEth} ETH`}</button>
                ) : (
                  <span style={{ ...fp, fontSize: 7, color: 'rgba(240,234,214,0.4)' }}>PENDING</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Manual referrer input — only show if not already linked */}
      {!isLinked && (
        <div style={{
          marginTop: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <input
            type="text"
            placeholder="Paste referrer wallet address (0x...)"
            value={manualAddr}
            onChange={e => setManualAddr(e.target.value)}
            style={{
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.18)',
              color: '#f0ead6',
              ...fv, fontSize: 22,
              padding: '12px 16px',
              flex: 1,
              outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = '#6ee0d8'; e.target.style.boxShadow = '0 0 10px rgba(110,224,216,0.2)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.18)'; e.target.style.boxShadow = 'none' }}
          />
          <button
            onClick={handleSetReferrer}
            disabled={isSettingRef || !/^0x[0-9a-fA-F]{40}$/.test(manualAddr)}
            style={{
              ...fp, fontSize: 7,
              background: '#6ee0d8',
              color: '#0a1a0f',
              border: '2px solid #0a1a0f',
              padding: '12px 18px',
              cursor: isSettingRef ? 'default' : 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '2px 2px 0 #0a1a0f',
              opacity: isSettingRef ? 0.6 : 1,
            }}
          >{isSettingRef ? 'LINKING...' : 'LINK REFERRER'}</button>
        </div>
      )}

      {/* Show linked referrer if already set */}
      {isLinked && (
        <div style={{ marginTop: 16, ...fv, fontSize: 20, color: 'rgba(240,234,214,0.5)' }}>
          Linked to referrer: <span style={{ color: '#6ee0d8' }}>{shortAddr(linkedReferrer)}</span>
        </div>
      )}

      {setRefSuccess && (
        <div style={{ marginTop: 8, ...fp, fontSize: 7, color: '#6ee0d8' }}>
          REFERRER LINKED SUCCESSFULLY
        </div>
      )}
      {setRefError && (
        <div style={{ marginTop: 8, ...fp, fontSize: 7, color: '#ff6666' }}>
          {setRefError.shortMessage || 'Failed to link referrer'}
        </div>
      )}
    </div>
  )
}
