import { publicClient } from "./src/chain.js";
import { formatEther } from "viem";

const RECIPIENT = "0x873299bCa22698E5ae62B58D0D078c92850Bf98a";

async function main() {
  try {
    const balance = await publicClient.getBalance({
      address: RECIPIENT,
    });
    console.log(`On-chain balance of ${RECIPIENT}:`);
    console.log(`  - In Wei: ${balance.toString()}`);
    console.log(`  - In ETH: ${formatEther(balance)}`);
  } catch (err) {
    console.error("Failed to query native balance:", err);
  }
}

main();
