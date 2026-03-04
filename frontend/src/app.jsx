// ─────────────────────────────────────────────────────────────────────────────
// App.jsx — Root component. Skeleton only for now.
//
// This is a temporary scaffold so you can verify wallet connection is working
// before building out the full game screen.
//
// What you should see when this runs:
//   - The header with "BLOKhunt" logo and Connect Wallet button
//   - After connecting: your address appears, treasury balance shown
//   - Your block balances for each tier (all zeros until you've minted)
//   - Mint window status (open or closed)
// ─────────────────────────────────────────────────────────────────────────────

import { WalletButton } from './components/WalletButton'
import { useGameState } from './hooks/useGameState'
import { TIER_NAMES, TIER_COLORS, TIER_SYMBOLS } from './config/wagmi'

export default function App() {
  const {
    address,
    isConnected,
    balances,
    tiersHeld,
    windowInfo,
    countdownInfo,
    treasuryBalance,
    isLoading,
    refetchAll,
  } = useGameState()

  return (
    <div style={styles.root}>

      {/* ── HEADER ── */}
      <header style={styles.header}>
        <div style={styles.logo}>
          BLOK<span style={{ color: '#f0ead6' }}>hunt</span>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.treasuryPill}>
            ⬡ {treasuryBalance} ETH
          </div>
          <WalletButton />
        </div>
      </header>

      {/* ── MAIN ── */}
      <main style={styles.main}>

        {/* Wallet not connected */}
        {!isConnected && (
          <div style={styles.connectPrompt}>
            <div style={styles.connectTitle}>Connect your wallet to play</div>
            <div style={styles.connectSub}>Base Sepolia testnet</div>
          </div>
        )}

        {/* Connected — show live state */}
        {isConnected && (
          <>
            {/* Mint window status */}
            <div style={styles.section}>
              <div style={styles.sectionLabel}>Mint Window</div>
              {isLoading || !windowInfo ? (
                <div style={styles.loading}>Loading...</div>
              ) : (
                <div style={styles.windowStatus}>
                  <span style={{
                    ...styles.windowBadge,
                    color: windowInfo.isOpen ? '#6eff8a' : '#cc3322',
                    borderColor: windowInfo.isOpen ? '#6eff8a' : '#cc3322',
                    background: windowInfo.isOpen
                      ? 'rgba(110,255,138,0.08)'
                      : 'rgba(204,51,34,0.08)',
                  }}>
                    {windowInfo.isOpen ? '● WINDOW OPEN' : '○ WINDOW CLOSED'}
                  </span>
                  {windowInfo.isOpen && (
                    <span style={styles.windowSub}>
                      {windowInfo.remaining.toLocaleString()} slots remaining
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Player balances */}
            <div style={styles.section}>
              <div style={styles.sectionLabel}>
                Your Blocks — {tiersHeld}/6 tiers held
              </div>
              <div style={styles.tierGrid}>
                {[7, 6, 5, 4, 3, 2].map(tier => (
                  <div key={tier} style={{
                    ...styles.tierCard,
                    borderColor: TIER_COLORS[tier],
                    opacity: balances[tier] > 0 ? 1 : 0.4,
                  }}>
                    <div style={styles.tierSymbol}>{TIER_SYMBOLS[tier]}</div>
                    <div style={{ ...styles.tierNum, color: TIER_COLORS[tier] }}>
                      TIER {tier}
                    </div>
                    <div style={styles.tierName}>{TIER_NAMES[tier]}</div>
                    <div style={styles.tierBalance}>{balances[tier]}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Countdown status (only shown if active) */}
            {countdownInfo?.active && (
              <div style={styles.countdownBanner}>
                <div style={styles.countdownTitle}>⚠ COUNTDOWN ACTIVE</div>
                <div style={styles.countdownSub}>
                  Holder: {countdownInfo.holder?.slice(0, 6)}...{countdownInfo.holder?.slice(-4)}
                </div>
                <div style={styles.countdownTime}>
                  {formatTimeLeft(countdownInfo.timeLeft)}
                </div>
              </div>
            )}

            <button onClick={refetchAll} style={styles.refreshBtn}>
              ↻ Refresh
            </button>
          </>
        )}
      </main>
    </div>
  )
}

// Converts seconds → "6d 14h 32m" display format
function formatTimeLeft(seconds) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${d}d ${h}h ${m}m`
}

// ── STYLES ────────────────────────────────────────────────────────────────────

const styles = {
  root: {
    fontFamily: "'Press Start 2P', monospace",
    background: '#1e4d32',
    backgroundImage: `
      repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 4px),
      repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 4px)
    `,
    minHeight: '100vh',
    color: '#f0ead6',
  },
  header: {
    background: '#2c1810',
    border: '3px solid #1a1208',
    borderLeft: 'none',
    borderRight: 'none',
    borderTop: 'none',
    boxShadow: '0 4px 0 #1a1208',
    padding: '12px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    fontFamily: "'Press Start 2P', monospace",
    fontSize: '16px',
    color: '#c8a84b',
    textShadow: '2px 2px 0 #8a6820',
    letterSpacing: '2px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  treasuryPill: {
    fontFamily: "'Press Start 2P', monospace",
    fontSize: '9px',
    color: '#c8a84b',
    background: 'rgba(200,168,75,0.1)',
    border: '1px solid #8a6820',
    padding: '6px 12px',
    letterSpacing: '1px',
  },
  main: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '32px 24px',
  },
  connectPrompt: {
    textAlign: 'center',
    padding: '80px 0',
  },
  connectTitle: {
    fontSize: '14px',
    color: '#c8a84b',
    marginBottom: '12px',
  },
  connectSub: {
    fontSize: '8px',
    color: '#f0ead6',
    opacity: 0.4,
  },
  section: {
    marginBottom: '32px',
  },
  sectionLabel: {
    fontSize: '8px',
    color: '#c8a84b',
    letterSpacing: '2px',
    marginBottom: '12px',
    paddingBottom: '8px',
    borderBottom: '1px solid rgba(200,168,75,0.3)',
  },
  loading: {
    fontSize: '8px',
    color: '#f0ead6',
    opacity: 0.4,
  },
  windowStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  windowBadge: {
    fontFamily: "'Press Start 2P', monospace",
    fontSize: '8px',
    padding: '6px 10px',
    border: '1px solid',
    letterSpacing: '1px',
  },
  windowSub: {
    fontSize: '7px',
    color: '#f0ead6',
    opacity: 0.5,
  },
  tierGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
  },
  tierCard: {
    background: 'rgba(0,0,0,0.3)',
    border: '2px solid',
    padding: '16px 12px',
    textAlign: 'center',
  },
  tierSymbol: {
    fontSize: '24px',
    marginBottom: '8px',
  },
  tierNum: {
    fontSize: '6px',
    letterSpacing: '2px',
    marginBottom: '4px',
  },
  tierName: {
    fontSize: '7px',
    color: '#f0ead6',
    opacity: 0.6,
    marginBottom: '8px',
  },
  tierBalance: {
    fontFamily: "'VT323', monospace",
    fontSize: '36px',
    color: '#f0ead6',
    lineHeight: 1,
  },
  countdownBanner: {
    background: 'rgba(204,51,34,0.15)',
    border: '2px solid #cc3322',
    boxShadow: '4px 4px 0 #1a1208',
    padding: '20px',
    marginBottom: '24px',
    textAlign: 'center',
  },
  countdownTitle: {
    fontSize: '12px',
    color: '#cc3322',
    marginBottom: '8px',
  },
  countdownSub: {
    fontSize: '7px',
    color: '#f0ead6',
    opacity: 0.6,
    marginBottom: '8px',
  },
  countdownTime: {
    fontFamily: "'VT323', monospace",
    fontSize: '48px',
    color: '#f0ead6',
    lineHeight: 1,
  },
  refreshBtn: {
    fontFamily: "'Press Start 2P', monospace",
    fontSize: '8px',
    background: 'transparent',
    color: '#f0ead6',
    border: '2px solid rgba(240,234,214,0.2)',
    padding: '8px 14px',
    cursor: 'pointer',
    opacity: 0.5,
  },
}
