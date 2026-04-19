import { BigInt, Bytes } from "@graphprotocol/graph-ts"
import {
  TierBountyWon,
  TierBountyClaimed,
  LotteryDistributed,
  StreakClaimed,
  ReferrerLinked,
  ReferralClaimed,
} from "../generated/BlockHuntRewards/BlockHuntRewards"
import { TierBounty, LotteryDraw, StreakClaim, ReferralClaim, ReferralLink, Player } from "../generated/schema"

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

// ── Tier Bounty ──────────────────────────────────────────────────────────

export function handleTierBountyWon(event: TierBountyWon): void {
  let season = event.params.season
  let batch = event.params.batch
  let tier = event.params.tier
  let id = season.toString() + "-" + batch.toString() + "-" + tier.toString()

  let winnerAddr = event.params.winner.toHexString().toLowerCase()
  getOrCreatePlayer(winnerAddr)

  let bounty = new TierBounty(id)
  bounty.season  = season
  bounty.batch   = batch
  bounty.tier    = tier
  bounty.winner  = winnerAddr
  bounty.amount  = ZERO
  bounty.claimed = false
  bounty.wonAt   = event.block.timestamp
  bounty.save()
}

export function handleTierBountyClaimed(event: TierBountyClaimed): void {
  let season = event.params.season
  let batch = event.params.batch
  let tier = event.params.tier
  let id = season.toString() + "-" + batch.toString() + "-" + tier.toString()

  let bounty = TierBounty.load(id)
  if (bounty) {
    bounty.claimed = true
    bounty.amount  = event.params.amount
    bounty.save()
  }
}

// ── Lottery ──────────────────────────────────────────────────────────────

export function handleLotteryDistributed(event: LotteryDistributed): void {
  let season = event.params.season
  let day = event.params.day
  let id = "lottery-" + season.toString() + "-" + day.toString()

  let winnerAddr = event.params.winner.toHexString().toLowerCase()
  getOrCreatePlayer(winnerAddr)

  let draw = new LotteryDraw(id)
  draw.season        = season
  draw.day           = day.toI32()
  draw.winner        = winnerAddr
  draw.amount        = event.params.amount
  draw.distributedAt = event.block.timestamp
  draw.save()
}

// ── Streak ───────────────────────────────────────────────────────────────

export function handleStreakClaimed(event: StreakClaimed): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()

  let playerAddr = event.params.player.toHexString().toLowerCase()
  getOrCreatePlayer(playerAddr)

  let claim = new StreakClaim(id)
  claim.season         = event.params.season
  claim.player         = playerAddr
  claim.milestoneIndex = event.params.milestoneIndex
  claim.blocksRewarded = event.params.blocks
  claim.claimedAt      = event.block.timestamp
  claim.save()
}

// ── Referral ─────────────────────────────────────────────────────────────

export function handleReferrerLinked(event: ReferrerLinked): void {
  let refereeAddr  = event.params.referee.toHexString().toLowerCase()
  let referrerAddr = event.params.referrer.toHexString().toLowerCase()

  getOrCreatePlayer(refereeAddr)
  getOrCreatePlayer(referrerAddr)

  let link = new ReferralLink(refereeAddr)
  link.referee  = refereeAddr
  link.referrer = referrerAddr
  link.linkedAt = event.block.timestamp
  link.save()
}

export function handleReferralClaimed(event: ReferralClaimed): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()

  let referrerAddr = event.params.referrer.toHexString().toLowerCase()
  let refereeAddr  = event.params.referee.toHexString().toLowerCase()

  getOrCreatePlayer(referrerAddr)
  getOrCreatePlayer(refereeAddr)

  let claim = new ReferralClaim(id)
  claim.referrer  = referrerAddr
  claim.referee   = refereeAddr
  claim.amount    = event.params.amount
  claim.claimedAt = event.block.timestamp
  claim.save()
}
