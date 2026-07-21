import { createPublicClient, createWalletClient, http, defineChain, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
const contractsEnv = dotenv.parse(fs.readFileSync(path.resolve(__dirname, "../contracts/.env")));
const indexerEnv = dotenv.parse(fs.readFileSync(path.resolve(__dirname, "./.env")));

const PRIVATE_KEY = contractsEnv.PRIVATE_KEY || "0x3cb1c3907aed967594f3c6820805439669200e8cda713680baf536d0ce75fb05";
const useTestnet = indexerEnv.USE_TESTNET === "true";

const account = privateKeyToAccount(PRIVATE_KEY);
const ownerAddress = account.address;

// Setup Chain
const robinhoodChainMainnet = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [contractsEnv.VITE_RH_MAINNET_RPC || "https://rpc.mainnet.chain.robinhood.com"] } },
});

const robinhoodChainTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [indexerEnv.RH_TESTNET_RPC || "https://rpc.testnet.chain.robinhood.com"] } },
  testnet: true,
});

const targetChain = useTestnet ? robinhoodChainTestnet : robinhoodChainMainnet;

const publicClient = createPublicClient({
  chain: targetChain,
  transport: http(),
});

const walletClient = createWalletClient({
  account,
  chain: targetChain,
  transport: http(),
});

// Load ABI
const artifactPath = path.resolve(__dirname, "../contracts/out/EmberDice.sol/EmberDice.json");
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

const DICE_ADDRESS = "0xab2f20e4ff0346114a81f1593aae7657a17fd799";

async function main() {
  const amountToWithdraw = process.argv[2];
  if (!amountToWithdraw) {
    console.error("❌ Error: Please specify the amount of ETH to withdraw.");
    console.log("Usage: node withdraw_dice.js <amount_in_eth>");
    console.log("Example: node withdraw_dice.js 0.0005");
    process.exit(1);
  }

  console.log(`Withdrawing from EmberDice contract on ${targetChain.name}...`);
  console.log(`Owner Account: ${ownerAddress}`);

  // Check contract balance
  const contractBalance = await publicClient.getBalance({ address: DICE_ADDRESS });
  console.log(`Current House Balance: ${formatEther(contractBalance)} ETH`);

  const withdrawAmountWei = parseEther(amountToWithdraw);
  if (withdrawAmountWei > contractBalance) {
    console.error("❌ Error: Requested amount exceeds current contract bankroll balance.");
    process.exit(1);
  }

  // Call withdrawBankroll
  console.log(`Sending transaction to withdraw ${amountToWithdraw} ETH...`);
  const hash = await walletClient.writeContract({
    address: DICE_ADDRESS,
    abi: artifact.abi,
    functionName: "withdrawBankroll",
    args: [withdrawAmountWei],
  });

  console.log(`  Tx Sent! Hash: ${hash}`);
  console.log("  Waiting for confirmation...");
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("  ✅ Withdrawal transaction confirmed successfully!");

  // Check updated balances
  const newContractBalance = await publicClient.getBalance({ address: DICE_ADDRESS });
  const newOwnerBalance = await publicClient.getBalance({ address: ownerAddress });
  console.log(`  New House Balance: ${formatEther(newContractBalance)} ETH`);
  console.log(`  New Owner Balance: ${formatEther(newOwnerBalance)} ETH`);
}

main().catch(console.error);
