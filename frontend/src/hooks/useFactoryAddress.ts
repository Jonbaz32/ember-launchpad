import { useChainId } from "wagmi";

export function useFactoryAddress() {
  const chainId = useChainId();
  
  // Robinhood Chain Mainnet ID is 4663
  if (chainId === 4663) {
    return (import.meta.env.VITE_MAINNET_FACTORY_ADDRESS || "0x0592d505e68b5A9b0465F86A8F5150c84f7cDD69") as `0x${string}`;
  }
  
  // Default to Testnet/Fallback
  return (import.meta.env.VITE_FACTORY_ADDRESS || "0x0592d505e68b5A9b0465F86A8F5150c84f7cDD69") as `0x${string}`;
}
