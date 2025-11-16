import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";

const SHOPIFY_APP_API_SECRET = process.env.SHOPIFY_APP_API_SECRET || "";

function verifyShopifyProxy(req: NextApiRequest): boolean {
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!verifyShopifyProxy(req)) {
    return res.status(401).json({ error: "Invalid Shopify proxy signature" });
  }

  // For now just return a test payload – later we will add order lookup, cancel, etc.
  res.status(200).json({
    ok: true,
    message: "Megaska App Proxy is working.",
    query: req.query
  });
}
