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

/**
 * @title  Block Hunt — Base Sepolia Redeployment (Phase 5 — Audit Fixes)
 * @notice Deploys 5 new contracts (Token, Treasury, MintWindow, Countdown,
 *         Escrow) and re-wires them to the 3 existing contracts (Forge,
 *         Migration, SeasonRegistry).
 *
 *         Changes since Phase 4:
 *           - H-1: Token admin setters are now test-mode-gated one-time setters
 *           - H-3: Countdown voter list replaced with round-based counter
 *           - H-4: Token royalty capped at 10%
 *           - M-1: Escrow uses pull-payment for winner's 50%
 *
 * ── Before running ───────────────────────────────────────────────────────────
 *
 *  1. Copy .env.example to .env and fill in:
 *       PRIVATE_KEY          — deployer wallet private key (testnet only)
 *       CREATOR_WALLET       — address that receives the 10% creator fee
 *       BASE_SEPOLIA_RPC_URL — your RPC endpoint
 *       BASESCAN_API_KEY     — for contract verification on BaseScan
 *
 *  2. Fund the deployer wallet with Base Sepolia ETH.
 *
 *  3. Ensure the Chainlink VRF V2.5 subscription is funded.
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
 *  1. Copy the printed contract addresses into STATUS.md.
 *  2. On the Chainlink VRF subscription (https://vrf.chain.link):
 *       - ADD the new Token address as a consumer
 *       - REMOVE the old Token address
 *       (Forge address is unchanged — already a consumer)
 *  3. Verify all 5 new contracts on BaseScan.
 *  4. Update frontend/src/config/wagmi.js with new addresses.
 *  5. Update subgraph/subgraph.yaml with new Token address.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
contract Deploy is Script {

    // ── Configuration ─────────────────────────────────────────────────────────

    // Metadata URI — {id} is replaced by the token ID (1-7) by the ERC-1155 standard
    string constant METADATA_URI = "https://api.blockhunt.xyz/metadata/{id}.json";

    // ERC-2981 royalty fee — 1000 = 10%
    uint96 constant ROYALTY_FEE_BPS = 1000;

    // Chainlink VRF V2.5 coordinator on Base Sepolia
    address constant VRF_COORDINATOR = 0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE;

    // Base Sepolia VRF key hash (30 gwei gas lane)
    bytes32 constant VRF_KEY_HASH = 0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71;

    // Chainlink VRF subscription ID
    uint256 constant VRF_SUB_ID = 57750058386053786990998297633685375559871666481243777791923539169896613845120;

    // VRF callback gas limits
    uint32 constant TOKEN_VRF_GAS = 2_500_000;
    uint32 constant FORGE_VRF_GAS = 300_000;

    // ── Existing contracts (NOT redeployed) ─────────────────────────────────

    address constant EXISTING_FORGE      = 0xA4865336E3e760f6738B0Dea009B574f3d8e0BbC;
    address constant EXISTING_MIGRATION  = 0xfD44677e950a77972a46FAe024e587dcD1Bd9eD5;

    // ── Run ───────────────────────────────────────────────────────────────────

    function run() external {
        // Load config from .env
        uint256 deployerKey   = vm.envUint("PRIVATE_KEY");
        address deployer      = vm.addr(deployerKey);
        address creatorWallet = vm.envAddress("CREATOR_WALLET");

        require(creatorWallet != address(0), "Deploy: CREATOR_WALLET not set in .env");

        console.log("=================================================");
        console.log("  Block Hunt -- Base Sepolia Redeployment (Phase 5)");
        console.log("=================================================");
        console.log("  Deployer:       ", deployer);
        console.log("  Creator wallet: ", creatorWallet);
        console.log("  Keeper (Escrow):", deployer);
        console.log("  VRF Coordinator:", VRF_COORDINATOR);
        console.log("-------------------------------------------------");
        console.log("  Existing Forge:     ", EXISTING_FORGE);
        console.log("  Existing Migration: ", EXISTING_MIGRATION);
        console.log("-------------------------------------------------");

        vm.startBroadcast(deployerKey);

        // ── Step 1: Deploy 5 new contracts ───────────────────────────────────

        // 1. Treasury — holds all mint ETH, pays out on endgame
        BlockHuntTreasury treasury = new BlockHuntTreasury(creatorWallet);
        console.log("1. Treasury deployed:    ", address(treasury));

        // 2. MintWindow — manages 3hr windows and per-user caps
        BlockHuntMintWindow mintWindow = new BlockHuntMintWindow();
        console.log("2. MintWindow deployed:  ", address(mintWindow));

        // 3. Countdown — 7-day endgame timer, challenge mechanic, community vote
        BlockHuntCountdown countdown = new BlockHuntCountdown();
        console.log("3. Countdown deployed:   ", address(countdown));

        // 4. Token — ERC-1155 core: mint, combine, forge, claim, sacrifice (VRF V2.5)
        BlockHuntToken token = new BlockHuntToken(
            METADATA_URI,
            creatorWallet,
            ROYALTY_FEE_BPS,
            VRF_COORDINATOR
        );
        console.log("4. Token deployed:       ", address(token));

        // 5. Escrow — sacrifice fund distribution (50/40/10 split, pull-payment)
        //    Keeper = deployer for testnet (will be Gelato/dedicated EOA on mainnet)
        BlockHuntEscrow escrow = new BlockHuntEscrow(deployer);
        console.log("5. Escrow deployed:      ", address(escrow));

        // 6. SeasonRegistry — fresh deploy (old registry has stale Season 1 data)
        BlockHuntSeasonRegistry registry = new BlockHuntSeasonRegistry();
        console.log("6. Registry deployed:    ", address(registry));

        console.log("-------------------------------------------------");

        // ── Step 2: Wire new contracts to each other ─────────────────────────

        // Token → peripherals (new + existing)
        token.setTreasuryContract(address(treasury));
        token.setMintWindowContract(address(mintWindow));
        token.setForgeContract(EXISTING_FORGE);
        token.setCountdownContract(address(countdown));
        token.setEscrowContract(address(escrow));
        token.setMigrationContract(EXISTING_MIGRATION);

        // New peripherals → Token
        treasury.setTokenContract(address(token));
        mintWindow.setTokenContract(address(token));
        countdown.setTokenContract(address(token));
        escrow.setTokenContract(address(token));

        // Treasury ↔ Escrow
        treasury.setEscrowContract(address(escrow));

        console.log("New contract wiring complete.");

        // ── Step 3: Re-wire existing contracts to new Token ──────────────────

        // Forge → new Token (Forge.setTokenContract has no guard — re-callable)
        BlockHuntForge(payable(EXISTING_FORGE)).setTokenContract(address(token));
        console.log("Forge re-wired to new Token.");

        // Migration → new Token as V1 (Migration.setTokenV1 has no guard)
        BlockHuntMigration(EXISTING_MIGRATION).setTokenV1(address(token));
        console.log("Migration re-wired to new Token (as V1).");

        // ── Step 4: Configure VRF ────────────────────────────────────────────

        // Token VRF — 2,500,000 gas limit for large mints (500 blocks)
        token.setVrfConfig(VRF_SUB_ID, VRF_KEY_HASH, TOKEN_VRF_GAS);
        token.setVrfEnabled(true);

        // Forge VRF — re-configure to ensure correct subscription
        BlockHuntForge(payable(EXISTING_FORGE)).setVrfConfig(VRF_SUB_ID, VRF_KEY_HASH, FORGE_VRF_GAS);
        BlockHuntForge(payable(EXISTING_FORGE)).setVrfEnabled(true);

        console.log("VRF configured: Token (2.5M gas), Forge (300k gas).");

        // ── Step 5: Register Season 1 on SeasonRegistry ──────────────────────

        registry.registerSeason(
            1,
            address(treasury),
            address(token),
            address(mintWindow),
            EXISTING_FORGE
        );
        registry.setSeasonMigration(1, EXISTING_MIGRATION);
        registry.markSeasonLaunched(1);

        console.log("Season 1 registered and launched in SeasonRegistry.");

        // ── Step 6: Open the first mint window ───────────────────────────────

        mintWindow.forceOpenWindow();
        console.log("First mint window opened (via forceOpenWindow).");

        vm.stopBroadcast();

        // ── Summary ───────────────────────────────────────────────────────────
        console.log("=================================================");
        console.log("  Deployment complete. Copy these into STATUS.md:");
        console.log("=================================================");
        console.log("  NEW CONTRACTS:");
        console.log("  BlockHuntToken:          ", address(token));
        console.log("  BlockHuntTreasury:       ", address(treasury));
        console.log("  BlockHuntMintWindow:     ", address(mintWindow));
        console.log("  BlockHuntCountdown:      ", address(countdown));
        console.log("  BlockHuntEscrow:         ", address(escrow));
        console.log("  BlockHuntSeasonRegistry: ", address(registry));
        console.log("");
        console.log("  EXISTING (unchanged):");
        console.log("  BlockHuntForge:          ", EXISTING_FORGE);
        console.log("  BlockHuntMigration:      ", EXISTING_MIGRATION);
        console.log("=================================================");
        console.log("  NEXT STEPS:");
        console.log("  1. Add NEW Token as VRF consumer at https://vrf.chain.link");
        console.log("  2. Remove OLD Token from VRF consumers");
        console.log("  3. Subscription ID:", VRF_SUB_ID);
        console.log("=================================================");
    }
}
