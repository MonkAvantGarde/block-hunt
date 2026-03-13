import { TMAP, INK } from '../config/design-tokens';

export const CARD_IMAGES = {
  1: new URL('../assets/T1.png', import.meta.url).href,
  2: new URL('../assets/T2.png', import.meta.url).href,
  3: new URL('../assets/T3.png', import.meta.url).href,
  4: new URL('../assets/T4.png', import.meta.url).href,
  5: new URL('../assets/T5.png', import.meta.url).href,
  6: new URL('../assets/T6.png', import.meta.url).href,
  7: new URL('../assets/T7.png', import.meta.url).href,
};

export default function TierCard({ tierId, size="md", glow=false }) {
  const t = TMAP[tierId];
  if (!t) return null;
  const img = CARD_IMAGES[tierId];
  const d = { sm:{w:56,h:56}, md:{w:140,h:140}, lg:{w:140,h:140} }[size];
  const glowFilter = glow
    ? `drop-shadow(0 0 6px ${t.accent}cc) drop-shadow(0 0 14px ${t.accent}66)`
    : "none";
  return (
    <div className="tier-card-img" style={{
      width:d.w, height:d.h, borderRadius:8, overflow:"hidden",
      flexShrink:0, position:"relative",
      boxShadow: glow ? `3px 3px 0 ${INK}, 0 0 20px ${t.accent}55, 0 0 40px ${t.accent}22` : `3px 3px 0 ${INK}`,
      transition:"box-shadow 0.3s",
    }}>
      <img src={img} alt={t.name} style={{
        width:"100%", height:"100%", objectFit:"cover",
        imageRendering:"pixelated", display:"block",
        filter:glowFilter, transition:"filter 0.3s",
      }} />
    </div>
  );
}
