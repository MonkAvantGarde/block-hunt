// ─────────────────────────────────────────────────────────────────────────────
// CombineCollapse.jsx — Animation 2: Countdown Crunch
//
// Pure CSS animations. No canvas, no external libs. Safari-compatible.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TMAP, COMBINE_RATIOS, CREAM } from '../config/design-tokens';

// Tier card images
const tierImage = (n) => new URL(`../assets/T${n}.png`, import.meta.url).href;

// ── Countdown step sequences per ratio ──────────────────────────────────────
const COUNTDOWN_STEPS = {
  21: [21, 15, 10, 7, 5, 3, 2, 1, 0],
  19: [19, 14, 10, 7, 5, 3, 2, 1, 0],
  17: [17, 12,  8, 5, 3, 2, 1, 0],
  15: [15, 10,  7, 5, 3, 2, 1, 0],
  13: [13,  9,  6, 4, 3, 2, 1, 0],
};

// Timing per step — accelerating. We distribute ~1200ms across N-1 intervals.
function buildTimings(stepCount) {
  // We want the first gap longest, last gap shortest, total ~1200ms.
  // Use a geometric decay so each gap is shorter than the last.
  const n = stepCount - 1; // number of intervals
  if (n <= 0) return [];
  // Hand-tuned: ratio between successive gaps ~0.75
  const r = 0.75;
  const base = 1200 * (1 - r) / (1 - Math.pow(r, n));
  const timings = [];
  for (let i = 0; i < n; i++) {
    timings.push(Math.round(base * Math.pow(r, i)));
  }
  return timings;
}

export default function CombineCollapse({ fromTier, startCount, combineRatio, onComplete }) {
  const toTier = fromTier - 1;
  const ratio = combineRatio || COMBINE_RATIOS[fromTier] || startCount || 21;
  const steps = COUNTDOWN_STEPS[ratio] || COUNTDOWN_STEPS[21];
  const timings = useRef(buildTimings(steps.length)).current;

  const [phase, setPhase] = useState('countdown'); // countdown | crunch | pop | done
  const [stepIdx, setStepIdx] = useState(0);
  const [showFlash, setShowFlash] = useState(false);
  const [shake, setShake] = useState(false);
  const [showTarget, setShowTarget] = useState(false);
  const [showText, setShowText] = useState(false);
  const completeCalled = useRef(false);

  const accent = TMAP[fromTier]?.accent || '#888';
  const targetAccent = TMAP[toTier]?.accent || '#fff';

  // ── Step 1: Countdown ─────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (stepIdx >= steps.length - 1) {
      // Countdown done — move to crunch
      setPhase('crunch');
      return;
    }
    const t = setTimeout(() => setStepIdx((i) => i + 1), timings[stepIdx]);
    return () => clearTimeout(t);
  }, [phase, stepIdx, steps.length, timings]);

  // ── Step 2: Crunch ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'crunch') return;
    // Flash + shake at 200ms, then pop at 300ms
    const t1 = setTimeout(() => {
      setShowFlash(true);
      setShake(true);
    }, 150);
    const t2 = setTimeout(() => {
      setShowFlash(false);
      setShake(false);
      setPhase('pop');
    }, 300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [phase]);

  // ── Step 3: Pop ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'pop') return;
    requestAnimationFrame(() => setShowTarget(true));
    const t1 = setTimeout(() => setShowText(true), 100);
    const t2 = setTimeout(() => {
      setPhase('done');
      if (!completeCalled.current) {
        completeCalled.current = true;
        onComplete?.();
      }
    }, 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [phase, onComplete]);

  // ── Derived animation values ──────────────────────────────────────────────
  const progress = steps.length > 1 ? stepIdx / (steps.length - 1) : 1;
  const sourceScale = phase === 'countdown'
    ? 1.0 - 0.15 * progress
    : phase === 'crunch' ? 0 : 0;
  const sourceOpacity = phase === 'countdown'
    ? 1.0 - 0.3 * progress
    : 0;
  // Pulse speed: period shrinks from 600ms to 200ms
  const pulseSpeed = 600 - 400 * progress;

  return (
    <div style={{
      ...styles.wrapper,
      animation: shake ? 'cc-shake 0.1s linear' : 'none',
    }}>
      <style>{keyframes(accent, targetAccent, pulseSpeed)}</style>

      {/* Source card — visible during countdown & crunch */}
      {phase !== 'pop' && phase !== 'done' && (
        <div style={{
          ...styles.cardWrap,
          transform: `scale(${sourceScale})`,
          opacity: sourceOpacity,
          transition: phase === 'crunch'
            ? 'transform 0.2s cubic-bezier(0.6, 0, 1, 0.4), opacity 0.2s cubic-bezier(0.6, 0, 1, 0.4)'
            : 'transform 0.08s linear, opacity 0.08s linear',
        }}>
          <div style={{
            ...styles.card,
            animation: phase === 'countdown' ? `cc-pulse ${pulseSpeed}ms ease-in-out infinite` : 'none',
          }}>
            <img src={tierImage(fromTier)} alt={`T${fromTier}`} style={styles.cardImg} />
          </div>
          {/* Count overlay */}
          <div style={styles.countOverlay}>
            <span style={styles.countText}>{steps[stepIdx]}</span>
          </div>
        </div>
      )}

      {/* White flash */}
      {showFlash && (
        <div style={styles.flash} />
      )}

      {/* Target card — pop phase */}
      {(phase === 'pop' || phase === 'done') && (
        <div style={{
          ...styles.cardWrap,
          transform: showTarget ? 'scale(1)' : 'scale(0)',
          transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          animation: showTarget ? 'cc-brightness 0.4s ease-out' : 'none',
        }}>
          <div style={{
            ...styles.card,
            boxShadow: `0 0 30px 10px ${targetAccent}66, 0 0 60px 20px ${targetAccent}33`,
          }}>
            <img src={tierImage(toTier)} alt={`T${toTier}`} style={styles.cardImg} />
          </div>
        </div>
      )}

      {/* Result text */}
      {showText && (
        <div style={{
          ...styles.resultText,
          animation: 'cc-fadeText 1.5s ease-out forwards',
        }}>
          T{fromTier} &times; {ratio} &rarr; T{toTier} &times; 1
        </div>
      )}
    </div>
  );
}

// ── Keyframes (injected as <style>) ─────────────────────────────────────────
function keyframes(accent, targetAccent, pulseSpeed) {
  return `
    @keyframes cc-pulse {
      0%, 100% { box-shadow: 0 0 8px 2px ${accent}44; }
      50%      { box-shadow: 0 0 20px 8px ${accent}aa; }
    }
    @keyframes cc-shake {
      0%   { transform: translateX(0); }
      25%  { transform: translateX(2px); }
      50%  { transform: translateX(-2px); }
      75%  { transform: translateX(2px); }
      100% { transform: translateX(0); }
    }
    @keyframes cc-brightness {
      0%   { filter: brightness(1.5); }
      100% { filter: brightness(1.0); }
    }
    @keyframes cc-fadeText {
      0%   { opacity: 1; }
      70%  { opacity: 1; }
      100% { opacity: 0; }
    }
  `;
}

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = {
  wrapper: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    minHeight: 200,
  },
  cardWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: 120,
    height: 168,
    borderRadius: 8,
    overflow: 'hidden',
    background: '#111',
  },
  cardImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  countOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  countText: {
    fontFamily: '"Press Start 2P", monospace',
    fontSize: 32,
    color: CREAM,
    textShadow: '0 0 8px rgba(0,0,0,0.9), 0 2px 4px rgba(0,0,0,0.7)',
    letterSpacing: 2,
  },
  flash: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: '#fff',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    animation: 'cc-flashPop 0.15s ease-out forwards',
    pointerEvents: 'none',
    zIndex: 10,
  },
  resultText: {
    marginTop: 16,
    fontFamily: '"Press Start 2P", monospace',
    fontSize: 11,
    color: CREAM,
    textAlign: 'center',
    whiteSpace: 'nowrap',
    letterSpacing: 1,
  },
};
