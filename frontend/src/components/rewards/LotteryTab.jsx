// LotteryTab.jsx — Daily Lottery: prize amount + countdown + yesterday's winner
import { useState, useEffect } from 'react'
import { formatEther } from 'viem'

const fp = { fontFamily: "'Press Start 2P', monospace" }
const fv = { fontFamily: "'VT323', monospace" }

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
  if (!addr || addr === '0x0000000000000000000000000000000000000000') return null
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export default function LotteryTab({ lottery }) {
  const countdown = useCountdown()

  const prize = lottery?.prize || 0
  const yesterdayWinner = lottery?.yesterdayWinner || null
  const yesterdayPrize = lottery?.prize || 0

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
        DAILY LOTTERY
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <div style={{ ...fv, fontSize: 38, color: '#6ee0d8' }}>
            {prize > 0 ? `${prize.toFixed(3)} ETH` : '--- ETH'}
          </div>
          <div style={{ ...fv, fontSize: 22, color: 'rgba(240,234,214,0.6)', marginTop: 12 }}>
            {yesterdayWinner
              ? `Yesterday: ${yesterdayWinner} won ${yesterdayPrize.toFixed(3)} ETH`
              : 'No winner yesterday'}
          </div>
        </div>
        <div style={{
          ...fp, fontSize: 11, color: '#6ee0d8',
          textShadow: '0 0 10px rgba(78,205,196,0.35)',
        }}>
          {countdown}
        </div>
      </div>
    </div>
  )
}
