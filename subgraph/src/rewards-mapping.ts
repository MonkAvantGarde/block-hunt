import { BigInt, Bytes } from "@graphprotocol/graph-ts"
import {
  DailyDrawResolved,
  DailyPrizeClaimed,
  BatchFirstAwarded,
  BatchFirstClaimed,
  BatchBountySet,
  BatchBountyClaimed,
  BatchFunded,
} from "../generated/BlockHuntRewards/BlockHuntRewards"
import { DailyDraw, BatchFirst, BatchBounty, BatchRewardConfig, Player } from "../generated/schema"

const ZERO = BigInt.fromI32(0)

function getOrCreatePlayer(address: string): Player {
  let player = Player.load(address)
  if (!player) {
    player = new Player(address)
    player.address             = changetype<Bytes>(Bytes.fromHexString(address))
    player.tier1Balance        = ZERO
    player.tier2Balance        = ZERO
    player.tier3Balance        = ZERO
    player.tier4Balance        = ZERO
    player.tier5Balance        = ZERO
    player.tier6Balance        = ZERO
    player.tier7Balance        = ZERO
    player.tiersUnlocked       = 0
    player.totalMints          = ZERO
    player.totalCombines       = ZERO
    player.totalForges         = ZERO
    player.totalForgeSuccesses = ZERO
    player.progressionScore    = ZERO
    player.lastUpdated         = ZERO
    player.save()
  }
  return player as Player
}

// ── Daily Lottery ──────────────────────────────────────────────────────────

export function handleDailyDrawResolved(event: DailyDrawResolved): void {
  let id = "draw-" + event.params.day.toString()
  let draw = new DailyDraw(id)
  let winnerAddr = event.params.winner.toHexString().toLowerCase()

  getOrCreatePlayer(winnerAddr)

  draw.day        = event.params.day
  draw.winner     = winnerAddr
  draw.prize      = event.params.prize
  draw.resolvedAt = event.block.timestamp
  draw.claimed    = false
  draw.save()
}

export function handleDailyPrizeClaimed(event: DailyPrizeClaimed): void {
  let id = "draw-" + event.params.day.toString()
  let draw = DailyDraw.load(id)
  if (draw) {
    draw.claimed       = true
    draw.claimedAmount = event.params.amount
    draw.save()
  }
}

// ── Batch Firsts ──────────────────────────────────────────────────────────

export function handleBatchFirstAwarded(event: BatchFirstAwarded): void {
  let id = event.params.batch.toString() + "-" + event.params.achievementId.toString()
  let bf = new BatchFirst(id)
  let winnerAddr = event.params.winner.toHexString().toLowerCase()

  getOrCreatePlayer(winnerAddr)

  bf.batch         = event.params.batch.toI32()
  bf.achievementId = event.params.achievementId.toI32()
  bf.winner        = winnerAddr
  bf.prize         = event.params.prize
  bf.awardedAt     = event.block.timestamp
  bf.claimed       = false
  bf.save()
}

export function handleBatchFirstClaimed(event: BatchFirstClaimed): void {
  let id = event.params.batch.toString() + "-" + event.params.achievementId.toString()
  let bf = BatchFirst.load(id)
  if (bf) {
    bf.claimed       = true
    bf.claimedAmount = event.params.amount
    bf.save()
  }
}

// ── Batch Bounty ──────────────────────────────────────────────────────────

export function handleBatchBountySet(event: BatchBountySet): void {
  let id = "bounty-" + event.params.batch.toString()
  let bounty = new BatchBounty(id)
  bounty.batch           = event.params.batch.toI32()
  bounty.totalRecipients = event.params.recipients
  bounty.perWalletShare  = event.params.perWallet
  bounty.setAt           = event.block.timestamp
  bounty.distributed     = false
  bounty.save()
}

export function handleBatchBountyClaimed(event: BatchBountyClaimed): void {
  // Individual claim — we could track per-player claims but the entity
  // is batch-level. Mark as distributed if we see any claim.
  let id = "bounty-" + event.params.batch.toString()
  let bounty = BatchBounty.load(id)
  if (bounty) {
    bounty.distributed = true
    bounty.save()
  }
}

// ── Batch Funding ─────────────────────────────────────────────────────────

export function handleBatchFunded(event: BatchFunded): void {
  let id = "config-" + event.params.batch.toString()
  let config = BatchRewardConfig.load(id)
  if (!config) {
    config = new BatchRewardConfig(id)
    config.batch        = event.params.batch.toI32()
    config.totalDeposit = ZERO
    config.active       = true
  }
  config.totalDeposit = config.totalDeposit.plus(event.params.amount)
  config.save()
}
