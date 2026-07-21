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
  connectors: [injected()],
  transports: {
    [robinhoodChain.id]: http(),
    [robinhoodChainTestnet.id]: http(),
    [debankChain.id]: http(),
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [arbitrum.id]: http(),
    [arbitrumSepolia.id]: http(),
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
});
