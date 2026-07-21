// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITokenFactory {
    function dexRouter() external view returns (address);
    function protocolFeeRecipient() external view returns (address);
}
