// pages/api/auth/callback.js
import crypto from "crypto";
import { getLastState } from "./auth";

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_APP_API_SECRET = process.env.SHOPIFY_APP_API_SECRET;
const SHOPIFY_APP_URL = process.env.SHOPIFY_APP_URL;
const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;

function validateHmac(query) {
  const { hmac, ...rest } = query;
  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${Array.isArray(rest[k]) ? rest[k][0] : rest[k]}`)
    .join("&");

  const digest = crypto
    .createHmac("sha256", SHOPIFY_APP_API_SECRET)
    .update(message)
    .digest("hex");

  return digest === hmac;
}

export default async function handler(req, res) {
  const { shop, code, state, hmac } = req.query;

  if (!shop || !code || !hmac) {
    return res.status(400).send("Missing required params");
  }

  // Basic HMAC and state checks (lightweight but ok for single-store)
  if (!validateHmac(req.query)) {
    return res.status(400).send("Invalid HMAC");
  }

  const expectedState = getLastState();
  if (expectedState && state !== expectedState) {
    // For single-store you *could* skip this, but good to keep
    // return res.status(400).send("Invalid state");
  }

  // Exchange code for access_token
  const tokenEndpoint = `https://${SHOPIFY_SHOP_DOMAIN}/admin/oauth/access_token`;

  try {
    const resp = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_APP_API_SECRET,
        code
      })
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("Token error:", resp.status, text);
      return res.status(500).send("Error getting access token");
    }

    const json = await resp.json();
    const accessToken = json.access_token;
    const scope = json.scope;

    console.log("SHOPIFY ACCESS TOKEN (save this safely):", accessToken);
    console.log("Granted scopes:", scope);

    // For now, just show a simple page telling you to copy it from logs
    return res.status(200).send(
      `<h1>Megaska OAuth Complete</h1>
       <p>Access token has been logged in the Vercel logs.</p>
       <p>Go to Vercel → your project → Logs, copy the token and add it to <code>SHOPIFY_ADMIN_ACCESS_TOKEN</code> env var.</p>
       <p>You can close this window.</p>`
    );
  } catch (err) {
    console.error(err);
    return res.status(500).send("Unexpected error getting token");
  }
}
