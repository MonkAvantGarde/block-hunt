// ─────────────────────────────────────────────────────────────────────────────
// WalletButton.jsx — Connect / disconnect wallet button
//
// Handles three states:
//   1. Not connected — shows "▶ CONNECT" button with wallet picker
//   2. Wrong network — shows "Switch to Base Sepolia" warning
//   3. Connected — shows truncated address + dropdown (disconnect, BaseScan)
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from 'wagmi'
import { baseSepolia } from 'wagmi/chains'

import { WOOD, GOLD, GOLD_DK, INK, CREAM } from '../config/design-tokens'

function truncateAddress(address) {
  if (!address) return ''
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function WalletButton() {
  const { address, isConnected, chain } = useAccount()
  const { connectors, connect, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const [showMenu,   setShowMenu]   = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  const isWrongNetwork = isConnected && chain?.id !== baseSepolia.id

  const btnBase = {
    fontFamily: "'Press Start 2P', monospace",
    fontSize: 8,
    color: CREAM,
    background: 'rgba(200,168,75,0.1)',
    border: `2px solid ${GOLD_DK}`,
    boxShadow: `3px 3px 0 ${INK}`,
    padding: '7px 14px',
    letterSpacing: 1,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  }

  // ── WRONG NETWORK ──
  if (isWrongNetwork) {
    return (
      <button
        onClick={() => switchChain({ chainId: baseSepolia.id })}
        style={{ ...btnBase, background: '#cc3322', color: CREAM, border: `2px solid ${INK}` }}
      >
        ⚠ Switch Network
      </button>
    )
  }

  // ── CONNECTED ──
  if (isConnected) {
    return (
      <div style={{ position: 'relative' }}>
        <button onClick={() => setShowMenu(v => !v)} style={btnBase}>
          {truncateAddress(address)} ▾
        </button>

        {showMenu && (
          <>
            <div onClick={() => setShowMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 900 }} />
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0,
              zIndex: 901, background: WOOD,
              border: `2px solid ${GOLD}`,
              borderRadius: 4, overflow: 'hidden',
              minWidth: 160,
              boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
            }}>
              <button
                onClick={() => { disconnect(); setShowMenu(false) }}
                style={{
                  display: 'block', width: '100%', padding: '10px 16px',
                  background: 'transparent', border: 'none',
                  borderBottom: `1px solid rgba(200,168,75,0.2)`,
                  fontFamily: "'Press Start 2P', monospace", fontSize: 8,
                  color: CREAM, cursor: 'pointer', textAlign: 'left', letterSpacing: 1,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(200,168,75,0.12)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                Disconnect
              </button>
              <a
                href={`https://sepolia.basescan.org/address/${address}`}
                target="_blank" rel="noreferrer"
                onClick={() => setShowMenu(false)}
                style={{
                  display: 'block', padding: '10px 16px',
                  fontFamily: "'Press Start 2P', monospace", fontSize: 8,
                  color: 'rgba(240,234,214,0.45)', textDecoration: 'none',
                  textAlign: 'left', letterSpacing: 1,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(200,168,75,0.12)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                BaseScan ↗
              </a>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── NOT CONNECTED ──
  const seen = new Set()
  const uniqueConnectors = connectors.filter(c => {
    if (seen.has(c.name)) return false
    seen.add(c.name)
    return true
  })

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowPicker(v => !v)}
        disabled={isConnecting}
        style={{
          ...btnBase,
          background: 'linear-gradient(180deg,#ffcc44,#c8a800)',
          color: INK,
          border: '2px solid #8a6800',
          boxShadow: `3px 3px 0 ${INK}, 0 0 12px rgba(255,170,0,0.3)`,
        }}
      >
        {isConnecting ? '…' : '▶ CONNECT'}
      </button>

      {showPicker && (
        <>
          <div onClick={() => setShowPicker(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4,
            background: '#2c1810', border: '2px solid #8a6820',
            boxShadow: `4px 4px 0 ${INK}`, zIndex: 100, minWidth: 180,
          }}>
            <div style={{
              fontFamily: "'Press Start 2P', monospace", fontSize: 8,
              color: GOLD, opacity: 0.6, letterSpacing: 1,
              padding: '10px 14px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              SELECT WALLET
            </div>
            {uniqueConnectors.length === 0 && (
              <div style={{
                fontFamily: "'Press Start 2P', monospace", fontSize: 8,
                color: CREAM, opacity: 0.4, padding: '12px 14px',
              }}>
                No wallets detected
              </div>
            )}
            {uniqueConnectors.map(c => (
              <button
                key={c.id}
                onClick={() => { connect({ connector: c }); setShowPicker(false) }}
                style={{
                  fontFamily: "'Press Start 2P', monospace", fontSize: 8,
                  display: 'block', width: '100%', background: 'transparent',
                  color: CREAM, border: 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  textAlign: 'left', padding: '12px 14px',
                  cursor: 'pointer', letterSpacing: 0.5,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(200,168,75,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                {c.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
