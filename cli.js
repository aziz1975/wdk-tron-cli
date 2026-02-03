import "dotenv/config";
import WalletManagerTron from "@tetherto/wdk-wallet-tron";

/**
 * Shasta USDT TRC20 (used as example in TRON dev docs).
 * You can override by passing a token address in commands.
 */
const DEFAULT_TOKEN_SHASTA_USDT = "TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs";

function checkEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function isTronAddress(addr) {
  return typeof addr === "string" && addr.startsWith("T") && addr.length === 34;
}

function parseBigIntStrict(label, s) {
  const str = String(s ?? "").trim();
  if (!/^\d+$/.test(str)) throw new Error(`${label} must be an integer string (base units)`);
  return BigInt(str);
}

function readBigIntEnv(name) {
  const v = process.env[name];
  if (v === undefined || v === "") return undefined;
  return parseBigIntStrict(name, v);
}

/**
 * Convert TRX human amount -> sun (smallest unit).
 * Uses BigInt to avoid floating issues for typical demo amounts.
 */
function trxToSun(trxHuman) {
  const s = String(trxHuman).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Invalid TRX amount");

  const [whole, frac = ""] = s.split(".");
  if (frac.length > 6) throw new Error("TRX supports up to 6 decimals");

  const fracPadded = (frac + "000000").slice(0, 6); // TRX has 6 decimals
  return BigInt(whole) * 1_000_000n + BigInt(fracPadded);
}

/**
 * Convert sun -> TRX human string (BigInt-safe).
 */
function sunToTrxString(sun) {
  const x = typeof sun === "bigint" ? sun : BigInt(sun);
  const base = 1_000_000n;

  const whole = x / base;
  const frac = (x % base).toString().padStart(6, "0").replace(/0+$/, "");

  return frac ? `${whole.toString()}.${frac}` : whole.toString();
}

/**
 * Always print BigInt/number safely.
 */
function asString(v) {
  return typeof v === "bigint" ? v.toString() : String(v);
}

function usage() {
  console.log(
    `
Commands:
  node cli.js address
  node cli.js balance

  # TRX transfer + fee estimate
  node cli.js quote-trx <toAddress> <trxAmount>
  node cli.js send-trx  <toAddress> <trxAmount>

  # TRC20 token balance
  node cli.js token-balance [tokenAddress]

  # TRC20 transfer + fee estimate (amount is base units!)
  node cli.js quote-token <tokenAddress> <toAddress> <tokenAmountBase>
  node cli.js send-token  <tokenAddress> <toAddress> <tokenAmountBase>

  # Message signing
  node cli.js sign "<message>"
  node cli.js verify "<message>" "<signature>"

Notes:
  - Shasta provider should be: https://api.shasta.trongrid.io
  - TRX smallest unit is sun: 1 TRX = 1,000,000 sun
  - TRC20 amounts are base units (e.g., if token has 6 decimals: 1.0 token = 1000000 base units)
  - token-balance default token (if not provided): Shasta USDT example contract
  - Optional fee cap: TRANSFER_MAX_FEE_SUN
`.trim()
  );
}

async function main() {
  const [, , cmd, ...args] = process.argv;
  if (!cmd) return usage();

  const seedPhrase = checkEnv("SEED_PHRASE");
  const provider = checkEnv("TRON_PROVIDER");

  // WDK config supports transferMaxFee (in sun). Optional.
  const transferMaxFee = readBigIntEnv("TRANSFER_MAX_FEE_SUN");

  async function createAccount(transferMaxFeeOverride) {
    const wallet = new WalletManagerTron(seedPhrase, {
      provider,
      ...(transferMaxFeeOverride !== undefined ? { transferMaxFee: transferMaxFeeOverride } : {})
    });
    const account = await wallet.getAccount(0);
    return { wallet, account };
  }

  let wallet;
  let account;

  try {
    ({ wallet, account } = await createAccount(transferMaxFee));

    if (cmd === "address") {
      console.log(await account.getAddress());
      return;
    }

    if (cmd === "balance") {
      const sun = await account.getBalance(); // bigint
      console.log("TRX balance:", sunToTrxString(sun), "TRX");
      console.log("TRX balance (sun):", asString(sun));
      return;
    }

    // ---------- TRX fee estimate ----------
    if (cmd === "quote-trx") {
      const [to, trxAmount] = args;
      if (!to || !trxAmount) return usage();
      if (!isTronAddress(to)) throw new Error("Invalid recipient TRON address");

      const valueSun = trxToSun(trxAmount);

      const quote = await account.quoteSendTransaction({
        to,
        value: valueSun
      });

      console.log("To:", to);
      console.log("Amount:", trxAmount, "TRX (sun:", asString(valueSun) + ")");
      console.log("Estimated fee (sun):", asString(quote.fee));
      console.log("Estimated fee (TRX):", sunToTrxString(quote.fee), "TRX");
      return;
    }

    // ---------- TRX send ----------
    if (cmd === "send-trx") {
      const [to, trxAmount] = args;
      if (!to || !trxAmount) return usage();
      if (!isTronAddress(to)) throw new Error("Invalid recipient TRON address");

      const valueSun = trxToSun(trxAmount);

      // Optional: show estimate first (nice for safety / debugging)
      const quote = await account.quoteSendTransaction({ to, value: valueSun });
      console.log("Estimated fee (TRX):", sunToTrxString(quote.fee), "TRX");

      const result = await account.sendTransaction({
        to,
        value: valueSun
      });

      console.log("Tx hash:", result.hash);
      console.log("Amount:", trxAmount, "TRX (sun:", asString(valueSun) + ")");
      console.log("Fee paid (sun):", asString(result.fee));
      console.log("Fee paid (TRX):", sunToTrxString(result.fee), "TRX");
      return;
    }

    // ---------- TRC20 balance ----------
    if (cmd === "token-balance") {
      const tokenAddress = args[0] || process.env.DEFAULT_TRC20_TOKEN || DEFAULT_TOKEN_SHASTA_USDT;
      if (!isTronAddress(tokenAddress)) throw new Error("Invalid TRC20 contract address");

      const bal = await account.getTokenBalance(tokenAddress); // bigint (base units)
      console.log("Token:", tokenAddress);
      console.log("Balance (base units):", asString(bal));
      return;
    }

    // ---------- TRC20 fee estimate ----------
    if (cmd === "quote-token") {
      const [tokenAddress, to, tokenAmountBase] = args;
      if (!tokenAddress || !to || !tokenAmountBase) return usage();
      if (!isTronAddress(tokenAddress)) throw new Error("Invalid TRC20 contract address");
      if (!isTronAddress(to)) throw new Error("Invalid recipient TRON address");

      const value = parseBigIntStrict("tokenAmountBase", tokenAmountBase);

      const quote = await account.quoteTransfer({
        token: tokenAddress,
        recipient: to,
        amount: value
      });

      console.log("Token:", tokenAddress);
      console.log("To:", to);
      console.log("Amount (base units):", asString(value));
      console.log("Estimated fee (sun):", asString(quote.fee));
      console.log("Estimated fee (TRX):", sunToTrxString(quote.fee), "TRX");
      if (transferMaxFee !== undefined) {
        console.log("Max fee cap (sun):", asString(transferMaxFee));
        console.log("Max fee cap (TRX):", sunToTrxString(transferMaxFee), "TRX");
      }
      return;
    }

    // ---------- TRC20 send ----------
    if (cmd === "send-token") {
      const [tokenAddress, to, tokenAmountBase] = args;
      if (!tokenAddress || !to || !tokenAmountBase) return usage();
      if (!isTronAddress(tokenAddress)) throw new Error("Invalid TRC20 contract address");
      if (!isTronAddress(to)) throw new Error("Invalid recipient TRON address");

      const value = parseBigIntStrict("tokenAmountBase", tokenAmountBase);

      // Estimate first
      const quote = await account.quoteTransfer({
        token: tokenAddress,
        recipient: to,
        amount: value
      });
      console.log("Estimated fee (TRX):", sunToTrxString(quote.fee), "TRX");

      if (transferMaxFee !== undefined) {
        console.log("Max fee cap (sun):", asString(transferMaxFee));
        console.log("Max fee cap (TRX):", sunToTrxString(transferMaxFee), "TRX");

        if (quote.fee >= transferMaxFee) {
          throw new Error(
            `Estimated fee ${sunToTrxString(quote.fee)} TRX exceeds max fee cap ` +
            `${sunToTrxString(transferMaxFee)} TRX. Increase TRANSFER_MAX_FEE_SUN ` +
            `or unset it.`
          );
        }
      }

      const result = await account.transfer({
        token: tokenAddress,
        recipient: to,
        amount: value
      });

      console.log("Transfer hash:", result.hash);
      console.log("Token:", tokenAddress);
      console.log("To:", to);
      console.log("Amount (base units):", asString(value));
      console.log("Fee paid (sun):", asString(result.fee));
      console.log("Fee paid (TRX):", sunToTrxString(result.fee), "TRX");
      return;
    }

    // ---------- Sign / verify ----------
    if (cmd === "sign") {
      const message = args.join(" ");
      if (!message) return usage();
      const sig = await account.sign(message);
      console.log(sig);
      return;
    }

    if (cmd === "verify") {
      const [message, signature] = args;
      if (!message || !signature) return usage();
      const ok = await account.verify(message, signature);
      console.log("Valid:", ok);
      return;
    }

    usage();
  } finally {
    account?.dispose();
    wallet?.dispose();
  }
}

main().catch((e) => {
  console.error("Error:", e?.message ?? e);
  process.exitCode = 1;
});
