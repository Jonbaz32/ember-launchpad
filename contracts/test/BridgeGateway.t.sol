// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BridgeGateway} from "../src/BridgeGateway.sol";

contract BridgeGatewayTest is Test {
    BridgeGateway bridge;
    uint256 relayerPrivateKey = 0xA11CE;
    address relayer;
    address receiver = address(0xDEAd);
    address depositor = address(0xCAfe);

    function setUp() public {
        relayer = vm.addr(relayerPrivateKey);
        bridge = new BridgeGateway(relayer);
        // Fund the bridge with some initial liquidity
        vm.deal(address(bridge), 10 ether);
        // Fund depositor
        vm.deal(depositor, 5 ether);
    }

    function test_Deposit_IncrementsNonceAndLocksEth() public {
        uint256 initialBalance = address(bridge).balance;
        uint256 depositAmount = 1 ether;

        vm.prank(depositor);
        bridge.deposit{value: depositAmount}(receiver, 999);

        assertEq(bridge.depositNonce(), 1);
        assertEq(address(bridge).balance, initialBalance + depositAmount);
    }

    function test_Release_SucceedsWithValidSignature() public {
        uint256 initialReceiverBalance = receiver.balance;
        uint256 amount = 1 ether;
        uint256 nonce = 0;
        uint256 sourceChainId = 999;

        // Construct message hash
        bytes32 messageHash = keccak256(
            abi.encodePacked(receiver, amount, nonce, sourceChainId, block.chainid)
        );

        // Construct Ethereum Signed Message Hash
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        // Sign the hash
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(relayerPrivateKey, ethSignedMessageHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        // Call release
        bridge.release(receiver, amount, nonce, sourceChainId, signature);

        // Verify receiver got their ETH and double spend is prevented
        assertEq(receiver.balance, initialReceiverBalance + amount);
        assertTrue(bridge.processedDeposits(sourceChainId, nonce));
    }

    function test_Release_RevertsOnDoubleSpend() public {
        uint256 amount = 1 ether;
        uint256 nonce = 0;
        uint256 sourceChainId = 999;

        bytes32 messageHash = keccak256(
            abi.encodePacked(receiver, amount, nonce, sourceChainId, block.chainid)
        );
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(relayerPrivateKey, ethSignedMessageHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        bridge.release(receiver, amount, nonce, sourceChainId, signature);

        // Second time should revert
        vm.expectRevert("Deposit already processed");
        bridge.release(receiver, amount, nonce, sourceChainId, signature);
    }

    function test_Release_RevertsOnInvalidSignature() public {
        uint256 amount = 1 ether;
        uint256 nonce = 0;
        uint256 sourceChainId = 999;

        bytes32 messageHash = keccak256(
            abi.encodePacked(receiver, amount, nonce, sourceChainId, block.chainid)
        );
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        // Sign with a different key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, ethSignedMessageHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.expectRevert("Invalid relayer signature");
        bridge.release(receiver, amount, nonce, sourceChainId, signature);
    }

    function test_Release_RevertsOnChainIdMismatch() public {
        uint256 amount = 1 ether;
        uint256 nonce = 0;
        uint256 sourceChainId = 999;
        uint256 wrongDestChainId = block.chainid + 1;

        // Construct hash for wrong destination chain ID
        bytes32 messageHash = keccak256(
            abi.encodePacked(receiver, amount, nonce, sourceChainId, wrongDestChainId)
        );
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(relayerPrivateKey, ethSignedMessageHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        // Attempting to release on the current chain ID should fail validation
        vm.expectRevert("Invalid relayer signature");
        bridge.release(receiver, amount, nonce, sourceChainId, signature);
    }
}
