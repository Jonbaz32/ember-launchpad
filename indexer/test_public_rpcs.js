import https from "https";

const urls = [
  "https://rpc.mainnet.chain.robinhood.com",
  "https://mainnet.chain.robinhood.com",
  "https://rpc.robinhoodchain.com",
  "https://rpc.testnet.chain.robinhood.com",
];

const data = JSON.stringify({
  jsonrpc: "2.0",
  method: "eth_blockNumber",
  params: [],
  id: 1,
});

for (const u of urls) {
  try {
    const req = https.request(
      u,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": data.length,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          console.log(`✅ SUCCESS on ${u} (Status ${res.statusCode}):`, body);
        });
      }
    );

    req.on("error", (e) => {
      console.log(`❌ Failed on ${u}: ${e.message}`);
    });

    req.write(data);
    req.end();
  } catch (e) {
    console.log(`❌ Exception on ${u}:`, e.message);
  }
}
