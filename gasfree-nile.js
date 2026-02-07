import "dotenv/config";
import { createHmac } from "crypto";
import WalletManagerTronGasfree from "@tetherto/wdk-wallet-tron-gasfree";

// Default Nile USDT test token contract (commonly used on Nile)
const DEFAULT_NILE_TOKEN = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";

// Nile endpoints + GasFree config (per WDK + GasFree spec)
const NILE_CONFIG_DEFAULTS = {
  chainId: 3448148188,
  provider: "https://nile.trongrid.io",
  gasFreeProvider: "https://open-test.gasfree.io/nile",
  serviceProvider: "TLyqzVGLV1srkB7dToTAEqgDSfPtXRJZYH",
  verifyingContract: "THQGuFzL87ZqhxkgqYEryRAd7gqFqL5rdc"
};

function checkEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function isTronAddress(addr) {
  return typeof addr === "string" && addr.startsWith("T") && addr.length === 34;
}

function usageAndExit() {
  console.log(`
GasFree Nile CLI (WDK)

Transfer:
  node gasfree-nile.js transfer <recipient> <amountBase> [tokenContract] [maxFee]

Commands:
  node gasfree-nile.js transfer <recipient> <amountBase> [tokenContract] [maxFee]
  node gasfree-nile.js status
  node gasfree-nile.js tokens [tokenContract]
  node gasfree-nile.js providers
  node gasfree-nile.js balance [tokenContract]
  node gasfree-nile.js fee <recipient> <amountBase> [tokenContract]
  node gasfree-nile.js activate <recipient> [tokenContract] [maxFee]

Args:
  recipient      TRON address (T...)
  amountBase     token amount in base units (integer). Example: 1 USDT (6 decimals) => 1000000
  tokenContract  optional TRC20 contract address (defaults to Nile USDT test token)
  maxFee         optional max fee (integer, raw units). If provided, it is used as the signed maxFee.

Env required:
  SEED_PHRASE
  GASFREE_NILE_API_KEY
  GASFREE_NILE_API_SECRET

Optional env overrides:
  GASFREE_NILE_PROVIDER
  GASFREE_NILE_RPC
  GASFREE_NILE_CHAIN_ID
  GASFREE_NILE_VERIFYING_CONTRACT
  GASFREE_NILE_SERVICE_PROVIDER

Examples:

  node gasfree-nile.js transfer TQGfKPHs3AwiBT44ibkCU64u1G4ttojUXU 5000000

  node gasfree-nile.js status
  node gasfree-nile.js tokens
  node gasfree-nile.js tokens ${DEFAULT_NILE_TOKEN}
  node gasfree-nile.js providers
  node gasfree-nile.js balance
  node gasfree-nile.js fee TQGfKPHs3AwiBT44ibkCU64u1G4ttojUXU 5000000
  node gasfree-nile.js activate TQGfKPHs3AwiBT44ibkCU64u1G4ttojUXU
`.trim());
  process.exit(1);
}

function parseUInt(label, s) {
  const str = String(s ?? "").trim();
  if (!/^\d+$/.test(str)) throw new Error(`${label} must be a non-negative integer`);
  return BigInt(str);
}

function normalizeBaseUrl(url) {
  return String(url ?? "").trim().replace(/\/+$/, "");
}

function getEnvOrDefault(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function parseChainId(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error("Invalid chainId");
  return n;
}

function toBigIntOrZero(value) {
  if (value === undefined || value === null || value === "") return 0n;
  return BigInt(value);
}

function toSafeNumber(bi, label) {
  if (bi > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} is too large for JS number; use a smaller amount for demo`);
  }
  return Number(bi);
}

async function gasfreeRequestJson({ baseUrl, apiKey, apiSecret, method, path, body }) {
  const timestamp = Math.floor(Date.now() / 1_000);
  const url = new URL(baseUrl + path);
  const signPath = url.pathname;
  const message = method + signPath + timestamp;
  const signature = createHmac("sha256", apiSecret).update(message).digest("base64");

  const headers = {
    Timestamp: `${timestamp}`,
    Authorization: `ApiKey ${apiKey}:${signature}`,
    "Content-Type": "application/json"
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const reason = payload?.reason ?? `HTTP ${response.status}`;
    const message2 = payload?.message ?? "Request failed";
    throw new Error(`GasFree API error (${reason}): ${message2}`);
  }

  if (payload?.code !== 200) {
    const reason = payload?.reason ?? "UnknownError";
    const message2 = payload?.message ?? "";
    throw new Error(`GasFree API error (${reason}): ${message2}`.trim());
  }

  return payload.data;
}

async function buildConfig() {
  const gasFreeApiKey = checkEnv("GASFREE_NILE_API_KEY");
  const gasFreeApiSecret = checkEnv("GASFREE_NILE_API_SECRET");

  const gasFreeProvider = normalizeBaseUrl(
    getEnvOrDefault("GASFREE_NILE_PROVIDER", NILE_CONFIG_DEFAULTS.gasFreeProvider)
  );
  const provider = getEnvOrDefault("GASFREE_NILE_RPC", NILE_CONFIG_DEFAULTS.provider);
  const chainId = parseChainId(getEnvOrDefault("GASFREE_NILE_CHAIN_ID", NILE_CONFIG_DEFAULTS.chainId));
  const verifyingContract = getEnvOrDefault(
    "GASFREE_NILE_VERIFYING_CONTRACT",
    NILE_CONFIG_DEFAULTS.verifyingContract
  );

  let serviceProvider = getEnvOrDefault(
    "GASFREE_NILE_SERVICE_PROVIDER",
    NILE_CONFIG_DEFAULTS.serviceProvider
  );

  // If not pinned in env, pick the first provider returned by API.
  if (!process.env.GASFREE_NILE_SERVICE_PROVIDER) {
    const data = await gasfreeRequestJson({
      baseUrl: gasFreeProvider,
      apiKey: gasFreeApiKey,
      apiSecret: gasFreeApiSecret,
      method: "GET",
      path: "/api/v1/config/provider/all"
    });

    if (data?.providers?.length) {
      serviceProvider = data.providers[0].address;
    }
  }

  return {
    gasFreeProvider,
    gasFreeApiKey,
    gasFreeApiSecret,
    config: {
      chainId,
      provider,
      gasFreeProvider,
      gasFreeApiKey,
      gasFreeApiSecret,
      serviceProvider,
      verifyingContract
    }
  };
}

async function createWalletAndAccount(config) {
  const seedPhrase = checkEnv("SEED_PHRASE");
  const wallet = new WalletManagerTronGasfree(seedPhrase, config);
  const account = await wallet.getAccount(0);
  return { wallet, account };
}

async function fetchGasfreeAccountInfo({ gasFreeProvider, gasFreeApiKey, gasFreeApiSecret, account }) {
  const ownerAddress = await account._ownerAccount.getAddress();

  const gasfreeAccount = await gasfreeRequestJson({
    baseUrl: gasFreeProvider,
    apiKey: gasFreeApiKey,
    apiSecret: gasFreeApiSecret,
    method: "GET",
    path: `/api/v1/address/${ownerAddress}`
  });

  const active = Boolean(gasfreeAccount.active);
  const allowSubmit = gasfreeAccount.allowSubmit ?? gasfreeAccount.allow_submit;

  return { ownerAddress, gasfreeAccount, active, allowSubmit };
}

async function fetchSupportedTokens({ gasFreeProvider, gasFreeApiKey, gasFreeApiSecret }) {
  const tokenConfig = await gasfreeRequestJson({
    baseUrl: gasFreeProvider,
    apiKey: gasFreeApiKey,
    apiSecret: gasFreeApiSecret,
    method: "GET",
    path: "/api/v1/config/token/all"
  });

  const tokens = tokenConfig?.tokens || tokenConfig?.assets || [];
  return Array.isArray(tokens) ? tokens : [];
}

function findToken(tokens, tokenAddress) {
  return (
    tokens.find((t) => t.tokenAddress === tokenAddress) ||
    tokens.find((t) => t.address === tokenAddress) ||
    undefined
  );
}

function printTokenRow(t) {
  const tokenAddress = t.tokenAddress ?? t.address ?? "";
  const symbol = t.symbol ?? "";
  const name = t.name ?? "";
  const transferFee = t.transferFee ?? "";
  const activateFee = t.activateFee ?? "";
  console.log(`${tokenAddress}  ${symbol}  ${name}  transferFee=${transferFee}  activateFee=${activateFee}`);
}

async function computeRequiredFee({ gasFreeProvider, gasFreeApiKey, gasFreeApiSecret, account, token }) {
  const { gasfreeAccount, active } = await fetchGasfreeAccountInfo({
    gasFreeProvider,
    gasFreeApiKey,
    gasFreeApiSecret,
    account
  });

  // Prefer account assets if present
  let asset = Array.isArray(gasfreeAccount.assets)
    ? gasfreeAccount.assets.find((a) => a.tokenAddress === token)
    : undefined;

  // Otherwise use global token config
  if (!asset) {
    const tokens = await fetchSupportedTokens({ gasFreeProvider, gasFreeApiKey, gasFreeApiSecret });
    asset = findToken(tokens, token);
  }

  if (!asset) throw new Error("Token not supported by GasFree provider");

  const transferFee = toBigIntOrZero(asset.transferFee);
  const activateFee = toBigIntOrZero(asset.activateFee);
  const requiredFee = transferFee + (active ? 0n : activateFee);

  return { active, transferFee, activateFee, requiredFee };
}

async function runTransfer(ctx, recipient, amountBaseStr, tokenArg, maxFeeArg) {
  if (!isTronAddress(recipient)) throw new Error("Invalid recipient TRON address");

  const token = tokenArg ?? DEFAULT_NILE_TOKEN;
  if (!isTronAddress(token)) throw new Error("Invalid token contract address");

  const amountBase = parseUInt("amountBase", amountBaseStr);
  const maxFee = maxFeeArg ? parseUInt("maxFee", maxFeeArg) : undefined;

  const from = await ctx.account.getAddress();
  console.log("From:", from);
  console.log("To:", recipient);
  console.log("Token:", token);
  console.log("Amount (base units):", amountBase.toString());

  const trxBal = await ctx.account.getBalance();
  const tokenBal = await ctx.account.getTokenBalance(token);
  console.log("TRX balance (sun):", trxBal.toString());
  console.log("Token balance (base units):", tokenBal.toString());

  const { active, allowSubmit } = await fetchGasfreeAccountInfo(ctx);
  console.log("GasFree active:", active);
  if (allowSubmit !== undefined) console.log("GasFree allow_submit:", allowSubmit);

  const { requiredFee } = await computeRequiredFee({ ...ctx, token });
  console.log("Estimated fee (raw units):", requiredFee.toString());

  const signedMaxFee = maxFee !== undefined ? maxFee : requiredFee;

  if (maxFee !== undefined) {
    console.log("Max fee (raw units):", maxFee.toString());
    if (maxFee < requiredFee) {
      throw new Error("The transfer operation exceeds the transfer max fee.");
    }
  }

  const totalRequired = amountBase + signedMaxFee;
  if (tokenBal < totalRequired) {
    throw new Error(`Insufficient token balance. Required (amount + fee): ${totalRequired.toString()}`);
  }

  // Ensure the signed maxFee matches our computed fee.
  const originalQuote = ctx.account.quoteTransfer.bind(ctx.account);
  ctx.account.quoteTransfer = async () => ({ fee: signedMaxFee });

  try {
    const result = await ctx.account.transfer(
      {
        token,
        recipient,
        amount: toSafeNumber(amountBase, "amountBase")
      },
      undefined
    );

    console.log("Transfer hash:", result.hash);
    console.log("Fee paid (raw units):", result.fee.toString());
  } finally {
    ctx.account.quoteTransfer = originalQuote;
  }
}

async function cmdStatus(ctx) {
  const from = await ctx.account.getAddress();
  const { ownerAddress, active, allowSubmit } = await fetchGasfreeAccountInfo(ctx);

  console.log("Owner address:", ownerAddress);
  console.log("From (GasFree sender):", from);
  console.log("GasFree active:", active);
  if (allowSubmit !== undefined) console.log("GasFree allow_submit:", allowSubmit);

  console.log("GasFree provider:", ctx.config.gasFreeProvider);
  console.log("TRON RPC:", ctx.config.provider);
  console.log("Service provider:", ctx.config.serviceProvider);
  console.log("Verifying contract:", ctx.config.verifyingContract);
}

async function cmdProviders(ctx) {
  const data = await gasfreeRequestJson({
    baseUrl: ctx.gasFreeProvider,
    apiKey: ctx.gasFreeApiKey,
    apiSecret: ctx.gasFreeApiSecret,
    method: "GET",
    path: "/api/v1/config/provider/all"
  });

  const providers = data?.providers || [];
  if (!providers.length) {
    console.log("No providers returned.");
    return;
  }

  for (const p of providers) {
    const addr = p.address ?? "";
    const name = p.name ?? "";
    console.log(`${addr}  ${name}`);
  }
}

async function cmdTokens(ctx, tokenFilter) {
  const tokens = await fetchSupportedTokens(ctx);
  if (!tokens.length) {
    console.log("No tokens returned.");
    return;
  }

  if (tokenFilter) {
    if (!isTronAddress(tokenFilter)) throw new Error("Invalid token contract address");
    const t = findToken(tokens, tokenFilter);
    if (!t) {
      console.log("Token not found in supported list:", tokenFilter);
      return;
    }
    printTokenRow(t);
    return;
  }

  console.log("tokenAddress  symbol  name  transferFee  activateFee");
  for (const t of tokens) printTokenRow(t);
}

async function cmdBalance(ctx, tokenArg) {
  const token = tokenArg ?? DEFAULT_NILE_TOKEN;
  if (!isTronAddress(token)) throw new Error("Invalid token contract address");

  const from = await ctx.account.getAddress();
  const trxBal = await ctx.account.getBalance();
  const tokenBal = await ctx.account.getTokenBalance(token);

  console.log("From:", from);
  console.log("TRX balance (sun):", trxBal.toString());
  console.log("Token:", token);
  console.log("Token balance (base units):", tokenBal.toString());
}

async function cmdFee(ctx, recipient, amountBaseStr, tokenArg) {
  if (!recipient || !amountBaseStr) usageAndExit();
  if (!isTronAddress(recipient)) throw new Error("Invalid recipient TRON address");

  const token = tokenArg ?? DEFAULT_NILE_TOKEN;
  if (!isTronAddress(token)) throw new Error("Invalid token contract address");

  const amountBase = parseUInt("amountBase", amountBaseStr);
  const { active, transferFee, activateFee, requiredFee } = await computeRequiredFee({ ...ctx, token });

  console.log("To:", recipient);
  console.log("Token:", token);
  console.log("Amount (base units):", amountBase.toString());
  console.log("GasFree active:", active);
  console.log("transferFee:", transferFee.toString());
  console.log("activateFee:", activateFee.toString());
  console.log("Required fee (raw units):", requiredFee.toString());
  console.log("Total required (amount + fee):", (amountBase + requiredFee).toString());
}

async function cmdActivate(ctx, recipient, tokenArg, maxFeeArg) {
  if (!recipient) usageAndExit();
  // Activation is done by a tiny transfer of 1 base unit.
  await runTransfer(ctx, recipient, "1", tokenArg, maxFeeArg);
}

async function main() {
  const arg1 = process.argv[2];
  if (!arg1) usageAndExit();

  const built = await buildConfig();
  const { wallet, account } = await createWalletAndAccount(built.config);

  const ctx = {
    ...built,
    wallet,
    account
  };

  try {
    const command = arg1;
    const args = process.argv.slice(3);

    if (command === "transfer") {
      await runTransfer(ctx, args[0], args[1], args[2], args[3]);
      return;
    }

    if (command === "status") {
      await cmdStatus(ctx);
      return;
    }

    if (command === "tokens") {
      await cmdTokens(ctx, args[0]);
      return;
    }

    if (command === "providers") {
      await cmdProviders(ctx);
      return;
    }

    if (command === "balance") {
      await cmdBalance(ctx, args[0]);
      return;
    }

    if (command === "fee") {
      await cmdFee(ctx, args[0], args[1], args[2]);
      return;
    }

    if (command === "activate") {
      await cmdActivate(ctx, args[0], args[1], args[2]);
      return;
    }

    if (isTronAddress(command)) {
      throw new Error("Missing command: use 'transfer <recipient> <amountBase> [tokenContract] [maxFee]'");
    }

    usageAndExit();
  } catch (err) {
    const msg = err?.message ?? String(err);
    if (msg.toLowerCase().includes("exceeds the transfer max fee")) {
      console.error("Cancelled: fee exceeds maxFee. Try increasing maxFee.");
    } else {
      console.error("Error:", msg);
    }
    process.exitCode = 1;
  } finally {
    ctx.account?.dispose();
    ctx.wallet?.dispose();
  }
}

main().catch((e) => {
  console.error("Fatal:", e?.message ?? e);
  process.exitCode = 1;
});
