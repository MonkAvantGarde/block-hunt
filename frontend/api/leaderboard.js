const SUBGRAPH_URL = "https://api.studio.thegraph.com/query/1744131/blok-hunt/version/latest";
const CACHE_TTL = 300; // 5 minutes

let cached = null;
let cachedAt = 0;

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const now = Date.now();

  // Serve from memory cache if fresh
  if (cached && (now - cachedAt) < CACHE_TTL * 1000) {
    res.setHeader("Cache-Control", `public, s-maxage=${CACHE_TTL}, stale-while-revalidate=60`);
    res.setHeader("X-Cache", "HIT");
    res.setHeader("X-Cached-At", new Date(cachedAt).toISOString());
    return res.status(200).json(cached);
  }

  // Fetch fresh data from subgraph
  try {
    const query = `{
      players(first: 1000, orderBy: progressionScore, orderDirection: desc, where: { totalMints_gt: "0" }) {
        id totalMints totalCombines totalForges progressionScore
        tier2Balance tier3Balance tier4Balance tier5Balance tier6Balance tier7Balance
      }
      seasonStat(id: "season-1") { totalMinted uniquePlayers totalBurned }
    }`;

    const response = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) throw new Error(`Subgraph returned ${response.status}`);

    const json = await response.json();
    if (json.errors) throw new Error(json.errors[0].message);

    cached = {
      players: json.data?.players || [],
      stats: json.data?.seasonStat || null,
      updatedAt: new Date().toISOString(),
    };
    cachedAt = now;

    res.setHeader("Cache-Control", `public, s-maxage=${CACHE_TTL}, stale-while-revalidate=60`);
    res.setHeader("X-Cache", "MISS");
    return res.status(200).json(cached);
  } catch (e) {
    // If we have stale cache, serve it
    if (cached) {
      res.setHeader("X-Cache", "STALE");
      res.setHeader("X-Error", e.message);
      return res.status(200).json(cached);
    }
    return res.status(502).json({ error: e.message });
  }
}
