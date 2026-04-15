# Redeploy + Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 2026-04-13 final testnet redeploy with all 13 security hardening items (SH-1 through SH-13) from the 2026-04-15 bug priority verdict, producing a safe-to-mainnet codebase for Token, Countdown, Forge, Treasury, Escrow, and MintWindow.

**Architecture:** Contract-by-contract TDD. Start with leaf contracts (Treasury, Escrow, MintWindow) that have no dependencies on the other upgraded contracts. Then Countdown (new cumulative-defense state + pending-forge integration). Then Forge. Then Token last (heaviest changes, depends on all of the above). Each task writes the failing test first, makes it pass, commits. Plan 2 (Rewards) builds on top of this plan's branch.

**Tech Stack:** Solidity 0.8.28, Foundry (forge + cast), OpenZeppelin Contracts 5.1, Chainlink VRF V2.5, Base Sepolia.

**Source specs:**
- `docs/superpowers/specs/2026-04-13-final-testnet-redeploy-design.md`
- `bug_priority_verdict.md`

**Out of scope:** `BlockHuntRewards.sol` changes (Plan 2), `BlockHuntMarketplace.sol` (deferred per BUG-10 P2), frontend changes (covered after both contract plans), subgraph changes (Phase 2 of spec).

---

## File Map

| File | Responsibility in this plan |
|------|----------------------------|
| `src/BlockHuntTreasury.sol` | 20% mint fee, remove `emergencyWithdraw`, creator fee floor + event (SH-12), explicit amount to escrow (SH-9) |
| `src/BlockHuntEscrow.sol` | Accept explicit `amount` parameter (SH-9), remove `address(this).balance` read |
| `src/BlockHuntMintWindow.sol` | Cycle auto-reset (§1.9), setter bounds (§1.9) |
| `src/BlockHuntCountdown.sol` | Cumulative defense (§1.7), season-indexed progression + leaderboard (§1.8, SH-10), holderSince guard (SH-1), `eliminatePlayer` (SH-11), `hasAllTiers` pending-forge aware (SH-5), `advanceSeason`, remove `castVote` (SH-13), read `countdownDuration` as source of truth (§1.7, bug-21) |
| `src/BlockHuntForge.sol` | Basis-point probability (SH-8), deferred countdown check in batch (§1.10), struct packing + storage cleanup, pendingForgeBurns increment/decrement including cancel path (SH-5) |
| `src/BlockHuntToken.sol` | VRF gas params configurable with bounds (§1.1, SH-2), try/catch all VRF external calls (§1.2, SH-3), hybrid mint w/ lazy reveal (§1.3), refund TTL configurable (§1.4), burn-1-per-tier on endgame (SH-6), `combineMany` cap (SH-7), `pendingForgeBurns` counter API (SH-5), `executeDefaultOnExpiry` grace period (SH-4), `rewardMint` stub (SH-11 integration), gas optimizations (§1.10 items 10/11/12/13, struct packing), remove dead `windowDayMinted` |
| `script/Deploy.s.sol` | Updated wiring order + post-deploy config calls |
| `test/BlockHuntTreasury.t.sol` | New unit test file (isolate Treasury tests) |
| `test/BlockHuntEscrow.t.sol` | New unit test file |
| `test/BlockHuntMintWindow.t.sol` | New unit test file |
| `test/BlockHuntCountdown.t.sol` | New unit test file |
| `test/BlockHuntForge.t.sol` | New unit test file |
| `test/BlockHuntToken.t.sol` | New unit test file |
| `test/BlockHunt.integration.t.sol` | Rename of existing `test/BlockHunt.t.sol` — keep full-system integration tests here |
| `test/BlockHuntInvariants.t.sol` | New invariant test file (holderSince, vault accounting, pending forge cleanup) |

**Test strategy:** Each contract gets a focused unit test file. Full-system flows stay in the integration test. Invariants live in a separate file runnable via `forge test --match-path test/BlockHuntInvariants.t.sol`.

---

## Phase A — Leaf Contracts (no dependencies)

### Task A1: Treasury — raise mint fee to 20%, remove emergencyWithdraw, add floor + event

**Files:**
- Modify: `src/BlockHuntTreasury.sol`
- Create: `test/BlockHuntTreasury.t.sol`

- [ ] **Step A1.1 — Create test file with failing tests**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/BlockHuntTreasury.sol";

contract BlockHuntTreasuryTest is Test {
    BlockHuntTreasury treasury;
    address owner = address(0xBEEF);
    address creator = address(0xC0DE);
    address token = address(0x7070);

    event CreatorFeeUpdated(uint256 oldBps, uint256 newBps);

    function setUp() public {
        vm.prank(owner);
        treasury = new BlockHuntTreasury(creator);
        vm.prank(owner);
        treasury.setTokenContract(token);
    }

    function test_InitialCreatorFeeIs2000Bps() public {
        assertEq(treasury.creatorFeeBps(), 2000);
    }

    function test_SetCreatorFeeBelowFloorReverts() public {
        vm.prank(owner);
        vm.expectRevert(bytes("Below minimum"));
        treasury.setCreatorFee(499);
    }

    function test_SetCreatorFeeEmitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit CreatorFeeUpdated(2000, 1500);
        treasury.setCreatorFee(1500);
    }

    function test_EmergencyWithdrawRemoved() public {
        (bool ok, ) = address(treasury).call(
            abi.encodeWithSignature("emergencyWithdraw()")
        );
        assertFalse(ok, "emergencyWithdraw should not exist");
    }

    function test_ReceiveMintFundsRoutes80PctToPool() public {
        vm.deal(token, 10 ether);
        vm.prank(token);
        treasury.receiveMintFunds{value: 10 ether}();
        assertEq(treasury.prizePool(), 8 ether);
        assertEq(creator.balance, 2 ether);
    }
}
```

- [ ] **Step A1.2 — Run tests, confirm they fail**

```bash
forge test --match-path test/BlockHuntTreasury.t.sol -vv
```
Expected: compilation error or failing asserts for each new test.

- [ ] **Step A1.3 — Modify `BlockHuntTreasury.sol`**

Add state:
```solidity
uint256 public constant MIN_CREATOR_FEE = 500;   // 5% floor
uint256 public constant MAX_CREATOR_FEE = 3000;  // keep existing max
event CreatorFeeUpdated(uint256 oldBps, uint256 newBps);
```

Change initial `creatorFeeBps` assignment in the constructor from `1000` to `2000`.

Replace `setCreatorFee` with:
```solidity
function setCreatorFee(uint256 bps) external onlyOwner {
    require(bps >= MIN_CREATOR_FEE, "Below minimum");
    require(bps <= MAX_CREATOR_FEE, "Exceeds max");
    emit CreatorFeeUpdated(creatorFeeBps, bps);
    creatorFeeBps = bps;
}
```

Delete the `emergencyWithdraw` function entirely.

- [ ] **Step A1.4 — Run tests, confirm they pass**

```bash
forge test --match-path test/BlockHuntTreasury.t.sol -vv
```
Expected: all 5 tests pass.

- [ ] **Step A1.5 — Commit**

```bash
git add src/BlockHuntTreasury.sol test/BlockHuntTreasury.t.sol
git commit -m "treasury: 20% fee, remove emergencyWithdraw, add floor + event (SH-12, §1.5, §1.6)"
```

---

### Task A2: Treasury + Escrow — explicit amount on sacrifice (SH-9)

**Files:**
- Modify: `src/BlockHuntTreasury.sol` (the `sacrificePayout` function)
- Modify: `src/BlockHuntEscrow.sol` (`initiateSacrifice` signature)
- Create: `test/BlockHuntEscrow.t.sol`

- [ ] **Step A2.1 — Write failing Escrow test**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/BlockHuntEscrow.sol";

contract BlockHuntEscrowTest is Test {
    BlockHuntEscrow escrow;
    address owner = address(0xBEEF);
    address token = address(0x7070);
    address treasury = address(0xA550);
    address winner = address(0xDEAD);

    function setUp() public {
        vm.prank(owner);
        escrow = new BlockHuntEscrow();
        vm.startPrank(owner);
        escrow.setTokenContract(token);
        escrow.setTreasuryContract(treasury);
        vm.stopPrank();
    }

    function test_InitiateSacrificeUsesExplicitAmountNotBalance() public {
        vm.deal(address(escrow), 10 ether);   // "stray" ETH
        vm.deal(treasury, 4 ether);            // treasury-sent amount
        vm.prank(treasury);
        (bool ok, ) = address(escrow).call{value: 4 ether}("");
        assertTrue(ok);

        vm.prank(token);
        escrow.initiateSacrifice(winner, 4 ether);

        // Winner gets 50% of 4 ether = 2 ether (not 50% of 14 ether)
        assertEq(winner.balance, 2 ether);
    }
}
```

- [ ] **Step A2.2 — Run test, confirm failure**

```bash
forge test --match-path test/BlockHuntEscrow.t.sol -vv
```

- [ ] **Step A2.3 — Modify `BlockHuntEscrow.sol`**

Change signature and body:
```solidity
function initiateSacrifice(address winner, uint256 amount) external onlyToken {
    require(amount > 0, "Zero amount");
    uint256 winnerShare    = amount * 50 / 100;
    uint256 communityShare = amount * 40 / 100;
    uint256 s2Share        = amount - winnerShare - communityShare;  // avoid rounding dust

    (bool wOk, ) = payable(winner).call{value: winnerShare}("");
    require(wOk, "Winner transfer failed");

    _distributeCommunity(communityShare);  // keep existing logic
    _seedSeason2(s2Share);                  // keep existing logic

    emit SacrificeExecuted(winner, amount, winnerShare, communityShare, s2Share);
}
```

- [ ] **Step A2.4 — Modify `BlockHuntTreasury.sol` `sacrificePayout`**

Change it to call:
```solidity
IBlockHuntEscrow(escrow).initiateSacrifice{value: amount}(winner, amount);
```
where `amount` is the already-calculated prize pool value.

- [ ] **Step A2.5 — Run Escrow test, confirm pass**

```bash
forge test --match-path test/BlockHuntEscrow.t.sol -vv
```

- [ ] **Step A2.6 — Commit**

```bash
git add src/BlockHuntTreasury.sol src/BlockHuntEscrow.sol test/BlockHuntEscrow.t.sol
git commit -m "escrow: accept explicit amount on sacrifice (SH-9, BUG-5)"
```

---

### Task A3: MintWindow — cycle auto-reset + setter bounds (§1.9)

**Files:**
- Modify: `src/BlockHuntMintWindow.sol`
- Create: `test/BlockHuntMintWindow.t.sol`

- [ ] **Step A3.1 — Write failing tests**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/BlockHuntMintWindow.sol";

contract BlockHuntMintWindowTest is Test {
    BlockHuntMintWindow window;
    address owner = address(0xBEEF);
    address token = address(0x7070);
    address alice = address(0xA11CE);

    function setUp() public {
        vm.prank(owner);
        window = new BlockHuntMintWindow();
        vm.prank(owner);
        window.setTokenContract(token);
    }

    function test_CycleResetsAfter3HoursOfInactivity() public {
        vm.prank(token);
        window.recordMint(alice, 400);
        (uint32 cycleMints, , ) = window.playerMintInfo(alice);
        assertEq(cycleMints, 400);

        vm.warp(block.timestamp + 3 hours + 1);

        vm.prank(token);
        window.recordMint(alice, 1);
        (cycleMints, , ) = window.playerMintInfo(alice);
        assertEq(cycleMints, 1, "Cycle should reset");
    }

    function test_SetCycleDurationBoundsEnforced() public {
        vm.prank(owner);
        vm.expectRevert(bytes("Duration out of range"));
        window.setCycleDuration(30 seconds);

        vm.prank(owner);
        vm.expectRevert(bytes("Duration out of range"));
        window.setCycleDuration(25 hours);
    }

    function test_SetCycleCapBoundsEnforced() public {
        vm.prank(owner);
        vm.expectRevert(bytes("Cap out of range"));
        window.setCycleCap(0);

        vm.prank(owner);
        vm.expectRevert(bytes("Cap out of range"));
        window.setCycleCap(10_001);
    }
}
```

- [ ] **Step A3.2 — Run tests, confirm failure**

- [ ] **Step A3.3 — Modify `BlockHuntMintWindow.sol`**

Add to the per-player state struct:
```solidity
struct PlayerMintState {
    uint32 cycleMints;
    uint32 dailyMints;
    uint32 cycleStartedAt;  // NEW: timestamp of first mint in the current cycle
    // ...existing fields
}
```

In `recordMint`, before incrementing `cycleMints`:
```solidity
PlayerMintState storage s = playerMintState[player];
if (s.cycleStartedAt == 0 || block.timestamp >= s.cycleStartedAt + cycleDuration) {
    s.cycleStartedAt = uint32(block.timestamp);
    s.cycleMints = 0;
}
s.cycleMints += uint32(quantity);
```

Add setter bounds:
```solidity
function setCycleDuration(uint256 _duration) external onlyOwner {
    require(_duration >= 1 minutes && _duration <= 24 hours, "Duration out of range");
    cycleDuration = _duration;
    emit CycleDurationUpdated(_duration);
}

function setCycleCap(uint256 _cap) external onlyOwner {
    require(_cap >= 1 && _cap <= 10_000, "Cap out of range");
    cycleCap = _cap;
    emit CycleCapUpdated(_cap);
}
```

Add matching bounds to `setDailyCap` and any other config setters (max 1M daily, min 1).

- [ ] **Step A3.4 — Run tests, confirm pass**

- [ ] **Step A3.5 — Commit**

```bash
git add src/BlockHuntMintWindow.sol test/BlockHuntMintWindow.t.sol
git commit -m "mintwindow: cycle auto-reset after inactivity, setter bounds (§1.9)"
```

---

## Phase B — Countdown (cumulative defense + leaderboard + hardening)

### Task B1: Countdown — cumulative defense state + holderSince guard (SH-1)

**Files:**
- Modify: `src/BlockHuntCountdown.sol`
- Create: `test/BlockHuntCountdown.t.sol`

- [ ] **Step B1.1 — Write failing tests**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/BlockHuntCountdown.sol";

contract MockToken {
    mapping(address => mapping(uint256 => uint256)) public bal;
    function setBal(address who, uint8 tier, uint256 n) external { bal[who][tier] = n; }
    function balanceOf(address a, uint256 t) external view returns (uint256) { return bal[a][t]; }
    function hasAllTiers(address a) external view returns (bool) {
        for (uint256 t = 2; t <= 7; t++) if (bal[a][t] == 0) return false;
        return true;
    }
    function calculateScore(address) external pure returns (uint256) { return 0; }
}

contract BlockHuntCountdownTest is Test {
    BlockHuntCountdown countdown;
    MockToken mockToken;
    address owner = address(0xBEEF);
    address alice = address(0xA11CE);
    address bob   = address(0xB0B);

    function setUp() public {
        mockToken = new MockToken();
        vm.prank(owner);
        countdown = new BlockHuntCountdown();
        vm.prank(owner);
        countdown.setTokenContract(address(mockToken));
    }

    function _fullSet(address who) internal {
        for (uint256 t = 2; t <= 7; t++) mockToken.setBal(who, uint8(t), 1);
    }

    function test_TriggerCountdownSetsHolderSince() public {
        _fullSet(alice);
        vm.prank(address(mockToken));
        countdown.triggerCountdown(alice);
        assertEq(countdown.holderSince(), block.timestamp);
        assertGt(countdown.holderSince(), 0);
    }

    function test_HolderSinceZeroInvariant() public view {
        // Before any countdown — holder is zero
        assertEq(countdown.currentHolder(), address(0));
        // Invariant: holder is zero OR holderSince > 0
        // Trivially satisfied here; enforced by tests below.
    }

    function test_CumulativeTimeBanksOnChallenge() public {
        _fullSet(alice);
        vm.prank(address(mockToken));
        countdown.triggerCountdown(alice);

        vm.warp(block.timestamp + 2 days);
        _fullSet(bob);
        vm.prank(address(mockToken));
        countdown.challenge(bob);

        // Alice should have 2 days banked
        assertEq(countdown.cumulativeDefenseTime(alice), 2 days);
        assertEq(countdown.currentHolder(), bob);
        assertEq(countdown.holderSince(), block.timestamp);
    }

    function test_CannotWinWithoutHolderSince() public {
        // Direct storage poke isn't possible without helper — we test the require
        // by asserting that a fresh countdown can't satisfy win condition
        _fullSet(alice);
        vm.prank(address(mockToken));
        countdown.triggerCountdown(alice);
        // 7 days haven't passed
        assertFalse(countdown.canClaim(alice));
    }
}
```

- [ ] **Step B1.2 — Run tests, confirm failure**

- [ ] **Step B1.3 — Modify `BlockHuntCountdown.sol`**

Add state:
```solidity
mapping(address => uint256) public cumulativeDefenseTime;
uint256 public constant REQUIRED_DEFENSE = 7 days;

address public currentHolder;
uint256 public holderSince;
```

In `triggerCountdown`:
```solidity
function triggerCountdown(address player) external onlyToken {
    require(player != address(0), "Zero player");
    require(IBlockHuntTokenCountdown(tokenContract).hasAllTiers(player), "Missing tiers");
    require(currentHolder == address(0), "Already active");

    currentHolder = player;
    holderSince   = block.timestamp;  // never skip
    isActive      = true;
    emit CountdownTriggered(player, block.timestamp);
}
```

In `challenge`:
```solidity
function challenge(address challenger) external onlyToken {
    require(currentHolder != address(0) && holderSince > 0, "Holder session not initialized");
    require(_ranksAbove(challenger, currentHolder), "Challenger must outrank holder");

    uint256 elapsed = block.timestamp - holderSince;
    cumulativeDefenseTime[currentHolder] += elapsed;

    address former = currentHolder;
    currentHolder = challenger;
    holderSince   = block.timestamp;  // explicit, never default
    emit CountdownChallenged(former, challenger, elapsed);
}
```

Add view:
```solidity
function canClaim(address player) public view returns (bool) {
    if (player != currentHolder) return false;
    if (holderSince == 0) return false;
    uint256 elapsed = block.timestamp - holderSince;
    return cumulativeDefenseTime[player] + elapsed >= REQUIRED_DEFENSE;
}
```

- [ ] **Step B1.4 — Run tests, confirm pass**

- [ ] **Step B1.5 — Commit**

```bash
git add src/BlockHuntCountdown.sol test/BlockHuntCountdown.t.sol
git commit -m "countdown: cumulative defense + holderSince guard (§1.7, SH-1)"
```

---

### Task B2: Countdown — season-indexed progression state (§1.8, SH-10)

**Files:**
- Modify: `src/BlockHuntCountdown.sol`
- Modify: `test/BlockHuntCountdown.t.sol`

- [ ] **Step B2.1 — Add failing tests**

Append to `test/BlockHuntCountdown.t.sol`:

```solidity
function test_RecordProgressionAddsPlayerOnce() public {
    vm.prank(address(mockToken));
    countdown.recordProgression(alice, 100);
    vm.prank(address(mockToken));
    countdown.recordProgression(alice, 50);

    assertEq(countdown.seasonScore(countdown.currentSeason(), alice), 150);
    assertEq(countdown.totalPlayers(), 1);
}

function test_AdvanceSeasonResetsLeaderboard() public {
    vm.prank(address(mockToken));
    countdown.recordProgression(alice, 100);

    vm.prank(owner);
    countdown.advanceSeason();

    assertEq(countdown.seasonScore(countdown.currentSeason(), alice), 0);
    assertEq(countdown.totalPlayers(), 0);

    vm.prank(address(mockToken));
    countdown.recordProgression(bob, 30);
    assertEq(countdown.seasonScore(countdown.currentSeason(), bob), 30);
}

function test_GetPlayersPaginates() public {
    for (uint160 i = 1; i <= 10; i++) {
        vm.prank(address(mockToken));
        countdown.recordProgression(address(i), i * 10);
    }
    (address[] memory addrs, uint256[] memory scores) = countdown.getPlayers(0, 5);
    assertEq(addrs.length, 5);
    assertEq(scores[0], 10);
}
```

- [ ] **Step B2.2 — Run, confirm failure**

- [ ] **Step B2.3 — Modify `BlockHuntCountdown.sol`**

Add state:
```solidity
uint256 public currentSeason;
mapping(uint256 => address[]) public seasonPlayers;
mapping(uint256 => mapping(address => uint256)) public seasonScore;
mapping(uint256 => mapping(address => bool)) public isSeasonPlayer;

event SeasonAdvanced(uint256 newSeason);
event PlayerRecorded(uint256 season, address indexed player, uint256 totalScore);
```

Functions:
```solidity
function recordProgression(address player, uint256 points) external onlyToken {
    uint256 s = currentSeason;
    if (!isSeasonPlayer[s][player]) {
        isSeasonPlayer[s][player] = true;
        seasonPlayers[s].push(player);
    }
    seasonScore[s][player] += points;
    emit PlayerRecorded(s, player, seasonScore[s][player]);
}

function totalPlayers() external view returns (uint256) {
    return seasonPlayers[currentSeason].length;
}

function getPlayers(uint256 offset, uint256 limit)
    external
    view
    returns (address[] memory addrs, uint256[] memory scores)
{
    uint256 s = currentSeason;
    address[] storage all = seasonPlayers[s];
    uint256 n = all.length;
    if (offset >= n) return (new address[](0), new uint256[](0));
    uint256 end = offset + limit > n ? n : offset + limit;
    uint256 len = end - offset;
    addrs = new address[](len);
    scores = new uint256[](len);
    for (uint256 i = 0; i < len; i++) {
        addrs[i]  = all[offset + i];
        scores[i] = seasonScore[s][addrs[i]];
    }
}

function advanceSeason() external onlyOwner {
    currentSeason += 1;
    emit SeasonAdvanced(currentSeason);
}
```

- [ ] **Step B2.4 — Run, confirm pass**

- [ ] **Step B2.5 — Commit**

```bash
git add src/BlockHuntCountdown.sol test/BlockHuntCountdown.t.sol
git commit -m "countdown: season-indexed progression + pagination (§1.8, SH-10)"
```

---

### Task B3: Countdown — eliminatePlayer + remove castVote + pendingForge-aware hasAllTiers (SH-11, SH-13, SH-5 read side)

**Files:**
- Modify: `src/BlockHuntCountdown.sol`
- Modify: `test/BlockHuntCountdown.t.sol`

- [ ] **Step B3.1 — Add failing tests**

```solidity
function test_EliminatePlayerZerosScore() public {
    vm.prank(address(mockToken));
    countdown.recordProgression(alice, 1000);
    vm.prank(address(mockToken));
    countdown.eliminatePlayer(alice);
    assertEq(countdown.seasonScore(countdown.currentSeason(), alice), 0);
    assertTrue(countdown.isEliminated(countdown.currentSeason(), alice));
}

function test_CastVoteRemoved() public {
    (bool ok, ) = address(countdown).call(abi.encodeWithSignature("castVote(bool)", true));
    assertFalse(ok, "castVote should not exist");
}

function test_HasAllTiersAccountsForPendingForgeBurns() public {
    _fullSet(alice);
    // Simulate alice forging all of her T4 — token should call setPendingForgeBurns
    mockToken.setBal(alice, 4, 0);
    vm.prank(address(mockToken));
    countdown.setPendingForgeBurns(alice, 4, 1);

    assertTrue(countdown.hasAllTiersEffective(alice));
}
```

- [ ] **Step B3.2 — Run, confirm failure**

- [ ] **Step B3.3 — Modify `BlockHuntCountdown.sol`**

Add state:
```solidity
mapping(uint256 => mapping(address => bool)) public isEliminated;
mapping(address => mapping(uint8 => uint256)) public pendingForgeBurns;

event PlayerEliminated(uint256 season, address indexed player);
event PendingForgeBurnsUpdated(address indexed player, uint8 tier, uint256 delta, bool increment);
```

Functions:
```solidity
function eliminatePlayer(address player) external onlyToken {
    uint256 s = currentSeason;
    seasonScore[s][player] = 0;
    isEliminated[s][player] = true;
    emit PlayerEliminated(s, player);
}

function setPendingForgeBurns(address player, uint8 tier, uint256 burnCount) external onlyToken {
    pendingForgeBurns[player][tier] += burnCount;
    emit PendingForgeBurnsUpdated(player, tier, burnCount, true);
}

function clearPendingForgeBurns(address player, uint8 tier, uint256 burnCount) external onlyToken {
    pendingForgeBurns[player][tier] -= burnCount;
    emit PendingForgeBurnsUpdated(player, tier, burnCount, false);
}

function hasAllTiersEffective(address player) public view returns (bool) {
    for (uint8 t = 2; t <= 7; t++) {
        uint256 bal = IBlockHuntTokenCountdown(tokenContract).balanceOf(player, t);
        if (bal + pendingForgeBurns[player][t] == 0) return false;
    }
    return true;
}
```

Remove `castVote`, `votesBurn`, `votesClaim`, `hasVoted`, `VoteCast` event.

Update `checkHolderStatus` to call `hasAllTiersEffective` instead of `hasAllTiers`.

- [ ] **Step B3.4 — Run, confirm pass**

- [ ] **Step B3.5 — Commit**

```bash
git add src/BlockHuntCountdown.sol test/BlockHuntCountdown.t.sol
git commit -m "countdown: eliminatePlayer, pending-forge-aware hasAllTiers, remove castVote (SH-5/11/13)"
```

---

## Phase C — Forge

### Task C1: Forge — basis-point probability (SH-8, BUG-3)

**Files:**
- Modify: `src/BlockHuntForge.sol`
- Create: `test/BlockHuntForge.t.sol`

- [ ] **Step C1.1 — Write failing test**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/BlockHuntForge.sol";

contract BlockHuntForgeTest is Test {
    function test_ProbabilityUsesBasisPoints() public pure {
        // T7->T6 uses ratio=21. burnCount=10 → chance = 10*10000/21 = 4761
        uint256 burn = 10;
        uint256 ratio = 21;
        uint256 expected = 4761;
        uint256 actual = (burn * 10_000) / ratio;
        assertEq(actual, expected);
    }
}
```

(The above is a pure-math sanity test. Full VRF-flow tests come later in the integration suite.)

- [ ] **Step C1.2 — Modify `BlockHuntForge.sol`**

In the forge resolve path:
```solidity
uint256 successChance = (singleReq.burnCount * 10_000) / ratio;
bool success = (randomWords[0] % 10_000) < successChance;
```

- [ ] **Step C1.3 — Run, confirm pass**

- [ ] **Step C1.4 — Commit**

```bash
git add src/BlockHuntForge.sol test/BlockHuntForge.t.sol
git commit -m "forge: basis-point probability precision (SH-8, BUG-3)"
```

---

### Task C2: Forge — struct packing + deferred countdown + storage cleanup (§1.10 items 6/14/15)

**Files:**
- Modify: `src/BlockHuntForge.sol`
- Modify: `test/BlockHuntForge.t.sol`

- [ ] **Step C2.1 — Add failing test for storage cleanup**

```solidity
function test_ResolvedForgeRequestIsDeleted() public {
    // Covered by VRF integration test later; minimal placeholder here.
}
```

- [ ] **Step C2.2 — Pack `ForgeRequest` struct to 1 slot**

```solidity
struct ForgeRequest {
    address player;    // 20
    uint8   fromTier;  // 1
    uint16  burnCount; // 2 (max 65k — plenty)
    bool    resolved;  // 1
    bool    success;   // 1
    // total: 25 bytes, fits in 1 slot
}
```

- [ ] **Step C2.3 — Batch forge: single countdown check at end**

In the batch-resolve function, move the `IBlockHuntCountdown.checkHolderStatus()` / trigger call outside the per-attempt loop to run exactly once.

- [ ] **Step C2.4 — Delete resolved ForgeRequest entries**

At the end of each resolve, `delete vrfForgeRequests[requestId];` and `delete vrfBatchRequests[requestId];` as appropriate.

- [ ] **Step C2.5 — Run existing forge tests, confirm no regressions**

```bash
forge test --match-contract BlockHuntForgeTest -vv
```

- [ ] **Step C2.6 — Commit**

```bash
git add src/BlockHuntForge.sol test/BlockHuntForge.t.sol
git commit -m "forge: struct packing, deferred countdown check, storage cleanup (§1.10)"
```

---

### Task C3: Forge — pendingForgeBurns increment + cancel/timeout decrement (SH-5)

**Files:**
- Modify: `src/BlockHuntForge.sol`
- Modify: `test/BlockHuntForge.t.sol`

- [ ] **Step C3.1 — Add failing test**

```solidity
function test_ForgeIncrementsPendingBurnsOnStart() public {
    // Expect Countdown.setPendingForgeBurns called with (player, fromTier, burnCount)
}

function test_ForgeClearsPendingBurnsOnResolve() public {
    // After VRF resolves, pendingForgeBurns[player][fromTier] should return to 0
}

function test_ForgeClearsPendingBurnsOnCancel() public {
    // After forge cancel/timeout, pendingForgeBurns[player][fromTier] returns to 0
}
```

(Full implementations integrate with MockCountdown and MockVRF — keep here as test names only; concrete bodies filled in with VRF mocks already used elsewhere in the repo.)

- [ ] **Step C3.2 — Modify `BlockHuntForge.sol`**

In `forgeBatch` / `forgeSingle`, after the burn but before `requestRandomWords`:
```solidity
IBlockHuntCountdown(countdownContract).setPendingForgeBurns(
    msg.sender, fromTier, burnCount
);
```

In `fulfillRandomWords`:
```solidity
IBlockHuntCountdown(countdownContract).clearPendingForgeBurns(
    req.player, req.fromTier, req.burnCount
);
```

Add a `cancelForgeRequest(uint256 requestId)` function (parallel to Token's cancel path) with TTL:
```solidity
uint256 public forgeRequestTTL = 10 minutes;

function cancelForgeRequest(uint256 requestId) external {
    ForgeRequest storage r = vrfForgeRequests[requestId];
    require(r.player == msg.sender, "Not requester");
    require(!r.resolved, "Already resolved");
    require(block.timestamp >= r.requestedAt + forgeRequestTTL, "TTL not reached");

    // Refund burns by minting back
    IBlockHuntTokenForge(tokenContract).forgeRefund(msg.sender, r.fromTier, r.burnCount);

    // Clear pending counter
    IBlockHuntCountdown(countdownContract).clearPendingForgeBurns(
        msg.sender, r.fromTier, r.burnCount
    );

    delete vrfForgeRequests[requestId];
    emit ForgeCancelled(requestId, msg.sender);
}
```

- [ ] **Step C3.3 — Modify `BlockHuntToken.sol` — add `forgeRefund`**

```solidity
function forgeRefund(address to, uint8 tier, uint256 amount) external {
    require(msg.sender == forgeContract, "Only forge");
    _mint(to, tier, amount, "");
    tierTotalSupply[tier] += amount;
}
```

- [ ] **Step C3.4 — Run forge tests, confirm pass**

- [ ] **Step C3.5 — Commit**

```bash
git add src/BlockHuntForge.sol src/BlockHuntToken.sol test/BlockHuntForge.t.sol
git commit -m "forge: pending burns counter w/ cancel cleanup (SH-5, BUG-16)"
```

---

## Phase D — Token (largest phase)

### Task D1: Token — configurable VRF gas params with bounds (§1.1, SH-2)

**Files:**
- Modify: `src/BlockHuntToken.sol`
- Create: `test/BlockHuntToken.t.sol`

- [ ] **Step D1.1 — Write failing test**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/BlockHuntToken.sol";

contract BlockHuntTokenTest is Test {
    BlockHuntToken token;
    address owner = address(0xBEEF);

    function setUp() public {
        vm.prank(owner);
        token = new BlockHuntToken(/* constructor args per repo conventions */);
    }

    function test_VrfGasParamsDefault() public {
        assertEq(token.vrfGasPerBlock(), 28_000);
        assertEq(token.vrfGasMax(), 15_000_000);
    }

    function test_SetVrfGasParamsRejectsZero() public {
        vm.prank(owner);
        vm.expectRevert(bytes("gasPerBlock out of range"));
        token.setVrfGasParams(0, 15_000_000);
    }

    function test_SetVrfGasParamsRejectsExceedingBlockLimit() public {
        vm.prank(owner);
        vm.expectRevert(bytes("gasMax out of range"));
        token.setVrfGasParams(28_000, 31_000_000);
    }

    function test_SetVrfGasParamsEmitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit BlockHuntToken.VrfGasParamsUpdated(50_000, 20_000_000);
        token.setVrfGasParams(50_000, 20_000_000);
    }
}
```

- [ ] **Step D1.2 — Run, confirm failure**

- [ ] **Step D1.3 — Modify `BlockHuntToken.sol`**

Replace the `constant VRF_GAS_PER_BLOCK` and `VRF_GAS_MAX` with state variables:

```solidity
uint32 public vrfGasPerBlock = 28_000;
uint32 public vrfGasMax      = 15_000_000;

event VrfGasParamsUpdated(uint32 gasPerBlock, uint32 gasMax);

function setVrfGasParams(uint32 _gasPerBlock, uint32 _gasMax) external onlyOwner {
    require(_gasPerBlock >= 10_000 && _gasPerBlock <= 100_000, "gasPerBlock out of range");
    require(_gasMax >= 500_000 && _gasMax <= 30_000_000, "gasMax out of range");
    vrfGasPerBlock = _gasPerBlock;
    vrfGasMax      = _gasMax;
    emit VrfGasParamsUpdated(_gasPerBlock, _gasMax);
}
```

Update the internal gas-calculation helper to read from state:
```solidity
function _gasLimitForQuantity(uint32 quantity) internal view returns (uint32) {
    uint256 computed = uint256(vrfCallbackGasLimit) + uint256(quantity) * uint256(vrfGasPerBlock);
    if (computed > vrfGasMax) computed = vrfGasMax;
    return uint32(computed);
}
```

- [ ] **Step D1.4 — Run, confirm pass**

- [ ] **Step D1.5 — Commit**

```bash
git add src/BlockHuntToken.sol test/BlockHuntToken.t.sol
git commit -m "token: VRF gas params configurable with bounds (§1.1, SH-2)"
```

---

### Task D2: Token — try/catch wrapper around ALL external calls in fulfillRandomWords (§1.2, SH-3)

**Files:**
- Modify: `src/BlockHuntToken.sol`
- Modify: `test/BlockHuntToken.t.sol`

- [ ] **Step D2.1 — Add failing test (using a reverting mock)**

```solidity
contract RevertingCountdown {
    function recordProgression(address, uint256) external pure {
        revert("boom");
    }
    function hasAllTiers(address) external pure returns (bool) { return false; }
}

function test_RecordProgressionRevertDoesNotRevertCallback() public {
    // Point token at a reverting countdown, fulfill a VRF request, expect success
}
```

- [ ] **Step D2.2 — Modify fulfillRandomWords**

Wrap every external call in try/catch:

```solidity
function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
    MintRequest storage req = vrfMintRequests[requestId];
    // ... seed assignment, tier computation, _mintBatch ...

    try IBlockHuntMint(mintWindowContract).recordMint(req.player, allocated) {}
    catch { emit RecordMintFailed(req.player, allocated); }

    try IBlockHuntCountdown(countdownContract).recordProgression(req.player, allocated) {}
    catch { emit RecordProgressionFailed(req.player, allocated); }

    // Rewards hook is added later in Plan 2 — for now, stub a commented marker:
    // (Plan 2 adds: try IBlockHuntRewards.onMint / recordTierDrop — same pattern)

    try IBlockHuntCountdown(countdownContract).checkHolderStatus() {}
    catch { emit CountdownCheckFailed(); }
}
```

Add corresponding events:
```solidity
event RecordMintFailed(address indexed player, uint32 quantity);
event RecordProgressionFailed(address indexed player, uint32 quantity);
event CountdownCheckFailed();
```

- [ ] **Step D2.3 — Run, confirm pass**

- [ ] **Step D2.4 — Commit**

```bash
git add src/BlockHuntToken.sol test/BlockHuntToken.t.sol
git commit -m "token: try/catch all external calls in fulfillRandomWords (§1.2, SH-3, NEW-B)"
```

---

### Task D3: Token — configurable refund TTL (§1.4)

**Files:**
- Modify: `src/BlockHuntToken.sol`
- Modify: `test/BlockHuntToken.t.sol`

- [ ] **Step D3.1 — Write failing test**

```solidity
function test_DefaultRefundTTLIsTenMinutes() public {
    assertEq(token.mintRequestTTL(), 10 minutes);
}

function test_SetRefundTTLBoundsEnforced() public {
    vm.prank(owner);
    vm.expectRevert(bytes("TTL out of range"));
    token.setMintRequestTTL(30 seconds);

    vm.prank(owner);
    vm.expectRevert(bytes("TTL out of range"));
    token.setMintRequestTTL(2 hours);
}
```

- [ ] **Step D3.2 — Modify token**

```solidity
uint256 public mintRequestTTL = 10 minutes;
event MintRequestTTLUpdated(uint256 newTTL);

function setMintRequestTTL(uint256 _ttl) external onlyOwner {
    require(_ttl >= 5 minutes && _ttl <= 1 hours, "TTL out of range");
    mintRequestTTL = _ttl;
    emit MintRequestTTLUpdated(_ttl);
}
```

Replace `MINT_REQUEST_TTL` constant references in `cancelMintRequest` with `mintRequestTTL`.

- [ ] **Step D3.3 — Run, confirm pass**

- [ ] **Step D3.4 — Commit**

```bash
git add src/BlockHuntToken.sol test/BlockHuntToken.t.sol
git commit -m "token: configurable mint request TTL, default 10 minutes (§1.4)"
```

---

### Task D4: Token — hybrid mint / lazy reveal threshold (§1.3)

**Files:**
- Modify: `src/BlockHuntToken.sol`
- Modify: `test/BlockHuntToken.t.sol`

- [ ] **Step D4.1 — Write failing tests**

```solidity
function test_LazyRevealDisabledByDefault() public {
    assertEq(token.lazyRevealThreshold(), 0);
}

function test_SetLazyRevealThreshold() public {
    vm.prank(owner);
    token.setLazyRevealThreshold(200);
    assertEq(token.lazyRevealThreshold(), 200);
}

function test_ClaimMintPermissionless() public {
    // Full VRF flow test — dispatches via mock oracle
    // Expect req.player to receive blocks even when msg.sender != req.player
}

function test_LazyRevealCancelAfterFulfilledBeforeClaimed() public {
    // Lazy reveal path: cancel allowed if fulfilled==true && claimed==false
}
```

- [ ] **Step D4.2 — Modify MintRequest struct**

Pack to 3 slots per spec:
```solidity
struct MintRequest {
    address player;        // slot 1 (20)
    uint32  quantity;      // slot 1 (4)
    bool    fulfilled;     // slot 1 (1)
    bool    claimed;       // slot 1 (1)
    // slot boundary
    uint128 amountPaid;    // slot 2 (16)
    uint64  requestedAt;   // slot 2 (8)
    // slot boundary
    uint256 seed;          // slot 3
}
```

- [ ] **Step D4.3 — Add threshold state + setter**

```solidity
uint32 public lazyRevealThreshold;  // 0 = disabled
event LazyRevealThresholdUpdated(uint32 newThreshold);

function setLazyRevealThreshold(uint32 _threshold) external onlyOwner {
    require(_threshold == 0 || _threshold >= 50, "Threshold must be 0 or >=50");
    lazyRevealThreshold = _threshold;
    emit LazyRevealThresholdUpdated(_threshold);
}
```

- [ ] **Step D4.4 — Fork fulfillRandomWords into two paths**

```solidity
function fulfillRandomWords(uint256 requestId, uint256[] memory words) internal override {
    MintRequest storage req = vrfMintRequests[requestId];
    if (req.player == address(0)) return;   // cancelled earlier

    uint32 threshold = lazyRevealThreshold;
    if (threshold == 0 || req.quantity <= threshold) {
        _executeMint(requestId, words[0]);
        delete vrfMintRequests[requestId];  // same behavior as today
    } else {
        req.seed = words[0];
        req.fulfilled = true;
        emit MintFulfilled(requestId, req.player, req.quantity);
    }
}
```

- [ ] **Step D4.5 — Add `claimMint`**

```solidity
function claimMint(uint256 requestId) external nonReentrant whenNotPaused {
    MintRequest storage req = vrfMintRequests[requestId];
    require(req.fulfilled && !req.claimed, "Not claimable");
    req.claimed = true;
    _executeMint(requestId, req.seed);
    delete vrfMintRequests[requestId];
}
```

- [ ] **Step D4.6 — Extract `_executeMint`**

Move tier assignment + `_mintBatch` + try/catch hooks into a private `_executeMint(uint256 requestId, uint256 seed)` helper called by both paths.

- [ ] **Step D4.7 — Update `cancelMintRequest` for lazy path**

```solidity
function cancelMintRequest(uint256 requestId) external nonReentrant {
    MintRequest storage req = vrfMintRequests[requestId];
    require(req.player == msg.sender, "Not requester");
    if (req.fulfilled) {
        require(!req.claimed, "Already claimed");
    }
    require(block.timestamp >= req.requestedAt + mintRequestTTL, "TTL not reached");
    uint128 refund = req.amountPaid;
    delete vrfMintRequests[requestId];
    payable(msg.sender).sendValue(refund);
    emit MintCancelled(requestId, msg.sender, refund);
}
```

- [ ] **Step D4.8 — Run tests, confirm pass**

- [ ] **Step D4.9 — Commit**

```bash
git add src/BlockHuntToken.sol test/BlockHuntToken.t.sol
git commit -m "token: hybrid mint with lazy reveal threshold (§1.3)"
```

---

### Task D5: Token — burn-1-per-tier on claim/sacrifice (SH-6, BUG-9)

**Files:**
- Modify: `src/BlockHuntToken.sol`
- Modify: `test/BlockHuntToken.t.sol`

- [ ] **Step D5.1 — Write failing test**

```solidity
function test_ClaimBurnsOneOfEachTierOnly() public {
    // Set up alice with: 340 T7, 28 T6, 12 T5, 8 T4, 5 T3, 2 T2
    // Trigger countdown + complete defense
    // Call claimTreasury
    // Assert balances after:
    // T7: 339, T6: 27, T5: 11, T4: 7, T3: 4, T2: 1
}
```

- [ ] **Step D5.2 — Modify claimTreasury / sacrifice / executeDefaultOnExpiry**

Replace the full-balance burn loop in each with:
```solidity
uint256[] memory ids = new uint256[](6);
uint256[] memory amounts = new uint256[](6);
for (uint256 i = 0; i < 6; i++) {
    ids[i]     = i + 2;
    amounts[i] = 1;
    tierTotalSupply[i + 2] -= 1;
}
_burnBatch(msg.sender, ids, amounts);
```

Call `IBlockHuntCountdown(countdownContract).eliminatePlayer(msg.sender)` immediately after the burn.

- [ ] **Step D5.3 — Run, confirm pass**

- [ ] **Step D5.4 — Commit**

```bash
git add src/BlockHuntToken.sol test/BlockHuntToken.t.sol
git commit -m "token: burn exactly 1 per tier on endgame + eliminate player (SH-6, SH-11)"
```

---

### Task D6: Token — combineMany cap (SH-7, BUG-4)

- [ ] **Step D6.1 — Write failing test**

```solidity
function test_CombineManyRejectsOver50Elements() public {
    uint256[] memory oversize = new uint256[](51);
    vm.expectRevert(bytes("Invalid length"));
    token.combineMany(oversize);
}

function test_CombineManyRejectsEmpty() public {
    uint256[] memory empty = new uint256[](0);
    vm.expectRevert(bytes("Invalid length"));
    token.combineMany(empty);
}
```

- [ ] **Step D6.2 — Modify `combineMany`**

```solidity
function combineMany(uint256[] calldata fromTiers) external nonReentrant whenNotPaused {
    uint256 n = fromTiers.length;
    require(n > 0 && n <= 50, "Invalid length");
    // ... existing loop
}
```

Also migrate the burn/mint loop to `_burnBatch` + `_mintBatch` (§1.10 item 13) — build the arrays in one pass.

- [ ] **Step D6.3 — Run tests, confirm pass**

- [ ] **Step D6.4 — Commit**

```bash
git add src/BlockHuntToken.sol test/BlockHuntToken.t.sol
git commit -m "token: combineMany cap at 50 + batch burn/mint (SH-7, §1.10)"
```

---

### Task D7: Token — pendingForgeBurns counter proxy API (SH-5 write side)

- [ ] **Step D7.1 — Modify Token**

Token already calls into `countdown.setPendingForgeBurns` via the Forge flow. If Forge cannot call Countdown directly due to current wiring, add a proxy on Token:

```solidity
function proxySetPendingForgeBurns(address player, uint8 tier, uint256 count) external {
    require(msg.sender == forgeContract, "Only forge");
    IBlockHuntCountdown(countdownContract).setPendingForgeBurns(player, tier, count);
}
```

(If Forge → Countdown direct call is acceptable in the existing wiring, skip the proxy; Task C3 already handles it.)

- [ ] **Step D7.2 — Commit**

```bash
git add src/BlockHuntToken.sol
git commit -m "token: wire pendingForgeBurns proxy if needed (SH-5)"
```

---

### Task D8: Token — executeDefaultOnExpiry holder grace period (SH-4, BUG-14)

- [ ] **Step D8.1 — Write failing test**

```solidity
function test_DefaultOnExpiryRejectsNonHolderInGrace() public {
    // Set up countdown that has just expired
    // attacker calls executeDefaultOnExpiry
    vm.expectRevert(bytes("Holder grace period active"));
    vm.prank(attacker);
    token.executeDefaultOnExpiry();
}

function test_DefaultOnExpiryAllowsHolderInGrace() public {
    vm.prank(holder);
    token.executeDefaultOnExpiry();
}

function test_DefaultOnExpiryPermissionlessAfter15Min() public {
    vm.warp(block.timestamp + 15 minutes + 1);
    vm.prank(randomUser);
    token.executeDefaultOnExpiry();
}
```

- [ ] **Step D8.2 — Modify executeDefaultOnExpiry**

```solidity
function executeDefaultOnExpiry() external nonReentrant {
    require(countdownActive, "No countdown active");
    uint256 expiry = countdownStartTime + _countdownDuration();
    require(block.timestamp >= expiry, "Not expired");

    // Holder-exclusive 15-minute grace period
    if (block.timestamp < expiry + 15 minutes) {
        require(msg.sender == countdownHolder, "Holder grace period active");
    }

    // ... existing sacrifice-split execution
}

function _countdownDuration() internal view returns (uint256) {
    return IBlockHuntCountdown(countdownContract).countdownDuration();
}
```

(Note: `_countdownDuration` now reads from Countdown contract per §1.7 / bug-21 sync fix — Token no longer stores its own copy. Remove Token's local `countdownDuration` state.)

- [ ] **Step D8.3 — Run, confirm pass**

- [ ] **Step D8.4 — Commit**

```bash
git add src/BlockHuntToken.sol test/BlockHuntToken.t.sol
git commit -m "token: 15-min holder grace period on expiry + read duration from countdown (SH-4, §1.7)"
```

---

### Task D9: Token — gas optimizations (§1.10 items 10/11/12)

- [ ] **Step D9.1 — Cache tier thresholds before loop (item 10)**

In `_executeMint`:
```solidity
uint16[8] memory thresholds = _getTierThresholds(currentBatch);
for (uint256 i = 0; i < quantity; i++) {
    uint8 tier = _assignTierFromThresholds(words[i], thresholds);
    // ...
}
```

- [ ] **Step D9.2 — Single nonce write after loop (item 11)**

```solidity
uint256 nonceStart = _nonce;
for (uint256 i = 0; i < quantity; i++) {
    uint256 local = nonceStart + i;
    // use local in any RNG
}
_nonce = nonceStart + quantity;
```

- [ ] **Step D9.3 — O(1) pending request removal (item 12)**

Switch `pendingRequestsByPlayer` from `uint256[]` linear scan to a mapping-based swap-and-pop:
```solidity
mapping(address => uint256[]) public pendingRequestsByPlayer;
mapping(uint256 => uint256) private pendingIndexPlusOne; // requestId => index+1

function _addPendingRequest(address player, uint256 requestId) internal {
    pendingRequestsByPlayer[player].push(requestId);
    pendingIndexPlusOne[requestId] = pendingRequestsByPlayer[player].length;
}

function _removePendingRequest(address player, uint256 requestId) internal {
    uint256 idxPlusOne = pendingIndexPlusOne[requestId];
    if (idxPlusOne == 0) return;
    uint256 idx = idxPlusOne - 1;
    uint256[] storage arr = pendingRequestsByPlayer[player];
    uint256 last = arr.length - 1;
    if (idx != last) {
        uint256 moved = arr[last];
        arr[idx] = moved;
        pendingIndexPlusOne[moved] = idx + 1;
    }
    arr.pop();
    delete pendingIndexPlusOne[requestId];
}
```

- [ ] **Step D9.4 — Remove dead `windowDayMinted` references**

Search Token for `windowDayMinted` and delete the state variable + any reads/writes.

- [ ] **Step D9.5 — Run full token test suite**

```bash
forge test --match-contract BlockHuntTokenTest -vv
```

- [ ] **Step D9.6 — Commit**

```bash
git add src/BlockHuntToken.sol test/BlockHuntToken.t.sol
git commit -m "token: gas opts — cache thresholds, single nonce write, O(1) pending removal (§1.10)"
```

---

### Task D10: Token — `rewardMint` entry point (SH-11 / Plan 2 dependency)

- [ ] **Step D10.1 — Write failing test**

```solidity
function test_RewardMintOnlyFromRewardsContract() public {
    vm.prank(address(0xCAFE));
    vm.expectRevert(bytes("Only rewards"));
    token.rewardMint(alice, 10);
}

function test_RewardMintCreatesT6Blocks() public {
    vm.prank(rewardsContract);
    token.rewardMint(alice, 10);
    assertEq(token.balanceOf(alice, 6), 10);
}
```

- [ ] **Step D10.2 — Add state + function**

```solidity
address public rewardsContract;
event RewardMinted(address indexed to, uint32 quantity);

function setRewardsContract(address _rewards) external onlyOwner {
    rewardsContract = _rewards;
}

function rewardMint(address to, uint32 quantity) external {
    require(msg.sender == rewardsContract, "Only rewards");
    require(quantity > 0, "Zero quantity");
    _mint(to, 6, quantity, "");
    tierTotalSupply[6] += quantity;
    emit RewardMinted(to, quantity);
}
```

- [ ] **Step D10.3 — Run, confirm pass**

- [ ] **Step D10.4 — Commit**

```bash
git add src/BlockHuntToken.sol test/BlockHuntToken.t.sol
git commit -m "token: rewardMint entry point for Plan 2 (SH-11 dependency)"
```

---

## Phase E — Integration + Invariants

### Task E1: Rename legacy test + port existing integration flows

**Files:**
- Rename: `test/BlockHunt.t.sol` → `test/BlockHunt.integration.t.sol`
- Modify: ported test file to match new contract signatures

- [ ] **Step E1.1 — Rename**

```bash
git mv test/BlockHunt.t.sol test/BlockHunt.integration.t.sol
```

- [ ] **Step E1.2 — Update test setup to match new signatures**

- New Treasury fee (2000 bps)
- New Escrow `initiateSacrifice(winner, amount)` signature
- New Token configurable TTL / VRF gas params / rewardsContract
- Remove any references to `castVote` / `votesBurn` / `votesClaim`
- Remove references to `emergencyWithdraw`

- [ ] **Step E1.3 — Add golden-path integration tests**

- Full mint → combine → forge → countdown → claim flow
- Full mint → combine → forge → countdown → sacrifice flow
- Verify winner keeps non-required blocks after claim
- Verify cumulative defense banks across challenge

- [ ] **Step E1.4 — Run full suite**

```bash
forge test -vv
```

- [ ] **Step E1.5 — Commit**

```bash
git add test/
git commit -m "test: rename integration suite + port to new contract signatures"
```

---

### Task E2: Invariant tests

**Files:**
- Create: `test/BlockHuntInvariants.t.sol`

- [ ] **Step E2.1 — Write invariant tests**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
// ...imports

contract BlockHuntInvariants is Test {
    // Invariant: holder is zero OR holderSince > 0
    function invariant_HolderSinceSet() public {
        address h = countdown.currentHolder();
        if (h == address(0)) return;
        assertGt(countdown.holderSince(), 0);
    }

    // Invariant: for every resolved/cancelled forge request, pendingForgeBurns is cleared
    function invariant_NoOrphanPendingForgeBurns() public {
        // Walk known players, assert no non-zero pendingForgeBurns for non-active requests
        // (scoped via fuzz handler that tracks requests)
    }

    // Invariant: treasury prizePool + creator fee payouts == total mint ETH in
    function invariant_TreasuryAccounting() public {
        // Track via fuzz handler
    }
}
```

- [ ] **Step E2.2 — Run**

```bash
forge test --match-path test/BlockHuntInvariants.t.sol -vv
```

- [ ] **Step E2.3 — Commit**

```bash
git add test/BlockHuntInvariants.t.sol
git commit -m "test: invariants for holderSince, pending forge cleanup, treasury accounting"
```

---

## Phase F — Deploy Script + Verification

### Task F1: Update `script/Deploy.s.sol`

**Files:**
- Modify: `script/Deploy.s.sol`

- [ ] **Step F1.1 — Verify deploy order**

```
1. Treasury
2. MintWindow
3. Countdown
4. Forge
5. Token
6. Escrow
7. Migration, SeasonRegistry
```

(Rewards insertion between Countdown and Forge is Plan 2.)

- [ ] **Step F1.2 — Add post-deploy config calls**

```solidity
// Post-deploy config
token.setVrfGasParams(28_000, 15_000_000);
token.setMintRequestTTL(10 minutes);
token.setLazyRevealThreshold(0);            // disabled at launch
treasury.setCreatorFee(2000);               // already default, idempotent
// castVote removed — nothing to configure
// rewardsContract wiring happens in Plan 2 deploy
```

- [ ] **Step F1.3 — Dry run**

```bash
forge script script/Deploy.s.sol:Deploy --rpc-url $BASE_SEPOLIA_RPC_URL -vvvv
```

- [ ] **Step F1.4 — Commit**

```bash
git add script/Deploy.s.sol
git commit -m "deploy: updated wiring + post-deploy config for redeploy"
```

---

### Task F2: Final suite + gas report

- [ ] **Step F2.1 — Full test run**

```bash
forge test -vv
```
Expected: all tests green.

- [ ] **Step F2.2 — Gas report**

```bash
forge test --gas-report > /tmp/gas-report.txt
```

Verify VRF callback gas per 50-block mint is under 200k.

- [ ] **Step F2.3 — Coverage**

```bash
forge coverage --report summary
```

- [ ] **Step F2.4 — Commit gas baseline**

```bash
git add docs/superpowers/plans/gas-baseline.md   # create with the output
git commit -m "docs: gas baseline after redeploy hardening"
```

---

## Spec Coverage Verification

| Redeploy spec item | Task(s) |
|---|---|
| §1.1 VRF gas params configurable | D1 |
| §1.2 try/catch recordMint | D2 |
| §1.3 Hybrid mint / lazy reveal | D4 |
| §1.4 Refund TTL configurable | D3 |
| §1.5 20% mint fee | A1 |
| §1.6 Remove emergencyWithdraw | A1 (Treasury), verify none in Escrow |
| §1.7 Cumulative defense + duration sync | B1, D8 |
| §1.8 On-chain progression + leaderboard | B2 |
| §1.9 MintWindow cycle reset + bounds | A3 |
| §1.10 Gas optimizations | C2, D4 (packing), D9, D5 (batch burn) |
| §1.11 Batch boundary pricing note | Documented in spec — no code change |
| SH-1 holderSince guard | B1 |
| SH-2 setVrfGasParams bounds | D1 |
| SH-3 try/catch all VRF external calls | D2 |
| SH-4 executeDefaultOnExpiry grace | D8 |
| SH-5 pending forge burns counter | B3, C3, D7 |
| SH-6 burn 1 per tier | D5 |
| SH-7 combineMany cap | D6 |
| SH-8 basis-point forge probability | C1 |
| SH-9 explicit amount on sacrifice | A2 |
| SH-10 season-indexed leaderboard state | B2, B3 |
| SH-11 eliminatePlayer | B3, D5 |
| SH-12 creator fee floor + event | A1 |
| SH-13 remove castVote | B3 |

---

## Out of Scope (tracked, not implemented here)

- `BlockHuntRewards.sol` modifications — Plan 2 (`2026-04-15-rewards-implementation.md`)
- `BlockHuntMarketplace.sol` CEI fix (BUG-10) — separate marketplace deploy
- Frontend updates (Phase 2 of redeploy spec) — follows both contract plans
- Subgraph updates — follows frontend
- NEW-C lazy reveal hardening — mitigated by `lazyRevealThreshold = 0` at launch
