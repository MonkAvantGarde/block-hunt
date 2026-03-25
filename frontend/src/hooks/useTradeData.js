import { useReadContract, useReadContracts, useAccount } from 'wagmi'
import { formatEther } from 'viem'
import { CONTRACTS } from '../config/wagmi'
import { MARKETPLACE_ABI, TOKEN_ABI } from '../abis'
import { TMAP } from '../config/design-tokens'

function parseItems(raw, ownerField, address, isConnected) {
  const items = []
  if (!raw) return items
  const [ids, owners, tiers, quantities, prices, expiresAts] = raw
  for (let i = 0; i < ids.length; i++) {
    const tier = Number(tiers[i])
    const qty = Number(quantities[i])
    const priceWei = prices[i]
    const priceEth = parseFloat(formatEther(priceWei))
    const owner = owners[i]
    const expiresAt = Number(expiresAts[i])
    const tierMeta = TMAP[tier]

    items.push({
      id: Number(ids[i]),
      [ownerField]: owner,
      ownerShort: owner.slice(0, 6) + '...' + owner.slice(-4),
      tier,
      tierName: tierMeta?.name || `Tier ${tier}`,
      tierLabel: tierMeta?.label || '',
      tierAccent: tierMeta?.accent || '#888',
      quantity: qty,
      pricePerBlock: priceEth,
      pricePerBlockWei: priceWei,
      totalPrice: priceEth * qty,
      expiresAt,
      isOwn: isConnected && address && owner.toLowerCase() === address.toLowerCase(),
    })
  }
  return items
}

export function useTradeData() {
  const { address, isConnected } = useAccount()

  const { data: listingsRaw, refetch: refetchListings } = useReadContract({
    address: CONTRACTS.MARKETPLACE,
    abi: MARKETPLACE_ABI,
    functionName: 'getActiveListings',
    args: [BigInt(1), BigInt(50)],
    query: { refetchInterval: 15_000 },
  })

  const { data: offersRaw, refetch: refetchOffers } = useReadContract({
    address: CONTRACTS.MARKETPLACE,
    abi: MARKETPLACE_ABI,
    functionName: 'getActiveOffers',
    args: [BigInt(1), BigInt(50)],
    query: { refetchInterval: 15_000 },
  })

  const { data: isApproved, refetch: refetchApproval } = useReadContract({
    address: CONTRACTS.TOKEN,
    abi: TOKEN_ABI,
    functionName: 'isApprovedForAll',
    args: [address || '0x0000000000000000000000000000000000000000', CONTRACTS.MARKETPLACE],
    query: { enabled: isConnected && !!address },
  })

  const parsedListings = parseItems(listingsRaw, 'seller', address, isConnected)
  const offers = parseItems(offersRaw, 'buyer', address, isConnected)

  // ── Seller balance check: multicall balanceOf for each listing seller ──
  const balanceContracts = parsedListings.map(l => ({
    address: CONTRACTS.TOKEN,
    abi: TOKEN_ABI,
    functionName: 'balanceOf',
    args: [l.seller, BigInt(l.tier)],
  }))
  const { data: sellerBalances } = useReadContracts({
    contracts: balanceContracts,
    query: { enabled: balanceContracts.length > 0, refetchInterval: 30_000 },
  })

  // Enrich listings with seller's actual balance and filter out dead ones
  const listings = parsedListings.map((l, i) => {
    const balResult = sellerBalances?.[i]
    const sellerBalance = balResult?.status === 'success' ? Number(balResult.result) : null
    const fillableQty = sellerBalance != null ? Math.min(l.quantity, sellerBalance) : l.quantity
    const isStale = sellerBalance != null && sellerBalance === 0
    return { ...l, sellerBalance, fillableQty, isStale }
  }).filter(l => !l.isStale) // Hide completely dead listings

  const myListings = listings.filter(l => l.isOwn)
  const otherListings = listings.filter(l => !l.isOwn)
  const myOffers = offers.filter(o => o.isOwn)
  const otherOffers = offers.filter(o => !o.isOwn)

  function refetchAll() {
    refetchListings()
    refetchOffers()
    refetchApproval()
  }

  return {
    listings, myListings, otherListings,
    offers, myOffers, otherOffers,
    isApproved: !!isApproved,
    refetchAll: refetchAll,
    refetchApproval,
    isConnected, address,
  }
}
