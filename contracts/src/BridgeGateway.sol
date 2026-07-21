// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title BridgeGateway
/// @notice Locked deposit and release gateway for native ETH cross-chain bridging.
contract BridgeGateway is Ownable {
    /// @notice Address of the off-chain relayer authorized to sign release transactions.
    address public relayerAddress;

    /// @notice Global deposit counter.
    uint256 public depositNonce;

    /// @notice Tracks processed nonces per source chain to prevent double-spending/replay attacks.
    ///         Mapping: sourceChainId => nonce => processed
    mapping(uint256 => mapping(uint256 => bool)) public processedDeposits;

    event BridgeDeposited(
        address indexed depositor,
        address indexed receiver,
        uint256 amount,
        uint256 indexed nonce,
        uint256 sourceChainId,
        uint256 destChainId
    );

    event BridgeReleased(
        address indexed receiver,
        uint256 amount,
        uint256 indexed nonce,
        uint256 sourceChainId,
        uint256 destChainId
    );

    event RelayerAddressUpdated(address indexed oldRelayer, address indexed newRelayer);

    constructor(address _relayerAddress) Ownable(msg.sender) {
        require(_relayerAddress != address(0), "Invalid relayer address");
        relayerAddress = _relayerAddress;
    }

    /// @notice Deposit native ETH to bridge to a destination chain.
    /// @param receiver Address to receive the ETH on the destination chain.
    /// @param destChainId Chain ID of the destination network.
    function deposit(address receiver, uint256 destChainId) external payable {
        require(msg.value > 0, "Deposit amount must be > 0");
        require(receiver != address(0), "Invalid receiver address");
        require(destChainId != block.chainid, "Cannot bridge to the same chain");

        uint256 currentNonce = depositNonce;
        depositNonce += 1;

        emit BridgeDeposited(
            msg.sender,
            receiver,
            msg.value,
            currentNonce,
            block.chainid,
            destChainId
        );
    }

    /// @notice Release bridged ETH to a receiver address based on a relayer signature.
    /// @param receiver Address to receive the released ETH.
    /// @param amount Amount of ETH to release.
    /// @param nonce The deposit nonce from the source chain.
    /// @param sourceChainId Chain ID of the source network where the deposit happened.
    /// @param signature Cryptographic signature proving the relayer authorized this release.
    function release(
        address receiver,
        uint256 amount,
        uint256 nonce,
        uint256 sourceChainId,
        bytes calldata signature
    ) external {
        require(receiver != address(0), "Invalid receiver");
        require(amount > 0, "Release amount must be > 0");
        require(sourceChainId != block.chainid, "Source chain cannot be current chain");
        require(!processedDeposits[sourceChainId][nonce], "Deposit already processed");
        require(address(this).balance >= amount, "Insufficient bridge liquidity");

        processedDeposits[sourceChainId][nonce] = true;

        // Construct the expected message hash
        bytes32 messageHash = keccak256(
            abi.encodePacked(receiver, amount, nonce, sourceChainId, block.chainid)
        );

        // Recover signer from Ethereum Signed Message hash
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        address recovered = recoverSigner(ethSignedMessageHash, signature);
        require(recovered == relayerAddress, "Invalid relayer signature");

        (bool success, ) = payable(receiver).call{value: amount}("");
        require(success, "ETH transfer failed");

        emit BridgeReleased(receiver, amount, nonce, sourceChainId, block.chainid);
    }

    /// @notice Recover address from signature
    function recoverSigner(bytes32 _ethSignedMessageHash, bytes memory _signature)
        internal
        pure
        returns (address)
    {
        if (_signature.length != 65) {
            return address(0);
        }

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(_signature, 32))
            s := mload(add(_signature, 64))
            v := byte(0, mload(add(_signature, 96)))
        }

        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    /// @notice Update the relayer address.
    function setRelayerAddress(address _newRelayer) external onlyOwner {
        require(_newRelayer != address(0), "Invalid relayer address");
        emit RelayerAddressUpdated(relayerAddress, _newRelayer);
        relayerAddress = _newRelayer;
    }

    /// @notice Withdraw native ETH from the bridge (for liquidity balancing or emergencies).
    function withdraw(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient balance");
        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Withdraw failed");
    }

    /// @notice Accept direct deposits to fund the bridge liquidity.
    receive() external payable {}
}
