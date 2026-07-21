# Ember — fair-launch bonding-curve tokens on Robinhood Chain

A pump.fun-style launchpad for **Robinhood Chain** (chain id `4663` mainnet / `46630`
testnet — Robinhood's permissionless, Arbitrum-based, EVM-compatible L2, live since
July 1, 2026). Anyone can:

- **Create a token** with a fixed 1B supply, entirely seeded onto a constant-product
  bonding curve — no presale, no team allocation.
- **Buy / sell** along the curve with a small trade fee, split between the protocol
  and a per-token "creator fee pool."
- **Graduate**: once a curve's real ETH reserve crosses a target (default 42 ETH),
  trading locks and the remaining liquidity can be migrated to a DEX pool with the LP
  tokens burned, permanently locking liquidity.
- **Burn to claim fees**: the creator — and only the creator — can burn a slice of
  their own token balance to claim that same percentage of the accrued fee pool.
  Burn 10% of live supply, claim 10% of the pool. It's the only way the creator pool
  ever pays out.

## Layout

```
contracts/   Foundry project — TokenFactory.sol, LaunchToken.sol, tests, deploy script
frontend/    Vite + React + TypeScript + Tailwind v4 + wagmi/viem app
indexer/     Node/Express service that watches on-chain events into SQLite + a REST API
shared/abi/  ABIs exported from the compiled contracts, copied into frontend/ and indexer/
```

## 1. Contracts

```
cd contracts
forge install          # pulls forge-std + OpenZeppelin (already vendored in lib/ here)
forge test              # 13 tests, all passing — buy/sell curve math, fee split,
                         # burn-for-fees proportionality, graduation lock, factory wiring
```

Deploy to Robinhood Chain Testnet:

```
cp .env.example .env    # set PRIVATE_KEY (and optionally PROTOCOL_FEE_RECIPIENT)
forge script script/Deploy.s.sol:Deploy \
  --rpc-url robinhood_testnet \
  --private-key $PRIVATE_KEY \
  --broadcast
```

Testnet ETH: https://faucet.testnet.chain.robinhood.com/. Swap `robinhood_testnet` for
`robinhood_mainnet` in `foundry.toml`'s `[rpc_endpoints]` when you're ready for
mainnet — but read the **Security notes** below first.

The public RPCs (`rpc.mainnet.chain.robinhood.com` / `rpc.testnet.chain.robinhood.com`)
are rate-limited. For anything beyond local testing, get a free endpoint from Alchemy
(recommended by Robinhood's docs) or QuickNode/Blockdaemon/dRPC/Validation Cloud.

**DEX router**: `LaunchToken.migrateLiquidity()` targets a Uniswap-V2-shaped router
(`IUniswapV2Router02.addLiquidityETH`) — public reporting says Robinhood Chain's AMM
layer integrates Uniswap-compatible pools, but the exact deployed router address isn't
in Robinhood's public docs yet. Call `TokenFactory.setDexRouter(address)` once you have
it; migration will revert with `"router not configured"` until then.

## 2. Frontend

```
cd frontend
npm install
cp .env.example .env    # set VITE_FACTORY_ADDRESS to your deployed factory
npm run dev
```

Pages: a token feed (`/`), a creation form (`/create`), and a token page (`/token/:address`)
with buy/sell, a live bonding-curve progress bar, and — only visible to the connected
creator wallet — the burn-to-claim panel with a radial "burn gauge" that previews the ETH
payout as you drag the burn-amount slider.

The feed reads directly from `TokenFactory.getTokenPage()` for simplicity. For a large
catalog, point `useTokenList`/`useTokenState` at the indexer's REST API instead — it's
already running and CORS-enabled.

## 3. Indexer

```
cd indexer
npm install
cp .env.example .env    # set FACTORY_ADDRESS + FACTORY_START_BLOCK after deploying
npm start
```

Polls `TokenCreated` (factory), `Buy`/`Sell`/`CreatorBurn` (per token) into SQLite and
serves them at:

- `GET /tokens?limit=&offset=`
- `GET /tokens/:address`
- `GET /tokens/:address/trades?limit=`
- `GET /tokens/:address/burns`
- `GET /creators/:address/tokens`

## Security notes (read before touching mainnet)

This is a reference implementation built for this conversation — **it has not been
audited**. Before any real money touches it:

- Get a professional audit, especially of the bonding-curve invariant math, the
  burn-for-fees rounding, and the migration path.
- Think through MEV/sandwich exposure on `buy`/`sell` — slippage params
  (`minTokensOut`/`minEthOut`) exist but the frontend currently passes `0`; wire up
  real slippage tolerance in the UI before mainnet.
- Consider a maximum-buy-per-transaction or a launch cooldown to blunt sniping bots.
- The `receive()` fallback treats bare ETH transfers as zero-slippage buys — fine for a
  demo, worth reconsidering for production.
- Rounding in `burnForFees` and the curve math favors the contract (floors), which is
  the safe direction, but get it independently checked.

## On "fun.noxa.f"

I couldn't find a live site at that exact address — if you meant a specific existing
platform as a reference, point me at it and I can match its mechanics more closely.
What's built here follows the standard fair-launch bonding-curve pattern (pump.fun-style)
that most platforms like it use, adapted for Robinhood Chain and your burn-to-claim-fees
requirement.
