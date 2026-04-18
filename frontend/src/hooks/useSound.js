// ─────────────────────────────────────────────────────────────────────────────
// useSound.js — Synthetic sound effects via Web Audio API
//
// No external audio files needed. All sounds are procedurally generated.
// Call play.mint(), play.combine(), etc. from any component.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef } from 'react'

let audioCtx = null
function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

function playTone(freq, duration, type = 'sine', volume = 0.15, ramp = true) {
  const ctx = getCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, ctx.currentTime)
  gain.gain.setValueAtTime(volume, ctx.currentTime)
  if (ramp) gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + duration)
}

function playNoise(duration, volume = 0.08) {
  const ctx = getCtx()
  const bufferSize = ctx.sampleRate * duration
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(volume, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
  const filter = ctx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 2000
  source.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  source.start()
}

const sounds = {
  // Mint: ascending chime sequence
  mint() {
    [523, 659, 784].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.25, 'sine', 0.12), i * 80)
    })
  },

  // VRF waiting: low pulsing hum
  vrfWaiting() {
    playTone(110, 1.5, 'triangle', 0.06, false)
  },

  // Reveal: bright sparkle burst
  reveal() {
    [880, 1108, 1318, 1568].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.15, 'sine', 0.1), i * 50)
    })
    setTimeout(() => playNoise(0.08, 0.05), 150)
  },

  // Combine: descending crunch
  combine() {
    [440, 370, 310, 260].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.12, 'square', 0.08), i * 60)
    })
    setTimeout(() => playNoise(0.15, 0.1), 200)
  },

  // Forge spin: rapid ticking that slows
  forgeSpin() {
    for (let i = 0; i < 12; i++) {
      setTimeout(() => playTone(800 + Math.random() * 400, 0.05, 'square', 0.06), i * (30 + i * 8))
    }
  },

  // Forge success: triumphant ascending
  forgeSuccess() {
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.3, 'sine', 0.12), i * 100)
    })
  },

  // Forge fail: descending buzz
  forgeFail() {
    [300, 250, 200].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.2, 'sawtooth', 0.06), i * 100)
    })
  },

  // Collection complete: grand fanfare
  collection() {
    const fanfare = [523, 659, 784, 1046, 784, 1046, 1318]
    fanfare.forEach((f, i) => {
      setTimeout(() => playTone(f, 0.35, 'sine', 0.14), i * 120)
    })
    setTimeout(() => playNoise(0.1, 0.04), 800)
  },

  // Counter tick
  tick() {
    playTone(1200, 0.03, 'square', 0.04)
  },

  // Claim reward: coin sound
  claim() {
    playTone(1318, 0.1, 'sine', 0.12)
    setTimeout(() => playTone(1568, 0.2, 'sine', 0.1), 80)
  },

  // Tab switch: subtle click
  tabSwitch() {
    playTone(600, 0.03, 'sine', 0.05)
  },
}

export function useSound() {
  const enabled = useRef(true)

  const play = useCallback((name) => {
    if (!enabled.current) return
    const fn = sounds[name]
    if (fn) try { fn() } catch (e) {}
  }, [])

  const toggle = useCallback(() => {
    enabled.current = !enabled.current
    return enabled.current
  }, [])

  return { play, toggle, sounds: Object.keys(sounds) }
}

export default sounds
