// ─────────────────────────────────────────────────────────────────────────────
// WalletButton.jsx — Connect / disconnect wallet button
//
// Handles three states:
//   1. Not connected — shows "Connect Wallet" button
//   2. Wrong network — shows "Switch to Base Sepolia" warning
//   3. Connected — shows truncated address + disconnect option
//
// Drop this component into the header. It handles everything internally.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from 'wagmi'
import { baseSepolia } from 'wagmi/chains'

// Truncate 0x1234...5678 format for display
function truncateAddress(address) {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function WalletButton() {
  const { address, isConnected, chain } = useAccount()
  const { connectors, connect, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const [showMenu, setShowMenu] = useState(false)

  const isWrongNetwork = isConnected && chain?.id !== baseSepolia.id

  // ── WRONG NETWORK ──────────────────────────────────────────────────────────
  if (isWrongNetwork) {
    return (
      <button
        onClick={() => switchChain({ chainId: baseSepolia.id })}
        style={styles.wrongNetwork}
      >
        ⚠ Switch to Base Sepolia
      </button>
    )
  }

  // ── CONNECTED ─────────────────────────────────────────────────────────────
  if (isConnected) {
    return (
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowMenu(v => !v)}
          style={styles.connected}
        >
          ● {truncateAddress(address)}
        </button>

        {showMenu && (
          <div style={styles.menu}>
            <button
              onClick={() => { disconnect(); setShowMenu(false) }}
              style={styles.menuItem}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── NOT CONNECTED ─────────────────────────────────────────────────────────
  // Use the first available connector (MetaMask / injected wallet)
  const connector = connectors[0]

  return (
    <button
      onClick={() => connect({ connector })}
      disabled={isConnecting}
      style={styles.connect}
    >
      {isConnecting ? 'Connecting...' : 'Connect Wallet'}
    </button>
  )
}

// ── STYLES ────────────────────────────────────────────────────────────────────
// Matches the design system: wood background, pixel font, gold accent

const base = {
  fontFamily: "'Press Start 2P', monospace",
  fontSize: '9px',
  padding: '10px 16px',
  border: '2px solid #1a1208',
  cursor: 'pointer',
  letterSpacing: '1px',
}

const styles = {
  connect: {
    ...base,
    background: '#c8a84b',
    color: '#1a1208',
    boxShadow: '4px 4px 0 #1a1208',
  },
  connected: {
    ...base,
    background: 'rgba(110,255,138,0.12)',
    color: '#6eff8a',
    border: '2px solid #6eff8a',
    boxShadow: 'none',
  },
  wrongNetwork: {
    ...base,
    background: '#cc3322',
    color: '#f0ead6',
    boxShadow: '4px 4px 0 #1a1208',
    animation: 'pulse 2s infinite',
  },
  menu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '4px',
    background: '#2c1810',
    border: '2px solid #1a1208',
    boxShadow: '4px 4px 0 #1a1208',
    zIndex: 100,
    minWidth: '140px',
  },
  menuItem: {
    ...base,
    display: 'block',
    width: '100%',
    background: 'transparent',
    color: '#f0ead6',
    border: 'none',
    boxShadow: 'none',
    textAlign: 'left',
    padding: '12px 14px',
  },
}
