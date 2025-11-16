// pages/api/proxy.js
import crypto from "crypto";

const SHOPIFY_APP_API_SECRET = process.env.SHOPIFY_APP_API_SECRET || "";
const SHOPIFY_ADMIN_ACCESS_TOKEN =
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "";
const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN || "";

// --- Optional: keep this for later if you want strict HMAC ---
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
        return key + "=" + value.join(",");
      }
      return key + "=" + (value == null ? "" : value);
    })
    .join("");

  const digest = crypto
    .createHmac("sha256", secret)
    .update(sorted)
    .digest("hex");

  return digest === signature;
}

// ---- Helper to call Shopify Admin GraphQL ----
async function shopifyGraphQL(query, variables) {
  if (!SHOPIFY_ADMIN_ACCESS_TOKEN || !SHOPIFY_SHOP_DOMAIN) {
    throw new Error("Shopify env vars missing");
  }

  const resp = await fetch(
    "https://" +
      SHOPIFY_SHOP_DOMAIN +
      "/admin/api/2024-04/graphql.json",
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
    console.error(json.errors);
    throw new Error("Shopify GraphQL errors");
  }
  return json.data;
}

// ---- LIST ORDERS FOR CUSTOMER ----
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
    ? "email:" + customerEmail
    : "phone:" + customerPhone;

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
            lineItems(first: 10) {
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
    const data = await shopifyGraphQL(query, {});
    const edges = data && data.orders && data.orders.edges
      ? data.orders.edges
      : [];
    const orders = edges.map(function (e) {
      return e.node;
    });

    res.status(200).json({ ok: true, orders: orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message || "Error listing orders"
    });
  }
}

// ---- CANCEL ORDER (IF UNFULFILLED) ----
async function requestCancel(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  let body = {};
  try {
    body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};
  } catch (e) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  const orderId = body.orderId;
  if (!orderId) {
    res.status(400).json({ error: "orderId is required" });
    return;
  }

  const getOrderQuery = `
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
    const data = await shopifyGraphQL(getOrderQuery, { id: orderId });
    const order = data && data.order ? data.order : null;

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (order.displayFulfillmentStatus !== "UNFULFILLED") {
      res.status(400).json({
        error:
          "Order already processed or shipped. Cancellation not allowed."
      });
      return;
    }

    const cancelMutation = `
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

    const result = await shopifyGraphQL(cancelMutation, { id: orderId });
    const payload = result && result.orderCancel
      ? result.orderCancel
      : null;
    const userErrors = payload && payload.userErrors
      ? payload.userErrors
      : [];

    if (userErrors.length > 0) {
      res.status(400).json({ error: userErrors[0].message });
      return;
    }

    res.status(200).json({
      ok: true,
      message: "Order cancellation initiated.",
      order: payload.order
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message || "Error cancelling order"
    });
  }
}

// ---- MAIN HANDLER ----
export default async function handler(req, res) {
  // For now, do NOT enforce proxy signature (to avoid blocking MVP)
  // When ready, you can change this to true and use verifyShopifyProxy.
  const enforceSignature = false;
  if (enforceSignature && !verifyShopifyProxy(req)) {
    res.status(401).json({ error: "Invalid Shopify proxy signature" });
    return;
  }

  const action = req.query.action || "ping";

  if (action === "listOrders") {
    await listOrders(req, res);
    return;
  }

  if (action === "requestCancel") {
    await requestCancel(req, res);
    return;
  }

  res.status(200).json({
    ok: true,
    message: "Megaska App Proxy is alive.",
    action: action
  });
}
