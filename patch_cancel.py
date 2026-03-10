content = open('frontend/src/screens/Game.jsx').read()

# Replace PendingMintItem with version that watches receipt, extracts requestId, and has cancel button
OLD = '''function PendingMintItem({ item, onDelivered }) {
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
}'''

NEW = '''function PendingMintItem({ item, onDelivered, onRequestId }) {
  const [elapsed, setElapsed] = useState(Math.floor((Date.now() - item.startTime) / 1000))
  const [cancelling, setCancelling] = useState(false)

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

  // Watch receipt to extract requestId
  const { data: receipt } = useWaitForTransactionReceipt({
    hash: item.txHash,
    query: { enabled: !!item.txHash && !item.requestId },
  })
  useEffect(() => {
    if (!receipt || item.requestId) return
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: TOKEN_ABI, data: log.data, topics: log.topics })
        if (decoded.eventName === "MintRequested") {
          onRequestId(item.id, decoded.args.requestId.toString())
          break
        }
      } catch {}
    }
  }, [receipt])

  const { writeContract: writeCancel } = useWriteContract()

  function doCancel() {
    if (!item.requestId || cancelling) return
    setCancelling(true)
    writeCancel({
      address: CONTRACTS.TOKEN,
      abi: TOKEN_ABI,
      functionName: "cancelMintRequest",
      args: [BigInt(item.requestId)],
    }, {
      onSuccess: () => onDelivered(item.id),
      onError: () => setCancelling(false),
    })
  }

  const isDelivered = item.status === "delivered"
  const canCancel = !isDelivered && elapsed >= 3600 && !!item.requestId
  const cancelLabel = cancelling ? "…" : elapsed >= 3600 ? "CANCEL" : fmt(3600 - elapsed)

  return (
    <div style={{
      display:"flex", flexDirection:"column", gap:4,
      background: isDelivered ? "rgba(110,255,138,0.06)" : "rgba(0,0,0,0.3)",
      border: `1px solid ${isDelivered ? "rgba(110,255,138,0.2)" : canCancel ? "rgba(255,100,100,0.25)" : "rgba(255,255,255,0.08)"}`,
      padding:"6px 10px",
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:6,
          color: isDelivered ? "#6eff8a" : canCancel ? "#ff6666" : "#ffcc33",
          minWidth:8,
        }}>
          {isDelivered ? "✓" : canCancel ? "!" : "◌"}
        </span>
        <span style={{ fontFamily:"'Courier Prime', monospace", fontSize:10, color:"rgba(255,255,255,0.35)", flex:1 }}>
          {item.txHash ? item.txHash.slice(0,8)+"…"+item.txHash.slice(-4) : "—"}
        </span>
        <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:6, color:"rgba(255,255,255,0.4)" }}>
          x{item.qty}
        </span>
        <span style={{ fontFamily:"'VT323', monospace", fontSize:18,
          color: isDelivered ? "#6eff8a" : canCancel ? "#ff6666" : "rgba(255,255,255,0.5)",
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
      {!isDelivered && (
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <button
            onClick={doCancel}
            disabled={!canCancel || cancelling}
            style={{
              flex:1,
              background: canCancel ? "rgba(255,80,80,0.12)" : "rgba(0,0,0,0.2)",
              border: `1px solid ${canCancel ? "rgba(255,80,80,0.35)" : "rgba(255,255,255,0.08)"}`,
              color: canCancel ? "#ff6666" : "rgba(255,255,255,0.2)",
              fontFamily:"'Press Start 2P', monospace", fontSize:5.5,
              padding:"4px 8px", cursor: canCancel ? "pointer" : "default",
            }}
          >
            {canCancel ? `✕ ${cancelLabel} — REFUND ETH` : `CANCEL IN ${cancelLabel}`}
          </button>
        </div>
      )}
    </div>
  )
}'''

content = content.replace(OLD, NEW)

# Update PendingMintItem usage to pass onRequestId
OLD2 = '''          {pendingMints.map(item => (
            <PendingMintItem key={item.id} item={item} onDelivered={dismissItem} />
          ))}'''

NEW2 = '''          {pendingMints.map(item => (
            <PendingMintItem key={item.id} item={item} onDelivered={dismissItem} onRequestId={storeRequestId} />
          ))}'''

content = content.replace(OLD2, NEW2)

# Add storeRequestId function after dismissItem
OLD3 = '''  function dismissItem(id) {
    setPendingMints(prev => {
      const next = prev.filter(m => m.id !== id)
      savePending(next)
      return next
    })
  }'''

NEW3 = '''  function dismissItem(id) {
    setPendingMints(prev => {
      const next = prev.filter(m => m.id !== id)
      savePending(next)
      return next
    })
  }

  function storeRequestId(id, requestId) {
    setPendingMints(prev => {
      const next = prev.map(m => m.id === id ? { ...m, requestId } : m)
      savePending(next)
      return next
    })
  }'''

content = content.replace(OLD3, NEW3)

open('frontend/src/screens/Game.jsx', 'w').write(content)
print('Done')
