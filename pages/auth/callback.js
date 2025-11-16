// pages/auth/callback.js
import crypto from "crypto";

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

export async function getServerSideProps(context) {
  const { query } = context;
  const { shop, code, hmac } = query;

  if (!shop || !code || !hmac) {
    return {
      props: {
        error: "Missing required parameters from Shopify."
      }
    };
  }

  if (!validateHmac(query)) {
    return {
      props: {
        error: "Invalid HMAC in callback (security check failed)."
      }
    };
  }

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
      return {
        props: {
          error: "Error getting access token from Shopify. Check logs in Vercel."
        }
      };
    }

    const json = await resp.json();
    const accessToken = json.access_token;
    const scope = json.scope;

    console.log("SHOPIFY ACCESS TOKEN (save this safely):", accessToken);
    console.log("Granted scopes:", scope);

    return {
      props: {
        ok: true
      }
    };
  } catch (err) {
    console.error(err);
    return {
      props: {
        error: "Unexpected error getting token. Check Vercel logs."
      }
    };
  }
}

export default function OAuthCallbackPage({ ok, error }) {
  return (
    <main style={{ padding: 20, fontFamily: "system-ui" }}>
      <h1>Megaska OAuth</h1>
      {error && (
        <>
          <p style={{ color: "red" }}>Error: {error}</p>
          <p>Please check the logs in Vercel for more details.</p>
        </>
      )}
      {ok && (
        <>
          <p>OAuth completed successfully.</p>
          <p>
            The access token has been printed in your Vercel logs. Go to Vercel
            → Project → Logs, copy the token, and store it in the
            <code>SHOPIFY_ADMIN_ACCESS_TOKEN</code> environment variable.
          </p>
        </>
      )}
    </main>
  );
}
