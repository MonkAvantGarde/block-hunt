import {
  Web3Function,
  Web3FunctionContext,
} from "@gelatonetwork/web3-functions-sdk";
import { Contract, JsonRpcProvider, id as ethersId } from "ethers";

// ── ABIs ────────────────────────────────────────────────────────────────────

const REWARDS_ABI = [
  "function resolveDailyDraw(uint256 day, uint256 batch, address[] wallets, uint256 randomSeed) external",
  "function setBatchFirstWinner(uint256 batch, uint256 achievementId, address winner) external",
  "function addBatchBountyRecipients(uint256 batch, address[] wallets) external",
  "function finalizeBatchBounty(uint256 batch) external",
  "function batchFirsts(uint256 batch, uint256 achievementId) external view returns (address winner, uint256 prize, uint256 awardedAt, bool claimed)",
  "function batchBounties(uint256 batch) external view returns (uint256 totalRecipients, uint256 perWalletShare, uint256 setAt, bool distributed)",
  "function dailyDraws(uint256 day) external view returns (uint256 batch, uint256 prize, address winner, uint256 resolvedAt, bool claimed)",
  "function dailyPrize(uint256 batch) external view returns (uint256)",
  "function lotteryRemaining(uint256 batch) external view returns (uint256)",
];

const MINT_WINDOW_ABI = [
  "function currentBatch() external view returns (uint256)",
];

// ── Achievement definitions ─────────────────────────────────────────────────

interface AchievementDef {
  id: number;
  name: string;
  query: (batch: number) => string;
  extractWinner: (data: any) => string | null;
}

const SUBGRAPH_BATCH_FILTER = (batch: number) =>
  `where: { batch: ${batch} }`;

// Build subgraph queries for each achievement type
function buildAchievementDefs(): AchievementDef[] {
  return [
    {
      id: 0,
      name: "Pioneer",
      query: (batch) => `{ mintFulfilleds(first: 1, orderBy: blockTimestamp, orderDirection: asc, ${SUBGRAPH_BATCH_FILTER(batch)}) { player } }`,
      extractWinner: (data) => data?.mintFulfilleds?.[0]?.player || null,
    },
    {
      id: 1,
      name: "Combiner",
      query: (batch) => `{ blocksCombineds(first: 1, orderBy: blockTimestamp, orderDirection: asc, ${SUBGRAPH_BATCH_FILTER(batch)}) { by } }`,
      extractWinner: (data) => data?.blocksCombineds?.[0]?.by || null,
    },
    {
      id: 2,
      name: "Smith",
      query: (batch) => `{ blocksForges(first: 1, orderBy: blockTimestamp, orderDirection: asc, where: { success: true }) { by } }`,
      extractWinner: (data) => data?.blocksForges?.[0]?.by || null,
    },
    {
      id: 3,
      name: "Centurion",
      query: (_batch) => `{ players(first: 1, orderBy: totalMints, orderDirection: desc, where: { totalMints_gte: "100" }) { id } }`,
      extractWinner: (data) => data?.players?.[0]?.id || null,
    },
    {
      id: 4,
      name: "Five Hundred",
      query: (_batch) => `{ players(first: 1, orderBy: totalMints, orderDirection: desc, where: { totalMints_gte: "500" }) { id } }`,
      extractWinner: (data) => data?.players?.[0]?.id || null,
    },
    {
      id: 5,
      name: "The Thousand",
      query: (_batch) => `{ players(first: 1, orderBy: totalMints, orderDirection: desc, where: { totalMints_gte: "1000" }) { id } }`,
      extractWinner: (data) => data?.players?.[0]?.id || null,
    },
    {
      id: 6,
      name: "Contender",
      query: (_batch) => `{ players(first: 1, where: { tier2Balance_gt: "0", tier3Balance_gt: "0", tier4Balance_gt: "0", tier5Balance_gt: "0", tier6Balance_gt: "0", tier7Balance_gt: "0" }) { id } }`,
      extractWinner: (data) => data?.players?.[0]?.id || null,
    },
    {
      id: 7,
      name: "Countdown Threat",
      query: (_batch) => `{ countdownStarteds(first: 1, orderBy: blockTimestamp, orderDirection: asc) { holder } }`,
      extractWinner: (data) => data?.countdownStarteds?.[0]?.holder || null,
    },
    // Tier discoveries (IDs 8-12): first mint of each tier
    ...[
      { id: 8, tier: 6, name: "First Restless" },
      { id: 9, tier: 5, name: "First Remembered" },
      { id: 10, tier: 4, name: "First Ordered" },
      { id: 11, tier: 3, name: "First Chaotic" },
      { id: 12, tier: 2, name: "First Willful" },
    ].map((t) => ({
      id: t.id,
      name: t.name,
      query: (_batch: number) =>
        `{ players(first: 1, orderBy: totalMints, orderDirection: asc, where: { tier${t.tier}Balance_gt: "0" }) { id } }`,
      extractWinner: (data: any) => data?.players?.[0]?.id || null,
    })),
  ];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function querySubgraph(
  url: string,
  query: string
): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  return json?.data || null;
}

// ── Main ────────────────────────────────────────────────────────────────────

Web3Function.onRun(async (context: Web3FunctionContext) => {
  const { userArgs, storage, multiChainProvider } = context;

  const rewardsAddress = userArgs.rewardsAddress as string;
  const mintWindowAddress = userArgs.mintWindowAddress as string;
  const subgraphUrl = userArgs.subgraphUrl as string;

  if (!rewardsAddress || !mintWindowAddress || !subgraphUrl) {
    return { canExec: false, message: "Missing required user args" };
  }

  const provider = multiChainProvider.default() as any;
  const rewards = new Contract(rewardsAddress, REWARDS_ABI, provider);
  const mintWindow = new Contract(mintWindowAddress, MINT_WINDOW_ABI, provider);

  const callData: Array<{ to: string; data: string }> = [];

  try {
    const currentBatch = Number(await mintWindow.currentBatch());

    // ════════════════════════════════════════════════════════════════════
    // STEP 1: DAILY LOTTERY
    // ════════════════════════════════════════════════════════════════════

    const currentDay = Math.floor(Date.now() / 86400000);
    const lastProcessed = await storage.get("lastProcessedDay");
    const lastDay = lastProcessed ? parseInt(lastProcessed) : 0;

    if (currentDay > lastDay) {
      // Query wallets that had activity yesterday
      const yesterdayStart = (currentDay - 1) * 86400;
      const yesterdayEnd = currentDay * 86400;

      const activityData = await querySubgraph(
        subgraphUrl,
        `{
          playerActivities(
            first: 1000,
            where: { date_gte: "${new Date(yesterdayStart * 1000).toISOString().split("T")[0]}", date_lt: "${new Date(yesterdayEnd * 1000).toISOString().split("T")[0]}", hasMint: true }
          ) {
            player { id }
          }
        }`
      );

      const activities = activityData?.playerActivities || [];
      const uniqueWallets = [
        ...new Set(activities.map((a: any) => a.player?.id).filter(Boolean)),
      ] as string[];

      if (uniqueWallets.length > 0) {
        // Check if daily prize is configured and pool has funds
        const prize = await rewards.dailyPrize(currentBatch);
        const remaining = await rewards.lotteryRemaining(currentBatch);

        if (prize > 0n && remaining >= prize) {
          // Generate deterministic seed (not VRF — testnet only)
          const seed = BigInt(
            ethersId(Date.now().toString() + uniqueWallets.join(""))
          );

          // Use yesterday's day number as the draw day
          const drawDay = currentDay - 1;

          // Check if already resolved
          const existingDraw = await rewards.dailyDraws(drawDay);
          if (existingDraw.resolvedAt === 0n) {
            callData.push({
              to: rewardsAddress,
              data: rewards.interface.encodeFunctionData("resolveDailyDraw", [
                drawDay,
                currentBatch,
                uniqueWallets,
                seed,
              ]),
            });
          }
        }
      }

      await storage.set("lastProcessedDay", currentDay.toString());
    }

    // ════════════════════════════════════════════════════════════════════
    // STEP 2: BATCH FIRSTS
    // ════════════════════════════════════════════════════════════════════

    const achievementDefs = buildAchievementDefs();

    for (const def of achievementDefs) {
      const storageKey = `awardedFirsts_${currentBatch}_${def.id}`;
      const alreadyAwarded = await storage.get(storageKey);

      if (alreadyAwarded === "true") continue;

      // Check on-chain if already awarded
      const onChain = await rewards.batchFirsts(currentBatch, def.id);
      if (onChain.winner !== "0x0000000000000000000000000000000000000000") {
        await storage.set(storageKey, "true");
        continue;
      }

      // Query subgraph for winner
      try {
        const data = await querySubgraph(subgraphUrl, def.query(currentBatch));
        const winner = def.extractWinner(data);

        if (winner) {
          callData.push({
            to: rewardsAddress,
            data: rewards.interface.encodeFunctionData("setBatchFirstWinner", [
              currentBatch,
              def.id,
              winner,
            ]),
          });
          await storage.set(storageKey, "true");
        }
      } catch {
        // Skip this achievement if query fails — will retry next run
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // STEP 3: BATCH BOUNTY
    // ════════════════════════════════════════════════════════════════════

    // Check if a batch just completed (previous batch)
    if (currentBatch > 1) {
      const prevBatch = currentBatch - 1;
      const bountyKey = `bountyFinalized_${prevBatch}`;
      const bountyDone = await storage.get(bountyKey);

      if (bountyDone !== "true") {
        // Check on-chain if already finalized
        const bountyState = await rewards.batchBounties(prevBatch);

        if (!bountyState.distributed) {
          // Query all unique wallets that minted in the completed batch
          let allWallets: string[] = [];
          let skip = 0;
          const PAGE_SIZE = 1000;

          while (true) {
            const data = await querySubgraph(
              subgraphUrl,
              `{
                players(
                  first: ${PAGE_SIZE},
                  skip: ${skip},
                  where: { totalMints_gt: "0" }
                ) {
                  id
                }
              }`
            );

            const players = data?.players || [];
            allWallets.push(...players.map((p: any) => p.id));

            if (players.length < PAGE_SIZE) break;
            skip += PAGE_SIZE;
          }

          // Submit in chunks of 500
          const CHUNK_SIZE = 500;
          for (let i = 0; i < allWallets.length; i += CHUNK_SIZE) {
            const chunk = allWallets.slice(i, i + CHUNK_SIZE);
            callData.push({
              to: rewardsAddress,
              data: rewards.interface.encodeFunctionData(
                "addBatchBountyRecipients",
                [prevBatch, chunk]
              ),
            });
          }

          // Finalize after all chunks
          if (allWallets.length > 0) {
            callData.push({
              to: rewardsAddress,
              data: rewards.interface.encodeFunctionData(
                "finalizeBatchBounty",
                [prevBatch]
              ),
            });
          }
        }

        await storage.set(bountyKey, "true");
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // RETURN
    // ════════════════════════════════════════════════════════════════════

    if (callData.length === 0) {
      return { canExec: false, message: "Nothing to process this run" };
    }

    return { canExec: true, callData };
  } catch (err: any) {
    return {
      canExec: false,
      message: `Rewards keeper error: ${err.message}`,
    };
  }
});
