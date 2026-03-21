// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/BlockHuntTreasury.sol";
import "../src/BlockHuntMintWindow.sol";
import "../src/BlockHuntCountdown.sol";
import "../src/BlockHuntForge.sol";
import "../src/BlockHuntToken.sol";
import "../src/BlockHuntEscrow.sol";
import "../src/BlockHuntMigration.sol";
import "../src/BlockHuntSeasonRegistry.sol";
import "../src/BlockHuntRewards.sol";

/**
 * @title  Block Hunt — Base Sepolia Redeployment (Phase 6 — Keeper + Fixes)
 * @notice Deploys 4 changed contracts (Token, MintWindow, Countdown, Rewards)
 *         and re-wires them to the 5 existing contracts (Treasury, Forge,
 *         Escrow, Migration, SeasonRegistry).
 *
 *         Changes since Phase 5:
 *           - Token: countdownDuration settable (was constant 7 days)
 *           - MintWindow: keeper role, resetWindowCap, new 25% growth batch configs
 *           - Countdown: keeper role
 *           - Rewards: MAX_BATCHES 6→10, keeper role
 *
 * ── Before running ───────────────────────────────────────────────────────────
 *
 *  1. .env must contain: PRIVATE_KEY, CREATOR_WALLET, BASE_SEPOLIA_RPC_URL,
 *     BASESCAN_API_KEY
 *  2. Fund deployer wallet with Base Sepolia ETH
 *  3. Ensure Chainlink VRF V2.5 subscription is funded
 *
 * ── Run ──────────────────────────────────────────────────────────────────────
 *
 *  Dry run:
 *    forge script script/Deploy.s.sol:Deploy \
 *      --rpc-url $BASE_SEPOLIA_RPC_URL -vvvv
 *
 *  Deploy + verify:
 *    forge script script/Deploy.s.sol:Deploy \
 *      --rpc-url $BASE_SEPOLIA_RPC_URL \
 *      --broadcast --verify \
 *      --etherscan-api-key $BASESCAN_API_KEY -vvvv
 *
 * ── After running ────────────────────────────────────────────────────────────
 *
 *  1. Copy printed addresses into frontend/src/config/wagmi.js
 *  2. On Chainlink VRF subscription (https://vrf.chain.link):
 *       - ADD the new Token address as a consumer
 *       - REMOVE the old Token address (0x669aa2605E66565EFe874dBb8cAB9450c75E7A00)
 *       (Forge address unchanged — already a consumer)
 *  3. Update subgraph/subgraph.yaml with new Token + MintWindow addresses
 *  4. Fund Rewards contract: call deposit() with ETH for batch 1
 *  5. Set Gelato keeper: call setKeeper() on MintWindow, Countdown, Rewards
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
contract Deploy is Script {

    // ── Configuration ─────────────────────────────────────────────────────────

    string constant METADATA_URI = "https://api.blockhunt.xyz/metadata/{id}.json";
    uint96 constant ROYALTY_FEE_BPS = 1000;

    // Chainlink VRF V2.5 on Base Sepolia
    address constant VRF_COORDINATOR = 0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE;
    bytes32 constant VRF_KEY_HASH = 0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71;
    uint256 constant VRF_SUB_ID = 57750058386053786990998297633685375559871666481243777791923539169896613845120;
    uint32 constant TOKEN_VRF_GAS = 2_500_000;
    uint32 constant FORGE_VRF_GAS = 300_000;

    // ── Existing contracts (NOT redeployed) ─────────────────────────────────

    address constant EXISTING_TREASURY   = 0x5E62B079AD08c8E20E027d53e9CF64bd93B40027;
    address constant EXISTING_FORGE      = 0x94d283a21386f1c5b051cE0ac5b9AD878182827c;
    address constant EXISTING_ESCROW     = 0x1e21c3536f3AE5590aA89A19DF599e7A6D50E985;
    address constant EXISTING_MIGRATION  = 0xfD44677e950a77972a46FAe024e587dcD1Bd9eD5;

    // Old Token address (for VRF consumer removal reference)
    address constant OLD_TOKEN = 0x669aa2605E66565EFe874dBb8cAB9450c75E7A00;

    // Testnet countdown duration (5 minutes instead of 7 days)
    uint256 constant TESTNET_COUNTDOWN = 300;

    // ── Run ───────────────────────────────────────────────────────────────────

    function run() external {
        uint256 deployerKey   = vm.envUint("PRIVATE_KEY");
        address deployer      = vm.addr(deployerKey);
        address creatorWallet = vm.envAddress("CREATOR_WALLET");

        require(creatorWallet != address(0), "Deploy: CREATOR_WALLET not set");

        console.log("=================================================");
        console.log("  Block Hunt -- Phase 6 (Keeper + Fixes)");
        console.log("=================================================");
        console.log("  Deployer:        ", deployer);
        console.log("  Creator wallet:  ", creatorWallet);
        console.log("-------------------------------------------------");
        console.log("  EXISTING (kept): Treasury, Forge, Escrow, Migration");
        console.log("  DEPLOYING:       Token, MintWindow, Countdown, Rewards");
        console.log("-------------------------------------------------");

        vm.startBroadcast(deployerKey);

        // ── Step 1: Deploy 4 new contracts ───────────────────────────────────

        // 1. Token — settable countdownDuration, ERC-1155 core
        BlockHuntToken token = new BlockHuntToken(
            METADATA_URI,
            creatorWallet,
            ROYALTY_FEE_BPS,
            VRF_COORDINATOR
        );
        console.log("1. Token deployed:       ", address(token));

        // 2. MintWindow — keeper role, new 25% growth batch configs
        BlockHuntMintWindow mintWindow = new BlockHuntMintWindow();
        console.log("2. MintWindow deployed:  ", address(mintWindow));

        // 3. Countdown — keeper role, settable durations
        BlockHuntCountdown countdown = new BlockHuntCountdown();
        console.log("3. Countdown deployed:   ", address(countdown));

        // 4. Rewards — MAX_BATCHES=10, keeper role
        BlockHuntRewards rewards = new BlockHuntRewards();
        console.log("4. Rewards deployed:     ", address(rewards));

        console.log("-------------------------------------------------");

        // ── Step 2: Wire new Token → all peripherals ─────────────────────────

        token.setTreasuryContract(EXISTING_TREASURY);
        token.setMintWindowContract(address(mintWindow));
        token.setForgeContract(EXISTING_FORGE);
        token.setCountdownContract(address(countdown));
        token.setEscrowContract(EXISTING_ESCROW);
        token.setMigrationContract(EXISTING_MIGRATION);
        console.log("Token wired to all peripherals.");

        // ── Step 3: Wire peripherals → new Token ─────────────────────────────

        // Existing contracts: re-point to new Token
        // Treasury.setTokenContract has testModeEnabled guard — must still be true
        BlockHuntTreasury(payable(EXISTING_TREASURY)).setTokenContract(address(token));
        console.log("Treasury re-wired to new Token.");

        // Escrow.setTokenContract has testModeEnabled guard
        BlockHuntEscrow(payable(EXISTING_ESCROW)).setTokenContract(address(token));
        console.log("Escrow re-wired to new Token.");

        // Forge.setTokenContract has no guard — always re-callable
        BlockHuntForge(payable(EXISTING_FORGE)).setTokenContract(address(token));
        console.log("Forge re-wired to new Token.");

        // Migration.setTokenV1 has no guard
        BlockHuntMigration(EXISTING_MIGRATION).setTokenV1(address(token));
        console.log("Migration re-wired to new Token (as V1).");

        // New contracts → new Token
        mintWindow.setTokenContract(address(token));
        countdown.setTokenContract(address(token));
        console.log("MintWindow + Countdown wired to new Token.");

        // ── Step 4: Configure VRF ────────────────────────────────────────────

        token.setVrfConfig(VRF_SUB_ID, VRF_KEY_HASH, TOKEN_VRF_GAS);
        token.setVrfEnabled(true);

        // Re-configure Forge VRF to ensure correct subscription
        BlockHuntForge(payable(EXISTING_FORGE)).setVrfConfig(VRF_SUB_ID, VRF_KEY_HASH, FORGE_VRF_GAS);
        BlockHuntForge(payable(EXISTING_FORGE)).setVrfEnabled(true);
        console.log("VRF configured: Token (2.5M), Forge (300k).");

        // ── Step 5: Open first mint window ───────────────────────────────────

        mintWindow.forceOpenWindow();
        console.log("First mint window opened.");

        // ── Step 6: Set testnet countdown duration (5 minutes) ───────────────

        token.setCountdownDuration(TESTNET_COUNTDOWN);
        countdown.setCountdownDuration(TESTNET_COUNTDOWN);
        console.log("Countdown duration set to 5 minutes (testnet).");

        vm.stopBroadcast();

        // ── Summary ───────────────────────────────────────────────────────────
        console.log("");
        console.log("=================================================");
        console.log("  Deployment complete!");
        console.log("=================================================");
        console.log("");
        console.log("  NEW CONTRACTS (update wagmi.js):");
        console.log("  TOKEN:     ", address(token));
        console.log("  WINDOW:    ", address(mintWindow));
        console.log("  COUNTDOWN: ", address(countdown));
        console.log("  REWARDS:   ", address(rewards));
        console.log("");
        console.log("  EXISTING (unchanged):");
        console.log("  TREASURY:  ", EXISTING_TREASURY);
        console.log("  FORGE:     ", EXISTING_FORGE);
        console.log("  ESCROW:    ", EXISTING_ESCROW);
        console.log("  MIGRATION: ", EXISTING_MIGRATION);
        console.log("");
        console.log("=================================================");
        console.log("  MANUAL STEPS:");
        console.log("=================================================");
        console.log("  1. VRF: Add new Token as consumer at https://vrf.chain.link");
        console.log("     Sub ID:", VRF_SUB_ID);
        console.log("     Remove old Token:", OLD_TOKEN);
        console.log("");
        console.log("  2. Update frontend/src/config/wagmi.js with new addresses");
        console.log("");
        console.log("  3. Update subgraph/subgraph.yaml with new Token address");
        console.log("");
        console.log("  4. Fund Rewards: call rewards.deposit() with ETH for batch 1");
        console.log("");
        console.log("  5. Set Gelato keeper on all 3 contracts:");
        console.log("     mintWindow.setKeeper(GELATO_SENDER)");
        console.log("     countdown.setKeeper(GELATO_SENDER)");
        console.log("     rewards.setKeeper(GELATO_SENDER)");
        console.log("=================================================");
    }
}
