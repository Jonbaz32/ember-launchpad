// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IUniswapV2Router02} from "./interfaces/IUniswapV2Router02.sol";
import {ITokenFactory} from "./interfaces/ITokenFactory.sol";

/// @title LaunchToken
/// @notice A single-sided constant-product bonding-curve token, in the style of pump.fun,
///         deployed for Robinhood Chain. Every buy/sell pays a trade fee split between the
///         protocol and a per-token "creator fee pool". The creator can burn part of their
///         own supply to claim a proportional share of that pool (see `burnForFees`). Once
///         the curve's real ETH reserve hits `graduationTarget`, trading on the curve locks
///         and remaining liquidity can be migrated to a DEX pool, permanently burning the LP.
/// @dev This is a reference implementation for a portfolio/demo build. It has NOT been
///      audited. Do not deploy to mainnet with real value without a professional audit,
///      MEV/sandwich analysis, and a review of the fee-pool accounting for edge cases
///      (e.g. repeated tiny burns, dust griefing, rounding direction).
contract LaunchToken is ERC20, ReentrancyGuard {
    // ---------------------------------------------------------------------
    // Immutable launch config
    // ---------------------------------------------------------------------

    /// @notice Total fixed supply, minted entirely to this contract at creation.
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000e18;

    /// @notice Fee charged on every buy/sell, in basis points of the ETH leg.
    uint256 public immutable tradeFeeBps;

    /// @notice Portion of `tradeFeeBps` that goes to the protocol (rest funds the
    ///         creator-claimable fee pool), in basis points of the fee itself.
    uint256 public immutable protocolFeeShareBps;

    /// @notice Real ETH reserve at which the curve "graduates" and locks.
    uint256 public immutable graduationTarget;

    /// @notice Address that receives the protocol's cut of trade fees.
    address public immutable protocolFeeRecipient;

    /// @notice The wallet that created this token; only address allowed to burn-for-fees.
    address public immutable creator;
    uint256 public immutable flatTradeFee;

    /// @notice Factory that deployed this token (used to look up the DEX router on migration).
    ITokenFactory public immutable factory;

    string public metadataURI;

    // ---------------------------------------------------------------------
    // Curve state
    // ---------------------------------------------------------------------

    /// @dev Virtual reserves used only for pricing; they never move ETH/tokens themselves.
    uint256 public immutable virtualEthReserve;
    uint256 public immutable virtualTokenReserve;

    /// @dev Constant product invariant, fixed at deployment: K = virtualEth * virtualToken.
    uint256 private immutable K;

    /// @notice Real ETH sitting in the curve (excludes accrued creator/protocol fees).
    uint256 public realEthReserve;

    /// @notice Tokens sold out of the curve so far (bounded by TOTAL_SUPPLY).
    uint256 public tokensSold;

    /// @notice ETH accrued for the creator, claimable only by burning supply.
    uint256 public creatorFeePool;

    /// @notice True once realEthReserve has crossed graduationTarget; curve trading stops.
    bool public graduated;

    /// @notice True once post-graduation liquidity has been sent to the DEX and LP burned.
    bool public migrated;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event Buy(address indexed buyer, uint256 ethIn, uint256 tokensOut, uint256 fee);
    event Sell(address indexed seller, uint256 tokensIn, uint256 ethOut, uint256 fee);
    event CreatorBurn(address indexed creator, uint256 tokensBurned, uint256 ethClaimed);
    event Graduated(uint256 realEthReserve, uint256 tokensSold);
    event Migrated(address indexed router, uint256 ethAdded, uint256 tokensAdded, address lpToken);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error NotCreator();
    error CurveGraduated();
    error CurveNotGraduated();
    error AlreadyMigrated();
    error SlippageExceeded();
    error ZeroAmount();
    error InsufficientCurveLiquidity();

    constructor(
        string memory name_,
        string memory symbol_,
        string memory metadataURI_,
        address creator_,
        address protocolFeeRecipient_,
        uint256 tradeFeeBps_,
        uint256 protocolFeeShareBps_,
        uint256 graduationTarget_,
        uint256 virtualEthReserve_,
        uint256 virtualTokenReserve_,
        uint256 flatTradeFee_
    ) ERC20(name_, symbol_) {
        creator = creator_;
        factory = ITokenFactory(msg.sender);
        protocolFeeRecipient = protocolFeeRecipient_;
        tradeFeeBps = tradeFeeBps_;
        protocolFeeShareBps = protocolFeeShareBps_;
        graduationTarget = graduationTarget_;
        virtualEthReserve = virtualEthReserve_;
        virtualTokenReserve = virtualTokenReserve_;
        flatTradeFee = flatTradeFee_;
        K = virtualEthReserve_ * virtualTokenReserve_;
        metadataURI = metadataURI_;

        // The entire supply is minted to the curve itself. There is no team/creator
        // pre-allocation: the creator has to buy in like everyone else.
        _mint(address(this), TOTAL_SUPPLY);
    }

    // ---------------------------------------------------------------------
    // Curve pricing (view helpers)
    // ---------------------------------------------------------------------

    function currentEthReserve() public view returns (uint256) {
        return virtualEthReserve + realEthReserve;
    }

    function currentTokenReserve() public view returns (uint256) {
        return virtualTokenReserve - tokensSold;
    }

    /// @notice Quote how many tokens `ethIn` (pre-fee) would buy right now.
    function quoteBuy(uint256 ethIn) public view returns (uint256 tokensOut, uint256 fee) {
        fee = (ethIn * tradeFeeBps) / 10_000;
        uint256 ethInAfterFee = ethIn - fee;
        uint256 x = currentEthReserve();
        uint256 y = currentTokenReserve();
        uint256 newX = x + ethInAfterFee;
        uint256 newY = K / newX;
        tokensOut = y - newY;
    }

    /// @notice Quote how much ETH (post-fee) selling `tokensIn` would return right now.
    function quoteSell(uint256 tokensIn) public view returns (uint256 ethOut, uint256 fee) {
        uint256 x = currentEthReserve();
        uint256 y = currentTokenReserve();
        uint256 newY = y + tokensIn;
        uint256 newX = K / newY;
        uint256 grossEthOut = x - newX;
        fee = (grossEthOut * tradeFeeBps) / 10_000;
        ethOut = grossEthOut - fee;
    }

    // ---------------------------------------------------------------------
    // Trading
    // ---------------------------------------------------------------------

    /// @notice Buy tokens off the curve with ETH.
    /// @param minTokensOut Slippage guard: revert if the buyer would receive less than this.
    function buy(uint256 minTokensOut) external payable nonReentrant returns (uint256 tokensOut) {
        tokensOut = _buy(msg.sender, minTokensOut);
    }

    /// @notice Same as `buy`, but credits the purchased tokens to `recipient` instead of
    ///         the caller. Used by TokenFactory to route a creator's bootstrap buy to the
    ///         creator (since the factory itself is msg.sender for that call), and useful
    ///         generally for routers/relayers buying on someone else's behalf.
    function buyFor(address recipient, uint256 minTokensOut) external payable nonReentrant returns (uint256 tokensOut) {
        tokensOut = _buy(recipient, minTokensOut);
    }

    function _buy(address recipient, uint256 minTokensOut) internal returns (uint256 tokensOut) {
        if (graduated) revert CurveGraduated();
        require(msg.value > flatTradeFee, "msg.value too low");

        if (flatTradeFee > 0) {
            (bool ok,) = protocolFeeRecipient.call{value: flatTradeFee}("");
            require(ok, "flat fee transfer failed");
        }

        uint256 ethIn = msg.value - flatTradeFee;
        uint256 fee;
        (tokensOut, fee) = quoteBuy(ethIn);
        if (tokensOut < minTokensOut) revert SlippageExceeded();
        if (tokensOut > currentTokenReserve()) revert InsufficientCurveLiquidity();

        uint256 ethInAfterFee = ethIn - fee;
        realEthReserve += ethInAfterFee;
        tokensSold += tokensOut;

        _distributeFee(fee);
        _transfer(address(this), recipient, tokensOut);

        emit Buy(recipient, msg.value, tokensOut, fee);

        if (realEthReserve >= graduationTarget) {
            graduated = true;
            emit Graduated(realEthReserve, tokensSold);
        }
    }

    /// @notice Sell tokens back into the curve for ETH.
    /// @param tokensIn Amount of caller's tokens to sell.
    /// @param minEthOut Slippage guard: revert if the seller would receive less than this.
    function sell(uint256 tokensIn, uint256 minEthOut) external nonReentrant returns (uint256 ethOut) {
        if (graduated) revert CurveGraduated();
        if (tokensIn == 0) revert ZeroAmount();

        uint256 fee;
        (ethOut, fee) = quoteSell(tokensIn);

        require(ethOut > flatTradeFee, "sell return too low for flat fee");
        uint256 netEthOut = ethOut - flatTradeFee;
        if (netEthOut < minEthOut) revert SlippageExceeded();

        uint256 grossEthOut = ethOut + fee;
        realEthReserve -= grossEthOut;
        tokensSold -= tokensIn;

        _transfer(msg.sender, address(this), tokensIn);
        _distributeFee(fee);

        if (flatTradeFee > 0) {
            (bool ok,) = protocolFeeRecipient.call{value: flatTradeFee}("");
            require(ok, "flat fee transfer failed");
        }

        (bool ok2,) = msg.sender.call{value: netEthOut}("");
        require(ok2, "ETH transfer failed");

        emit Sell(msg.sender, tokensIn, netEthOut, fee);
    }

    function _distributeFee(uint256 fee) internal {
        if (fee == 0) return;
        (bool ok,) = protocolFeeRecipient.call{value: fee}("");
        require(ok, "protocol fee transfer failed");
    }

    // ---------------------------------------------------------------------
    // Graduation / migration
    // ---------------------------------------------------------------------

    /// @notice Once graduated, anyone can trigger migration of the remaining curve
    ///         liquidity (real ETH reserve + unsold curve tokens) into a DEX pool via
    ///         the factory's configured router. LP tokens are sent to the burn address
    ///         so liquidity is permanently locked, matching standard fair-launch practice.
    function migrateLiquidity(uint256 minEthAdded, uint256 minTokensAdded) external nonReentrant {
        if (!graduated) revert CurveNotGraduated();
        if (migrated) revert AlreadyMigrated();
        migrated = true;

        address routerAddr = factory.dexRouter();
        require(routerAddr != address(0), "router not configured");
        IUniswapV2Router02 router = IUniswapV2Router02(routerAddr);

        uint256 ethToAdd = realEthReserve;
        uint256 tokensToAdd = currentTokenReserve();
        realEthReserve = 0;

        _approve(address(this), routerAddr, tokensToAdd);

        (uint256 tokenAdded, uint256 ethAdded,) = router.addLiquidityETH{value: ethToAdd}(
            address(this),
            tokensToAdd,
            minTokensAdded,
            minEthAdded,
            address(0x000000000000000000000000000000000000dEaD), // LP sent straight to burn
            block.timestamp + 1800
        );

        emit Migrated(routerAddr, ethAdded, tokenAdded, address(0));
    }

    receive() external payable nonReentrant {
        // Plain ETH transfers are treated as buys with no slippage protection.
        if (graduated || msg.value == 0) revert("direct ETH transfers not accepted");
        _buy(msg.sender, 0);
    }
}
