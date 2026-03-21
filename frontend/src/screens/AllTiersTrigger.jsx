/**
 * AllTiersTrigger.jsx
 * ─────────────────────────────────────────────────────────────────
 * Rendered when the player holds all 6 tiers (T2–T7).
 * Full-screen takeover with 90-second countdown, TRIGGER NOW,
 * SHARE FIRST (html2canvas + Web Share API / X link), and
 * auto-trigger on expiry.
 *
 * Props:
 *   walletAddress  string   — connected wallet (truncated for display)
 *   balances       object   — { 2: n, 3: n, ... 7: n }
 *   onTriggered    fn       — called after claimHolderStatus() confirms
 *                             (parent navigates to CountdownHolder)
 *
 * Contract:
 *   BlockHuntToken.claimHolderStatus()
 *   address: see CONTRACTS.TOKEN in config/wagmi.js
 * ─────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import html2canvas from 'html2canvas';
import { CONTRACTS } from '../config/wagmi.js';
import { TOKEN_ABI } from '../abis/index.js';
import CollectionCascade from '../components/CollectionCascade';

// ── Tier metadata ─────────────────────────────────────────────────
const TIER_META = {
  7: { name: 'THE INERT',      color: '#b0a060', glow: '#d4c87a', img: '/src/assets/T7.png' },
  6: { name: 'THE RESTLESS',   color: '#8888cc', glow: '#aaaaff', img: '/src/assets/T6.png' },
  5: { name: 'THE REMEMBERED', color: '#60a080', glow: '#7ecfa0', img: '/src/assets/T5.png' },
  4: { name: 'THE ORDERED',    color: '#cc8844', glow: '#ffaa66', img: '/src/assets/T4.png' },
  3: { name: 'THE CHAOTIC',    color: '#cc4488', glow: '#ff66aa', img: '/src/assets/T3.png' },
  2: { name: 'THE WILLFUL',    color: '#cc3322', glow: '#ff5544', img: '/src/assets/T2.png' },
};

const TRIGGER_DURATION = 90; // seconds before auto-trigger

function shortAddr(addr) {
  if (!addr) return '???';
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function fmtCountdown(secs) {
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// ─────────────────────────────────────────────────────────────────
export default function AllTiersTrigger({ walletAddress, balances, onTriggered, alreadyTriggered = false }) {
  const cascadeKey = `blockhunt_cascade_${walletAddress}`;
  const alreadySeen = walletAddress ? localStorage.getItem(cascadeKey) : true;
  const [showCascade, setShowCascade] = useState(!alreadySeen);

  const [secondsLeft, setSecondsLeft] = useState(TRIGGER_DURATION);
  const [phase, setPhase]             = useState('READY');
  const [shareError, setShareError]   = useState(null);
  const [txError, setTxError]         = useState(null);

  const cardsRef     = useRef(null);
  const autoFiredRef = useRef(false);

  const { writeContract, data: txHash, isPending: isTxPending, error: writeError } = useWriteContract();
  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (writeError) {
      setTxError(writeError.shortMessage || 'Transaction rejected.');
      setPhase('READY');
    }
  }, [writeError]);

  useEffect(() => {
    if (txConfirmed) {
      setPhase('DONE');
      setTimeout(onTriggered, 1200);
    }
  }, [txConfirmed, onTriggered]);

  useEffect(() => {
    if (phase === 'TRIGGERING' || phase === 'WAITING_TX' || phase === 'DONE') return;
    const tick = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(tick);
          if (!autoFiredRef.current) {
            autoFiredRef.current = true;
            fireTrigger();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── TRIGGER: call contract or skip if already triggered on-chain ────
  const fireTrigger = useCallback(() => {
    if (alreadyTriggered) {
      // Countdown already active on-chain — play the full celebration sequence
      setPhase('DONE');
      setTimeout(onTriggered, 4000);
      return;
    }
    setPhase('TRIGGERING');
    setTxError(null);
    writeContract({
      address: CONTRACTS.TOKEN,
      abi: TOKEN_ABI,
      functionName: 'claimHolderStatus',
      args: [],
      gas: 300000n,
    });
    setPhase('WAITING_TX');
  }, [writeContract, alreadyTriggered, onTriggered]);

  const handleShare = useCallback(async () => {
    setPhase('SHARING');
    setShareError(null);
    const shareText = `I'm holding all 6 tiers in The Block Hunt — 7 days on the clock. Can you take it from me? #BlockHunt`;
    const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    try {
      const canvas = await html2canvas(cardsRef.current, { backgroundColor: '#07120d', scale: 2, useCORS: true, logging: false });
      if (navigator.share && navigator.canShare) {
        canvas.toBlob(async (blob) => {
          const file = new File([blob], 'block-hunt-all-tiers.png', { type: 'image/png' });
          try {
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({ title: 'The Block Hunt', text: shareText, files: [file] });
            } else {
              await navigator.share({ title: 'The Block Hunt', text: shareText });
            }
          } catch (e) {
            if (e.name !== 'AbortError') window.open(xUrl, '_blank');
          }
        }, 'image/png');
      } else {
        const link = document.createElement('a');
        link.download = 'block-hunt-all-tiers.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        setTimeout(() => window.open(xUrl, '_blank'), 400);
      }
    } catch (err) {
      setShareError('Screenshot failed — opening X anyway.');
      window.open(xUrl, '_blank');
    }
    setPhase('READY');
  }, []);

  const urgent   = secondsLeft <= 20;
  const critical = secondsLeft <= 5;

  if (showCascade) {
    return (
      <CollectionCascade
        onComplete={() => {
          localStorage.setItem(cascadeKey, '1');
          setShowCascade(false);
        }}
      />
    );
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.bgGlow} />
      <div style={styles.scanlines} />
      <div style={styles.woodTop} />
      <div style={styles.woodBottom} />
      <div style={styles.woodLeft} />
      <div style={styles.woodRight} />

      <div style={styles.inner}>

        <div style={styles.headerBanner}>
          <div style={styles.crownRow}>
            <span style={styles.crownIcon}>👑</span>
            <span style={styles.bannerTitle}>ALL 6 TIERS COLLECTED</span>
            <span style={styles.crownIcon}>👑</span>
          </div>
          <div style={styles.walletLine}>{shortAddr(walletAddress)} · Holder Candidate</div>
        </div>

        <div style={{
          ...styles.timerBox,
          borderColor: critical ? '#ff2200' : urgent ? '#ffaa00' : '#c8a84b',
          boxShadow: critical
            ? '0 0 30px rgba(255,34,0,0.5), inset 0 0 20px rgba(255,34,0,0.1)'
            : urgent ? '0 0 20px rgba(255,170,0,0.4)' : '0 0 12px rgba(200,168,75,0.3)',
          animation: critical ? 'timerPulse 0.4s ease-in-out infinite' : 'none',
        }}>
          <div style={styles.timerLabel}>TRIGGER IN</div>
          <div style={{ ...styles.timerValue, color: critical ? '#ff4422' : urgent ? '#ffcc44' : '#f0ead6' }}>
            {fmtCountdown(secondsLeft)}
          </div>
          <div style={styles.timerSub}>or it auto-fires</div>
        </div>

        <div ref={cardsRef} style={styles.cardsGrid} id="tier-cards-capture">
          {[7, 6, 5, 4, 3, 2].map((tier) => {
            const meta = TIER_META[tier];
            const qty  = balances?.[tier] ?? 0;
            return (
              <div key={tier} style={{
                ...styles.card,
                borderColor: meta.color,
                boxShadow: `0 0 16px ${meta.glow}55, 0 4px 8px rgba(0,0,0,0.5)`,
                animation: `cardFloat ${1.8 + tier * 0.15}s ease-in-out infinite`,
              }}>
                <img src={meta.img} alt={meta.name} style={styles.cardImg} onError={(e) => { e.target.style.display = 'none'; }} />
                <div style={{ ...styles.cardTierBadge, color: meta.glow }}>TIER {tier}</div>
                <div style={styles.cardName}>{meta.name}</div>
                <div style={{ ...styles.cardQty, color: meta.glow }}>×{qty}</div>
              </div>
            );
          })}
        </div>

        {(phase === 'READY' || phase === 'SHARING') && (
          <div style={styles.buttonRow}>
            <button
              onClick={fireTrigger}
              disabled={phase === 'SHARING'}
              style={styles.triggerBtn}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 0 28px rgba(255,170,0,0.7), 0 6px 0 #7a4000'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)';    e.currentTarget.style.boxShadow = '0 0 20px rgba(255,170,0,0.5), 0 4px 0 #7a4000'; }}
            >
              ⚡ TRIGGER NOW
            </button>
            <button
              onClick={handleShare}
              disabled={phase === 'SHARING'}
              style={{ ...styles.shareBtn, opacity: phase === 'SHARING' ? 0.6 : 1 }}
              onMouseEnter={e => { if (phase !== 'SHARING') e.currentTarget.style.transform = 'scale(1.03)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              {phase === 'SHARING' ? '📸 CAPTURING...' : '📸 SHARE FIRST'}
            </button>
          </div>
        )}

        {(phase === 'TRIGGERING' || phase === 'WAITING_TX') && (
          <div style={styles.txPending}>
            <div style={styles.spinner} />
            <div style={styles.txPendingText}>{isTxPending ? 'Confirm in MetaMask…' : 'Transaction pending…'}</div>
            {txHash && (
              <a href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer" style={styles.txLink}>
                View on BaseScan ↗
              </a>
            )}
          </div>
        )}

        {phase === 'DONE' && (
          <div style={styles.doneState}>
            <div style={styles.doneFlare} />
            <div style={styles.doneIcon}>⚡</div>
            <div style={styles.doneText}>COUNTDOWN STARTED</div>
            <div style={styles.doneSubtext}>7 days on the clock</div>
            <div style={styles.donePulseRing} />
          </div>
        )}

        {txError    && <div style={styles.errorMsg}>{txError}</div>}
        {shareError && <div style={{ ...styles.errorMsg, color: '#ffaa44' }}>{shareError}</div>}

        <div style={styles.footNote}>
          Timer is for your decision — the contract call happens immediately on click.
        </div>
      </div>

      <style>{`
        @keyframes timerPulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        @keyframes cardFloat  { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-5px)} }
        @keyframes spin       { to{transform:rotate(360deg)} }
        @keyframes doneFlash  { 0%{opacity:0;transform:scale(0.6)} 60%{transform:scale(1.1)} 100%{opacity:1;transform:scale(1)} }
        @keyframes doneGlow   { 0%{opacity:0;transform:scale(0.3)} 40%{opacity:1;transform:scale(1.2)} 100%{opacity:0.6;transform:scale(1)} }
        @keyframes pulseRing  { 0%{transform:scale(0.5);opacity:0.8;border-width:4px} 100%{transform:scale(2.5);opacity:0;border-width:1px} }
        @keyframes subtextIn  { 0%{opacity:0;transform:translateY(10px)} 100%{opacity:1;transform:translateY(0)} }
        @keyframes iconPulse  { 0%,100%{transform:scale(1);text-shadow:0 0 20px rgba(110,255,138,0.8)} 50%{transform:scale(1.1);text-shadow:0 0 40px rgba(110,255,138,1), 0 0 80px rgba(110,255,138,0.5)} }
      `}</style>
    </div>
  );
}

const FONT_PIXEL = "'Press Start 2P', monospace";
const FONT_RETRO = "'VT323', monospace";

const styles = {
  overlay:    { position:'fixed', inset:0, zIndex:9000, background:'#07120d', display:'flex', flexDirection:'column', alignItems:'center', overflowY:'auto', fontFamily:FONT_PIXEL },
  bgGlow:     { position:'fixed', top:'-60px', left:'50%', transform:'translateX(-50%)', width:'700px', height:'300px', background:'radial-gradient(ellipse, rgba(200,168,75,0.18) 0%, transparent 70%)', pointerEvents:'none', zIndex:0 },
  scanlines:  { position:'fixed', inset:0, pointerEvents:'none', zIndex:1, background:'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)' },
  woodTop:    { position:'fixed', top:0,    left:0, right:0,  height:18, background:'#2c1810', borderBottom:'3px solid #8a6820', zIndex:20 },
  woodBottom: { position:'fixed', bottom:0, left:0, right:0,  height:18, background:'#2c1810', borderTop:'3px solid #8a6820',    zIndex:20 },
  woodLeft:   { position:'fixed', top:0, left:0,   bottom:0, width:18,  background:'#2c1810', borderRight:'3px solid #8a6820',  zIndex:20 },
  woodRight:  { position:'fixed', top:0, right:0,  bottom:0, width:18,  background:'#2c1810', borderLeft:'3px solid #8a6820',   zIndex:20 },
  inner:      { position:'relative', zIndex:10, display:'flex', flexDirection:'column', alignItems:'center', padding:'36px 24px 40px', gap:20, width:'100%', maxWidth:680 },
  headerBanner: { textAlign:'center', padding:'18px 32px', background:'linear-gradient(180deg, rgba(200,168,75,0.15) 0%, transparent 100%)', border:'2px solid #c8a84b', borderRadius:4, width:'100%' },
  crownRow:   { display:'flex', alignItems:'center', justifyContent:'center', gap:12, marginBottom:8 },
  crownIcon:  { fontSize:22 },
  bannerTitle:{ fontSize:14, color:'#e8c86b', letterSpacing:2, textShadow:'0 0 12px rgba(232,200,107,0.7)' },
  walletLine: { fontFamily:FONT_RETRO, fontSize:18, color:'rgba(240,234,214,0.6)', letterSpacing:1 },
  timerBox:   { textAlign:'center', padding:'14px 40px', border:'2px solid', borderRadius:4, background:'rgba(0,0,0,0.5)', minWidth:200, transition:'border-color 0.3s, box-shadow 0.3s' },
  timerLabel: { fontSize:8, color:'rgba(240,234,214,0.5)', letterSpacing:3, marginBottom:6 },
  timerValue: { fontFamily:FONT_RETRO, fontSize:56, lineHeight:1, letterSpacing:4, transition:'color 0.3s' },
  timerSub:   { fontFamily:FONT_RETRO, fontSize:14, color:'rgba(240,234,214,0.4)', marginTop:4, letterSpacing:1 },
  cardsGrid:  { display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12, width:'100%', padding:'16px', background:'rgba(0,0,0,0.3)', border:'1px solid rgba(200,168,75,0.2)', borderRadius:6 },
  card:       { display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'10px 6px 8px', background:'linear-gradient(160deg, #0e2a1a, #07120d)', border:'2px solid', borderRadius:4, cursor:'default' },
  cardImg:    { width:'100%', maxWidth:90, height:'auto', imageRendering:'pixelated', borderRadius:3 },
  cardTierBadge: { fontSize:7, letterSpacing:1, marginTop:2 },
  cardName:   { fontFamily:FONT_RETRO, fontSize:13, color:'rgba(240,234,214,0.7)', textAlign:'center', lineHeight:1.2 },
  cardQty:    { fontFamily:FONT_RETRO, fontSize:20, letterSpacing:1 },
  buttonRow:  { display:'flex', gap:14, width:'100%', justifyContent:'center', flexWrap:'wrap' },
  triggerBtn: { fontFamily:FONT_PIXEL, fontSize:11, color:'#1a0800', background:'linear-gradient(180deg, #ffcc44, #c8a800)', border:'2px solid #8a6800', borderRadius:3, padding:'14px 28px', cursor:'pointer', letterSpacing:1, boxShadow:'0 0 20px rgba(255,170,0,0.5), 0 4px 0 #7a4000', transition:'transform 0.1s, box-shadow 0.1s' },
  shareBtn:   { fontFamily:FONT_PIXEL, fontSize:10, color:'#f0ead6', background:'rgba(200,168,75,0.12)', border:'2px solid #c8a84b', borderRadius:3, padding:'14px 20px', cursor:'pointer', letterSpacing:1, transition:'transform 0.1s' },
  txPending:  { display:'flex', flexDirection:'column', alignItems:'center', gap:12, padding:'20px' },
  spinner:    { width:32, height:32, border:'3px solid rgba(200,168,75,0.2)', borderTop:'3px solid #c8a84b', borderRadius:'50%', animation:'spin 0.8s linear infinite' },
  txPendingText: { fontFamily:FONT_RETRO, fontSize:20, color:'#c8a84b', letterSpacing:1 },
  txLink:     { fontFamily:FONT_RETRO, fontSize:14, color:'rgba(200,168,75,0.6)', textDecoration:'none' },
  doneState:  { position:'relative', display:'flex', flexDirection:'column', alignItems:'center', gap:12, animation:'doneFlash 0.8s ease-out', padding:'30px 0' },
  doneFlare:  { position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:200, height:200, borderRadius:'50%', background:'radial-gradient(circle, rgba(110,255,138,0.3) 0%, rgba(110,255,138,0.05) 50%, transparent 70%)', animation:'doneGlow 1s ease-out', pointerEvents:'none' },
  doneIcon:   { fontSize:64, color:'#6eff8a', animation:'iconPulse 1.5s ease-in-out infinite', zIndex:1 },
  doneText:   { fontFamily:FONT_RETRO, fontSize:32, color:'#6eff8a', letterSpacing:4, textShadow:'0 0 20px rgba(110,255,138,0.8)', zIndex:1 },
  doneSubtext:{ fontFamily:FONT_RETRO, fontSize:18, color:'rgba(110,255,138,0.6)', letterSpacing:2, animation:'subtextIn 0.6s ease-out 0.4s both', zIndex:1 },
  donePulseRing:{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:100, height:100, borderRadius:'50%', border:'3px solid rgba(110,255,138,0.6)', animation:'pulseRing 1.5s ease-out infinite', pointerEvents:'none' },
  errorMsg:   { fontFamily:FONT_RETRO, fontSize:14, color:'#ff5544', textAlign:'center', padding:'8px 16px', background:'rgba(255,85,68,0.1)', border:'1px solid rgba(255,85,68,0.3)', borderRadius:3, maxWidth:400 },
  footNote:   { fontFamily:FONT_RETRO, fontSize:13, color:'rgba(240,234,214,0.3)', textAlign:'center', letterSpacing:0.5, maxWidth:400 },
};
