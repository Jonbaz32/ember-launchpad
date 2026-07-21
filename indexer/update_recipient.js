import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain } from "./src/chain.js";

const PRIVATE_KEY = "0x3cb1c3907aed967594f3c6820805439669200e8cda713680baf536d0ce75fb05";
const FACTORY_ADDRESS = "0x0592d505e68b5A9b0465F86A8F5150c84f7cDD69";
const NEW_RECIPIENT = "0x415e16Ad0Cd00485a7479B0a31b862c5ba27222A";

const account = privateKeyToAccount(PRIVATE_KEY);

const walletClient = createWalletClient({
  account,
  chain,
  transport: http(),
});

const abi = [
  {
    name: "setProtocolFeeRecipient",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "recipient",
        type: "address",
      },
    ],
    outputs: [],
  },
];

async function main() {
  console.log("Updating on-chain protocol fee recipient...");
  console.log("Owner Account Address:", account.address);
  console.log("Target Factory Address:", FACTORY_ADDRESS);
  console.log("New Recipient Address:", NEW_RECIPIENT);

  try {
    const hash = await walletClient.writeContract({
      address: FACTORY_ADDRESS,
      abi,
      functionName: "setProtocolFeeRecipient",
      args: [NEW_RECIPIENT],
    });
    console.log("Transaction sent! Transaction hash:", hash);
  } catch (err) {
    console.error("Failed to set protocol fee recipient:", err);
  }
}

main();
