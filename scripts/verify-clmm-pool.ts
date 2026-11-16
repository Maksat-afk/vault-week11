import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  Raydium,
  DEVNET_PROGRAM_ID,
  DEV_API_URLS,
} from "@raydium-io/raydium-sdk-v2";
import Decimal from "decimal.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

async function main() {
  const manifestPath = path.join(__dirname, "..", "devnet-pool.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  const keyPath =
    process.env.ANCHOR_WALLET ??
    path.join(os.homedir(), ".config", "solana", "id.json");

  const secretKey = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  const owner = Keypair.fromSecretKey(Uint8Array.from(secretKey));

  const connection = new Connection(
    process.env.DEVNET_RPC ?? "https://api.devnet.solana.com",
    "confirmed"
  );

  const raydium = await Raydium.load({
    owner,
    connection,
    cluster: "devnet",
    disableFeatureCheck: true,
    disableLoadToken: true,
    blockhashCommitment: "finalized",
    urlConfigs: DEV_API_URLS,
  });

  console.log("Читаю состояние пула из Devnet...");

  const pool = await raydium.clmm.getRpcClmmPoolInfo({
    poolId: manifest.poolId,
  });

  const mintA = pool.mintA.toBase58();
  const mintB = pool.mintB.toBase58();

  if (
    !(
      (mintA === manifest.tokenA && mintB === manifest.tokenB) ||
      (mintA === manifest.tokenB && mintB === manifest.tokenA)
    )
  ) {
    throw new Error("Mint-адреса пула не совпадают с devnet-pool.json");
  }

  const priceAtoB =
    mintA === manifest.tokenA
      ? new Decimal(pool.currentPrice)
      : new Decimal(1).div(pool.currentPrice);

  console.log("\n========== ON-CHAIN POOL ==========");
  console.log("Pool ID:", manifest.poolId);
  console.log("Mint A:", mintA);
  console.log("Mint B:", mintB);
  console.log("Tick spacing:", pool.tickSpacing);
  console.log("Цена TOKEN_B за TOKEN_A:", priceAtoB.toString());
  console.log("===================================");

  if (priceAtoB.minus(1).abs().lt("0.000001")) {
    console.log("SUCCESS: начальная цена соответствует 1:1");
  } else {
    console.log("ВНИМАНИЕ: цена отличается от 1:1");
  }
}

main().catch((error) => {
  console.error("Ошибка проверки:", error);
  process.exit(1);
});
