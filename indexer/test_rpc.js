import { createPublicClient, http } from "viem";
import { arbitrum, base, mainnet, polygon } from "viem/chains";

const KEY = "T-e5JYA-JSSWwcoKGQMMe";

const chains = [
  { name: "Arbitrum", chain: arbitrum, url: `https://arb-mainnet.g.alchemy.com/v2/${KEY}` },
  { name: "Base", chain: base, url: `https://base-mainnet.g.alchemy.com/v2/${KEY}` },
  { name: "Ethereum Mainnet", chain: mainnet, url: `https://eth-mainnet.g.alchemy.com/v2/${KEY}` },
  { name: "Polygon", chain: polygon, url: `https://polygon-mainnet.g.alchemy.com/v2/${KEY}` },
];

async function check() {
  for (const c of chains) {
    try {
      const client = createPublicClient({ chain: c.chain, transport: http(c.url) });
      const block = await client.getBlockNumber();
      console.log(`✅ SUCCESS on ${c.name}! Current Block: ${block}`);
    } catch (e) {
      console.log(`❌ Failed on ${c.name}: ${e.shortMessage || e.message}`);
    }
  }
}

check();
