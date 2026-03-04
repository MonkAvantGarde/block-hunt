// ─────────────────────────────────────────────────────────────────────────────
// main.jsx — App entry point
//
// This wraps the entire app in WagmiProvider so every component
// can access wallet state and make contract calls.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react'
import ReactDOM from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from './config/wagmi'
import App from './App'

// React Query is required by wagmi for caching contract reads
const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
)
