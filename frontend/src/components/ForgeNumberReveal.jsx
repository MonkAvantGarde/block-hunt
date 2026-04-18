// ─────────────────────────────────────────────────────────────────────────────
// ForgeNumberReveal.jsx — Forge roulette: spinning percentage decelerates to
// land on the VRF result. CSS-only animations, Safari-compatible.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TMAP, GOLD, CREAM, GREEN, EMBER_LT } from '../config/design-tokens';
import sounds from '../hooks/useSound';

const SUCCESS_COLOR = '#6eff8a';
const FAILURE_COLOR = '#ff4444';
const NEAR_MISS_THRESHOLD = 5;

// ── Timing constants (ms) ──────────────────────────────────────────────────
const T_THRESHOLD_IN = 0;
const T_SPIN_START = 300;
const T_SPIN_PHASE2 = 800;
const T_SPIN_PHASE3 = 1300;
const T_SPIN_PHASE4 = 1700;
const T_SPIN_END = 2000;
const T_FREEZE_END = 2300;
const T_RESULT_END = 3000;
const T_COMPLETE = 4500; // 3.0s + 1.5s hold

// ── Keyframe injection (once) ──────────────────────────────────────────────
let stylesInjected = false;
function injectKeyframes() {
  if (stylesInjected) return;
  stylesInjected = true;
  const sheet = document.createElement('style');
  sheet.textContent = `
    @keyframes fnr-shake {
      0%, 100% { transform: translateX(0); }
      16.6% { transform: translateX(3px); }
      33.3% { transform: translateX(-3px); }
      50% { transform: translateX(3px); }
      66.6% { transform: translateX(-3px); }
      83.3% { transform: translateX(3px); }
    }
    @keyframes fnr-flash {
      0% { opacity: 0.3; }
      50% { opacity: 0; }
      100% { opacity: 0; }
    }
    @keyframes fnr-scale-in {
      0% { transform: scale(0.8); opacity: 0; }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes fnr-success-scale {
      0% { transform: scale(1); }
      50% { transform: scale(1.2); }
      100% { transform: scale(1.15); }
    }
  `;
  document.head.appendChild(sheet);
}

// ── Helper: random int in range ────────────────────────────────────────────
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── Component ──────────────────────────────────────────────────────────────
export default function ForgeNumberReveal({
  rolledPct,
  neededPct,
  success,
  fromTier,
  onComplete,
}) {
  const [phase, setPhase] = useState('idle');       // idle | threshold | spinning | frozen | result
  const [spinValue, setSpinValue] = useState(0);
  const intervalRef = useRef(null);
  const timeoutRefs = useRef([]);
  const completeCalled = useRef(false);

  const targetTier = fromTier - 1;
  const tierData = TMAP[targetTier] || TMAP[fromTier];
  const tierAccent = tierData ? tierData.accent : GOLD;
  const isNearMiss = !success && Math.abs(rolledPct - neededPct) <= NEAR_MISS_THRESHOLD;

  const schedule = useCallback((fn, delay) => {
    const id = setTimeout(fn, delay);
    timeoutRefs.current.push(id);
    return id;
  }, []);

  const clearAllTimers = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    timeoutRefs.current.forEach(clearTimeout);
    timeoutRefs.current = [];
  }, []);

  useEffect(() => {
    injectKeyframes();
    completeCalled.current = false;

    // Step 1: threshold appears
    setPhase('threshold');

    // Step 2: start spinning
    schedule(() => {
      setPhase('spinning');
      sounds.forgeSpin();
      startSpinSequence();
    }, T_SPIN_START);

    // Step 3: freeze
    schedule(() => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setSpinValue(rolledPct);
      setPhase('frozen');
    }, T_SPIN_END);

    // Step 4: result
    schedule(() => {
      setPhase('result');
      if (success) {
        sounds.forgeSuccess();
      } else {
        sounds.forgeFail();
      }
    }, T_FREEZE_END);

    // Complete callback
    schedule(() => {
      if (!completeCalled.current && onComplete) {
        completeCalled.current = true;
        onComplete();
      }
    }, T_COMPLETE);

    return clearAllTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolledPct, neededPct, success, fromTier]);

  // ── Spin sequence with decelerating intervals ────────────────────────────
  function startSpinSequence() {
    // Phase 1: fast (0.3-0.8s) ~67ms
    startInterval(67);

    schedule(() => startInterval(125), T_SPIN_PHASE2 - T_SPIN_START);   // ~8/sec
    schedule(() => startInterval(333), T_SPIN_PHASE3 - T_SPIN_START);   // ~3/sec
    schedule(() => startClusterInterval(), T_SPIN_PHASE4 - T_SPIN_START); // ~1/sec, cluster near result
  }

  function startInterval(ms) {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setSpinValue(randInt(0, 100));
    }, ms);
  }

  function startClusterInterval() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const offset = randInt(-15, 15);
      setSpinValue(Math.max(0, Math.min(100, rolledPct + offset)));
    }, 1000);
  }

  // ── Styles ───────────────────────────────────────────────────────────────
  const containerStyle = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: '180px',
    fontFamily: "'VT323', monospace",
    userSelect: 'none',
    WebkitUserSelect: 'none',
  };

  const thresholdLineStyle = {
    position: 'absolute',
    top: '40%',
    left: '10%',
    right: '10%',
    height: '1px',
    background: `${CREAM}33`,
    opacity: phase === 'idle' ? 0 : 1,
    transition: 'opacity 0.3s ease-in',
  };

  const thresholdLabelStyle = {
    position: 'absolute',
    top: 'calc(40% - 22px)',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: "'Press Start 2P', cursive",
    fontSize: '9px',
    color: CREAM,
    opacity: phase === 'idle' ? 0 : 0.6,
    transition: 'opacity 0.3s ease-in',
    letterSpacing: '1px',
  };

  // Number display value
  const displayNum = phase === 'idle' ? 0
    : phase === 'threshold' ? 0
    : phase === 'frozen' || phase === 'result' ? rolledPct
    : spinValue;

  const isResultPhase = phase === 'result';

  let numberColor = GOLD;
  if (isResultPhase) {
    numberColor = success ? SUCCESS_COLOR : FAILURE_COLOR;
  }

  const numberStyle = {
    fontFamily: "'VT323', monospace",
    fontSize: '64px',
    fontWeight: 'bold',
    color: numberColor,
    textAlign: 'center',
    lineHeight: 1,
    marginTop: '20px',
    transition: isResultPhase ? 'color 0.2s ease-out' : 'none',
    animation: isResultPhase
      ? success
        ? 'fnr-success-scale 0.4s ease-out forwards'
        : 'fnr-shake 0.3s ease-in-out'
      : 'none',
    opacity: phase === 'idle' || phase === 'threshold' ? 0 : 1,
  };

  const resultTextStyle = {
    fontFamily: "'Press Start 2P', cursive",
    fontSize: '14px',
    marginTop: '16px',
    letterSpacing: '2px',
    animation: 'fnr-scale-in 0.3s ease-out forwards',
  };

  const subTextStyle = {
    fontFamily: "'VT323', monospace",
    fontSize: '16px',
    marginTop: '8px',
    opacity: 0.7,
  };

  // Background flash on success
  const flashStyle = {
    position: 'absolute',
    inset: 0,
    borderRadius: '8px',
    background: success ? SUCCESS_COLOR : 'transparent',
    opacity: 0,
    animation: isResultPhase && success ? 'fnr-flash 0.6s ease-out forwards' : 'none',
    pointerEvents: 'none',
  };

  return (
    <div style={containerStyle}>
      {/* Background flash */}
      <div style={flashStyle} />

      {/* Threshold line + label */}
      <div style={thresholdLineStyle} />
      <div style={thresholdLabelStyle}>
        NEED: {neededPct}%
      </div>

      {/* Spinning / final number */}
      <div style={numberStyle}>
        {displayNum}%
      </div>

      {/* Result text */}
      {isResultPhase && (
        <>
          {/* Near-miss callout */}
          {isNearMiss && (
            <div style={{
              ...resultTextStyle,
              fontSize: '11px',
              color: GOLD,
              marginTop: '12px',
              marginBottom: '-4px',
            }}>
              So close.
            </div>
          )}

          {success ? (
            <>
              <div style={{ ...resultTextStyle, color: tierAccent }}>
                SUCCESS
              </div>
              <div style={{ ...subTextStyle, color: CREAM }}>
                Rolled {rolledPct}%. Needed: {neededPct}%
              </div>
            </>
          ) : (
            <>
              <div style={{ ...resultTextStyle, color: FAILURE_COLOR }}>
                FAILED
              </div>
              {isNearMiss ? (
                <div style={{ ...subTextStyle, color: FAILURE_COLOR }}>
                  Missed by {Math.abs(rolledPct - neededPct)}%
                </div>
              ) : (
                <div style={{ ...subTextStyle, color: CREAM }}>
                  Rolled {rolledPct}%. Needed: {neededPct}%
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
