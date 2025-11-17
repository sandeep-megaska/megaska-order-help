// pages/api/proxy.js
function setCORS(res) {
  // For your use-case we don't send cookies, so * is safe.
  // If you want to tighten later, replace * with "https://megaska.com".
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

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
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_ACCESS_TOKEN,
      },
      body: JSON.stringify({
        query,
        variables: variables || {},
      }),
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error("Shopify API error: " + resp.status + " " + text);
  }

  const json = await resp.json();
  if (json.errors) {
    throw new Error(JSON.stringify(json.errors));
  }
  return json.data;
}

// ---- List orders (we already proved this works) ----
async function listOrders(req, res) {
  const customerEmail = req.query.customer_email;
  const customerPhone = req.query.customer_phone;

  if (!customerEmail && !customerPhone) {
    res.status(400).json({
      ok: false,
      error: "customer_email or customer_phone is required",
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
    console.error("LIST_ORDERS_ERROR", err);
    res.status(500).json({ ok: false, error: err.message || "Error listing orders" });
  }
}

// ---- Cancel order ----
async function cancelOrder(req, res) {
  let orderId = req.query.order_id;
  const customerEmail = req.query.customer_email;

  if (!orderId) {
    res.status(400).json({ ok: false, error: "order_id is required" });
    return;
  }
  if (!customerEmail) {
    res.status(400).json({ ok: false, error: "customer_email is required" });
    return;
  }

  // If we get numeric ID, convert to GID
  if (/^\d+$/.test(orderId)) {
    orderId = `gid://shopify/Order/${orderId}`;
  }

  console.log("DEBUG_CANCEL_INPUT", { orderId, customerEmail });

  // 1) Fetch order to verify ownership & status
  const orderQuery = `
    query getOrder($id: ID!) {
      order(id: $id) {
        id
        name
        email
        customer {
          email
        }
        canceledAt
        displayFulfillmentStatus
      }
    }
  `;

  try {
    const orderData = await shopifyGraphQL(orderQuery, { id: orderId });
    const order = orderData?.order;

    if (!order) {
      res.status(404).json({ ok: false, error: "Order not found." });
      return;
    }

    const orderEmail = order.customer?.email || order.email || "";
    if (!orderEmail || orderEmail.toLowerCase() !== customerEmail.toLowerCase()) {
      res.status(403).json({
        ok: false,
        error: "You are not allowed to cancel this order."
      });
      return;
    }

    if (order.canceledAt) {
      res.status(400).json({
        ok: false,
        error: "This order is already cancelled."
      });
      return;
    }

    if (order.displayFulfillmentStatus !== "UNFULFILLED") {
      res.status(400).json({
        ok: false,
        error: "This order has already been processed or shipped and cannot be cancelled."
      });
      return;
    }

    // 2) Run Shopify cancel mutation
    const mutation = `
      mutation cancelOrder(
        $orderId: ID!,
        $refund: Boolean!,
        $restock: Boolean!,
        $reason: OrderCancelReason!
      ) {
        orderCancel(
          orderId: $orderId,
          refund: $refund,
          restock: $restock,
          reason: $reason
        ) {
          job {
            id
            done
          }
          orderCancelUserErrors {
            field
            message
            code
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const data = await shopifyGraphQL(mutation, {
      orderId,
      refund: false,
      restock: false,
      reason: "CUSTOMER"
    });

    if (!data || !data.orderCancel) {
      res.status(500).json({
        ok: false,
        error: "Unexpected response from Shopify (no orderCancel payload)."
      });
      return;
    }

    const payload = data.orderCancel;
    const errors = [
      ...(payload.orderCancelUserErrors || []),
      ...(payload.userErrors || [])
    ];

    if (errors.length > 0) {
      console.error("CANCEL_USER_ERRORS", errors);
      res.status(400).json({
        ok: false,
        error: errors[0].message || "Cancellation not allowed.",
        errors
      });
      return;
    }

    res.status(200).json({
      ok: true,
      job: payload.job
    });
  } catch (err) {
    console.error("CANCEL_FATAL_ERROR", err);
    res.status(500).json({
      ok: false,
      error: err.message || "Unexpected error while cancelling order."
    });
  }
}

// ---- Main handler ----
export default async function handler(req, res) {
  // CORS for all responses
  setCORS(res);

  // Handle preflight (some browsers will send this)
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  const action = req.query.action || "ping";

  if (action === "listOrders") {
    await listOrders(req, res);
    return;
  }

  if (action === "cancelOrder") {
    await cancelOrder(req, res);
    return;
  }

  // default ping
  res.status(200).json({
    ok: true,
    message: "Megaska App Proxy (ping)",
    action,
  });
}

