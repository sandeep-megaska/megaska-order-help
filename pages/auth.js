// pages/auth.js

export async function getServerSideProps({ req, query }) {
  // Use shop from query if present, otherwise from env
  const shop = query.shop || process.env.SHOPIFY_SHOP_DOMAIN;

  if (!shop) {
    return {
      notFound: true,
    };
  }

  const scopes = process.env.SHOPIFY_SCOPES;
  const redirectUri =
    process.env.SHOPIFY_REDIRECT_URI ||
    `https://${req.headers.host}/auth/callback`;

  const clientId = process.env.SHOPIFY_API_KEY; // from Dev Dashboard

  const installUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${clientId}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  // Redirect the browser to Shopify's permission page
  return {
    redirect: {
      destination: installUrl,
      permanent: false,
    },
  };
}

export default function AuthPage() {
  // This never really renders, we always redirect
  return null;
}
