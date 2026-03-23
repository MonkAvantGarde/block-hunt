import { useReadContract, useAccount } from 'wagmi'
import { formatEther } from 'viem'
import { CONTRACTS } from '../config/wagmi'
import { MARKETPLACE_ABI, TOKEN_ABI } from '../abis'
import { TMAP } from '../config/design-tokens'

export function useTradeData() {
  const { address, isConnected } = useAccount()

  // Read active listings (first 50)
  const { data: listingsRaw, refetch: refetchListings } = useReadContract({
    address: CONTRACTS.MARKETPLACE,
    abi: MARKETPLACE_ABI,
    functionName: 'getActiveListings',
    args: [BigInt(1), BigInt(50)],
    query: { refetchInterval: 15_000 },
  })

  // Check if user has approved marketplace
  const { data: isApproved, refetch: refetchApproval } = useReadContract({
    address: CONTRACTS.TOKEN,
    abi: TOKEN_ABI,
    functionName: 'isApprovedForAll',
    args: [address || '0x0000000000000000000000000000000000000000', CONTRACTS.MARKETPLACE],
    query: { enabled: isConnected && !!address },
  })

  // Parse listings
  const listings = []
  if (listingsRaw) {
    const [ids, sellers, tiers, quantities, prices, expiresAts] = listingsRaw
    for (let i = 0; i < ids.length; i++) {
      const tier = Number(tiers[i])
      const qty = Number(quantities[i])
      const priceWei = prices[i]
      const priceEth = parseFloat(formatEther(priceWei))
      const seller = sellers[i]
      const expiresAt = Number(expiresAts[i])
      const tierMeta = TMAP[tier]

      listings.push({
        id: Number(ids[i]),
        seller,
        sellerShort: seller.slice(0, 6) + '...' + seller.slice(-4),
        tier,
        tierName: tierMeta?.name || `Tier ${tier}`,
        tierLabel: tierMeta?.label || '',
        tierAccent: tierMeta?.accent || '#888',
        quantity: qty,
        pricePerBlock: priceEth,
        pricePerBlockWei: priceWei,
        totalPrice: priceEth * qty,
        expiresAt,
        isOwn: isConnected && address && seller.toLowerCase() === address.toLowerCase(),
      })
    }
  }

  // Split into all listings and user's listings
  const myListings = listings.filter(l => l.isOwn)
  const otherListings = listings.filter(l => !l.isOwn)

  return {
    listings,
    myListings,
    otherListings,
    isApproved: !!isApproved,
    refetchListings,
    refetchApproval,
    isConnected,
    address,
  }
}
