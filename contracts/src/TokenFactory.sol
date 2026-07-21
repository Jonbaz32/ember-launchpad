// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {LaunchToken} from "./LaunchToken.sol";
import {ITokenFactory} from "./interfaces/ITokenFactory.sol";

/// @title TokenFactory
/// @notice Deploys new LaunchToken bonding-curve tokens on Robinhood Chain and holds the
///         protocol-wide config (fee split, graduation target, DEX router) that every
///         token it deploys reads at construction / migration time.
contract TokenFactory is ITokenFactory, Ownable {
    uint256 public constant MAX_TRADE_FEE_BPS = 500; // 5% hard ceiling
    uint256 public constant BPS_DENOM = 10_000;

    /// @notice Total fee taken on every buy/sell, in bps of the ETH leg. Default 1%.
    uint256 public tradeFeeBps = 100;

    /// @notice Share of the trade fee that goes to the protocol vs. the creator fee pool.
    ///         Default 50% protocol / 50% creator pool.
    uint256 public protocolFeeShareBps = 5_000;

    /// @notice ETH balance in a curve at which it graduates and locks. Default 42 ETH,
    ///         echoing the pump.fun-style "graduate to a real DEX pool" threshold.
    uint256 public graduationTarget = 42 ether;

    /// @notice Virtual reserves seeding every curve's starting price.
    uint256 public virtualEthReserve = 3 ether;
    uint256 public virtualTokenReserve = 1_000_000_000e18;

    address public protocolFeeRecipient;
    address public dexRouter;
    uint256 public tokenCreationFee = 0.0002 ether;
    uint256 public flatTradeFee = 0.0002 ether;

    struct TokenInfo {
        address token;
        address creator;
        string name;
        string symbol;
        string metadataURI;
        uint256 createdAt;
    }

    TokenInfo[] public allTokens;
    mapping(address => bool) public isLaunchToken;
    mapping(address => uint256[]) private tokensByCreator; // creator => indices into allTokens

    event TokenCreated(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        string metadataURI,
        uint256 index
    );
    event ProtocolConfigUpdated();

    constructor(address protocolFeeRecipient_) Ownable(msg.sender) {
        require(protocolFeeRecipient_ != address(0), "zero fee recipient");
        protocolFeeRecipient = protocolFeeRecipient_;
    }

    /// @notice Deploy a new bonding-curve token. Any ETH sent is immediately used to
    ///         execute the creator's first buy, so the creator can seed initial price
    ///         movement the same way any other buyer would (no free allocation).
    function createToken(
        string calldata name_,
        string calldata symbol_,
        string calldata metadataURI_,
        uint256 minTokensOut
    ) external payable returns (address tokenAddr) {
        require(msg.value >= tokenCreationFee, "insufficient creation fee");

        if (tokenCreationFee > 0) {
            (bool ok,) = protocolFeeRecipient.call{value: tokenCreationFee}("");
            require(ok, "protocol fee payment failed");
        }

        LaunchToken token = new LaunchToken(
            name_,
            symbol_,
            metadataURI_,
            msg.sender,
            protocolFeeRecipient,
            tradeFeeBps,
            protocolFeeShareBps,
            graduationTarget,
            virtualEthReserve,
            virtualTokenReserve,
            flatTradeFee
        );
        tokenAddr = address(token);
        isLaunchToken[tokenAddr] = true;

        uint256 index = allTokens.length;
        allTokens.push(
            TokenInfo({
                token: tokenAddr,
                creator: msg.sender,
                name: name_,
                symbol: symbol_,
                metadataURI: metadataURI_,
                createdAt: block.timestamp
            })
        );
        tokensByCreator[msg.sender].push(index);

        emit TokenCreated(tokenAddr, msg.sender, name_, symbol_, metadataURI_, index);

        uint256 buyValue = msg.value - tokenCreationFee;
        if (buyValue > 0) {
            token.buyFor{value: buyValue}(msg.sender, minTokensOut);
        }
    }

    function allTokensLength() external view returns (uint256) {
        return allTokens.length;
    }

    function getTokensByCreator(address creator) external view returns (uint256[] memory) {
        return tokensByCreator[creator];
    }

    function getTokenPage(uint256 offset, uint256 limit) external view returns (TokenInfo[] memory page) {
        uint256 total = allTokens.length;
        if (offset >= total) return new TokenInfo[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new TokenInfo[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = allTokens[i];
        }
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setTradeFeeBps(uint256 bps) external onlyOwner {
        require(bps <= MAX_TRADE_FEE_BPS, "fee too high");
        tradeFeeBps = bps;
        emit ProtocolConfigUpdated();
    }

    function setProtocolFeeShareBps(uint256 bps) external onlyOwner {
        require(bps <= BPS_DENOM, "invalid share");
        protocolFeeShareBps = bps;
        emit ProtocolConfigUpdated();
    }

    function setGraduationTarget(uint256 target) external onlyOwner {
        require(target > 0, "invalid target");
        graduationTarget = target;
        emit ProtocolConfigUpdated();
    }

    function setVirtualReserves(uint256 ethReserve, uint256 tokenReserve) external onlyOwner {
        require(ethReserve > 0 && tokenReserve > 0, "invalid reserves");
        virtualEthReserve = ethReserve;
        virtualTokenReserve = tokenReserve;
        emit ProtocolConfigUpdated();
    }

    function setProtocolFeeRecipient(address recipient) external onlyOwner {
        require(recipient != address(0), "zero address");
        protocolFeeRecipient = recipient;
        emit ProtocolConfigUpdated();
    }

    function setDexRouter(address router) external onlyOwner {
        dexRouter = router;
        emit ProtocolConfigUpdated();
    }

    function setTokenCreationFee(uint256 fee) external onlyOwner {
        tokenCreationFee = fee;
        emit ProtocolConfigUpdated();
    }

    function setFlatTradeFee(uint256 fee) external onlyOwner {
        flatTradeFee = fee;
        emit ProtocolConfigUpdated();
    }
}
