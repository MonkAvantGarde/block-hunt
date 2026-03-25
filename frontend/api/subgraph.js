const SUBGRAPH_URL = "https://api.studio.thegraph.com/query/1744131/blok-hunt/version/latest";

// Per-query cache: key = query hash, value = { data, ts }
const cache = new Map();
const CACHE_TTL = 60_000; // 1 minute for player-specific queries
const MAX_CACHE_SIZE = 500;

function hashQuery(query) {
  // Simple hash for cache key
  let h = 0;
  for (let i = 0; i < query.length; i++) {
    h = ((h << 5) - h + query.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { query } = req.body || {};
  if (!query) return res.status(400).json({ error: "Missing query" });

  const key = hashQuery(query);
  const now = Date.now();

  // Check cache
  const entry = cache.get(key);
  if (entry && (now - entry.ts) < CACHE_TTL) {
    res.setHeader("X-Cache", "HIT");
    return res.status(200).json(entry.data);
  }

  // Fetch from subgraph
  try {
    const response = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) throw new Error(`Subgraph ${response.status}`);
    const json = await response.json();

    // Cache the result
    if (cache.size >= MAX_CACHE_SIZE) {
      // Evict oldest entry
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
    cache.set(key, { data: json, ts: now });

    res.setHeader("X-Cache", "MISS");
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=30");
    return res.status(200).json(json);
  } catch (e) {
    // Serve stale cache if available
    if (entry) {
      res.setHeader("X-Cache", "STALE");
      return res.status(200).json(entry.data);
    }
    return res.status(502).json({ error: e.message });
  }
}
