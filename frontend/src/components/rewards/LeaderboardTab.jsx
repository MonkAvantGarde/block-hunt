// LeaderboardTab.jsx — Podium (prizes with glowing text) + yesterday's winners + top 10 table
import { useState, useEffect, useMemo } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { formatEther } from 'viem'
import { CONTRACTS } from '../../config/wagmi'
import { COUNTDOWN_ABI } from '../../abis'

const fp = { fontFamily: "'Press Start 2P', monospace" }
const fv = { fontFamily: "'VT323', monospace" }

const CHAIN_ID = 84532

const LEADERBOARD_CSS = `
  @keyframes goldGlow { 0%,100% { text-shadow: 0 0 12px rgba(240,216,104,0.6), 0 0 35px rgba(240,216,104,0.25); } 50% { text-shadow: 0 0 24px rgba(240,216,104,0.9), 0 0 60px rgba(240,216,104,0.45), 0 0 90px rgba(240,216,104,0.2); } }
  @keyframes silverGlow { 0%,100% { text-shadow: 0 0 10px rgba(200,200,220,0.45), 0 0 25px rgba(200,200,220,0.2); } 50% { text-shadow: 0 0 18px rgba(200,200,220,0.65), 0 0 45px rgba(200,200,220,0.3); } }
  @keyframes bronzeGlow { 0%,100% { text-shadow: 0 0 10px rgba(220,140,70,0.45), 0 0 25px rgba(220,140,70,0.2); } 50% { text-shadow: 0 0 16px rgba(220,140,70,0.65), 0 0 40px rgba(220,140,70,0.3); } }
`

function useCountdown() {
  const [timeLeft, setTimeLeft] = useState('')
  useEffect(() => {
    function calc() {
      const now = new Date()
      const utcMidnight = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0
      ))
      const diff = utcMidnight - now
      if (diff <= 0) return '00:00:00'
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    setTimeLeft(calc())
    const t = setInterval(() => setTimeLeft(calc()), 1000)
    return () => clearInterval(t)
  }, [])
  return timeLeft
}

function shortAddr(addr) {
  if (!addr) return '---'
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export default function LeaderboardTab({ leaderboardAmounts }) {
  const countdown = useCountdown()
  const { address } = useAccount()

  const prizes = leaderboardAmounts.map(a => Number(formatEther(a)))

  // ── Read top 10 players from Countdown contract ──
  const { data: playersData, isLoading } = useReadContract({
    address: CONTRACTS.COUNTDOWN,
    abi: COUNTDOWN_ABI,
    chainId: CHAIN_ID,
    functionName: 'getPlayers',
    args: [0n, 10n],
    query: { refetchOnMount: true, staleTime: Infinity },
  })

  // ── Build sorted entries from on-chain data ──
  const entries = useMemo(() => {
    if (!playersData) return []
    const [addrs, scores] = playersData
    const combined = addrs.map((addr, i) => ({
      addr,
      score: Number(scores[i]),
    }))
    // Sort descending by score
    combined.sort((a, b) => b.score - a.score)
    // Assign ranks and mark connected wallet
    return combined.map((entry, i) => ({
      ...entry,
      rank: i + 1,
      isYou: address && entry.addr.toLowerCase() === address.toLowerCase(),
    }))
  }, [playersData, address])

  const thirdScore = entries[2]?.score || 0

  // Yesterday's winners placeholder — no on-chain source for historical daily data yet
  const yesterdayWinners = [
    { addr: entries[0]?.addr, prize: prizes[0] || 0.005 },
    { addr: entries[1]?.addr, prize: prizes[1] || 0.003 },
    { addr: entries[2]?.addr, prize: prizes[2] || 0.001 },
  ]

  // Connected wallet gap to #3
  const myEntry = entries.find(e => e.isYou)

  // Podium config
  const podiumConfig = [
    {
      place: 'second', rank: '#2', prize: prizes[1] || 0.003,
      prizeStyle: { ...fv, fontSize: 30, color: '#d0d0e0', animation: 'silverGlow 2.5s ease-in-out infinite', marginBottom: 10, letterSpacing: 1 },
      blockStyle: {
        width: '100%', height: 68, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center',
        border: '1px solid rgba(200,200,220,0.25)',
        background: 'linear-gradient(180deg, rgba(200,200,220,0.1) 0%, rgba(200,200,220,0.03) 100%)',
      },
      rankStyle: { ...fp, fontSize: 13, color: '#b8b8c8' },
    },
    {
      place: 'first', rank: '#1', prize: prizes[0] || 0.005,
      prizeStyle: { ...fv, fontSize: 36, color: '#f0d868', animation: 'goldGlow 2.5s ease-in-out infinite', marginBottom: 10, letterSpacing: 1 },
      blockStyle: {
        width: '100%', height: 95, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center',
        border: '1px solid rgba(240,216,104,0.35)',
        background: 'linear-gradient(180deg, rgba(240,216,104,0.14) 0%, rgba(240,216,104,0.04) 100%)',
      },
      rankStyle: { ...fp, fontSize: 16, color: '#f0d868' },
    },
    {
      place: 'third', rank: '#3', prize: prizes[2] || 0.001,
      prizeStyle: { ...fv, fontSize: 26, color: '#e0a060', animation: 'bronzeGlow 2.5s ease-in-out infinite', marginBottom: 10, letterSpacing: 1 },
      blockStyle: {
        width: '100%', height: 48, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center',
        border: '1px solid rgba(220,140,70,0.25)',
        background: 'linear-gradient(180deg, rgba(220,140,70,0.1) 0%, rgba(220,140,70,0.03) 100%)',
      },
      rankStyle: { ...fp, fontSize: 11, color: '#d09050' },
    },
  ]

  return (
    <div style={{
      background: '#0e2a1a',
      border: '1px solid rgba(200,168,75,0.18)',
      padding: 24,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <style>{LEADERBOARD_CSS}</style>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, transparent, rgba(200,168,75,0.35), transparent)',
      }} />

      <div style={{ ...fp, fontSize: 10, color: '#e0c060', letterSpacing: 2, marginBottom: 16 }}>
        DAILY TOP 3
      </div>

      {/* Timer row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <div style={{
          ...fp, fontSize: 9, color: '#ff8844',
          textShadow: '0 0 8px rgba(255,102,34,0.35)',
        }}>
          RESETS IN {countdown}
        </div>
      </div>

      {/* Podium */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 10,
        height: 170,
      }}>
        {podiumConfig.map((p, i) => (
          <div key={p.place} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            flex: 1, maxWidth: 170,
          }}>
            <div style={p.prizeStyle}>{p.prize.toFixed(3)} ETH</div>
            <div style={p.blockStyle}>
              <div style={p.rankStyle}>{p.rank}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Yesterday's winners */}
      <div style={{
        textAlign: 'center', ...fv, fontSize: 20,
        color: 'rgba(240,234,214,0.55)',
        marginBottom: 20, paddingBottom: 16,
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        Yesterday: {yesterdayWinners.map((w, i) => (
          <span key={i}>
            {i > 0 && ' \u00B7 '}
            <strong style={{ color: 'rgba(240,234,214,0.65)' }}>{shortAddr(w.addr)}</strong>
            {' '}{w.prize.toFixed(3)}
          </span>
        ))}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div style={{ ...fp, fontSize: 8, color: 'rgba(240,234,214,0.55)', textAlign: 'center', padding: 20 }}>
          Loading leaderboard...
        </div>
      )}

      {/* Empty state */}
      {!isLoading && entries.length === 0 && (
        <div style={{ ...fp, fontSize: 8, color: 'rgba(240,234,214,0.55)', textAlign: 'center', padding: 20 }}>
          No players yet this season
        </div>
      )}

      {/* Top 10 table */}
      {entries.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['RANK', 'PLAYER', 'SCORE', 'TO TOP 3'].map((h, i) => (
                <th key={h} style={{
                  ...fp, fontSize: 7, color: 'rgba(240,234,214,0.55)',
                  textAlign: i === 3 ? 'right' : 'left',
                  padding: 10,
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                  letterSpacing: 1,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const isTop3 = entry.rank <= 3
              const isYou = entry.isYou
              const gap = entry.rank <= 3 ? '---' : `+${(thirdScore - entry.score).toLocaleString()}`

              return (
                <tr key={entry.rank} style={{
                  background: isYou ? 'rgba(110,224,216,0.08)' : 'transparent',
                }}>
                  <td style={{
                    ...fp, fontSize: 9, width: 36, padding: '11px 10px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    color: isYou ? '#6ee0d8' : isTop3 ? 'rgba(240,216,104,0.8)' : 'rgba(240,234,214,0.55)',
                  }}>#{entry.rank}</td>
                  <td style={{
                    ...fv, fontSize: 22, padding: '11px 10px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    color: isYou ? '#6ee0d8' : isTop3 ? 'rgba(240,216,104,0.8)' : 'rgba(240,234,214,0.75)',
                    fontWeight: isYou ? 'bold' : 'normal',
                  }}>{isYou ? 'YOU' : shortAddr(entry.addr)}</td>
                  <td style={{
                    ...fv, fontSize: 22, textAlign: 'right', padding: '11px 10px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    color: isYou ? '#6ee0d8' : isTop3 ? 'rgba(240,216,104,0.8)' : 'rgba(240,234,214,0.65)',
                  }}>{entry.score.toLocaleString()}</td>
                  <td style={{
                    ...fp, fontSize: 8, textAlign: 'right', padding: '11px 10px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    color: isYou ? '#6ee0d8' : '#ff8844',
                  }}>{gap}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* Connected wallet gap to #3 */}
      {myEntry && myEntry.rank > 3 && (
        <div style={{
          ...fp, fontSize: 8, color: '#6ee0d8', textAlign: 'center',
          marginTop: 12, padding: '8px 0',
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}>
          YOUR GAP TO TOP 3: +{(thirdScore - myEntry.score).toLocaleString()} pts
        </div>
      )}
    </div>
  )
}
