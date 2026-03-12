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
 * @title  Block Hunt — Base Sepolia Deployment Script (Phase 4)
 * @notice Deploys and wires all 8 contracts, configures VRF, registers Season 1,
 *         and opens the first mint window.
 *
 * ── Before running ───────────────────────────────────────────────────────────
 *
 *  1. Copy .env.example to .env and fill in:
 *       PRIVATE_KEY          — deployer wallet private key (testnet only, never mainnet)
 *       CREATOR_WALLET       — address that receives the 10% creator fee
 *       BASE_SEPOLIA_RPC_URL — your RPC endpoint (Alchemy / Infura / etc.)
 *       BASESCAN_API_KEY     — for contract verification on BaseScan
 *
 *  2. Fund the deployer wallet with Base Sepolia ETH.
 *       Faucet: https://www.alchemy.com/faucets/base-sepolia
 *
 *  3. Ensure the Chainlink VRF V2.5 subscription is funded and both Forge and
 *     Token addresses are added as consumers AFTER deployment.
 *
 * ── Run ──────────────────────────────────────────────────────────────────────
 *
 *  Dry run (no broadcast, no gas spent):
 *    forge script script/Deploy.s.sol:Deploy \
 *      --rpc-url $BASE_SEPOLIA_RPC_URL \
 *      -vvvv
 *
 *  Deploy + verify:
 *    forge script script/Deploy.s.sol:Deploy \
 *      --rpc-url $BASE_SEPOLIA_RPC_URL \
 *      --broadcast \
 *      --verify \
 *      --etherscan-api-key $BASESCAN_API_KEY \
 *      -vvvv
 *
 * ── After running ────────────────────────────────────────────────────────────
 *
 *  1. Copy the printed contract addresses into STATUS.md.
 *  2. Confirm all contracts are verified on BaseScan:
 *       https://sepolia.basescan.org
 *  3. Add BOTH Forge and Token contract addresses as consumers on the
 *     Chainlink VRF V2.5 subscription at https://vrf.chain.link
 *  4. Play the game manually end-to-end to confirm wiring is correct.
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
    uint32 constant TOKEN_VRF_GAS = 500_000;
    uint32 constant FORGE_VRF_GAS = 300_000;

    // ── Run ───────────────────────────────────────────────────────────────────

    function run() external {
        // Load config from .env
        uint256 deployerKey   = vm.envUint("PRIVATE_KEY");
        address deployer      = vm.addr(deployerKey);
        address creatorWallet = vm.envAddress("CREATOR_WALLET");

        require(creatorWallet != address(0), "Deploy: CREATOR_WALLET not set in .env");

        console.log("=================================================");
        console.log("  Block Hunt -- Base Sepolia Deployment (Phase 4)");
        console.log("=================================================");
        console.log("  Deployer:       ", deployer);
        console.log("  Creator wallet: ", creatorWallet);
        console.log("  Keeper (Escrow):", deployer);
        console.log("  VRF Coordinator:", VRF_COORDINATOR);
        console.log("-------------------------------------------------");

        vm.startBroadcast(deployerKey);

        // ── Step 1: Deploy all 8 contracts ─────────────────────────────────

        // 1. Treasury — holds all mint ETH, pays out on endgame
        BlockHuntTreasury treasury = new BlockHuntTreasury(creatorWallet);
        console.log("1. Treasury deployed:    ", address(treasury));

        // 2. MintWindow — manages 6hr windows and per-user caps
        BlockHuntMintWindow mintWindow = new BlockHuntMintWindow();
        console.log("2. MintWindow deployed:  ", address(mintWindow));

        // 3. Countdown — 7-day endgame timer and community vote (pure game logic, no ETH)
        BlockHuntCountdown countdown = new BlockHuntCountdown();
        console.log("3. Countdown deployed:   ", address(countdown));

        // 4. Forge — probabilistic tier upgrades + forgeBatch (VRF V2.5)
        BlockHuntForge forge = new BlockHuntForge(VRF_COORDINATOR);
        console.log("4. Forge deployed:       ", address(forge));

        // 5. Token — ERC-1155 core: mint, combine, forge, claim, sacrifice (VRF V2.5)
        BlockHuntToken token = new BlockHuntToken(
            METADATA_URI,
            creatorWallet,
            ROYALTY_FEE_BPS,
            VRF_COORDINATOR
        );
        console.log("5. Token deployed:       ", address(token));

        // 6. Escrow — sacrifice fund distribution (50/40/10 split)
        //    Keeper = deployer for testnet (will be Gelato/dedicated EOA on mainnet)
        BlockHuntEscrow escrow = new BlockHuntEscrow(deployer);
        console.log("6. Escrow deployed:      ", address(escrow));

        // 7. Migration — Season 1 → Season 2 player migration
        BlockHuntMigration migration = new BlockHuntMigration(address(token));
        console.log("7. Migration deployed:   ", address(migration));

        // 8. SeasonRegistry — season lifecycle tracking, seed destination verification
        BlockHuntSeasonRegistry registry = new BlockHuntSeasonRegistry();
        console.log("8. Registry deployed:    ", address(registry));

        console.log("-------------------------------------------------");

        // ── Step 2: Wire all contracts together ────────────────────────────

        // Token → peripherals
        token.setTreasuryContract(address(treasury));
        token.setMintWindowContract(address(mintWindow));
        token.setForgeContract(address(forge));
        token.setCountdownContract(address(countdown));
        token.setEscrowContract(address(escrow));
        token.setMigrationContract(address(migration));

        // Peripherals → Token
        treasury.setTokenContract(address(token));
        mintWindow.setTokenContract(address(token));
        forge.setTokenContract(address(token));
        countdown.setTokenContract(address(token));
        escrow.setTokenContract(address(token));

        // Treasury ↔ Escrow
        treasury.setEscrowContract(address(escrow));

        console.log("Wiring complete.");

        // ── Step 3: Configure VRF on Token and Forge ───────────────────────

        token.setVrfConfig(VRF_SUB_ID, VRF_KEY_HASH, TOKEN_VRF_GAS);
        token.setVrfEnabled(true);

        forge.setVrfConfig(VRF_SUB_ID, VRF_KEY_HASH, FORGE_VRF_GAS);
        forge.setVrfEnabled(true);

        console.log("VRF configured and enabled on Token and Forge.");

        // ── Step 4: Register Season 1 in the SeasonRegistry ────────────────

        registry.registerSeason(
            1,
            address(treasury),
            address(token),
            address(mintWindow),
            address(forge)
        );
        registry.setSeasonMigration(1, address(migration));
        registry.markSeasonLaunched(1);

        console.log("Season 1 registered and launched in SeasonRegistry.");

        // ── Step 5: Open the first mint window ─────────────────────────────

        mintWindow.openWindow();
        console.log("First mint window opened.");

        vm.stopBroadcast();

        // ── Summary ─────────────────────────────────────────────────────────
        console.log("=================================================");
        console.log("  Deployment complete. Copy these into STATUS.md:");
        console.log("=================================================");
        console.log("  BlockHuntTreasury:       ", address(treasury));
        console.log("  BlockHuntMintWindow:     ", address(mintWindow));
        console.log("  BlockHuntCountdown:      ", address(countdown));
        console.log("  BlockHuntForge:          ", address(forge));
        console.log("  BlockHuntToken:          ", address(token));
        console.log("  BlockHuntEscrow:         ", address(escrow));
        console.log("  BlockHuntMigration:      ", address(migration));
        console.log("  BlockHuntSeasonRegistry: ", address(registry));
        console.log("=================================================");
        console.log("  NEXT STEP: Add Token and Forge as VRF consumers");
        console.log("  at https://vrf.chain.link for subscription:");
        console.log("  ", VRF_SUB_ID);
        console.log("=================================================");
    }
}
