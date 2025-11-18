import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// verify Shopify webhook HMAC
function verifyShopifyWebhook(req) {
  const crypto = require("crypto");
  const hmacHeader = req.headers["x-shopify-hmac-sha256"];
  const body = req.rawBody;

  const digest = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET)
    .update(body, "utf8")
    .digest("base64");

  return digest === hmacHeader;
}

export default async function handler(req, res) {
  // Shopify sends raw body
  if (!verifyShopifyWebhook(req)) {
    res.status(401).send("Unauthorized");
    return;
  }

  const payload = JSON.parse(req.body);
  const email = payload.email;
  const discountCodes = payload.discount_codes || [];

  // 1) Detect wallet discount code
  const walletCode = discountCodes.find(dc =>
    dc.code.startsWith("MEG-WALLET-")
  );

  if (!walletCode) {
    return res.status(200).send("No wallet code used");
  }

  const amount = Number(walletCode.amount || 0);
  if (!amount) {
    return res.status(200).send("Invalid wallet amount");
  }

  // 2) Deduct wallet balance
  const { data: walletRow } = await supabase
    .from("megaska_wallets")
    .select("*")
    .eq("customer_email", email)
    .single();

  if (!walletRow) {
    return res.status(200).send("Wallet not found");
  }

  const newBalance = Math.max(0, Number(walletRow.balance) - amount);

  await supabase
    .from("megaska_wallets")
    .update({
      balance: newBalance,
      last_updated: new Date().toISOString()
    })
    .eq("customer_email", email);

  // 3) Add ledger entry
  await supabase
    .from("megaska_wallet_transactions")
    .insert({
      customer_email: email,
      type: "DEBIT",
      amount: amount,
      reason: "Wallet redemption at checkout",
      order_id: payload.order_number
    });

  console.log("WALLET DEBIT SUCCESS", { email, amount, newBalance });

  res.status(200).send("Wallet debited successfully");
}

// Required: capture raw body
export const config = {
  api: {
    bodyParser: false,
  },
};
