// ─────────────────────────────────────────────────────────────────────────────
// useReferral.js — Referral link capture + on-chain linking
//
// Captures ?ref=<address> from the URL on first visit, persists in localStorage.
// Reads on-chain referrer to detect if already linked. Exposes linkReferrer()
// to call rewards.setReferrer(referrer) via the connected wallet.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useAccount, useReadContract, useWriteContract } from 'wagmi'
import { CONTRACTS } from '../config/wagmi'
import { REWARDS_ABI } from '../abis/index.js'

const CHAIN_ID = 84532
const STORAGE_KEY = 'blockhunt_referrer'
const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

export function useReferral() {
  const { address, isConnected } = useAccount()
  const [pendingReferrer, setPendingReferrer] = useState(null)

  // ── Capture ?ref= from URL or restore from localStorage ────────────────

  useEffect(() => {
    // Check URL first
    const params = new URLSearchParams(window.location.search)
    const refParam = params.get('ref')
    if (refParam && /^0x[0-9a-fA-F]{40}$/.test(refParam)) {
      localStorage.setItem(STORAGE_KEY, refParam)
      setPendingReferrer(refParam)
      return
    }

    // Fall back to localStorage
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && /^0x[0-9a-fA-F]{40}$/.test(stored)) {
      setPendingReferrer(stored)
    }
  }, [])

  // ── Read on-chain referrer ─────────────────────────────────────────────

  const { data: linkedReferrerRaw } = useReadContract({
    address: CONTRACTS.REWARDS,
    abi: REWARDS_ABI,
    chainId: CHAIN_ID,
    functionName: 'referrerOf',
    args: [address],
    query: { enabled: isConnected && !!address, refetchInterval: 15_000 },
  })

  const linkedReferrer = linkedReferrerRaw && linkedReferrerRaw !== ZERO_ADDR
    ? linkedReferrerRaw
    : null

  const isLinked = !!linkedReferrer

  // ── Write: setReferrer ─────────────────────────────────────────────────

  const { writeContract, isPending, isSuccess, error } = useWriteContract()

  function linkReferrer() {
    if (!pendingReferrer || isLinked || !isConnected) return
    writeContract({
      address: CONTRACTS.REWARDS,
      abi: REWARDS_ABI,
      chainId: CHAIN_ID,
      functionName: 'setReferrer',
      args: [pendingReferrer],
    })
  }

  return {
    pendingReferrer,
    isLinked,
    linkedReferrer,
    linkReferrer,
    isLinking: isPending,
    linkSuccess: isSuccess,
    linkError: error,
  }
}
