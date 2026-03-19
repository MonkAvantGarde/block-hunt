// ─────────────────────────────────────────────────────────────────────────────
// RollingDigits.jsx — Mechanical-counter rolling digit animation for numeric values
// CSS-only animation, Safari-compatible. No canvas, no external libs.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GOLD, GREEN } from '../config/design-tokens';

const DIGITS = ['0','1','2','3','4','5','6','7','8','9'];
const ROLL_DURATION_MS = 400;
const STAGGER_MS = 50;
const ARROW_FADE_MS = 2000;
const THROTTLE_MS = 2000;

// ── Single digit column ────────────────────────────────────────────────────
function DigitColumn({ digit, staggerIndex, animate, fontSize }) {
  const numericDigit = parseInt(digit, 10);
  const charHeight = fontSize; // 1em in px

  const columnStyle = {
    display: 'inline-block',
    width: `${fontSize * 0.65}px`,
    height: `${charHeight}px`,
    overflow: 'hidden',
    position: 'relative',
    verticalAlign: 'top',
  };

  const stripStyle = {
    display: 'flex',
    flexDirection: 'column',
    transform: `translateY(-${numericDigit * charHeight}px)`,
    transition: animate
      ? `transform ${ROLL_DURATION_MS}ms cubic-bezier(0.2, 0, 0.1, 1) ${staggerIndex * STAGGER_MS}ms`
      : 'none',
    willChange: 'transform',
  };

  const cellStyle = {
    height: `${charHeight}px`,
    lineHeight: `${charHeight}px`,
    textAlign: 'center',
    fontSize: `${fontSize}px`,
    fontFamily: "'VT323', monospace",
    WebkitFontSmoothing: 'antialiased',
  };

  return (
    <span style={columnStyle}>
      <span style={stripStyle}>
        {DIGITS.map((d) => (
          <span key={d} style={cellStyle}>{d}</span>
        ))}
      </span>
    </span>
  );
}

// ── Static character (prefix, suffix, decimal, comma) ──────────────────────
function StaticChar({ char, fontSize }) {
  const style = {
    display: 'inline-block',
    height: `${fontSize}px`,
    lineHeight: `${fontSize}px`,
    fontSize: `${fontSize}px`,
    fontFamily: "'VT323', monospace",
    verticalAlign: 'top',
    WebkitFontSmoothing: 'antialiased',
  };
  return <span style={style}>{char}</span>;
}

// ── Arrow indicator ────────────────────────────────────────────────────────
function ArrowIndicator({ visible, fontSize }) {
  const style = {
    display: 'inline-block',
    marginLeft: '4px',
    fontSize: `${Math.round(fontSize * 0.7)}px`,
    lineHeight: `${fontSize}px`,
    verticalAlign: 'top',
    color: GREEN,
    opacity: visible ? 1 : 0,
    transition: visible ? 'none' : `opacity ${ARROW_FADE_MS}ms ease-out`,
  };
  return <span style={style}>{'\u25B2'}</span>;
}

// ── Main component ─────────────────────────────────────────────────────────
export default function RollingDigits({
  value,
  prefix = '',
  suffix = '',
  decimals = 4,
  fontSize = 28,
  color,
  style: externalStyle,
}) {
  const prevValueRef = useRef(null);
  const prevCharsRef = useRef(null);
  const throttleTimerRef = useRef(null);
  const pendingValueRef = useRef(null);

  const [displayValue, setDisplayValue] = useState(value);
  const [animatingIndices, setAnimatingIndices] = useState(new Set());
  const [showArrow, setShowArrow] = useState(false);
  const arrowTimerRef = useRef(null);

  // Throttle incoming value updates to THROTTLE_MS windows
  useEffect(() => {
    if (throttleTimerRef.current !== null) {
      // Currently throttled — stash latest value
      pendingValueRef.current = value;
      return;
    }

    // Apply immediately
    setDisplayValue(value);

    // Start throttle window
    throttleTimerRef.current = setTimeout(() => {
      throttleTimerRef.current = null;
      if (pendingValueRef.current !== null && pendingValueRef.current !== value) {
        setDisplayValue(pendingValueRef.current);
        pendingValueRef.current = null;
      }
    }, THROTTLE_MS);

    return () => {
      if (throttleTimerRef.current !== null) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
    };
  }, [value]);

  // Format to fixed decimal string
  const formatted = useMemo(() => {
    const num = typeof displayValue === 'number' ? displayValue : parseFloat(displayValue) || 0;
    return num.toFixed(decimals);
  }, [displayValue, decimals]);

  // Split into characters
  const chars = useMemo(() => formatted.split(''), [formatted]);

  // Determine which digit indices changed and whether value increased
  const applyAnimation = useCallback(() => {
    const prevChars = prevCharsRef.current;
    const prevVal = prevValueRef.current;

    if (prevChars === null) {
      // First render — no animation
      prevValueRef.current = displayValue;
      prevCharsRef.current = chars;
      return;
    }

    // Find changed digit positions
    const changed = new Set();
    const maxLen = Math.max(chars.length, prevChars.length);
    for (let i = 0; i < maxLen; i++) {
      if (chars[i] !== prevChars[i]) {
        changed.add(i);
      }
    }

    if (changed.size > 0) {
      setAnimatingIndices(changed);

      // Show arrow on increase
      const currNum = parseFloat(displayValue) || 0;
      const prevNum = parseFloat(prevVal) || 0;
      if (currNum > prevNum) {
        setShowArrow(true);
        if (arrowTimerRef.current) clearTimeout(arrowTimerRef.current);
        arrowTimerRef.current = setTimeout(() => setShowArrow(false), 100);
      }
    }

    prevValueRef.current = displayValue;
    prevCharsRef.current = chars;
  }, [displayValue, chars]);

  useEffect(() => {
    applyAnimation();
    return () => {
      if (arrowTimerRef.current) clearTimeout(arrowTimerRef.current);
    };
  }, [applyAnimation]);

  // Compute stagger: rightmost numeric digit = 0 delay, leftward increases
  const numericPositions = useMemo(() => {
    const positions = [];
    chars.forEach((ch, i) => {
      if (/\d/.test(ch)) positions.push(i);
    });
    return positions;
  }, [chars]);

  const staggerMap = useMemo(() => {
    const map = {};
    const count = numericPositions.length;
    numericPositions.forEach((pos, idx) => {
      // rightmost numeric digit gets stagger 0
      map[pos] = count - 1 - idx;
    });
    return map;
  }, [numericPositions]);

  const containerStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    fontFamily: "'VT323', monospace",
    color: color || GOLD,
    userSelect: 'none',
    WebkitUserSelect: 'none',
    ...externalStyle,
  };

  return (
    <span style={containerStyle}>
      {prefix && <StaticChar char={prefix} fontSize={fontSize} />}
      {chars.map((ch, i) => {
        if (/\d/.test(ch)) {
          return (
            <DigitColumn
              key={`d-${i}`}
              digit={ch}
              staggerIndex={staggerMap[i] || 0}
              animate={animatingIndices.has(i)}
              fontSize={fontSize}
            />
          );
        }
        return <StaticChar key={`s-${i}`} char={ch} fontSize={fontSize} />;
      })}
      {suffix && <StaticChar char={suffix} fontSize={fontSize} />}
      <ArrowIndicator visible={showArrow} fontSize={fontSize} />
    </span>
  );
}
