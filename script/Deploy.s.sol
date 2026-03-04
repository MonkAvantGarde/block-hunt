// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/BlockHuntTreasury.sol";
import "../src/BlockHuntMintWindow.sol";
import "../src/BlockHuntCountdown.sol";
import "../src/BlockHuntForge.sol";
import "../src/BlockHuntToken.sol";
import "../src/BlockHuntMigration.sol";
import "../src/BlockHuntSeasonRegistry.sol";

/**
 * @title  Block Hunt — Base Sepolia Deployment Script
 * @notice Deploys and wires all 7 contracts, registers Season 1, and opens
 *         the first mint window.
 *
 * ── Before running ───────────────────────────────────────────────────────────
 *
 *  1. Copy .env.example to .env and fill in:
 *       PRIVATE_KEY          — deployer wallet private key (testnet only, never mainnet)
 *       CREATOR_WALLET       — address that receives the 5% creator fee
 *       BASE_SEPOLIA_RPC_URL — your RPC endpoint (Alchemy / Infura / etc.)
 *       BASESCAN_API_KEY     — for contract verification on BaseScan
 *
 *  2. Fund the deployer wallet with Base Sepolia ETH.
 *       Faucet: https://www.alchemy.com/faucets/base-sepolia
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
 *  3. Set up Chainlink VRF for both Forge and Token (vrfEnabled = false by default
 *     so the game is fully playable before VRF is configured):
 *       a. Create a VRF V2.5 subscription at https://vrf.chain.link
 *       b. Fund the subscription with testnet LINK
 *       c. Add BOTH Forge and Token contract addresses as consumers
 *       d. Call forge.setVrfConfig(subId, KEY_HASH, 200000)
 *       e. Call token.setVrfConfig(subId, KEY_HASH, 500000)
 *       f. Call forge.setVrfEnabled(true)
 *       g. Call token.setVrfEnabled(true)
 *  4. Play the game manually end-to-end to confirm wiring is correct.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
contract Deploy is Script {

    // ── Configuration ─────────────────────────────────────────────────────────

    // Metadata URI — {id} is replaced by the token ID (1-7) by the ERC-1155 standard
    // Update this once you have a live metadata API or IPFS CID
    string constant METADATA_URI = "https://api.blockhunt.xyz/metadata/{id}.json";

    // ERC-2981 royalty fee — 500 = 5%
    uint96 constant ROYALTY_FEE_BPS = 500;

    // Chainlink VRF V2.5 coordinator on Base Sepolia
    // Both Forge and Token use the same coordinator address.
    // vrfEnabled = false by default on both contracts — VRF must be configured
    // and enabled manually after deployment (see "After running" notes above).
    address constant VRF_COORDINATOR = 0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE;

    // Base Sepolia VRF key hash (30 gwei gas lane)
    bytes32 constant VRF_KEY_HASH = 0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71;

    // ── Run ───────────────────────────────────────────────────────────────────

    function run() external {
        // Load config from .env
        uint256 deployerKey   = vm.envUint("PRIVATE_KEY");
        address deployer      = vm.addr(deployerKey);
        address creatorWallet = vm.envAddress("CREATOR_WALLET");

        require(creatorWallet != address(0), "Deploy: CREATOR_WALLET not set in .env");

        console.log("=================================================");
        console.log("  Block Hunt -- Base Sepolia Deployment");
        console.log("=================================================");
        console.log("  Deployer:      ", deployer);
        console.log("  Creator wallet:", creatorWallet);
        console.log("  VRF Coordinator:", VRF_COORDINATOR);
        console.log("-------------------------------------------------");

        vm.startBroadcast(deployerKey);

        // ── Step 1: Deploy all 7 contracts ───────────────────────────────────
        // Order matters: Token wires to everything else, so others deploy first.
        // Migration needs the Token address, so it deploys after Token.
        // SeasonRegistry is standalone — deploys last.

        // 1. Treasury — holds all mint ETH, pays out on endgame
        BlockHuntTreasury treasury = new BlockHuntTreasury(creatorWallet);
        console.log("1. Treasury deployed:    ", address(treasury));

        // 2. MintWindow — manages 8hr windows and daily caps
        BlockHuntMintWindow mintWindow = new BlockHuntMintWindow();
        console.log("2. MintWindow deployed:  ", address(mintWindow));

        // 3. Countdown — 7-day endgame timer and community vote
        BlockHuntCountdown countdown = new BlockHuntCountdown();
        console.log("3. Countdown deployed:   ", address(countdown));

        // 4. Forge — probabilistic tier upgrades (VRF V2.5, disabled by default)
        BlockHuntForge forge = new BlockHuntForge(VRF_COORDINATOR);
        console.log("4. Forge deployed:       ", address(forge));

        // 5. Token — ERC-1155 core: mint, combine, forge, claim, sacrifice
        //    (VRF V2.5 for mint randomness, disabled by default)
        BlockHuntToken token = new BlockHuntToken(
            METADATA_URI,
            creatorWallet,
            ROYALTY_FEE_BPS,
            VRF_COORDINATOR
        );
        console.log("5. Token deployed:       ", address(token));

        // 6. Migration — Season 1 -> Season 2 player migration
        BlockHuntMigration migration = new BlockHuntMigration(address(token));
        console.log("6. Migration deployed:   ", address(migration));

        // 7. SeasonRegistry — season lifecycle tracking, seed destination verification
        BlockHuntSeasonRegistry registry = new BlockHuntSeasonRegistry();
        console.log("7. Registry deployed:    ", address(registry));

        console.log("-------------------------------------------------");

        // ── Step 2: Wire all contracts together ──────────────────────────────

        // Token needs to know about Treasury, MintWindow, Forge, and Countdown
        token.setTreasuryContract(address(treasury));
        token.setMintWindowContract(address(mintWindow));
        token.setForgeContract(address(forge));
        token.setCountdownContract(address(countdown));

        // Each peripheral contract needs to know about Token
        treasury.setTokenContract(address(token));
        mintWindow.setTokenContract(address(token));
        forge.setTokenContract(address(token));
        countdown.setTokenContract(address(token));

        console.log("Wiring complete.");

        // ── Step 3: Register Season 1 in the SeasonRegistry ──────────────────

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

        // ── Step 4: Open the first mint window ───────────────────────────────

        mintWindow.openWindow();
        console.log("First mint window opened.");

        vm.stopBroadcast();

        // ── Summary ───────────────────────────────────────────────────────────
        console.log("=================================================");
        console.log("  Deployment complete. Copy these into STATUS.md:");
        console.log("=================================================");
        console.log("  BlockHuntTreasury:       ", address(treasury));
        console.log("  BlockHuntMintWindow:     ", address(mintWindow));
        console.log("  BlockHuntCountdown:      ", address(countdown));
        console.log("  BlockHuntForge:          ", address(forge));
        console.log("  BlockHuntToken:          ", address(token));
        console.log("  BlockHuntMigration:      ", address(migration));
        console.log("  BlockHuntSeasonRegistry: ", address(registry));
        console.log("=================================================");
        console.log("  NEXT STEP: Configure VRF for Forge and Token.");
        console.log("  See 'After running' notes at top of this file.");
        console.log("  VRF key hash:", uint256(VRF_KEY_HASH));
        console.log("=================================================");
    }
}
