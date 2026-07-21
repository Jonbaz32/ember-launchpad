import https from "https";

const url = "https://robinhood-mainnet.g.alchemy.com/v2/T-e5JYA-JSSWwcoKGQMMe";

const data = JSON.stringify({
  jsonrpc: "2.0",
  method: "eth_blockNumber",
  params: [],
  id: 1,
});

const req = https.request(
  url,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": data.length,
    },
  },
  (res) => {
    console.log("HTTP Status Code:", res.statusCode);
    let body = "";
    res.on("data", (chunk) => (body += chunk));
    res.on("end", () => {
      console.log("Response Body:", body);
    });
  }
);

req.on("error", (e) => {
  console.error("Connection Error:", e.message);
});

req.write(data);
req.end();
