import { Component } from 'react'

const GOLD = '#c8a84b'
const GOLD_DK = '#8a6820'
const INK = '#0a0705'
const CREAM = '#f0ead6'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{
        minHeight: '100vh',
        background: '#1e4d32',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Courier Prime', monospace",
      }}>
        <div style={{
          background: '#0e2318',
          border: `2px solid ${GOLD_DK}`,
          boxShadow: `8px 8px 0 ${INK}`,
          padding: '40px 48px',
          maxWidth: 480,
          textAlign: 'center',
        }}>
          <div style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 12, color: GOLD, letterSpacing: 2,
            marginBottom: 20,
          }}>CONNECTION LOST</div>
          <div style={{
            fontSize: 15, color: CREAM, opacity: 0.7,
            lineHeight: 1.6, marginBottom: 24,
          }}>
            Something went wrong. Check your wallet connection and try again.
          </div>
          {this.state.error && (
            <div style={{
              fontSize: 11, color: 'rgba(255,255,255,0.3)',
              marginBottom: 20, wordBreak: 'break-word',
              padding: '8px 12px',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              {this.state.error.message || String(this.state.error)}
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 9, letterSpacing: 2,
              background: GOLD, color: INK,
              border: `3px solid ${INK}`,
              boxShadow: `4px 4px 0 ${INK}`,
              padding: '14px 36px',
              cursor: 'pointer',
            }}
          >↻ REFRESH</button>
        </div>
      </div>
    )
  }
}
