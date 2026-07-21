# Tasks

- `[x]` Register `/portfolio` route in `App.tsx`
- `[x]` Replace Portfolio placeholder with routing `NavLink` in `Layout.tsx`
- `[x]` Create standalone `Portfolio.tsx` (wallet lookup, native ETH balance, batch factory contract queries for tokens, real-time reserves price calculations, total USD valuation, and trade shortcuts list)
- `[x]` Implement DEX router unconfigured safeguards in `Swap.tsx` and `TokenDetail.tsx`
- `[x]` Optimize token loading with Stale-While-Revalidate REST indexer API fallback in `useTokenState.ts`
- `[x]` Speed up holder scanning in `TokenDetail.tsx` by setting the getLogs starting block to `90276810n`
- `[x]` Support dynamic mainnet/testnet factory address switching and connect to both networks concurrently in `wagmi.ts` and React components
- `[x]` Add dynamic fallback error views in `TokenDetail.tsx` for tokens not found on the active network
- `[x]` Integrate platform token creation fee of `0.001 ETH` on `TokenFactory.sol` and dynamic form routing/fee notices in `Create.tsx`
- `[x]` Dynamic price routing in `Swap.tsx` (reads bonding curve for active curve tokens, Uniswap V2 Router for graduated tokens)
- `[x]` Remove "Copy trading" tab from the navigation header in `Swap.tsx`
- `[x]` Verify build compilation (`npm run build`)
