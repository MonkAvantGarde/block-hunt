content = open('frontend/src/screens/Game.jsx').read()

# 1. Add ABI entries - find the closing bracket of TOKEN_ABI
# Look for the end of the ABI array
import re

# Find where TOKEN_ABI ends
abi_end = content.find('\n] // end TOKEN_ABI')
if abi_end == -1:
    abi_end = content.find('\n];\nconst FORGE_ABI')
    if abi_end == -1:
        # Try to find another anchor
        abi_end = content.find(']\nconst FORGE_ABI')

if abi_end == -1:
    print('WARNING: Could not find TOKEN_ABI end — printing context around FORGE_ABI')
    idx = content.find('FORGE_ABI')
    print(repr(content[idx-100:idx+20]))
else:
    # Check if already patched
    if 'pendingRequestsByPlayer' in content:
        print('ABI already has pendingRequestsByPlayer — skipping')
    else:
        insert = ''',
  { name: 'pendingRequestsByPlayer', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }] },
  { name: 'vrfMintRequests', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'requestId', type: 'uint256' }],
    outputs: [
      { name: 'player',      type: 'address' },
      { name: 'quantity',    type: 'uint256' },
      { name: 'amountPaid',  type: 'uint256' },
      { name: 'requestedAt', type: 'uint256' },
      { name: 'windowDay',   type: 'uint256' },
    ] }'''
        content = content[:abi_end] + insert + content[abi_end:]
        print('ABI patched at position', abi_end)

# 2. Add recovery effect — find reliable anchor
ANCHOR = 'useEffect(() => () => { clearInterval(pollRef.current) }, [])'
if ANCHOR not in content:
    print('WARNING: poll cleanup anchor not found')
else:
    if 'recoveryRan' in content:
        print('Recovery already present — skipping')
    else:
        RECOVERY = '''
  // On mount: recover open on-chain requests not tracked in localStorage
  const recoveryRan = useRef(false)
  useEffect(() => {
    if (!address || recoveryRan.current) return
    recoveryRan.current = true
    async function recover() {
      try {
        const { createPublicClient, http } = await import('viem')
        const { baseSepolia } = await import('viem/chains')
        const client = createPublicClient({ chain: baseSepolia, transport: http() })
        const requestIds = await client.readContract({
          address: CONTRACTS.TOKEN, abi: TOKEN_ABI,
          functionName: 'pendingRequestsByPlayer', args: [address],
        })
        if (!requestIds || requestIds.length === 0) return
        const existing = loadPending()
        const existingReqIds = new Set(existing.map(m => m.requestId).filter(Boolean))
        const toAdd = []
        for (const rid of requestIds) {
          const ridStr = rid.toString()
          if (existingReqIds.has(ridStr)) continue
          const req = await client.readContract({
            address: CONTRACTS.TOKEN, abi: TOKEN_ABI,
            functionName: 'vrfMintRequests', args: [rid],
          })
          if (!req || req.player?.toLowerCase() !== address.toLowerCase()) continue
          toAdd.push({
            id: 'recovered_' + ridStr,
            txHash: null,
            qty: Number(req.quantity),
            startTime: Number(req.requestedAt) * 1000,
            status: 'pending',
            requestId: ridStr,
          })
        }
        if (toAdd.length > 0) {
          setPendingMints(prev => {
            const next = [...prev, ...toAdd]
            savePending(next)
            return next
          })
        }
      } catch (e) {
        console.warn('VRF recovery failed:', e)
      }
    }
    recover()
  }, [address])
'''
        content = content.replace(ANCHOR, ANCHOR + RECOVERY)
        print('Recovery effect added')

open('frontend/src/screens/Game.jsx', 'w').write(content)
print('Done')
