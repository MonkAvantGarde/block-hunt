// ─────────────────────────────────────────────────────────────────────────────
// CollectionCascade.jsx — Animation 6: Captain Planet
//
// Full-screen overlay. Pure CSS animations. No canvas, no external libs.
// Safari-compatible (no individual transform properties).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TMAP, CREAM } from '../config/design-tokens';

// Tier card images
const tierImage = (n) => new URL(`../assets/T${n}.png`, import.meta.url).href;

// ── Formation order & angles ────────────────────────────────────────────────
const FORMATION = [
  { tier: 7, angle: -90,  activateAt: 0.0 },
  { tier: 6, angle: -30,  activateAt: 0.5 },
  { tier: 5, angle:  30,  activateAt: 0.9 },
  { tier: 4, angle: 150,  activateAt: 1.2 },
  { tier: 3, angle: 210,  activateAt: 1.4 },
  { tier: 2, angle:  90,  activateAt: 1.5 },
];

const RADIUS = 200;
const CARD_W = 120;
const CARD_H = 160;
const TOTAL_DURATION = 9000;

export default function CollectionCascade({ onComplete }) {
  const [elapsed, setElapsed] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const startRef = useRef(null);
  const rafRef = useRef(null);
  const completeCalled = useRef(false);

  // ── Animation loop ────────────────────────────────────────────────────────
  useEffect(() => {
    startRef.current = performance.now();
    const tick = (now) => {
      const ms = now - startRef.current;
      setElapsed(ms);
      if (ms < TOTAL_DURATION) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // ── Completion ────────────────────────────────────────────────────────────
  useEffect(() => {
    if ((elapsed >= TOTAL_DURATION || dismissed) && !completeCalled.current) {
      completeCalled.current = true;
      onComplete?.();
    }
  }, [elapsed, dismissed, onComplete]);

  // ── Skip handler (Phase 4-5 only) ────────────────────────────────────────
  const handleClick = useCallback(() => {
    if (elapsed >= 6000) setDismissed(true);
  }, [elapsed]);

  if (dismissed) return null;

  // ── Phase calculations ────────────────────────────────────────────────────
  const s = elapsed / 1000; // seconds

  // Phase 1: Formation    0-3s
  // Phase 2: Beams        3-4.5s
  // Phase 3: Flash        4.5-6s
  // Phase 4: Message      6-8s
  // Phase 5: Dissolve     8-9s

  const inFormation = s < 3;
  const inBeams     = s >= 3 && s < 4.5;
  const inFlash     = s >= 4.5 && s < 6;
  const inMessage   = s >= 6 && s < 8;
  const inDissolve  = s >= 8;

  // Overlay opacity
  let overlayOpacity = 1;
  if (inDissolve) overlayOpacity = Math.max(0, 1 - (s - 8));

  // Flash circle scale (4.5-6s: grows from 0 to fill screen)
  const flashProgress = inFlash ? (s - 4.5) / 1.5 : 0;
  const flashScale = inFlash ? flashProgress * 20 : 0;
  // Hold white from 5.5-6s
  const pureWhite = s >= 5.5 && s < 6;

  // Background: black in formation/beams, transition to white in flash
  let bgColor = '#000';
  if (inFlash) bgColor = flashProgress > 0.3 ? '#fff' : '#000';
  if (inMessage || inDissolve) bgColor = '#fff';

  // Cards & beams visible until flash dissolves them
  const showCards = s < 5.0;
  const showBeams = inBeams || (inFlash && s < 5.0);

  // Center glow (during beams)
  const centerGlowSize = inBeams ? Math.min(40, 40 * ((s - 3) / 1.5)) : 0;

  return (
    <div
      style={{
        ...styles.overlay,
        opacity: overlayOpacity,
        backgroundColor: bgColor,
        cursor: s >= 6 ? 'pointer' : 'default',
      }}
      onClick={handleClick}
    >
      <style>{keyframes()}</style>

      {/* ── Cards in circle ───────────────────────────────────────────────── */}
      {showCards && FORMATION.map(({ tier, angle, activateAt }, i) => {
        const activated = s >= activateAt;
        const activationProgress = activated
          ? Math.min(1, (s - activateAt) / 0.4)
          : 0;

        const rad = (angle * Math.PI) / 180;
        const x = Math.cos(rad) * RADIUS;
        const y = Math.sin(rad) * RADIUS;

        const scale = 0.8 + 0.2 * activationProgress;
        const opacity = 0.2 + 0.8 * activationProgress;
        const grayscale = 1 - activationProgress;
        const accent = TMAP[tier]?.accent || '#888';

        // Radar ping ring
        const showPing = activated && (s - activateAt) < 0.8;
        const pingProgress = showPing ? (s - activateAt) / 0.8 : 0;

        return (
          <div key={tier} style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: CARD_W,
            height: CARD_H,
            transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale})`,
            opacity,
            filter: `grayscale(${grayscale})`,
            transition: 'opacity 0.3s, filter 0.3s, transform 0.1s',
            zIndex: 10,
          }}>
            {/* Ping ring */}
            {showPing && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 40 + pingProgress * 80,
                height: 40 + pingProgress * 80,
                borderRadius: '50%',
                border: `2px solid ${accent}`,
                opacity: 1 - pingProgress,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
              }} />
            )}
            <div style={{
              width: CARD_W,
              height: CARD_H,
              borderRadius: 8,
              overflow: 'hidden',
              background: '#111',
              boxShadow: activated ? `0 0 12px 4px ${accent}44` : 'none',
            }}>
              <img src={tierImage(tier)} alt={`T${tier}`} style={styles.cardImg} />
            </div>
          </div>
        );
      })}

      {/* ── Energy beams toward center ────────────────────────────────────── */}
      {showBeams && FORMATION.map(({ tier, angle }) => {
        const accent = TMAP[tier]?.accent || '#888';
        const rad = (angle * Math.PI) / 180;
        // Beam origin: card center
        const ox = Math.cos(rad) * RADIUS;
        const oy = Math.sin(rad) * RADIUS;
        // Beam length = distance from card to center = RADIUS
        const beamProgress = inBeams ? Math.min(1, (s - 3) / 0.5) : 1;
        const beamLength = RADIUS * beamProgress;
        // Beam angle: from card toward center = angle + 180
        const beamAngle = angle + 180;

        return (
          <div key={`beam-${tier}`} style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 15,
            height: beamLength,
            background: `linear-gradient(to bottom, ${accent}00, ${accent}cc, ${accent}ff)`,
            transformOrigin: 'center top',
            transform: `translate(calc(-50% + ${ox}px), ${oy}px) rotate(${beamAngle + 90}deg)`,
            opacity: inFlash ? Math.max(0, 1 - (s - 4.5) * 4) : 1,
            borderRadius: 4,
            pointerEvents: 'none',
            zIndex: 5,
          }} />
        );
      })}

      {/* ── Center glow ───────────────────────────────────────────────────── */}
      {(inBeams || inFlash) && (
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: inFlash ? flashScale * 60 : centerGlowSize,
          height: inFlash ? flashScale * 60 : centerGlowSize,
          borderRadius: '50%',
          background: '#fff',
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 40px 20px rgba(255,255,255,0.5)',
          opacity: inFlash ? Math.max(0, 1 - flashProgress * 0.5) : 1,
          pointerEvents: 'none',
          zIndex: 15,
        }} />
      )}

      {/* ── Phase 4: Message text ─────────────────────────────────────────── */}
      {(inMessage || inDissolve) && (
        <div style={styles.messageWrap}>
          {s >= 6.0 && (
            <div style={{
              ...styles.msgLine,
              fontSize: 14,
              opacity: Math.min(1, (s - 6.0) / 0.3),
            }}>
              ALL SIX TIERS HELD.
            </div>
          )}
          {s >= 6.5 && (
            <div style={{
              ...styles.msgLine,
              fontSize: 14,
              opacity: Math.min(1, (s - 6.5) / 0.3),
              marginTop: 20,
            }}>
              THE COUNTDOWN HAS BEGUN.
            </div>
          )}
          {s >= 7.0 && (
            <div style={{
              ...styles.msgLine,
              fontSize: 24,
              opacity: Math.min(1, (s - 7.0) / 0.3),
              marginTop: 28,
            }}>
              7 DAYS.
            </div>
          )}
          {s >= 7.5 && (
            <div style={{
              ...styles.msgLine,
              fontSize: 9,
              opacity: Math.min(0.5, (s - 7.5) / 0.3 * 0.5),
              marginTop: 24,
            }}>
              The community is watching.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Keyframes ───────────────────────────────────────────────────────────────
function keyframes() {
  return `
    @keyframes cascade-fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
  `;
}

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  messageWrap: {
    position: 'relative',
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  },
  msgLine: {
    fontFamily: '"Press Start 2P", monospace',
    color: '#000',
    letterSpacing: 2,
    lineHeight: 1.6,
  },
};
