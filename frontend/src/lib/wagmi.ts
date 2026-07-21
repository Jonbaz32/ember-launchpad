import { createConfig, http, injected } from "wagmi";
import { mainnet, arbitrum, base, sepolia, arbitrumSepolia, baseSepolia } from "viem/chains";
import { robinhoodChain, robinhoodChainTestnet, debankChain } from "./chain";

const useTestnet = import.meta.env.VITE_USE_TESTNET === "true";

export const activeChain = useTestnet ? robinhoodChainTestnet : robinhoodChain;

export const configuredChains = [
  robinhoodChain,
  robinhoodChainTestnet,
  debankChain,
  mainnet,
  sepolia,
  arbitrum,
  arbitrumSepolia,
  base,
  baseSepolia
] as const;

export const wagmiConfig = createConfig({
  chains: configuredChains,
  connectors: [
    injected({ target: "metaMask" }),
    injected({ target: "rabby" }),
    injected(),
  ],
  transports: {
    [robinhoodChain.id]: http(import.meta.env.VITE_RH_MAINNET_RPC || "https://rpc.mainnet.chain.robinhood.com", { timeout: 4000, retryCount: 2 }),
    [robinhoodChainTestnet.id]: http(import.meta.env.VITE_RH_TESTNET_RPC || "https://rpc.testnet.chain.robinhood.com", { timeout: 4000, retryCount: 2 }),
    [debankChain.id]: http("https://rpc.debankchain.com", { timeout: 4000, retryCount: 2 }),
    [mainnet.id]: http(undefined, { timeout: 4000 }),
    [sepolia.id]: http(undefined, { timeout: 4000 }),
    [arbitrum.id]: http(undefined, { timeout: 4000 }),
    [arbitrumSepolia.id]: http(undefined, { timeout: 4000 }),
    [base.id]: http(undefined, { timeout: 4000 }),
    [baseSepolia.id]: http(undefined, { timeout: 4000 }),
  },
});
