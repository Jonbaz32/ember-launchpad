import fs from "fs";
import { execSync } from "child_process";
import https from "https";

const ZIP_URL = "https://github.com/foundry-rs/foundry/releases/download/nightly/foundry_cli_win_amd64.zip";
const ZIP_PATH = "foundry.zip";

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  try {
    if (!fs.existsSync("forge.exe")) {
      console.log("Downloading Windows Foundry compiler (forge) from GitHub...");
      await downloadFile(ZIP_URL, ZIP_PATH);
      console.log("Extracting forge.exe using PowerShell...");
      execSync(`powershell -Command "Expand-Archive -Path ${ZIP_PATH} -DestinationPath . -Force"`);
      console.log("Cleanup...");
      if (fs.existsSync(ZIP_PATH)) {
        fs.unlinkSync(ZIP_PATH);
      }
    }
    
    console.log("Running forge build to compile contract changes...");
    execSync(".\\forge.exe build", { stdio: "inherit" });
    console.log("SUCCESS! Contracts successfully compiled.");
  } catch (err) {
    console.error("Error during build:", err);
  }
}

main();
