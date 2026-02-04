# WDK Tron CLI (Simple Guide)

This is a small CLI for the WDK Tron WalletManager. It can show your address, check balances, sign/verify messages, and send TRX or TRC20 tokens. It also includes a GasFree example script for Nile.

**Quick Setup**

1. Install dependencies:

```bash
npm install
```

2. Create your env file:

```bash
cp .env.sample .env
```

3. Open `.env` and fill in your values:

- `SEED_PHRASE` (your wallet seed phrase)
- `TRON_PROVIDER` (example: Shasta testnet)
- `TRANSFER_MAX_FEE_SUN` (max fee in sun)
- GasFree Nile keys (only if you use `gasfree-nile.js`)

**Common Commands**

Run everything with:

```bash
npm start -- <command> [args]
```

Examples:

```bash
npm start -- address
npm start -- balance
npm start -- send-trx TQGfKPHs3AwiBT44ibkCU64u1G4ttojUXU 0.01
npm start -- sign "hello shasta"
npm start -- verify "hello shasta" "0x60a7faea867ca62af25c6494c4b0452cb56847229c77ec996288657c2d86fb6f0d81c7613f4ae6c6d7de244885f451a2743c14fa4b923c94881b41f8c35a41501c"
npm start -- token-balance
```

**Token Quote + Send**

```bash
npm start -- quote-token TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs TQGfKPHs3AwiBT44ibkCU64u1G4ttojUXU 1000000
npm start -- send-token TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs TQGfKPHs3AwiBT44ibkCU64u1G4ttojUXU 1000000
```

- `quote-token` shows the fee estimate for a TRC20 transfer.
- `send-token` performs the transfer.

**GasFree (Nile Example)**

There is an extra script for GasFree on Nile:

```bash
node gasfree-nile.js <toAddress> <amountBaseUnits>
```

Example:

```bash
node gasfree-nile.js TQGfKPHs3AwiBT44ibkCU64u1G4ttojUXU 5000000
```

**Notes**

- TRX amounts are in TRX (e.g., `0.01`).
- Token amounts are in base units (depends on token decimals).
- Make sure your `TRON_PROVIDER` matches the network you are using.
