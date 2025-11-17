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
    throw new Error(JSON.stringify(json.errors));
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

// ---- Cancel order mutation ----
// pages/api/proxy.js  — inside this file

async function cancelOrder(req, res) {
  let orderId = req.query.order_id;

  if (!orderId) {
    res.status(400).json({ ok: false, error: "order_id is required" });
    return;
  }

  // From Shopify app proxy we get a plain numeric ID like 6302697357448
  // Convert to full GID if needed
  if (/^\d+$/.test(orderId)) {
    orderId = `gid://shopify/Order/${orderId}`;
  }

  console.log("DEBUG_FIXED_ORDER_ID", orderId);

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

  try {
    const data = await shopifyGraphQL(mutation, {
      orderId,          // 👈 IMPORTANT: use orderId (GID string), not "id"
      refund: false,    // we’re not auto-refunding
      restock: false,   // we’re not restocking (your policy is exchange only)
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
  const action = req.query.action || "ping";

  if (action === "listOrders") {
    await listOrders(req, res);
    return;
  }

  if (action === "cancelOrder") {
    await cancelOrder(req, res);
    return;
  }

  res.status(200).json({
    ok: true,
    message: "Megaska App Proxy (Phase 3 - Cancel Ready)",
    action
  });
}

