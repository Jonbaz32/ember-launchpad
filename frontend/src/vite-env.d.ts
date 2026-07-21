/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RH_MAINNET_RPC?: string;
  readonly VITE_RH_TESTNET_RPC?: string;
  readonly VITE_USE_TESTNET?: string;
  readonly VITE_FACTORY_ADDRESS?: string;
  readonly VITE_INDEXER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
