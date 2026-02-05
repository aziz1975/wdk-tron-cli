# wdk-tron-cli

A Node.js CLI demo project for building and testing **TRON** wallet actions with **Tether WDK**, including basic Shasta wallet commands and a GasFree TRC20 transfer flow on Nile.


It includes two scripts:

- **`cli.js`**: Basic wallet actions on **Shasta** (address, balance, TRX send, TRC20 balance, TRC20 send, sign/verify).
- **`gasfree-nile.js`**: A **GasFree** demo on **Nile** for sending a TRC20 token using `@tetherto/wdk-wallet-tron-gasfree`.

---

## Requirements

- **Node.js 20+** (recommended)  

- **npm**

---

## Install

1. Install dependencies:

```bash
npm install
```

2. Create your `.env` file from the sample:

```bash
cp .env.sample .env
```

3. Edit `.env` and set your values.

---

## Environment variables

### Common (Shasta / `cli.js`)

- `SEED_PHRASE`  
  The seed phrase for your test wallet (account index `0` is used).

- `TRON_PROVIDER`  
  Shasta provider URL. Example:

  - `https://api.shasta.trongrid.io`

- `TRANSFER_MAX_FEE_SUN` (optional)  
  Max fee cap for transfers (in **sun**).  
  Reminder: **1 TRX = 1,000,000 sun**.

Example from `.env.sample`:

```env
SEED_PHRASE="seed_phrase goes_here"
TRON_PROVIDER="https://api.shasta.trongrid.io"
TRANSFER_MAX_FEE_SUN=9000000
```

### GasFree Nile (`gasfree-nile.js`)

Required:

- `GASFREE_NILE_API_KEY`
- `GASFREE_NILE_API_SECRET`

Example from `.env.sample`:

```env
GASFREE_NILE_API_KEY="gasfree_nile_api_key_goes_here"
GASFREE_NILE_API_SECRET="gasfree_nile_api_secret_goes_here"
```

To get your API key and secret, use the GasFree dashboard:  
https://developer.gasfree.io/dashboard

Optional overrides (only if you need them):

- `GASFREE_NILE_PROVIDER` (default: `https://open-test.gasfree.io/nile`)
- `GASFREE_NILE_RPC` (default: `https://nile.trongrid.io`)
- `GASFREE_NILE_CHAIN_ID` (default: `3448148188`)
- `GASFREE_NILE_VERIFYING_CONTRACT` (default: `THQGuFzL87ZqhxkgqYEryRAd7gqFqL5rdc`)
- `GASFREE_NILE_SERVICE_PROVIDER` (if not set, the script fetches the provider list and uses the first one)

---

## Project files

- `cli.js`  
  Shasta CLI using `@tetherto/wdk-wallet-tron`.

- `gasfree-nile.js`  
  Nile GasFree transfer CLI using `@tetherto/wdk-wallet-tron-gasfree`.

- `package.json`  
  Uses ESM (`"type": "module"`) and runs `cli.js` via `npm start`.

- `.env.sample`  
  Template for environment variables.

---

## How to run `cli.js` (Shasta)

`package.json` includes:

```json
"scripts": {
  "start": "node cli.js"
}
```

So you can run commands like this:

```bash
npm start -- <command> [args...]
```

### 1) Show address

```bash
npm start -- address
```

### 2) Show TRX balance

```bash
npm start -- balance
```

This prints:

- TRX balance as a human string (e.g., `1.23 TRX`)
- TRX balance in **sun** (integer)

### 3) Quote a TRX transfer fee (estimate)

```bash
npm start -- quote-trx <toAddress> <trxAmount>
```

Example:

```bash
npm start -- quote-trx TQGfKPHs3AwiBT44ibkCU64u1G4ttojUXU 0.01
```

### 4) Send TRX

```bash
npm start -- send-trx <toAddress> <trxAmount>
```

Example:

```bash
npm start -- send-trx TQGfKPHs3AwiBT44ibkCU64u1G4ttojUXU 0.01
```

### 5) Get TRC20 token balance

```bash
npm start -- token-balance [tokenAddress]
```

If you do not pass `tokenAddress`, it uses:

- `DEFAULT_TRC20_TOKEN` from `.env` if set, otherwise
- Shasta USDT example contract: `TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs`

Example:

```bash
npm start -- token-balance
```

### 6) Quote a TRC20 transfer fee (estimate)

```bash
npm start -- quote-token <tokenAddress> <toAddress> <tokenAmountBase>
```

Important: `tokenAmountBase` must be an **integer in base units**.  
For example, if a token has **6 decimals**, then:

- `1.0 token` = `1_000_000` base units

Example:

```bash
npm start -- quote-token TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs TQGfKPHs3AwiBT44ibkCU64u1G4ttojUXU 1000000
```

### 7) Send a TRC20 transfer

```bash
npm start -- send-token <tokenAddress> <toAddress> <tokenAmountBase>
```

Example:

```bash
npm start -- send-token TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs TQGfKPHs3AwiBT44ibkCU64u1G4ttojUXU 1000000
```

### 8) Sign and verify a message

Sign:

```bash
npm start -- sign "hello shasta"
```

Verify:

```bash
npm start -- verify "hello shasta" "<signature>"
```

Example:

```bash
npm start -- verify "hello shasta" "0x60a7faea867ca62af25c6494c4b0452cb56847229c77ec996288657c2d86fb6f0d81c7613f4ae6c6d7de244885f451a2743c14fa4b923c94881b41f8c35a41501c"
```

---

## How to run `gasfree-nile.js` (Nile GasFree)

Run it directly with Node:

```bash
node gasfree-nile.js <recipient> <amountBase> [tokenContract] [maxFee]
```

Arguments:

- `recipient`  
  A TRON address like `T...`

- `amountBase`  
  Token amount in **base units** (integer)

- `tokenContract` (optional)  
  TRC20 token contract address. If not provided, it uses the default Nile token:

  - `TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf`

- `maxFee` (optional)  
  Max fee in **raw units** (integer). If provided, the script refuses to send if the required fee is higher than this value.

Example (from testing):

```bash
node gasfree-nile.js TQGfKPHs3AwiBT44ibkCU64u1G4ttojUXU 5000000
```

### What the script does

1. Loads your wallet from `SEED_PHRASE` (account index `0`).
2. Fetches your GasFree account status (active / allow_submit).
3. Finds the token fee configuration (transfer fee + activation fee if needed).
4. Computes the required fee:
   - `requiredFee = transferFee + (active ? 0 : activateFee)`
5. Checks your token balance is enough for:
   - `amountBase + signedMaxFee`
6. Sends the transfer using WDK GasFree.

---

## Common troubleshooting

### “Invalid recipient TRON address”
The script checks that addresses look like a TRON base58 address:
- It must start with `T`
- It must be 34 characters long

Make sure you copied the address correctly.

### “Insufficient token balance”
For GasFree, the script requires:
- `token balance >= amountBase + fee`

So you need enough tokens for both:
- the transfer amount
- the GasFree fee

### “The transfer operation exceeds the transfer max fee.”
You passed `maxFee` but the required fee is higher.  
Increase `maxFee` or run without it.

### “GasFree API error (...)”
This usually means:
- your API key/secret are wrong, or
- your GasFree account is not active/approved, or
- the endpoint changed, or
- the token is not supported by that provider.

---

## Safety notes

- Do not commit your real seed phrase or API secret.
- Use test wallets and test funds on Shasta/Nile for demos.
- Always run `quote-trx` / `quote-token` before sending if you want a fee estimate.

---

## Commands used during testing

Shasta:

```bash
npm start -- address
npm start -- balance
npm start -- send-trx TQGfKPHs3AwiBT44ibkCU64u1G4ttojUXU 0.01
npm start -- sign "hello shasta"
npm start -- verify "hello shasta" "0x60a7faea867ca62af25c6494c4b0452cb56847229c77ec996288657c2d86fb6f0d81c7613f4ae6c6d7de244885f451a2743c14fa4b923c94881b41f8c35a41501c"
npm start -- token-balance

npm start -- quote-token TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs TQGfKPHs3AwiBT44ibkCU64u1G4ttojUXU 1000000
npm start -- send-token  TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs TQGfKPHs3AwiBT44ibkCU64u1G4ttojUXU 1000000
```

Nile GasFree:

```bash
node gasfree-nile.js TQGfKPHs3AwiBT44ibkCU64u1G4ttojUXU 5000000
```
