// pages/api/debug-products.js

const STORE_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;   // e.g. megaska.myshopify.com
const ADMIN_TOKEN  = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION  = process.env.SHOPIFY_API_VERSION || "2024-04";

async function shopifyGraphQL(query, variables = {}) {
  const res = await fetch(`https://${STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`Non-JSON response: ${text}`);
  }

  if (!res.ok) {
    throw new Error(`Shopify API error: ${res.status} ${text}`);
  }
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

export default async function handler(req, res) {
  if (!STORE_DOMAIN || !ADMIN_TOKEN) {
    return res.status(500).json({
      ok: false,
      error: "SHOPIFY_SHOP_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN not set",
    });
  }

  try {
    const query = `
      {
        products(first: 5) {
          edges {
            node {
              id
              title
              status
              totalInventory
            }
          }
        }
      }
    `;

    const data = await shopifyGraphQL(query);

    return res.status(200).json({
      ok: true,
      domain: STORE_DOMAIN,
      productsCount: data.products.edges.length,
      products: data.products.edges.map(e => e.node),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
