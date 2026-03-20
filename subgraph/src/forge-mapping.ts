import { BigInt, Bytes } from "@graphprotocol/graph-ts"
import {
  ForgeRequested,
  ForgeResolved,
} from "../generated/BlockHuntForge/BlockHuntForge"
import { ForgeRequest, Player } from "../generated/schema"

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

export function handleForgeRequested(event: ForgeRequested): void {
  let id = event.params.requestId.toString()
  let req = new ForgeRequest(id)
  let playerAddr = event.params.player.toHexString().toLowerCase()

  // Ensure player exists
  getOrCreatePlayer(playerAddr)

  req.requestId  = event.params.requestId
  req.player     = playerAddr
  req.fromTier   = event.params.fromTier.toI32()
  req.burnCount  = event.params.burnCount
  req.resolved   = false
  req.success    = false
  req.createdAt  = event.block.timestamp
  req.save()
}

export function handleForgeResolved(event: ForgeResolved): void {
  let id = event.params.requestId.toString()
  let req = ForgeRequest.load(id)
  if (req) {
    req.resolved   = true
    req.success    = event.params.success
    req.resolvedAt = event.block.timestamp
    req.save()
  }
}
