content = open('frontend/src/screens/Game.jsx').read()

NEW_PANEL = '''function PendingMintItem({ item, onDelivered }) {
  const [elapsed, setElapsed] = useState(Math.floor((Date.now() - item.startTime) / 1000))
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [])
  function fmt(s) {
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60
    return h > 0
      ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`
      : `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`
  }
  const isDelivered = item.status === "delivered"
  const isTimeout = elapsed > 3600
  return (
    <div style={{
      display:"flex", alignItems:"center", justifyContent:"space-between",
      background: isDelivered ? "rgba(110,255,138,0.06)" : "rgba(0,0,0,0.3)",
      border: `1px solid ${isDelivered ? "rgba(110,255,138,0.2)" : "rgba(255,255,255,0.08)"}`,
      padding:"6px 10px", gap:8,
    }}>
      <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:6,
        color: isDelivered ? "#6eff8a" : isTimeout ? "#ff6666" : "#ffcc33",
        minWidth:8,
      }}>
        {isDelivered ? "✓" : isTimeout ? "!" : "◌"}
      </span>
      <span style={{ fontFamily:"'Courier Prime', monospace", fontSize:10, color:"rgba(255,255,255,0.35)", flex:1 }}>
        {item.txHash ? item.txHash.slice(0,8)+"…"+item.txHash.slice(-4) : "—"}
      </span>
      <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:6, color:"rgba(255,255,255,0.4)" }}>
        x{item.qty}
      </span>
      <span style={{ fontFamily:"'VT323', monospace", fontSize:18,
        color: isDelivered ? "#6eff8a" : isTimeout ? "#ff6666" : "rgba(255,255,255,0.5)",
        minWidth:44, textAlign:"right",
      }}>
        {isDelivered ? "DONE" : fmt(elapsed)}
      </span>
      {isDelivered && (
        <button onClick={() => onDelivered(item.id)} style={{
          background:"none", border:"none", color:"rgba(255,255,255,0.3)",
          cursor:"pointer", fontFamily:"'Press Start 2P', monospace", fontSize:6, padding:"0 4px",
        }}>x</button>
      )}
    </div>
  )
}

const STORAGE_KEY = "blockhunt_pending_mints"
function loadPending() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") } catch { return [] }
}
function savePending(items) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) } catch {}
}

function VRFMintPanel({ onMint, windowOpen, windowInfo, slots, treasury, address, refetchAll, blocks }) {
  const [qty, setQty] = useState(10)
  const [pendingMints, setPendingMints] = useState(() => loadPending())
  const [, setTick] = useState(0)
  const prevBlocksRef = useRef(null)
  const pollRef = useRef(null)

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const hasPending = pendingMints.some(m => m.status === "pending")
    if (!hasPending) return
    const t7 = blocks ? (blocks[7] || 0) : 0
    if (prevBlocksRef.current !== null && t7 > prevBlocksRef.current) {
      setPendingMints(prev => {
        const next = [...prev]
        const idx = next.findIndex(m => m.status === "pending")
        if (idx !== -1) next[idx] = { ...next[idx], status: "delivered" }
        savePending(next)
        return next
      })
      setTimeout(() => onMint(), 500)
    }
    prevBlocksRef.current = t7
  }, [blocks])

  useEffect(() => {
    const hasPending = pendingMints.some(m => m.status === "pending")
    if (hasPending) {
      if (!pollRef.current) {
        pollRef.current = setInterval(() => refetchAll(), 3000)
      }
    } else {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [pendingMints])

  useEffect(() => () => { clearInterval(pollRef.current) }, [])

  const { writeContract: writeMint } = useWriteContract()
  const total = (qty * 0.00025).toFixed(5)

  function doMint() {
    if (!windowOpen) return
    prevBlocksRef.current = blocks ? (blocks[7] || 0) : 0
    writeMint({
      address: CONTRACTS.TOKEN,
      abi: TOKEN_ABI,
      functionName: "mint",
      args: [BigInt(qty)],
      value: parseEther((qty * 0.00025).toFixed(18)),
    }, {
      onSuccess: (hash) => {
        const item = { id: Date.now().toString(), txHash: hash, qty, startTime: Date.now(), status: "pending" }
        setPendingMints(prev => {
          const next = [...prev, item]
          savePending(next)
          return next
        })
      },
    })
  }

  function dismissItem(id) {
    setPendingMints(prev => {
      const next = prev.filter(m => m.id !== id)
      savePending(next)
      return next
    })
  }

  const now = Math.floor(Date.now() / 1000)
  let timerLabel = "— : — : —"
  let timerSub = ""
  if (windowInfo) {
    if (windowInfo.isOpen && windowInfo.closeAt) {
      const secs = Math.max(0, Number(windowInfo.closeAt) - now)
      const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60
      timerLabel = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
      timerSub = "WINDOW CLOSES"
    } else if (!windowInfo.isOpen && windowInfo.openAt) {
      const secs = Math.max(0, Number(windowInfo.openAt) - now)
      const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60
      timerLabel = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
      timerSub = "NEXT WINDOW OPENS"
    }
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10, height:"100%" }}>
      {pendingMints.length > 0 && (
        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
          <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:5.5, color:"rgba(255,255,255,0.3)", marginBottom:2 }}>
            IN-FLIGHT MINTS
          </div>
          {pendingMints.map(item => (
            <PendingMintItem key={item.id} item={item} onDelivered={dismissItem} />
          ))}
        </div>
      )}
      <div style={{
        display:"flex", justifyContent:"space-between", alignItems:"center",
        background: windowOpen ? "rgba(110,255,138,0.08)" : "rgba(255,80,80,0.08)",
        border: `1px solid ${windowOpen ? "#6eff8a44" : "#ff505044"}`,
        padding:"6px 10px",
      }}>
        <span style={{
          fontFamily:"'Press Start 2P', monospace", fontSize:6,
          color: windowOpen ? "#6eff8a" : "#ff8888",
          animation: windowOpen ? "badgePulse 2s infinite" : "none",
        }}>
          {windowOpen ? "● WINDOW OPEN" : "○ WINDOW CLOSED"}
        </span>
        <span style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:"rgba(255,255,255,0.4)" }}>
          {timerLabel !== "— : — : —" ? (windowOpen ? `closes in ${timerLabel}` : `opens in ${timerLabel}`) : ""}
        </span>
      </div>
      <div style={{ display:"flex", gap:6 }}>
        <StatBox label="BATCH" value={windowInfo ? `${windowInfo.day ?? 1} / 6` : "— / 6"} />
        <StatBox label="PRICE" value="0.00025Ξ" />
        <StatBox label="SLOTS" value={slots.toLocaleString()} accent={slots < 5000 ? "#ff6644" : undefined} />
      </div>
      <div style={{ fontFamily:"'VT323', monospace", fontSize:44, letterSpacing:4, color:CREAM, textAlign:"center", lineHeight:1 }}>
        {timerLabel}
      </div>
      <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:5.5, color:"rgba(255,255,255,0.3)", textAlign:"center", letterSpacing:1 }}>
        {timerSub}
      </div>
      <div style={{ display:"flex", gap:0, alignItems:"stretch", border:"2px solid rgba(255,255,255,0.12)" }}>
        {[-100,-10,-1].map(d => (
          <button key={d} onClick={() => setQty(q => Math.max(1, q+d))} style={{
            width:36, background:"rgba(0,0,0,0.4)",
            border:"none", borderRight:"1px solid rgba(255,255,255,0.1)",
            color:"rgba(255,255,255,0.6)", fontFamily:"'Press Start 2P', monospace", fontSize:7, cursor:"pointer",
          }}>{d < -9 ? d : d < 0 ? " "+d : "+"+d}</button>
        ))}
        <div style={{
          flex:1, display:"flex", alignItems:"center", justifyContent:"center",
          fontFamily:"'VT323', monospace", fontSize:36, color:CREAM, background:"rgba(0,0,0,0.2)",
        }}>{qty}</div>
        {[1,10,100].map(d => (
          <button key={d} onClick={() => setQty(q => Math.min(500, q+d))} style={{
            width:36, background:"rgba(0,0,0,0.4)",
            border:"none", borderLeft:"1px solid rgba(255,255,255,0.1)",
            color:"rgba(255,255,255,0.6)", fontFamily:"'Press Start 2P', monospace", fontSize:7, cursor:"pointer",
          }}>+{d}</button>
        ))}
      </div>
      <div style={{
        fontFamily:"'Press Start 2P', monospace", fontSize:8, color:"#6eff8a", textAlign:"center",
        padding:"6px 0",
        borderTop:"1px solid rgba(255,255,255,0.06)", borderBottom:"1px solid rgba(255,255,255,0.06)",
      }}>
        TOTAL: {total} ETH
      </div>
      <Btn onClick={doMint} disabled={!windowOpen}>
        {windowOpen ? "▶  MINT NOW" : "✕  WINDOW CLOSED"}
      </Btn>
      <div style={{
        marginTop:"auto", background:"rgba(0,0,0,0.35)", border:"1px solid rgba(255,255,255,0.06)",
        padding:"8px 12px", display:"flex", justifyContent:"space-between", alignItems:"baseline",
      }}>
        <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:6, color:"rgba(255,255,255,0.35)" }}>TREASURY</span>
        <span style={{ fontFamily:"'VT323', monospace", fontSize:28, color:"#6eff8a" }}>Ξ {treasury}</span>
      </div>
    </div>
  )
}
'''

start_marker = 'function VRFMintPanel('
end_marker = '\n// FORGE PANEL\n'

start_idx = content.index(start_marker)
end_idx = content.index(end_marker)

content = content[:start_idx] + NEW_PANEL + '\n' + content[end_idx:]
open('frontend/src/screens/Game.jsx', 'w').write(content)
print('Done — lines:', content.count('\n'))
