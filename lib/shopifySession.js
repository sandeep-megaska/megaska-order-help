// lib/shopifySession.js
import createApp from "@shopify/app-bridge";
import { getSessionToken } from "@shopify/app-bridge-utils";

/**
 * Get Shopify session JWT for the current embedded admin session.
 * Shopify provides `host` in the embedded app URL query string.
 */
export async function getShopifySessionToken(host) {
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY;

  if (!apiKey) throw new Error("Missing NEXT_PUBLIC_SHOPIFY_API_KEY");
  if (!host) throw new Error("Missing host param (open inside Shopify admin)");

  const app = createApp({
    apiKey,
    host,
    forceRedirect: true,
  });

  const token = await getSessionToken(app);
  return token;
}
