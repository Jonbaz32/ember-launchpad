import { createPublicClient, http, parseAbi } from 'viem';

const robinhoodChainTestnet = {
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Robinhood ETH',
    symbol: 'ETH',
  },
  rpcUrls: {
    public: { http: ['https://rpc.testnet.chain.robinhood.com'] },
    default: { http: ['https://rpc.testnet.chain.robinhood.com'] },
  },
};

const client = createPublicClient({
  chain: robinhoodChainTestnet,
  transport: http()
});

const abi = parseAbi([
  'function realEthReserve() view returns (uint256)',
  'function tokensSold() view returns (uint256)',
  'function virtualEthReserve() view returns (uint256)',
  'function virtualTokenReserve() view returns (uint256)',
  'function flatTradeFee() view returns (uint256)',
  'function quoteSell(uint256 tokensIn) view returns (uint256 ethOut, uint256 fee)'
]);

async function check() {
  const fs = await import('fs');
  const sqlite = await import('better-sqlite3');
  const db = new sqlite.default('ember.sqlite');
  const rows = db.prepare('SELECT address FROM tokens').all();
  
  if (rows.length === 0) {
    console.error('No token found in database.');
    return;
  }
  const token = rows[rows.length - 1].address;
  console.log('Querying token:', token);
  
  try {
    const [realEth, sold, virtEth, virtTok, flatFee] = await Promise.all([
      client.readContract({ address: token, abi, functionName: 'realEthReserve' }),
      client.readContract({ address: token, abi, functionName: 'tokensSold' }),
      client.readContract({ address: token, abi, functionName: 'virtualEthReserve' }),
      client.readContract({ address: token, abi, functionName: 'virtualTokenReserve' }),
      client.readContract({ address: token, abi, functionName: 'flatTradeFee' })
    ]);
    
    console.log('--- TESSCAT State ---');
    console.log('Real ETH Reserve:', Number(realEth) / 1e18, 'ETH');
    console.log('Tokens Sold:', Number(sold) / 1e18, 'TOKENS');
    console.log('Virtual ETH Reserve:', Number(virtEth) / 1e18, 'ETH');
    console.log('Virtual Token Reserve:', Number(virtTok) / 1e18, 'TOKENS');
    console.log('Flat Trade Fee:', Number(flatFee) / 1e18, 'ETH');
    
    const amountIn = 1384081662810000000000000n;
    const [ethOut, fee] = await client.readContract({
      address: token,
      abi,
      functionName: 'quoteSell',
      args: [amountIn]
    });
    console.log('--- Quote Sell (1.38M TESSCAT) ---');
    console.log('Gross/Net ETH Out:', Number(ethOut) / 1e18, 'ETH');
    console.log('Trading Fee:', Number(fee) / 1e18, 'ETH');
  } catch (err) {
    console.error('Error querying token:', err);
  }
}

check();
