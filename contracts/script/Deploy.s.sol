// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TokenFactory} from "../src/TokenFactory.sol";
import {EmberDiceVault} from "../src/EmberDiceVault.sol";

/// @notice Deploys TokenFactory & EmberDiceVault to Robinhood Chain (mainnet chain id 4663, testnet 46630).
contract Deploy is Script {
    function run() external returns (TokenFactory factory, EmberDiceVault diceVault) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address feeRecipient = vm.envOr("PROTOCOL_FEE_RECIPIENT", deployer);

        vm.startBroadcast(deployerKey);
        factory = new TokenFactory(feeRecipient);
        diceVault = new EmberDiceVault(4 ether, feeRecipient); // $10,000 threshold (~4 ETH)
        vm.stopBroadcast();

        console.log("TokenFactory deployed at:", address(factory));
        console.log("EmberDiceVault deployed at:", address(diceVault));
        console.log("Protocol fee recipient:", feeRecipient);
    }
}
