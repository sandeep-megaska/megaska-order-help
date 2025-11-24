// pages/auth/callback.js

export async function getServerSideProps({ query }) {
  const { shop, code } = query;

  if (!shop || !code) {
    return {
      props: { error: "Missing shop or code in callback" },
    };
  }

  const tokenUrl = `https://${shop}/admin/oauth/access_token`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,      // Client ID from Dev Dashboard
      client_secret: process.env.SHOPIFY_API_SECRET, // Secret from Dev Dashboard
      code,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    console.error("❌ Token exchange error:", response.status, data);
    return {
      props: { error: "Error getting access token" },
    };
  }

  // THIS is your permanent Admin API token for this store+app
  console.log("✅ SHOPIFY ACCESS TOKEN:", data.access_token);
  console.log("✅ SHOP:", shop);

  // After copying token into Vercel env, we send user to the app UI
  return {
    redirect: {
      destination: "/admin/wallet", // your existing admin page
      permanent: false,
    },
  };
}

export default function AuthCallbackPage(props) {
  if (props.error) {
    return <div>Auth error: {props.error}</div>;
  }
  return <div>Completing authentication…</div>;
}
