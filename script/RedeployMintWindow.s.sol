// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/BlockHuntMintWindow.sol";
import "../src/BlockHuntToken.sol";

contract RedeployMintWindow is Script {
    // Your existing token address — stays the same
    address payable constant TOKEN = payable(0x57Efa000E28313ed47213C6faF13719500038D75);

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        // Deploy new MintWindow (now 24hr window)
        BlockHuntMintWindow mintWindow = new BlockHuntMintWindow();
        console.log("New MintWindow deployed:", address(mintWindow));

        // Wire: MintWindow needs to know about Token
        mintWindow.setTokenContract(TOKEN);

        // Wire: Token needs to point to new MintWindow
        BlockHuntToken token = BlockHuntToken(TOKEN);
        token.setMintWindowContract(address(mintWindow));

        // Open the first window
        mintWindow.openWindow();
        console.log("Window opened.");

        vm.stopBroadcast();

        console.log("=================================================");
        console.log("UPDATE wagmi.js MINTWINDOW address to:", address(mintWindow));
        console.log("=================================================");
    }
}