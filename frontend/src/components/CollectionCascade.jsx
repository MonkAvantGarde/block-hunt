// ─────────────────────────────────────────────────────────────────────────────
// CollectionCascade.jsx — Animation 6: Captain Planet
//
// Full-screen overlay. Pure CSS animations. No canvas, no external libs.
// Safari-compatible (no individual transform properties).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TMAP, CREAM } from '../config/design-tokens';
import sounds from '../hooks/useSound';

// Tier card images
const tierImage = (n) => new URL(`../assets/T${n}.png`, import.meta.url).href;

// ── Formation order & angles ────────────────────────────────────────────────
const FORMATION = [
  { tier: 7, angle: -90,  activateAt: 0.0 },
  { tier: 6, angle: -30,  activateAt: 1.5 },
  { tier: 5, angle:  30,  activateAt: 2.7 },
  { tier: 4, angle: 150,  activateAt: 3.6 },
  { tier: 3, angle: 210,  activateAt: 4.2 },
  { tier: 2, angle:  90,  activateAt: 4.5 },
];

const RADIUS = 200;
const CARD_W = 120;
const CARD_H = 160;
const TOTAL_DURATION = 27000;

export default function CollectionCascade({ onComplete }) {
  const [elapsed, setElapsed] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const startRef = useRef(null);
  const rafRef = useRef(null);
  const completeCalled = useRef(false);

  // Play collection sound when full-set animation triggers
  useEffect(() => {
    sounds.collection();
  }, []);

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
    if (elapsed >= 18000) setDismissed(true);
  }, [elapsed]);

  if (dismissed) return null;

  // ── Phase calculations ────────────────────────────────────────────────────
  const s = elapsed / 1000; // seconds

  // Phase 1: Formation    0-9s
  // Phase 2: Beams        9-13.5s
  // Phase 3: Flash        13.5-18s
  // Phase 4: Message      18-24s
  // Phase 5: Dissolve     24-27s

  const inFormation = s < 9;
  const inBeams     = s >= 9 && s < 13.5;
  const inFlash     = s >= 13.5 && s < 18;
  const inMessage   = s >= 18 && s < 24;
  const inDissolve  = s >= 24;

  // Overlay opacity
  let overlayOpacity = 1;
  if (inDissolve) overlayOpacity = Math.max(0, 1 - (s - 24) / 3);

  // Flash circle scale (13.5-18s: grows from 0 to fill screen)
  const flashProgress = inFlash ? (s - 13.5) / 4.5 : 0;
  const flashScale = inFlash ? flashProgress * 20 : 0;
  // Hold white from 16.5-18s
  const pureWhite = s >= 16.5 && s < 18;

  // Background: black in formation/beams, transition to white in flash
  let bgColor = '#000';
  if (inFlash) bgColor = flashProgress > 0.3 ? '#fff' : '#000';
  if (inMessage || inDissolve) bgColor = '#fff';

  // Cards & beams visible until flash dissolves them
  const showCards = s < 15.0;
  const showBeams = inBeams || (inFlash && s < 15.0);

  // Center glow (during beams)
  const centerGlowSize = inBeams ? Math.min(40, 40 * ((s - 9) / 4.5)) : 0;

  return (
    <div
      style={{
        ...styles.overlay,
        opacity: overlayOpacity,
        backgroundColor: bgColor,
        cursor: s >= 18 ? 'pointer' : 'default',
      }}
      onClick={handleClick}
    >
      <style>{keyframes()}</style>

      {/* ── Cards in circle ───────────────────────────────────────────────── */}
      {showCards && FORMATION.map(({ tier, angle, activateAt }, i) => {
        const activated = s >= activateAt;
        const activationProgress = activated
          ? Math.min(1, (s - activateAt) / 1.2)
          : 0;

        const rad = (angle * Math.PI) / 180;
        const x = Math.cos(rad) * RADIUS;
        const y = Math.sin(rad) * RADIUS;

        const scale = 0.8 + 0.2 * activationProgress;
        const opacity = 0.2 + 0.8 * activationProgress;
        const grayscale = 1 - activationProgress;
        const accent = TMAP[tier]?.accent || '#888';

        // Radar ping ring
        const showPing = activated && (s - activateAt) < 2.4;
        const pingProgress = showPing ? (s - activateAt) / 2.4 : 0;

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
        // Beam grows from card toward center
        const beamProgress = inBeams ? Math.min(1, (s - 9) / 1.5) : 1;
        const beamLength = RADIUS * beamProgress;
        // Beam starts at card edge, grows inward
        const startDist = RADIUS - beamLength;
        const bx = Math.cos(rad) * (startDist + beamLength / 2);
        const by = Math.sin(rad) * (startDist + beamLength / 2);
        // Rotate beam to align along the radius (toward center)
        const beamRotation = angle + 90;

        return (
          <div key={`beam-${tier}`} style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 15,
            height: beamLength,
            background: `linear-gradient(to bottom, ${accent}00, ${accent}cc, ${accent}ff)`,
            transformOrigin: 'center center',
            transform: `translate(calc(-50% + ${bx}px), calc(-50% + ${by}px)) rotate(${beamRotation}deg)`,
            opacity: inFlash ? Math.max(0, 1 - (s - 13.5) * 1.33) : 1,
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
          opacity: inFlash ? Math.max(0, 1 - flashProgress * 0.3) : 1,
          pointerEvents: 'none',
          zIndex: 15,
        }} />
      )}

      {/* ── Phase 4: Message text ─────────────────────────────────────────── */}
      {(inMessage || inDissolve) && (
        <div style={styles.messageWrap}>
          {s >= 18.0 && (
            <div style={{
              ...styles.msgLine,
              fontSize: 14,
              opacity: Math.min(1, (s - 18.0) / 0.9),
            }}>
              ALL SIX TIERS HELD.
            </div>
          )}
          {s >= 19.5 && (
            <div style={{
              ...styles.msgLine,
              fontSize: 14,
              opacity: Math.min(1, (s - 19.5) / 0.9),
              marginTop: 20,
            }}>
              THE COUNTDOWN HAS BEGUN.
            </div>
          )}
          {s >= 21.0 && (
            <div style={{
              ...styles.msgLine,
              fontSize: 24,
              opacity: Math.min(1, (s - 21.0) / 0.9),
              marginTop: 28,
            }}>
              7 DAYS.
            </div>
          )}
          {s >= 22.5 && (
            <div style={{
              ...styles.msgLine,
              fontSize: 9,
              opacity: Math.min(0.5, (s - 22.5) / 0.9 * 0.5),
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