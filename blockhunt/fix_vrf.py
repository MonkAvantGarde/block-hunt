content = open('frontend/src/screens/Game.jsx').read()

# 1. Add blocks to VRFMintPanel props
content = content.replace(
    'function VRFMintPanel({ onMint, windowOpen, windowInfo, slots, treasury, address, refetchAll })',
    'function VRFMintPanel({ onMint, windowOpen, windowInfo, slots, treasury, address, refetchAll, blocks })'
)

# 2. Add prevT7Ref after setVrf line
content = content.replace(
    '  function setVrf(s) { vrfStateRef.current = s; setVrfState(s); }',
    '  function setVrf(s) { vrfStateRef.current = s; setVrfState(s); }\n  const prevT7Ref = useRef(null)'
)

# 3. Add useEffect to watch T7 increase
content = content.replace(
    '  const prevT7Ref = useRef(null)',
    '''  const prevT7Ref = useRef(null)
  useEffect(() => {
    if (vrfStateRef.current !== VRF.PENDING && vrfStateRef.current !== VRF.DELAYED) return
    const t7 = blocks ? (blocks[7] || 0) : 0
    if (prevT7Ref.current !== null && t7 > prevT7Ref.current) {
      stopClock()
      clearTimeout(autoRef.current)
      setDelivered({ qty, alloc: t7 - prevT7Ref.current, results: [] })
      setVrf(VRF.DELIVERED)
      setTimeout(() => onMint(), 500)
    }
    prevT7Ref.current = t7
  }, [blocks])'''
)

# 4. Store T7 count when mint starts
content = content.replace(
    "  function doMint() {\n    if (!windowOpen || vrfState !== VRF.IDLE) return\n    setReqId('awaiting wallet\u2026')",
    "  function doMint() {\n    if (!windowOpen || vrfState !== VRF.IDLE) return\n    prevT7Ref.current = blocks ? (blocks[7] || 0) : 0\n    setReqId('awaiting wallet\u2026')"
)

# 5. Pass blocks to VRFMintPanel at call site
content = content.replace(
    'onMint={handleMint} windowOpen={windowOpen} windowInfo={windowInfo} slots={slots} treasury={treasury} address={address} refetchAll={refetchAll} />',
    'onMint={handleMint} windowOpen={windowOpen} windowInfo={windowInfo} slots={slots} treasury={treasury} address={address} refetchAll={refetchAll} blocks={blocks} />'
)

open('frontend/src/screens/Game.jsx', 'w').write(content)
print('Done')
