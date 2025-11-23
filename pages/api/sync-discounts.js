// pages/api/sync-discounts.js

const STORE_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;   // e.g. bigonbuy-fashions.myshopify.com
const ADMIN_TOKEN  = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN; // Admin API access token
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
    throw new Error(`Non-JSON response from Shopify: ${text}`);
  }

  if (!res.ok) {
    throw new Error(`Shopify API error: ${res.status} ${text}`);
  }
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

function computeDiscountPercent(variants) {
  let maxDiscount = 0;

  for (const v of variants) {
    const price = parseFloat(v.price);
    const compareAt = v.compareAtPrice ? parseFloat(v.compareAtPrice) : null;

    if (compareAt && compareAt > price) {
      const d = Math.round(((compareAt - price) / compareAt) * 100);
      if (d > maxDiscount) maxDiscount = d;
    }
  }

  return maxDiscount; // 0 if no valid discount
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Use GET" });
  }

  if (!STORE_DOMAIN || !ADMIN_TOKEN) {
    return res.status(500).json({
      ok: false,
      error: "SHOPIFY_SHOP_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN not set",
    });
  }

  try {
    let cursor = null;
    let totalProducts = 0;
    let updatedCount = 0;
    const errorDetails = [];

    const productQuery = `
      query Products($cursor: String) {
        products(first: 50, after: $cursor) {
          edges {
            cursor
            node {
              id
              title
              variants(first: 100) {
                edges {
                  node {
                    price
                    compareAtPrice
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    `;

    const updateMutation = `
      mutation UpdateProductDiscount($id: ID!, $discount: String!) {
        productUpdate(input: {
          id: $id,
          metafields: [
            {
              namespace: "custom",
              key: "discount_percent",
              type: "number_integer",
              value: $discount
            }
          ]
        }) {
          product { id }
          userErrors { field message }
        }
      }
    `;

    while (true) {
      const data = await shopifyGraphQL(productQuery, { cursor });
      const edges = data.products.edges;

      if (!edges.length) break;

      for (const edge of edges) {
        const product = edge.node;
        totalProducts++;

        const variants = product.variants.edges.map(e => e.node);
        const discount = computeDiscountPercent(variants);

        const upd = await shopifyGraphQL(updateMutation, {
          id: product.id,
          discount: String(discount),
        });

        const userErrors = upd.productUpdate.userErrors || [];
        if (userErrors.length > 0) {
          errorDetails.push({
            productId: product.id,
            title: product.title,
            discount,
            userErrors,
          });
        } else {
          updatedCount++;
        }
      }

      if (!data.products.pageInfo.hasNextPage) break;
      cursor = edges[edges.length - 1].cursor;
    }

    return res.status(200).json({
      ok: true,
      domain: STORE_DOMAIN,
      totalProducts,
      updatedCount,
      errorCount: errorDetails.length,
      sampleErrors: errorDetails.slice(0, 5),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
