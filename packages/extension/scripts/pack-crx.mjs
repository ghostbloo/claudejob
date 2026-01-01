import crx from "crx";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const keyPath = path.join(rootDir, "key.pem");
const distPath = path.join(rootDir, "dist");
const outputPath = path.join(rootDir, "claude-blocker.crx");

if (!fs.existsSync(keyPath)) {
  console.error("Error: key.pem not found!");
  console.error("Generate one with: openssl genrsa -out key.pem 2048");
  process.exit(1);
}

if (!fs.existsSync(distPath)) {
  console.error("Error: dist/ folder not found!");
  console.error("Run pnpm build first.");
  process.exit(1);
}

const extension = new crx({
  privateKey: fs.readFileSync(keyPath),
});

console.log("Packing extension...");

extension
  .load(distPath)
  .then((crx) => crx.pack())
  .then((crxBuffer) => {
    fs.writeFileSync(outputPath, crxBuffer);
    console.log(`Created: ${outputPath}`);
  })
  .catch((err) => {
    console.error("Failed to pack extension:", err);
    process.exit(1);
  });
