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
 * @title  Block Hunt — Full Fresh Deployment (Season 1 Testnet)
 * @notice Deploys ALL 9 contracts from scratch and wires them together.
 *         Production game settings: 7-day countdown, 24-hour safe period.
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
 *       - ADD the new Token AND Forge addresses as consumers
 *  3. Update subgraph/subgraph.yaml with new Token address + startBlock
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
    uint32 constant TOKEN_VRF_GAS = 150_000;
    uint32 constant FORGE_VRF_GAS = 300_000;

    // Old addresses (for VRF consumer removal reference)
    address constant OLD_TOKEN = 0x48F0853BDECBDb137dE5091ef9Fe94DC0924BF5e;
    address constant OLD_FORGE = 0x94d283a21386f1c5b051cE0ac5b9AD878182827c;

    // ── Run ───────────────────────────────────────────────────────────────────

    function run() external {
        uint256 deployerKey   = vm.envUint("PRIVATE_KEY");
        address deployer      = vm.addr(deployerKey);
        address creatorWallet = vm.envAddress("CREATOR_WALLET");

        require(creatorWallet != address(0), "Deploy: CREATOR_WALLET not set");

        console.log("=================================================");
        console.log("  Block Hunt -- Full Fresh Deploy (Season 1)");
        console.log("=================================================");
        console.log("  Deployer:        ", deployer);
        console.log("  Creator wallet:  ", creatorWallet);
        console.log("-------------------------------------------------");

        vm.startBroadcast(deployerKey);

        // ── Step 1: Deploy all 9 contracts ─────────────────────────────────

        // 1. Treasury
        BlockHuntTreasury treasury = new BlockHuntTreasury(creatorWallet);
        console.log("1. Treasury deployed:    ", address(treasury));

        // 2. MintWindow
        BlockHuntMintWindow mintWindow = new BlockHuntMintWindow();
        console.log("2. MintWindow deployed:  ", address(mintWindow));

        // 3. Countdown
        BlockHuntCountdown countdown = new BlockHuntCountdown();
        console.log("3. Countdown deployed:   ", address(countdown));

        // 4. Forge
        BlockHuntForge forge = new BlockHuntForge(VRF_COORDINATOR);
        console.log("4. Forge deployed:       ", address(forge));

        // 5. Token
        BlockHuntToken token = new BlockHuntToken(
            METADATA_URI,
            creatorWallet,
            ROYALTY_FEE_BPS,
            VRF_COORDINATOR
        );
        console.log("5. Token deployed:       ", address(token));

        // 6. Escrow (keeper = deployer for now)
        BlockHuntEscrow escrow = new BlockHuntEscrow(deployer);
        console.log("6. Escrow deployed:      ", address(escrow));

        // 7. Migration
        BlockHuntMigration migration = new BlockHuntMigration(address(token));
        console.log("7. Migration deployed:   ", address(migration));

        // 8. SeasonRegistry
        BlockHuntSeasonRegistry registry = new BlockHuntSeasonRegistry();
        console.log("8. Registry deployed:    ", address(registry));

        // 9. Rewards
        BlockHuntRewards rewards = new BlockHuntRewards();
        console.log("9. Rewards deployed:     ", address(rewards));

        console.log("-------------------------------------------------");

        // ── Step 2: Wire Token → all peripherals ───────────────────────────

        token.setTreasuryContract(address(treasury));
        token.setMintWindowContract(address(mintWindow));
        token.setForgeContract(address(forge));
        token.setCountdownContract(address(countdown));
        token.setEscrowContract(address(escrow));
        token.setMigrationContract(address(migration));
        console.log("Token wired to all peripherals.");

        // ── Step 3: Wire peripherals → Token ───────────────────────────────

        treasury.setTokenContract(address(token));
        treasury.setEscrowContract(address(escrow));
        console.log("Treasury wired to Token + Escrow.");

        escrow.setTokenContract(address(token));
        console.log("Escrow wired to Token.");

        forge.setTokenContract(address(token));
        forge.setCountdownContract(address(countdown));
        console.log("Forge wired to Token + Countdown.");

        mintWindow.setTokenContract(address(token));
        console.log("MintWindow wired to Token.");

        countdown.setTokenContract(address(token));
        console.log("Countdown wired to Token.");

        rewards.setTokenContract(address(token));
        console.log("Rewards wired to Token.");

        // ── Step 4: Configure VRF ──────────────────────────────────────────

        token.setVrfConfig(VRF_SUB_ID, VRF_KEY_HASH, TOKEN_VRF_GAS);
        // VRF disabled by default — enable after adding consumer on VRF dashboard
        // token.setVrfEnabled(true);

        forge.setVrfConfig(VRF_SUB_ID, VRF_KEY_HASH, FORGE_VRF_GAS);
        // forge.setVrfEnabled(true);
        console.log("VRF configured (disabled until consumers added on dashboard).");

        // ── Step 5: Post-deploy config (redeploy hardening) ───────────────

        token.setVrfGasParams(28_000, 15_000_000);
        token.setMintRequestTTL(10 minutes);
        token.setLazyRevealThreshold(0);
        token.setRewardsContract(address(rewards));
        console.log("Token config: VRF gas 28k/15M, TTL 10min, lazy reveal OFF, rewards wired.");

        // ── Step 6: Minting is always open (no window to open) ────────────
        console.log("Minting is always open (per-player cooldown model).");

        // ── Step 7: Register Season 1 ──────────────────────────────────────

        registry.registerSeason(
            1,
            address(treasury),
            address(token),
            address(mintWindow),
            address(forge)
        );
        registry.markSeasonLaunched(1);
        console.log("Season 1 registered and launched.");

        vm.stopBroadcast();

        // ── Summary ─────────────────────────────────────────────────────────
        console.log("");
        console.log("=================================================");
        console.log("  Deployment complete!");
        console.log("=================================================");
        console.log("");
        console.log("  ALL CONTRACTS (update wagmi.js):");
        console.log("  TOKEN:     ", address(token));
        console.log("  TREASURY:  ", address(treasury));
        console.log("  WINDOW:    ", address(mintWindow));
        console.log("  COUNTDOWN: ", address(countdown));
        console.log("  FORGE:     ", address(forge));
        console.log("  ESCROW:    ", address(escrow));
        console.log("  MIGRATION: ", address(migration));
        console.log("  REGISTRY:  ", address(registry));
        console.log("  REWARDS:   ", address(rewards));
        console.log("");
        console.log("  SETTINGS:");
        console.log("  Countdown:     7 days (default)");
        console.log("  Safe period:   24 hours (default)");
        console.log("  Creator fee:   20% (default)");
        console.log("  VRF gas:       28k/block, 15M max");
        console.log("  Mint TTL:      10 minutes");
        console.log("  Lazy reveal:   disabled");
        console.log("  Grace period:  15 minutes (holder-exclusive)");
        console.log("  VRF:           disabled (enable after adding consumers)");
        console.log("");
        console.log("=================================================");
        console.log("  MANUAL STEPS:");
        console.log("=================================================");
        console.log("  1. VRF: Add Token + Forge as consumers at https://vrf.chain.link");
        console.log("     Sub ID:", VRF_SUB_ID);
        console.log("     Then call token.setVrfEnabled(true) and forge.setVrfEnabled(true)");
        console.log("     Remove old consumers:", OLD_TOKEN, OLD_FORGE);
        console.log("");
        console.log("  2. Update frontend/src/config/wagmi.js with ALL new addresses");
        console.log("");
        console.log("  3. Update subgraph/subgraph.yaml with new Token address + startBlock");
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
