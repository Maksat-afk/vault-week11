/**
 * Неделя 11: собственные SPL-токены и CLMM-пул Raydium в Devnet.
 *
 * Скрипт:
 * 1. Создаёт два SPL Token mint с 6 decimals.
 * 2. Создаёт ATA владельца и минтит по 1 000 000 TOKEN_A и TOKEN_B.
 * 3. Создаёт CLMM-пул Raydium Devnet с начальной ценой 1 TOKEN_A = 1 TOKEN_B.
 * 4. Проверяет, что созданный pool account принадлежит Raydium CLMM program.
 * 5. Сохраняет адреса в devnet-pool.json.
 *
 * Запуск: yarn create-pool
 *
 * Кошелёк: ANCHOR_WALLET или ~/.config/solana/id.json
 * RPC: DEVNET_RPC или публичный Solana Devnet RPC.
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import {
  Raydium,
  DEVNET_PROGRAM_ID,
  DEV_API_URLS,
  TxVersion,
  ApiV3Token,
} from "@raydium-io/raydium-sdk-v2";
import Decimal from "decimal.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// -----------------------------------------------------------------------------
// Настройки задания
// -----------------------------------------------------------------------------

const RPC_URL = process.env.DEVNET_RPC ?? "https://api.devnet.solana.com";
const DECIMALS = 6;
const MINT_AMOUNT = 1_000_000; // целых токенов каждого вида
const INITIAL_PRICE = new Decimal(1); // 1 TOKEN_A = 1 TOKEN_B
const TICK_SPACING = 60; // fee tier 0.25% в конфигурации задания

const OUT_FILE = path.join(__dirname, "..", "devnet-pool.json");
const PENDING_FILE = path.join(__dirname, "..", "devnet-pool.pending.json");

type PoolManifest = {
  cluster: "devnet";
  owner: string;
  clmmProgram: string;
  tokenA: string;
  tokenB: string;
  tokenAAccount: string;
  tokenBAccount: string;
  decimals: number;
  mintedAmountEach: number;
  initialPriceTokenBPerTokenA: string;
  tickSpacing: number;
  tradeFeeRate: number;
  ammConfig: string;
  poolId: string | null;
  tx: string | null;
};

function loadWallet(): Keypair {
  const keyPath =
    process.env.ANCHOR_WALLET ??
    path.join(os.homedir(), ".config", "solana", "id.json");

  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `Файл кошелька не найден: ${keyPath}\n` +
        "Проверь ANCHOR_WALLET или путь ~/.config/solana/id.json."
    );
  }

  const secretKey = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

function saveJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

async function main(): Promise<void> {
  const owner = loadWallet();
  const connection = new Connection(RPC_URL, "confirmed");
  const clmmProgramId = DEVNET_PROGRAM_ID.CLMM_PROGRAM_ID;

  console.log("==================================================");
  console.log(" RAYDIUM CLMM — DEVNET / WEEK 11");
  console.log("==================================================");
  console.log("Кошелёк:", owner.publicKey.toBase58());
  console.log("RPC     :", RPC_URL);
  console.log("CLMM ID :", clmmProgramId.toBase58());

  const balanceLamports = await connection.getBalance(owner.publicKey);
  const balanceSol = balanceLamports / 1_000_000_000;
  console.log("Баланс  :", balanceSol, "SOL");

  if (balanceSol < 0.5) {
    throw new Error(
      "Недостаточно SOL для создания двух mint, token accounts и CLMM-пула. " +
        "Пополните кошелёк в Solana Devnet Faucet и повторите запуск."
    );
  }

  // 1. Создаём собственные тестовые токены.
  console.log("\n[1/4] Создаю два тестовых SPL-токена...");

  const mintA = await createMint(
    connection,
    owner,
    owner.publicKey,
    null,
    DECIMALS
  );
  console.log("  TOKEN_A mint:", mintA.toBase58());

  const mintB = await createMint(
    connection,
    owner,
    owner.publicKey,
    null,
    DECIMALS
  );
  console.log("  TOKEN_B mint:", mintB.toBase58());

  // 2. Создаём associated token accounts и выпускаем тестовые токены.
  console.log("\n[2/4] Создаю token accounts и выпускаю токены...");

  const ataA = await getOrCreateAssociatedTokenAccount(
    connection,
    owner,
    mintA,
    owner.publicKey
  );

  const ataB = await getOrCreateAssociatedTokenAccount(
    connection,
    owner,
    mintB,
    owner.publicKey
  );

  // 1 000 000 * 10^6 = 1 000 000 000 000, безопасно помещается в Number.MAX_SAFE_INTEGER.
  const mintAmountBaseUnits = MINT_AMOUNT * 10 ** DECIMALS;

  const mintATx = await mintTo(
    connection,
    owner,
    mintA,
    ataA.address,
    owner,
    mintAmountBaseUnits
  );

  const mintBTx = await mintTo(
    connection,
    owner,
    mintB,
    ataB.address,
    owner,
    mintAmountBaseUnits
  );

  const [mintInfoA, mintInfoB, accountInfoA, accountInfoB] =
    await Promise.all([
      getMint(connection, mintA),
      getMint(connection, mintB),
      getAccount(connection, ataA.address),
      getAccount(connection, ataB.address),
    ]);

  if (
    mintInfoA.decimals !== DECIMALS ||
    mintInfoB.decimals !== DECIMALS
  ) {
    throw new Error("У созданных токенов неожиданное количество decimals.");
  }

  if (
    accountInfoA.amount.toString() !== mintAmountBaseUnits.toString() ||
    accountInfoB.amount.toString() !== mintAmountBaseUnits.toString()
  ) {
    throw new Error("Не удалось подтвердить полный выпуск тестовых токенов.");
  }

  // Сохраняем mint-адреса до вызова Raydium SDK. Если создание пула не пройдёт,
  // созданные тестовые токены всё равно останутся доступны в этом файле.
  saveJson(PENDING_FILE, {
    stage: "tokens-created",
    cluster: "devnet",
    owner: owner.publicKey.toBase58(),
    tokenA: mintA.toBase58(),
    tokenB: mintB.toBase58(),
    tokenAAccount: ataA.address.toBase58(),
    tokenBAccount: ataB.address.toBase58(),
    decimals: DECIMALS,
    mintedAmountEach: MINT_AMOUNT,
  });

  console.log(`  TOKEN_A balance: ${MINT_AMOUNT.toLocaleString("en-US")}`);
  console.log(`  TOKEN_B balance: ${MINT_AMOUNT.toLocaleString("en-US")}`);
  console.log("  Mint A tx:", mintATx);
  console.log("  Mint B tx:", mintBTx);

  // Сохраняем промежуточный результат, чтобы адреса mint не потерялись,
  // если создание пула завершится ошибкой или RPC временно станет недоступен.
  const raydium = await Raydium.load({
    owner,
    connection,
    cluster: "devnet",
    disableFeatureCheck: true,
    disableLoadToken: true,
    blockhashCommitment: "finalized",
    urlConfigs: DEV_API_URLS,
  });

  // 3. Получаем fee tier с API именно Devnet и создаём CLMM pool.
  console.log("\n[3/4] Получаю CLMM fee config и создаю пул Raydium...");

  const configs = await raydium.api.getClmmConfigs();
  const config = configs.find((item) => item.tickSpacing === TICK_SPACING);

  if (!config) {
    const available = configs
      .map((item) => `tickSpacing=${item.tickSpacing}, fee=${item.tradeFeeRate / 10_000}%`)
      .join("; ");
    throw new Error(
      `В Devnet API не найден CLMM config с tickSpacing=${TICK_SPACING}. ` +
        `Доступные конфигурации: ${available || "нет данных"}`
    );
  }

  console.log("  API config   :", config.id);
  console.log("  Config index :", config.index);
  console.log("  Tick spacing :", config.tickSpacing);
  console.log("  Trade fee    :", `${config.tradeFeeRate / 10_000}%`);

  // Для CLMM config PDA используется seed ["amm_config", index_u16_be].
  // В некоторых ответах API Devnet поле id может отличаться от on-chain PDA,
  // поэтому вычисляем канонический адрес и проверяем его владельца через RPC.
  const configIndexSeed = Buffer.alloc(2);
  configIndexSeed.writeUInt16BE(config.index, 0);

  const [ammConfigId] = PublicKey.findProgramAddressSync(
    [Buffer.from("amm_config"), configIndexSeed],
    clmmProgramId
  );

  const [derivedConfigAccount, apiConfigAccount] = await Promise.all([
    connection.getAccountInfo(ammConfigId, "confirmed"),
    connection.getAccountInfo(new PublicKey(config.id), "confirmed"),
  ]);

  if (
    !derivedConfigAccount ||
    !derivedConfigAccount.owner.equals(clmmProgramId)
  ) {
    throw new Error(
      `CLMM config PDA ${ammConfigId.toBase58()} не найден или принадлежит другой программе. ` +
        "Проверь Devnet RPC и доступность конфигурации Raydium."
    );
  }

  if (!new PublicKey(config.id).equals(ammConfigId)) {
    console.warn(
      "  Внимание: API config id не совпал с on-chain PDA. Использую вычисленный адрес:",
      ammConfigId.toBase58()
    );
  } else if (
    !apiConfigAccount ||
    !apiConfigAccount.owner.equals(clmmProgramId)
  ) {
    throw new Error("API вернул CLMM config id, который не подтверждается on-chain.");
  }

  const tokenInfo = (
    mint: PublicKey,
    symbol: string
  ): ApiV3Token => ({
    chainId: 101,
    address: mint.toBase58(),
    programId: TOKEN_PROGRAM_ID.toBase58(),
    logoURI: "",
    symbol,
    name: symbol,
    decimals: DECIMALS,
    tags: [],
    extensions: {},
  });

  const { execute, extInfo } = await raydium.clmm.createPool({
    programId: clmmProgramId,
    mint1: tokenInfo(mintA, "TOKEN_A"),
    mint2: tokenInfo(mintB, "TOKEN_B"),
    ammConfig: {
      ...config,
      id: ammConfigId,
      fundOwner: "",
      description: "",
    } as any,
    initialPrice: INITIAL_PRICE,
    txVersion: TxVersion.V0,
  });

  const { txId } = await execute({ sendAndConfirm: true });

  const poolIdValue = (extInfo as any)?.address?.id;
  if (!poolIdValue) {
    throw new Error(
      "Транзакция создания пула отправлена, но SDK не вернул poolId. " +
        `Проверь транзакцию: https://explorer.solana.com/tx/${txId}?cluster=devnet`
    );
  }

  const poolId = new PublicKey(String(poolIdValue));

  // Проверяем, что аккаунт пула действительно создан и принадлежит CLMM program.
  const poolAccount = await connection.getAccountInfo(poolId, "confirmed");

  if (!poolAccount) {
    throw new Error(
      `Pool account ${poolId.toBase58()} не найден после подтверждения транзакции.`
    );
  }

  if (!poolAccount.owner.equals(clmmProgramId)) {
    throw new Error(
      `Неверный владелец pool account: ${poolAccount.owner.toBase58()}. ` +
        `Ожидался Raydium CLMM: ${clmmProgramId.toBase58()}`
    );
  }

  // 4. Сохраняем итоговые адреса и ссылки.
  console.log("\n[4/4] Сохраняю devnet-pool.json...");

  const result: PoolManifest = {
    cluster: "devnet",
    owner: owner.publicKey.toBase58(),
    clmmProgram: clmmProgramId.toBase58(),
    tokenA: mintA.toBase58(),
    tokenB: mintB.toBase58(),
    tokenAAccount: ataA.address.toBase58(),
    tokenBAccount: ataB.address.toBase58(),
    decimals: DECIMALS,
    mintedAmountEach: MINT_AMOUNT,
    initialPriceTokenBPerTokenA: INITIAL_PRICE.toString(),
    tickSpacing: config.tickSpacing,
    tradeFeeRate: config.tradeFeeRate,
    ammConfig: ammConfigId.toBase58(),
    poolId: poolId.toBase58(),
    tx: txId,
  };

  saveJson(OUT_FILE, result);

  if (fs.existsSync(PENDING_FILE)) {
    fs.unlinkSync(PENDING_FILE);
  }

  console.log("\n==================== ГОТОВО ====================");
  console.log("TOKEN_A:", result.tokenA);
  console.log("TOKEN_B:", result.tokenB);
  console.log("Pool ID:", result.poolId);
  console.log(
    "Transaction:",
    `https://explorer.solana.com/tx/${txId}?cluster=devnet`
  );
  console.log(
    "Pool Explorer:",
    `https://explorer.solana.com/address/${result.poolId}?cluster=devnet`
  );
  console.log("Файл:", OUT_FILE);
  console.log("================================================");
}

main().catch((error: unknown) => {
  console.error("\nОшибка при создании Raydium CLMM pool:");
  if (error instanceof Error) {
    console.error(error.message);
    if (error.stack) console.error(error.stack);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
