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
Usage:
  node gasfree-nile-cli.js <recipient> <amountBase> [tokenContract] [maxFee]

Args:
  recipient      TRON address (T...)
  amountBase     token amount in base units (integer). Example: 1 USDT (6 decimals) => 1000000
  tokenContract  optional TRC20 contract address (defaults to Nile USDT test token)
  maxFee         optional max fee (integer, raw units). If provided, it is used as the signed maxFee.

Env required:
  SEED_PHRASE
  GASFREE_NILE_API_KEY
  GASFREE_NILE_API_SECRET

Examples:
  # Send 1.0 token (if 6 decimals) using default Nile token
  node gasfree-nile-cli.js TQGfKPHs3AwiBT44ibkCU64u1G4ttojUXU 1000000

  # Send 0.5 token using a custom token contract
  node gasfree-nile-cli.js TQGfKPHs3AwiBT44ibkCU64u1G4ttojUXU 500000 TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf 8000
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
  if (value === undefined || value === null) return 0n;
  return BigInt(value);
}

function toSafeNumber(bi, label) {
  // WDK examples typically use JS number for amount/fee inputs.
  // Keep demo amounts within safe integer.
  if (bi > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} is too large for JS number; use a smaller amount for demo`);
  }
  return Number(bi);
}

async function gasfreeRequestJson({ baseUrl, apiKey, apiSecret, method, path, body }) {
  const timestamp = Math.floor(Date.now() / 1_000);
  const url = new URL(baseUrl + path);
  const signPath = url.pathname; // must match the actual request path
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
    const message = payload?.message ?? "Request failed";
    throw new Error(`GasFree API error (${reason}): ${message}`);
  }

  if (payload?.code !== 200) {
    const reason = payload?.reason ?? "UnknownError";
    const message = payload?.message ?? "";
    throw new Error(`GasFree API error (${reason}): ${message}`.trim());
  }

  return payload.data;
}

async function main() {
  const [, , recipient, amountBaseStr, tokenArg, maxFeeArg] = process.argv;

  if (!recipient || !amountBaseStr) usageAndExit();
  if (!isTronAddress(recipient)) throw new Error("Invalid recipient TRON address");

  const token = tokenArg ?? DEFAULT_NILE_TOKEN;
  if (!isTronAddress(token)) throw new Error("Invalid token contract address");

  const amountBase = parseUInt("amountBase", amountBaseStr);
  const maxFee = maxFeeArg ? parseUInt("maxFee", maxFeeArg) : undefined;

  const seedPhrase = checkEnv("SEED_PHRASE");
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

  const config = {
    chainId,
    provider,
    gasFreeProvider,
    gasFreeApiKey,
    gasFreeApiSecret,
    serviceProvider,
    verifyingContract
  };

  const wallet = new WalletManagerTronGasfree(seedPhrase, config);
  const account = await wallet.getAccount(0);

  try {
    const from = await account.getAddress();
    console.log("From:", from);
    console.log("To:", recipient);
    console.log("Token:", token);
    console.log("Amount (base units):", amountBase.toString());

    // Optional: show balances (helps debug “insufficient balance”)
    const trxBal = await account.getBalance();
    const tokenBal = await account.getTokenBalance(token);
    console.log("TRX balance (sun):", trxBal.toString());
    console.log("Token balance (base units):", tokenBal.toString());

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

    console.log("GasFree active:", active);
    if (allowSubmit !== undefined) {
      console.log("GasFree allow_submit:", allowSubmit);
    }

    let asset = Array.isArray(gasfreeAccount.assets)
      ? gasfreeAccount.assets.find((a) => a.tokenAddress === token)
      : undefined;

    if (!asset) {
      const tokenConfig = await gasfreeRequestJson({
        baseUrl: gasFreeProvider,
        apiKey: gasFreeApiKey,
        apiSecret: gasFreeApiSecret,
        method: "GET",
        path: "/api/v1/config/token/all"
      });

      const tokens = tokenConfig?.tokens || [];
      asset = tokens.find((t) => t.tokenAddress === token);
    }

    if (!asset) {
      throw new Error("Token not supported by GasFree provider");
    }

    const transferFee = toBigIntOrZero(asset.transferFee);
    const activateFee = toBigIntOrZero(asset.activateFee);
    const requiredFee = transferFee + (active ? 0n : activateFee);

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
      throw new Error(
        `Insufficient token balance. Required (amount + fee): ${totalRequired.toString()}`
      );
    }

    // Ensure the signed maxFee matches our computed fee (avoid MaxFeeExceededException).
    const originalQuote = account.quoteTransfer.bind(account);
    account.quoteTransfer = async () => ({ fee: signedMaxFee });

    // 2) Transfer with max-fee guard
    const result = await account.transfer(
      {
        token,
        recipient,
        amount: toSafeNumber(amountBase, "amountBase")
      },
      undefined
    );

    console.log("Transfer hash:", result.hash);
    console.log("Fee paid (raw units):", result.fee.toString());
  } catch (err) {
    const msg = err?.message ?? String(err);
    if (msg.toLowerCase().includes("exceeds the transfer max fee")) {
      console.error("Cancelled: fee exceeds maxFee. Try increasing maxFee.");
    } else {
      console.error("GasFree Nile transfer failed:", msg);
    }
    process.exitCode = 1;
  } finally {
    account.dispose();
    wallet.dispose();
  }
}

main().catch((e) => {
  console.error("Fatal:", e?.message ?? e);
  process.exitCode = 1;
});
