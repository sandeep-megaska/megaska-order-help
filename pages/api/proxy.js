import crypto from "crypto";

const SHOPIFY_APP_API_SECRET = process.env.SHOPIFY_APP_API_SECRET || "";
const SHOPIFY_ADMIN_ACCESS_TOKEN =
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "";
const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN || "";

// --- (optional) keep this for later if we want to re-enable HMAC ---
function verifyShopifyProxy(req) {
  const secret = SHOPIFY_APP_API_SECRET;
  if (!secret) return false;

  const params = { ...req.query };

  const signature = params.signature;
  if (!signature || Array.isArray(signature)) return false;

  delete params.signature;

  const sorted = Object.keys(params)
    .sort()
    .map((key) => {
      const value = params[key];
      if (Array.isArray(value)) {
        return `${key}=${value.join(",")}`;
      }
      return `${key}=${value ?? ""}`;
    })
    .join("");

  const digest = crypto
    .createHmac("sha256", secret)
    .update(sorted)
    .digest("hex");

  return digest === signature;
}

// Simple Shopify GraphQL helper
async function shopifyGraphQL(query, variables = {}) {
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
      body: JSON.stringify({ query, variables })
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Shopify API error: ${resp.status} ${text}`);
  }

  const json = await resp.json();
  if (json.errors) {
    console.error(json.errors);
    throw new Error("Shopify GraphQL errors");
  }
  return json.data;
}

// ---------- LIST ORDERS ----------
async function listOrders(req, res) {
  const customerEmail = req.query.customer_email;
  const customerPhone = req.query.customer_phone;

  if (!customerEmail && !customerPhone) {
    return res.status(400).json({
      error: "customer_email or customer_phone is required"
    });
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
            lineItems(first: 20) {
              edges {
                node {
                  id
                  title
                  quantity
                  variant {
                    id
                    title
                    sku
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const data = await shopifyGraphQL(query);
    const orders = (data.orders?.edges || []).map((e) => e.node);
    return res.status(200).json({ ok: true, orders });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: err.message || "Error listing orders" });
  }
}

// ---------- CANCEL ORDER ----------
async function requestCancel(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { orderId } = body;
  if (!orderId) {
    return res.status(400).json({ error: "orderId is required" });
  }

  const query = `
    query($id: ID!) {
      order(id: $id) {
        id
        name
        displayFulfillmentStatus
        displayFinancialStatus
      }
    }
  `;

  try {
    const data = await shopifyGraphQL(query, { id: orderId });
    const order = data.order;
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.displayFulfillmentStatus !== "UNFULFILLED") {
      return res.status(400).json({
        error: "Order already processed or shipped. Cancellation not allowed."
      });
    }

    const mutation = `
      mutation cancelOrder($id: ID!) {
        orderCancel(input: { id: $id }) {
          order {
            id
            name
            canceledAt
            cancelReason
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const result = await shopifyGraphQL(mutation, { id: orderId });
    const cancelResult = result.orderCancel;
    const userErrors = cancelResult.userErrors || [];

    if (userErrors.length) {
      return res.status(400).json({ error: userErrors[0].message });
    }

    return res.status(200).json({
      ok: true,
      message: "Order cancellation initiated.",
      order: cancelResult.order
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: err.message || "Error cancelling order" });
  }
}

// ---------- MAIN HANDLER ----------
export default async function handler(req, res) {
  // TEMPORARILY DISABLE SIGNATURE CHECK FOR MVP
  // const enforceSignature = true;
  // if (enforceSignature && !verifyShopifyProxy(req)) {
  //   return res.status(401).json({ error: "Invalid Shopify proxy signature" });
  // }

  const action = req.query.action || "ping";

  if (action === "listOrders") {
    return listOrde
