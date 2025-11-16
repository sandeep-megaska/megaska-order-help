// pages/api/auth.js
import crypto from "crypto";

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_APP_API_SECRET = process.env.SHOPIFY_APP_API_SECRET;
const SHOPIFY_SCOPES = process.env.SHOPIFY_SCOPES || "";
const SHOPIFY_APP_URL = process.env.SHOPIFY_APP_URL;
const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;

// Very simple in-memory state for demo (okay for single-store private app)
let lastState = null;

export default function handler(req, res) {
  const shop = SHOPIFY_SHOP_DOMAIN;
  if (!shop) {
    return res.status(500).send("SHOPIFY_SHOP_DOMAIN not set");
  }

  const state = crypto.randomBytes(16).toString("hex");
  lastState = state;

  const redirectUri = `${SHOPIFY_APP_URL}/api/auth/callback`;

  const installUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${SHOPIFY_API_KEY}` +
    `&scope=${encodeURIComponent(SHOPIFY_SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  return res.redirect(installUrl);
}

export function getLastState() {
  return lastState;
}
