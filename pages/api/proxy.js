// pages/api/proxy.js

const SHOPIFY_ADMIN_ACCESS_TOKEN =
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "";
const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN || "";

// ---- Helper: Shopify Admin GraphQL call ----
async function shopifyGraphQL(query, variables) {
  if (!SHOPIFY_ADMIN_ACCESS_TOKEN || !SHOPIFY_SHOP_DOMAIN) {
    throw new Error("Shopify env vars missing");
  }

  const resp = await fetch(
    `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-04/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_ACCESS_TOKEN
      },
      body: JSON.stringify({
        query: query,
        variables: variables || {}
      })
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error("Shopify API error: " + resp.status + " " + text);
  }

  const json = await resp.json();
  if (json.errors) {
    throw new Error("Shopify GraphQL errors");
  }
  return json.data;
}

// ---- List orders for logged-in customer ----
async function listOrders(req, res) {
  const customerEmail = req.query.customer_email;
  const customerPhone = req.query.customer_phone;

  if (!customerEmail && !customerPhone) {
    res.status(400).json({
      error: "customer_email or customer_phone is required"
    });
    return;
  }

  const filter = customerEmail
    ? `email:${customerEmail}`
    : `phone:${customerPhone}`;

  const query = `
    {
      orders(first: 10, query: "${filter}") {
        edges {
          node {
            id
            name
            createdAt
            displayFulfillmentStatus
            displayFinancialStatus
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
  `;

  try {
    const data = await shopifyGraphQL(query);
    const edges = data.orders?.edges || [];
    const orders = edges.map((e) => e.node);

    res.status(200).json({ ok: true, orders });
  } catch (err) {
    res.status(500).json({ error: err.message || "Error listing orders" });
  }
}

// ---- Main handler ----
export default async function handler(req, res) {
  const action = req.query.action || "ping";

  if (action === "listOrders") {
    await listOrders(req, res);
    return;
  }

  // default response
  res.status(200).json({
    ok: true,
    message: "Megaska App Proxy (Phase 2)",
    action
  });
}
