import { useWriteContract } from 'wagmi'
import { useCallback } from 'react'

const TARGET_CHAIN = 84532

/**
 * Drop-in replacement for useWriteContract that checks the wallet's
 * actual chain before sending. If on the wrong chain, it rejects
 * with a clear error instead of sending on mainnet.
 */
export function useSafeWrite() {
  const result = useWriteContract()

  const safeWriteContract = useCallback(async (config, callbacks) => {
    // Check real chain from wallet provider
    if (window.ethereum) {
      try {
        const hex = await window.ethereum.request({ method: 'eth_chainId' })
        const currentChain = parseInt(hex, 16)
        if (currentChain !== TARGET_CHAIN) {
          // Try to switch
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: '0x' + TARGET_CHAIN.toString(16) }],
            })
          } catch (switchErr) {
            // If chain not added, try adding it
            if (switchErr.code === 4902) {
              try {
                await window.ethereum.request({
                  method: 'wallet_addEthereumChain',
                  params: [{
                    chainId: '0x' + TARGET_CHAIN.toString(16),
                    chainName: 'Base Sepolia',
                    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                    rpcUrls: ['https://sepolia.base.org'],
                    blockExplorerUrls: ['https://sepolia.basescan.org'],
                  }],
                })
              } catch {
                const err = new Error('Please switch to Base Sepolia in your wallet')
                callbacks?.onError?.(err)
                return
              }
            } else {
              const err = new Error('Please switch to Base Sepolia in your wallet')
              callbacks?.onError?.(err)
              return
            }
          }

          // Verify switch worked
          const newHex = await window.ethereum.request({ method: 'eth_chainId' })
          if (parseInt(newHex, 16) !== TARGET_CHAIN) {
            const err = new Error('Wrong network — switch to Base Sepolia to continue')
            callbacks?.onError?.(err)
            return
          }
        }
      } catch {
        // If we can't check, proceed anyway (provider might not support eth_chainId)
      }
    }

    // Chain is correct, proceed with the write
    result.writeContract(config, callbacks)
  }, [result.writeContract])

  return {
    ...result,
    writeContract: safeWriteContract,
  }
}
