// lib/verifyShopifySessionToken.js
import { jwtVerify, decodeJwt, createRemoteJWKSet } from "jose";

/**
 * Verifies Shopify session token (JWT) sent from App Bridge.
 * Returns { shopDomain, payload } if valid.
 */
export async function verifyShopifySessionToken(token) {
  if (!token) throw new Error("Missing token");

  const apiKey = process.env.SHOPIFY_API_KEY;
  if (!apiKey) throw new Error("Missing SHOPIFY_API_KEY");

  // Decode without verifying first, to locate `iss` (shop) for JWKS URL
  const decoded = decodeJwt(token);

  const iss = decoded?.iss; // like: "https://{shop}/admin"
  if (!iss || typeof iss !== "string") throw new Error("Invalid token: missing iss");

  // Extract shop domain
  // iss: https://bigonbuy-fashions.myshopify.com/admin
  const shopDomain = iss.replace("https://", "").replace("/admin", "");

  // Shopify JWKS endpoint for this shop
  const jwksUrl = new URL(`https://${shopDomain}/admin/oauth/jwks.json`);
  const JWKS = createRemoteJWKSet(jwksUrl);

  // Verify signature + standard claims
  const { payload } = await jwtVerify(token, JWKS, {
    audience: apiKey,     // aud must match app client id
    issuer: iss,          // must match the token issuer
  });

  return { shopDomain, payload };
}

/**
 * Reads Authorization header and verifies the session token.
 */
export async function requireShopifyStaff(req) {
  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1] : null;
  if (!token) throw new Error("Missing Authorization Bearer token");

  return await verifyShopifySessionToken(token);
}
