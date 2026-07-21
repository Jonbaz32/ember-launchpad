import { db } from "./src/db.js";

function main() {
  try {
    const tokens = db.prepare("SELECT * FROM tokens").all();
    const trades = db.prepare("SELECT * FROM trades").all();
    const burns = db.prepare("SELECT * FROM burns").all();

    console.log("=== SQLite Database Summary ===");
    console.log("Total Deployed Tokens:", tokens.length);
    if (tokens.length > 0) {
      console.log("Tokens:");
      tokens.forEach(t => console.log(`  - ${t.symbol} at ${t.address} (creator: ${t.creator})`));
    }
    
    console.log("Total Trade Transactions:", trades.length);
    if (trades.length > 0) {
      console.log("Trades:");
      trades.forEach(t => console.log(`  - ${t.side.toUpperCase()} of ${t.token_amount} tokens for ${t.eth_amount} ETH`));
    }

    console.log("Total Burn Actions:", burns.length);
  } catch (err) {
    console.error("Error reading database:", err);
  }
}

main();
