// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Trimmed down to just what LaunchToken needs for migration. Robinhood Chain's
///      AMM ecosystem (per public reporting) integrates Uniswap-compatible pools, so this
///      targets a standard UniswapV2Router02-shaped router. Swap in the real deployed
///      router address via TokenFactory.setDexRouter once known.
interface IUniswapV2Router02 {
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);
}
