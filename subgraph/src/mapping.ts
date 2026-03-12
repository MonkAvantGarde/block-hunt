import { BigInt, Bytes } from "@graphprotocol/graph-ts"
import { TransferSingle, TransferBatch } from "../generated/BlockHuntToken/BlockHuntToken"
import { MintFulfilled } from "../generated/BlockHuntToken/BlockHuntToken"
import { Player, SeasonStat } from "../generated/schema"

// ─────────────────────────────────────────────────────────────────────────────
// Tier weights — T7 blocks required to produce 1 of each tier
// Matches your combine ratios:
//   T7→T6: 20   T6→T5: 20   T5→T4: 30   T4→T3: 30   T3→T2: 50
// ─────────────────────────────────────────────────────────────────────────────
const WEIGHT_T2 = BigInt.fromString("18000000") // 20 × 20 × 30 × 30 × 50
const WEIGHT_T3 = BigInt.fromString("360000")   // 20 × 20 × 30 × 30
const WEIGHT_T4 = BigInt.fromString("12000")    // 20 × 20 × 30
const WEIGHT_T5 = BigInt.fromString("400")      // 20 × 20
const WEIGHT_T6 = BigInt.fromString("20")       // 20
const WEIGHT_T7 = BigInt.fromString("1")

const ZERO        = BigInt.fromI32(0)
const ADDR_ZERO   = "0x0000000000000000000000000000000000000000"

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getOrCreateStats(): SeasonStat {
  let stats = SeasonStat.load("season-1")
  if (!stats) {
    stats = new SeasonStat("season-1")
    stats.totalMinted    = ZERO
    stats.totalBurned    = ZERO
    stats.uniquePlayers  = 0
  }
  return stats as SeasonStat
}

function getOrCreatePlayer(address: string): Player {
  let player = Player.load(address)
  if (!player) {
    player = new Player(address)
    player.address          = Bytes.fromHexString(address)
    player.tier1Balance     = ZERO
    player.tier2Balance     = ZERO
    player.tier3Balance     = ZERO
    player.tier4Balance     = ZERO
    player.tier5Balance     = ZERO
    player.tier6Balance     = ZERO
    player.tier7Balance     = ZERO
    player.tiersUnlocked    = 0
    player.totalMints       = ZERO
    player.progressionScore = ZERO
    player.lastUpdated      = ZERO

    // First time we see this address — increment unique player count
    let stats = getOrCreateStats()
    stats.uniquePlayers = stats.uniquePlayers + 1
    stats.save()
  }
  return player as Player
}

function getTierBalance(player: Player, tier: i32): BigInt {
  if (tier == 1) return player.tier1Balance
  if (tier == 2) return player.tier2Balance
  if (tier == 3) return player.tier3Balance
  if (tier == 4) return player.tier4Balance
  if (tier == 5) return player.tier5Balance
  if (tier == 6) return player.tier6Balance
  if (tier == 7) return player.tier7Balance
  return ZERO
}

function setTierBalance(player: Player, tier: i32, value: BigInt): void {
  if (tier == 1)      player.tier1Balance = value
  else if (tier == 2) player.tier2Balance = value
  else if (tier == 3) player.tier3Balance = value
  else if (tier == 4) player.tier4Balance = value
  else if (tier == 5) player.tier5Balance = value
  else if (tier == 6) player.tier6Balance = value
  else if (tier == 7) player.tier7Balance = value
}

// Recalculate progressionScore and tiersUnlocked after any balance change
function recalcPlayer(player: Player): void {
  let t2 = player.tier2Balance
  let t3 = player.tier3Balance
  let t4 = player.tier4Balance
  let t5 = player.tier5Balance
  let t6 = player.tier6Balance
  let t7 = player.tier7Balance

  player.progressionScore =
    t2.times(WEIGHT_T2)
      .plus(t3.times(WEIGHT_T3))
      .plus(t4.times(WEIGHT_T4))
      .plus(t5.times(WEIGHT_T5))
      .plus(t6.times(WEIGHT_T6))
      .plus(t7.times(WEIGHT_T7))

  let count = 0
  if (t2.gt(ZERO)) count++
  if (t3.gt(ZERO)) count++
  if (t4.gt(ZERO)) count++
  if (t5.gt(ZERO)) count++
  if (t6.gt(ZERO)) count++
  if (t7.gt(ZERO)) count++
  player.tiersUnlocked = count
}

// ─────────────────────────────────────────────────────────────────────────────
// Event: TransferSingle (ERC-1155 standard — fires on every token movement)
// ─────────────────────────────────────────────────────────────────────────────
export function handleTransferSingle(event: TransferSingle): void {
  let tier      = event.params.id.toI32()
  let amount    = event.params.value
  let fromAddr  = event.params.from.toHexString().toLowerCase()
  let toAddr    = event.params.to.toHexString().toLowerCase()
  let timestamp = event.block.timestamp
  let stats     = getOrCreateStats()

  // ── Burn (to = zero address) ───────────────────────────────────────────────
  if (toAddr == ADDR_ZERO) {
    let fromPlayer = getOrCreatePlayer(fromAddr)
    let newBal = getTierBalance(fromPlayer, tier).minus(amount)
    setTierBalance(fromPlayer, tier, newBal.lt(ZERO) ? ZERO : newBal)
    recalcPlayer(fromPlayer)
    fromPlayer.lastUpdated = timestamp
    fromPlayer.save()

    stats.totalBurned = stats.totalBurned.plus(amount)
    stats.save()
    return
  }

  // ── Mint (from = zero address) ─────────────────────────────────────────────
  if (fromAddr == ADDR_ZERO) {
    let toPlayer = getOrCreatePlayer(toAddr)
    setTierBalance(toPlayer, tier, getTierBalance(toPlayer, tier).plus(amount))
    // NOTE: totalMints is tracked via MintFulfilled only — not here.
    // TransferSingle from 0x0 fires for combine/forge outputs too, which
    // would overcount. MintFulfilled only fires for VRF mint completions.
    recalcPlayer(toPlayer)
    toPlayer.lastUpdated = timestamp
    toPlayer.save()

    stats.totalMinted = stats.totalMinted.plus(amount)
    stats.save()
    return
  }

  // ── Transfer (from → to) ───────────────────────────────────────────────────
  let fromPlayer = getOrCreatePlayer(fromAddr)
  let newFromBal = getTierBalance(fromPlayer, tier).minus(amount)
  setTierBalance(fromPlayer, tier, newFromBal.lt(ZERO) ? ZERO : newFromBal)
  recalcPlayer(fromPlayer)
  fromPlayer.lastUpdated = timestamp
  fromPlayer.save()

  let toPlayer = getOrCreatePlayer(toAddr)
  setTierBalance(toPlayer, tier, getTierBalance(toPlayer, tier).plus(amount))
  recalcPlayer(toPlayer)
  toPlayer.lastUpdated = timestamp
  toPlayer.save()
}

// ─────────────────────────────────────────────────────────────────────────────
// Event: TransferBatch — fires when multiple tiers are minted at once (VRF delivery)
// This is the primary event for mint results since _mintBatch is used.
// ─────────────────────────────────────────────────────────────────────────────
export function handleTransferBatch(event: TransferBatch): void {
  let ids      = event.params.ids
  let values   = event.params.values
  let fromAddr = event.params.from.toHexString().toLowerCase()
  let toAddr   = event.params.to.toHexString().toLowerCase()
  let timestamp = event.block.timestamp
  let stats    = getOrCreateStats()

  for (let i = 0; i < ids.length; i++) {
    let tier   = ids[i].toI32()
    let amount = values[i]

    // ── Burn ────────────────────────────────────────────────────────────────
    if (toAddr == ADDR_ZERO) {
      let fromPlayer = getOrCreatePlayer(fromAddr)
      let newBal = getTierBalance(fromPlayer, tier).minus(amount)
      setTierBalance(fromPlayer, tier, newBal.lt(ZERO) ? ZERO : newBal)
      recalcPlayer(fromPlayer)
      fromPlayer.lastUpdated = timestamp
      fromPlayer.save()
      stats.totalBurned = stats.totalBurned.plus(amount)

    // ── Mint ────────────────────────────────────────────────────────────────
    } else if (fromAddr == ADDR_ZERO) {
      let toPlayer = getOrCreatePlayer(toAddr)
      setTierBalance(toPlayer, tier, getTierBalance(toPlayer, tier).plus(amount))
      recalcPlayer(toPlayer)
      toPlayer.lastUpdated = timestamp
      toPlayer.save()
      stats.totalMinted = stats.totalMinted.plus(amount)

    // ── Transfer ────────────────────────────────────────────────────────────
    } else {
      let fromPlayer = getOrCreatePlayer(fromAddr)
      let newBal = getTierBalance(fromPlayer, tier).minus(amount)
      setTierBalance(fromPlayer, tier, newBal.lt(ZERO) ? ZERO : newBal)
      recalcPlayer(fromPlayer)
      fromPlayer.lastUpdated = timestamp
      fromPlayer.save()

      let toPlayer = getOrCreatePlayer(toAddr)
      setTierBalance(toPlayer, tier, getTierBalance(toPlayer, tier).plus(amount))
      recalcPlayer(toPlayer)
      toPlayer.lastUpdated = timestamp
      toPlayer.save()
    }
  }

  stats.save()
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
export function handleMintFulfilled(event: MintFulfilled): void {
  let playerAddr = event.params.player.toHexString().toLowerCase()
  let player = getOrCreatePlayer(playerAddr)
  player.totalMints  = player.totalMints.plus(event.params.quantity)
  player.lastUpdated = event.block.timestamp
  player.save()
}
