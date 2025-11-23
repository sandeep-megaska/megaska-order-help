// /pages/api/shopify-sync-discount.ts (Next.js on Vercel)

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!;
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-04";

async function shopifyGraphQL(query: string, variables: any = {}) {
  const res = await fetch(`https://${STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API error: ${res.status} ${text}`);
  }

  const json = await res.json();
  if (json.errors) {
    console.error(json.errors);
    throw new Error("GraphQL errors from Shopify");
  }
  return json.data;
}

function computeDiscountPercent(variants: { price: string; compareAtPrice: string | null }[]) {
  let maxDiscount = 0;

  for (const v of variants) {
    const price = parseFloat(v.price);
    const compareAt = v.compareAtPrice ? parseFloat(v.compareAtPrice) : null;

    if (compareAt && compareAt > price) {
      const d = Math.round(((compareAt - price) / compareAt) * 100);
      if (d > maxDiscount) maxDiscount = d;
    }
  }

  return maxDiscount; // 0 if no discount
}

export default async function handler(req, res) {
  try {
    let cursor: string | null = null;
    let updatedCount = 0;

    const productQuery = `
      query Products($cursor: String) {
        products(first: 50, after: $cursor) {
          edges {
            cursor
            node {
              id
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
              type: "integer",
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
        const variants = product.variants.edges.map(e => e.node);

        const discount = computeDiscountPercent(variants);
        const discountStr = String(discount);

        const upd = await shopifyGraphQL(updateMutation, {
          id: product.id,
          discount: discountStr,
        });

        const errors = upd.productUpdate.userErrors;
        if (errors && errors.length) {
          console.error("Error updating product", product.id, errors);
        } else {
          updatedCount++;
        }
      }

      if (!data.products.pageInfo.hasNextPage) break;
      cursor = edges[edges.length - 1].cursor;
    }

    res.status(200).json({ ok: true, updatedCount });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
}
