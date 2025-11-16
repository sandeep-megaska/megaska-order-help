import crypto from "crypto";

const SHOPIFY_APP_API_SECRET = process.env.SHOPIFY_APP_API_SECRET || "";

function verifyShopifyProxy(req) {
  const secret = SHOPIFY_APP_API_SECRET;
  if (!secret) return false;

  // req.query is already decoded by Next.js
  const params = { ...req.query };

  const signature = params.signature;
  if (!signature || Array.isArray(signature)) return false;

  // Remove signature itself from params
  delete params.signature;

  // Some environments add this extra param; Shopify says to ignore it
  if (params["X-ARR-LOG-ID"]) {
    delete params["X-ARR-LOG-ID"];
  }

  // Build the sorted string exactly as Shopify expects
  const sorted = Object.keys(params)
    .sort()
    .map((key) => {
      const value = params[key];
      if (Array.isArray(value)) {
        return `${key}=${value.join(",")}`;
      }
      // treat undefined/null as empty string
      return `${key}=${value ?? ""}`;
    })
    .join("");

  const digest = crypto
    .createHmac("sha256", secret)
    .update(sorted)
    .digest("hex");

  // optional: log once while debugging
  console.log("Proxy verify:", { params, sorted, digest, signature });

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
