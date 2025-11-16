import crypto from "crypto";

const SHOPIFY_APP_API_SECRET = process.env.SHOPIFY_APP_API_SECRET || "";

function verifyShopifyProxy(req) {
  const { signature, ...rest } = req.query;

  if (!signature || Array.isArray(signature)) return false;

  const sorted = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("");

  const digest = crypto
    .createHmac("sha256", SHOPIFY_APP_API_SECRET)
    .update(sorted)
    .digest("hex");

  return digest === signature;
}

export default function handler(req, res) {
  if (!verifyShopifyProxy(req)) {
    return res.status(401).json({ error: "Invalid Shopify proxy signature" });
  }

  // For now just a test response. We'll add order logic later.
  return res.status(200).json({
    ok: true,
    message: "Megaska App Proxy is working.",
    query: req.query
  });
}
