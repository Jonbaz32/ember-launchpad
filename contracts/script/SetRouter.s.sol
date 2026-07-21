// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TokenFactory} from "../src/TokenFactory.sol";

/// @notice Helper script to set the DEX Router address on the deployed TokenFactory.
///
/// Usage (testnet):
///   1. Ensure PRIVATE_KEY, FACTORY_ADDRESS, and DEX_ROUTER_ADDRESS are set incontracts/.env
///   2. Execute:
///      forge script script/SetRouter.s.sol:SetRouter \
///        --rpc-url robinhood_testnet \
///        --broadcast
contract SetRouter is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address factoryAddr = vm.envAddress("FACTORY_ADDRESS");
        address routerAddr = vm.envAddress("DEX_ROUTER_ADDRESS");

        require(factoryAddr != address(0), "FACTORY_ADDRESS not set");
        require(routerAddr != address(0), "DEX_ROUTER_ADDRESS not set");

        vm.startBroadcast(deployerKey);
        TokenFactory(factoryAddr).setDexRouter(routerAddr);
        vm.stopBroadcast();

        console.log("Successfully set DEX Router on Factory:", factoryAddr);
        console.log("Uniswap V2 Router Address:", routerAddr);
    }
}
