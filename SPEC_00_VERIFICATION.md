# SPEC 00 — Pre-Change Verification
> **Purpose:** Before making any changes, verify what already exists so we don't duplicate work
> **Priority:** Run this FIRST before any other spec

---

## Read and Report

Read these files and report back on what exists:

```
src/BlockHuntMintWindow.sol
src/BlockHuntCountdown.sol
src/BlockHuntEscrow.sol
src/BlockHuntToken.sol
test/BlockHunt.t.sol
script/Deploy.s.sol (if it exists)
```

### For BlockHuntMintWindow.sol, report:
1. What is the current window duration constant? (expected: 6 hours / 21600)
2. What is the current time guard constant? (expected: 12 hours / 43200 or 16 hours / 57600)
3. Is there already a `forceOpenWindow()` or testing override?
4. Is there a `testMintEnabled` or `testModeEnabled` flag?
5. What events does it emit when a window opens?
6. List all public/external functions

### For BlockHuntCountdown.sol, report:
1. How does `claimHolderStatus()` work? What does it check?
2. How does it verify a player holds all 6 tiers?
3. Is there any scoring mechanism already?
4. What state variables track the countdown? (holder address, start time, duration, active flag, etc.)
5. How do `claimTreasury()` and `sacrifice()` verify the countdown has expired?
6. Is there already a challenge or takeover mechanism?
7. List all public/external functions
8. List all events

### For BlockHuntEscrow.sol, report:
1. Does this contract exist?
2. If yes, what does it do? Is it the SeasonEscrow for holding 10% seed funds?
3. What functions does it have?
4. Is there a `release()` function?

### For BlockHuntToken.sol, report:
1. How does `balancesOf(address)` work? What does it return?
2. What are the tier ID constants? (TIER_INERT, TIER_RESTLESS, etc.)
3. What is the `hasAllTiers(address)` function? What does it check?
4. Is there a `testMintEnabled` flag? How is it disabled?

### For Deploy.s.sol, report:
1. What wiring calls does it make after deployment?
2. Which contracts get told about which other contracts?
3. Is there anything the deploy script does that would need to be repeated when redeploying MintWindow and Countdown?

### For test file, report:
1. How many total tests exist?
2. How many are MintWindow related?
3. How many are Countdown related?
4. Run `forge test` and report current pass/fail status

---

## Output

Provide a summary like this:

```
VERIFICATION SUMMARY
====================
Total tests: XXX (XXX passing, XXX failing)

BlockHuntMintWindow.sol:
- Window duration: XXX seconds
- Time guard: XXX seconds
- forceOpenWindow exists: YES/NO
- testModeEnabled flag: YES/NO

BlockHuntCountdown.sol:
- claimHolderStatus checks: [list]
- Scoring exists: YES/NO
- Challenge mechanism exists: YES/NO
- State variables: [list]

BlockHuntEscrow.sol:
- Exists: YES/NO
- Is SeasonEscrow: YES/NO
- Has release(): YES/NO

BlockHuntToken.sol:
- Tier IDs: [list with values]
- hasAllTiers: [what it checks]
- balancesOf: [what it returns]

Deploy.s.sol:
- Wiring calls: [list]
```

This summary will be used to inform SPEC 01 and SPEC 02 implementation.
