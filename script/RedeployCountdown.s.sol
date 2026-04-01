// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/BlockHuntCountdown.sol";
import "../src/BlockHuntToken.sol";

/**
 * @title  Redeploy Countdown Only
 * @notice Deploys a new Countdown contract, wires it to the existing Token,
 *         restores the active countdown with remaining duration, and sets
 *         safePeriod to 0.
 *
 *  forge script script/RedeployCountdown.s.sol:RedeployCountdown \
 *    --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify \
 *    --etherscan-api-key $BASESCAN_API_KEY -vvvv
 */
contract RedeployCountdown is Script {

    // Existing Token contract on Base Sepolia
    address payable constant TOKEN = payable(0x541a85733d98F720A3b7C15f2fdc2f157599B9dc);

    // Current countdown holder to restore
    address constant HOLDER = 0x857fef8809f0241e4e71a2C42c2142343d7AFE3F;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        // 1. Deploy new Countdown
        BlockHuntCountdown countdown = new BlockHuntCountdown();
        console.log("New Countdown deployed:", address(countdown));

        // 2. Wire Countdown <-> Token
        countdown.setTokenContract(TOKEN);
        BlockHuntToken(TOKEN).setCountdownContract(address(countdown));
        console.log("Wired Countdown <-> Token");

        // 3. Set remaining duration (~3 hours at time of writing, adjust if needed)
        //    Using 3 hours = 10800 seconds as a baseline.
        //    The actual remaining time should be recalculated at deploy time.
        uint256 remainingDuration = 2 hours;
        countdown.setCountdownDuration(remainingDuration);
        console.log("Countdown duration set to:", remainingDuration);

        // 4. Set safePeriod to 0 (matching current live setting)
        countdown.setSafePeriod(0);
        console.log("Safe period set to 0");

        // 5. Restore the active countdown for the current holder
        countdown.adminStartCountdown(HOLDER);
        console.log("Countdown restored for holder:", HOLDER);

        vm.stopBroadcast();

        console.log("");
        console.log("=================================================");
        console.log("  Countdown Redeploy Complete!");
        console.log("=================================================");
        console.log("  NEW COUNTDOWN:", address(countdown));
        console.log("  Update frontend/src/config/wagmi.js COUNTDOWN address");
        console.log("=================================================");
    }
}
