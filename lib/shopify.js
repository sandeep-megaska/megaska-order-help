// lib/shopify.js

export async function callShopifyAdmin({ shop, accessToken, query, variables }) {
  const endpoint = `https://${shop}/admin/api/2025-01/graphql.json`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();

    if (json.errors) {
    console.error("Shopify GraphQL errors:", JSON.stringify(json.errors, null, 2));
    throw new Error(
      "Shopify GraphQL error: " + JSON.stringify(json.errors.map(e => e.message))
    );
  }


  return json.data;
}
