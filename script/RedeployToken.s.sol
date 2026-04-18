// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/BlockHuntToken.sol";
import "../src/BlockHuntTreasury.sol";
import "../src/BlockHuntMintWindow.sol";
import "../src/BlockHuntCountdown.sol";
import "../src/BlockHuntForge.sol";
import "../src/BlockHuntMigration.sol";
import "../src/BlockHuntEscrow.sol";

/**
 * @title  RedeployToken — Redeploy only BlockHuntToken
 * @notice Deploys a new Token contract and re-wires all 6 peripherals.
 *         Needed after mintPriceForBatch changed from pure to storage mapping.
 *
 *  forge script script/RedeployToken.s.sol:RedeployToken \
 *    --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify \
 *    --etherscan-api-key $BASESCAN_API_KEY -vvvv
 */
contract RedeployToken is Script {

    // ── Config (same as Deploy.s.sol) ───────────────────────────────────────
    string constant METADATA_URI    = "https://api.blockhunt.xyz/metadata/{id}.json";
    uint96 constant ROYALTY_FEE_BPS = 1000;
    address constant VRF_COORDINATOR = 0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE;
    bytes32 constant VRF_KEY_HASH    = 0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71;
    uint256 constant VRF_SUB_ID      = 57750058386053786990998297633685375559871666481243777791923539169896613845120;
    uint32  constant TOKEN_VRF_GAS   = 2_500_000;

    // ── Existing contracts (from Phase 5 deploy) ────────────────────────────
    address constant TREASURY   = 0x6c264D2aBc88bB52D8D1B8769360cad71cB6730f;
    address constant MINT_WINDOW = 0xd6041d73C9B5C8dde6df6a1b35F7d22C1A087aEa;
    address constant COUNTDOWN  = 0x7360590aD91AFE35e9e678842a79B0720F0425e7;
    address constant ESCROW     = 0xBA346012cc45BBD3aB66E953C6D5914a8E40D923;
    address constant FORGE      = 0xA4865336E3e760f6738B0Dea009B574f3d8e0BbC;
    address constant MIGRATION  = 0xfD44677e950a77972a46FAe024e587dcD1Bd9eD5;

    function run() external {
        uint256 deployerKey   = vm.envUint("PRIVATE_KEY");
        address deployer      = vm.addr(deployerKey);
        address creatorWallet = vm.envAddress("CREATOR_WALLET");

        console.log("=================================================");
        console.log("  RedeployToken -- Token-only redeploy");
        console.log("=================================================");
        console.log("  Deployer:       ", deployer);
        console.log("  Creator wallet: ", creatorWallet);
        console.log("-------------------------------------------------");

        vm.startBroadcast(deployerKey);

        // ── Step 1: Deploy new Token ────────────────────────────────────────
        BlockHuntToken token = new BlockHuntToken(
            METADATA_URI,
            creatorWallet,
            ROYALTY_FEE_BPS,
            VRF_COORDINATOR
        );
        console.log("NEW Token deployed: ", address(token));

        // ── Step 2: Wire Token → peripherals ────────────────────────────────
        token.setTreasuryContract(TREASURY);
        token.setMintWindowContract(MINT_WINDOW);
        token.setForgeContract(FORGE);
        token.setCountdownContract(COUNTDOWN);
        token.setEscrowContract(ESCROW);
        // token.setMigrationContract(MIGRATION); // deferred to Season 2
        console.log("Token -> peripherals wired.");

        // ── Step 3: Wire peripherals → new Token ────────────────────────────
        BlockHuntTreasury(payable(TREASURY)).setTokenContract(address(token));
        BlockHuntMintWindow(MINT_WINDOW).setTokenContract(address(token));
        BlockHuntCountdown(COUNTDOWN).setTokenContract(address(token));
        BlockHuntEscrow(payable(ESCROW)).setTokenContract(address(token));
        BlockHuntForge(payable(FORGE)).setTokenContract(address(token));
        BlockHuntMigration(MIGRATION).setTokenV1(address(token));
        console.log("Peripherals -> new Token wired.");

        // ── Step 4: Configure VRF ───────────────────────────────────────────
        token.setVrfConfig(VRF_SUB_ID, VRF_KEY_HASH, TOKEN_VRF_GAS);
        token.setVrfEnabled(true);
        console.log("VRF configured (2.5M gas).");

        // ── Step 5: Minting is always open ────────────────────────────────
        console.log("Minting is always open (per-player cooldown model).");

        vm.stopBroadcast();

        console.log("=================================================");
        console.log("  NEW Token:  ", address(token));
        console.log("  OLD Token:   0x4C4DFE9A763F7ebeD0A2C18c12Bf7c022ad396a7");
        console.log("=================================================");
        console.log("  NEXT STEPS:");
        console.log("  1. Add NEW Token as VRF consumer at vrf.chain.link");
        console.log("  2. Remove OLD Token from VRF consumers");
        console.log("  3. Update CONTRACTS.TOKEN in wagmi.js");
        console.log("=================================================");
    }
}
