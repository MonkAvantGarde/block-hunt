// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/BlockHuntToken.sol";
import "../src/BlockHuntTreasury.sol";
import "../src/BlockHuntMintWindow.sol";
import "../src/BlockHuntCountdown.sol";
import "../src/BlockHuntEscrow.sol";
import "../src/BlockHuntForge.sol";

/**
 * @title  Block Hunt — v2.1 Redeployment
 * @notice Deploys 5 contracts (Token, Treasury, MintWindow, Countdown, Escrow)
 *         because Treasury and Escrow have locked setTokenContract.
 *         Wires them to 3 existing contracts (Forge, Migration, Registry).
 *
 *         v2.1 changes:
 *           - Token: continuous rarity curve, new combine ratios, totalMinted counter
 *           - MintWindow: 10-batch config with scaled pricing
 *           - Countdown: takeover mechanic with safe period
 */
contract DeployV2_1 is Script {

    // ── Configuration ─────────────────────────────────────────────────────────
    string constant METADATA_URI = "https://api.blockhunt.xyz/metadata/{id}.json";
    uint96 constant ROYALTY_FEE_BPS = 1000;

    // Chainlink VRF V2.5
    address constant VRF_COORDINATOR = 0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE;
    bytes32 constant VRF_KEY_HASH = 0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71;
    uint256 constant VRF_SUB_ID = 57750058386053786990998297633685375559871666481243777791923539169896613845120;
    uint32 constant TOKEN_VRF_GAS = 2_500_000;

    // ── Existing contracts (NOT redeployed) ─────────────────────────────────
    address constant EXISTING_FORGE     = 0x6CCBD030Eab2020326d3D76725F8361ffD354303;
    address constant EXISTING_MIGRATION = 0xfD44677e950a77972a46FAe024e587dcD1Bd9eD5;
    address constant EXISTING_REGISTRY  = 0x43944fc7Fe8dce7997Ba1609a13Cf298eFD6622f;

    function run() external {
        uint256 deployerKey   = vm.envUint("PRIVATE_KEY");
        address deployer      = vm.addr(deployerKey);
        address creatorWallet = vm.envAddress("CREATOR_WALLET");

        console.log("=================================================");
        console.log("  Block Hunt -- v2.1 Redeployment");
        console.log("=================================================");
        console.log("  Deployer:       ", deployer);
        console.log("  Creator wallet: ", creatorWallet);
        console.log("-------------------------------------------------");

        vm.startBroadcast(deployerKey);

        // ── Deploy 5 contracts ─────────────────────────────────────────────

        BlockHuntTreasury treasury = new BlockHuntTreasury(creatorWallet);
        console.log("1. Treasury deployed:    ", address(treasury));

        BlockHuntMintWindow mintWindow = new BlockHuntMintWindow();
        console.log("2. MintWindow deployed:  ", address(mintWindow));

        BlockHuntCountdown countdown = new BlockHuntCountdown();
        console.log("3. Countdown deployed:   ", address(countdown));

        BlockHuntEscrow escrow = new BlockHuntEscrow(deployer);
        console.log("4. Escrow deployed:      ", address(escrow));

        BlockHuntToken token = new BlockHuntToken(
            METADATA_URI,
            creatorWallet,
            ROYALTY_FEE_BPS,
            VRF_COORDINATOR
        );
        console.log("5. Token deployed:       ", address(token));

        // ── Wire new contracts ─────────────────────────────────────────────

        // Token → peripherals
        token.setTreasuryContract(address(treasury));
        token.setMintWindowContract(address(mintWindow));
        token.setForgeContract(EXISTING_FORGE);
        token.setCountdownContract(address(countdown));
        token.setEscrowContract(address(escrow));
        // token.setMigrationContract(EXISTING_MIGRATION); // deferred to Season 2

        // New peripherals → Token
        treasury.setTokenContract(address(token));
        mintWindow.setTokenContract(address(token));
        countdown.setTokenContract(address(token));
        escrow.setTokenContract(address(token));

        // Treasury ↔ Escrow
        treasury.setEscrowContract(address(escrow));

        // Existing Forge → new Token (no guard — re-callable)
        BlockHuntForge(payable(EXISTING_FORGE)).setTokenContract(address(token));
        console.log("Forge re-wired to new Token.");

        // ── Configure VRF ──────────────────────────────────────────────────

        token.setVrfConfig(VRF_SUB_ID, VRF_KEY_HASH, TOKEN_VRF_GAS);
        token.setVrfEnabled(true);
        console.log("VRF configured on new Token.");

        // ── Minting is always open (no window to open) ──────────────────
        console.log("Minting is always open (per-player cooldown model).");

        vm.stopBroadcast();

        // ── Summary ────────────────────────────────────────────────────────
        console.log("=================================================");
        console.log("  v2.1 Deployment Complete");
        console.log("=================================================");
        console.log("  NEW CONTRACTS (5):");
        console.log("  BlockHuntToken:      ", address(token));
        console.log("  BlockHuntTreasury:   ", address(treasury));
        console.log("  BlockHuntMintWindow: ", address(mintWindow));
        console.log("  BlockHuntCountdown:  ", address(countdown));
        console.log("  BlockHuntEscrow:     ", address(escrow));
        console.log("");
        console.log("  EXISTING (3, unchanged):");
        console.log("  BlockHuntForge:          ", EXISTING_FORGE);
        console.log("  BlockHuntMigration:      ", EXISTING_MIGRATION);
        console.log("  BlockHuntSeasonRegistry: ", EXISTING_REGISTRY);
        console.log("=================================================");
        console.log("  NEXT: Add new Token as VRF consumer at vrf.chain.link");
        console.log("=================================================");
    }
}
