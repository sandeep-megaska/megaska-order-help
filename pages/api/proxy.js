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
      cancelledAt
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

    if (order.cancelledAt) {
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

async function exchangeRequest(req, res) {
  let orderId = req.query.order_id;
  const customerEmail = req.query.customer_email;
  const lineItemId = req.query.line_item_id;
  const newSize = (req.query.new_size || "").trim();
  const reason = (req.query.reason || "").trim();

  if (!orderId) {
    res.status(400).json({ ok: false, error: "order_id is required" });
    return;
  }
  if (!customerEmail) {
    res.status(400).json({ ok: false, error: "customer_email is required" });
    return;
  }
  if (!lineItemId) {
    res.status(400).json({ ok: false, error: "line_item_id is required" });
    return;
  }
  if (!newSize) {
    res.status(400).json({ ok: false, error: "new_size is required" });
    return;
  }

  // If numeric order id, convert to GID as we do for cancel
  if (/^\d+$/.test(orderId)) {
    orderId = `gid://shopify/Order/${orderId}`;
  }

  console.log("DEBUG_EXCHANGE_INPUT", {
    orderId,
    customerEmail,
    lineItemId,
    newSize,
    reason,
  });

  // 1) Fetch order details to verify ownership & eligibility
  const getOrderQuery = `
    query getOrderForExchange($id: ID!) {
      order(id: $id) {
        id
        name
        email
        customer {
          email
        }
        cancelledAt
        displayFulfillmentStatus
        tags
        note
        lineItems(first: 50) {
          edges {
            node {
              id
              name
              sku
              variantTitle
              quantity
            }
          }
        }
      }
    }
  `;

  try {
    const orderData = await shopifyGraphQL(getOrderQuery, { id: orderId });
    const order = orderData?.order;

    if (!order) {
      res.status(404).json({ ok: false, error: "Order not found." });
      return;
    }

    // Verify customer ownership
    const orderEmail = order.customer?.email || order.email || "";
    if (!orderEmail || orderEmail.toLowerCase() !== customerEmail.toLowerCase()) {
      res.status(403).json({
        ok: false,
        error: "You are not allowed to request an exchange for this order.",
      });
      return;
    }

    // Already cancelled?
    if (order.cancelledAt) {
      res.status(400).json({
        ok: false,
        error: "This order is cancelled and not eligible for exchange.",
      });
      return;
    }

    // Check fulfillment status (must be FULFILLED to allow exchange)
    if (order.displayFulfillmentStatus !== "FULFILLED") {
      res.status(400).json({
        ok: false,
        error:
          "This order is not yet delivered/fulfilled and is not eligible for exchange. Please try again after delivery.",
      });
      return;
    }

    // Check if exchange has already been requested
    const tags = order.tags || [];
    if (tags.includes("exchange-request")) {
      res.status(400).json({
        ok: false,
        error: "An exchange request has already been submitted for this order.",
      });
      return;
    }

    // Find the line item being exchanged
    const edges = order.lineItems?.edges || [];
    const line = edges.find((e) => e.node.id === lineItemId);
    if (!line) {
      res.status(400).json({
        ok: false,
        error: "The selected item was not found in this order.",
      });
      return;
    }

    const li = line.node;

    // Build a nice note line
    let noteLine = `[EXCHANGE REQUEST] Product: ${li.name}`;
    if (li.variantTitle) noteLine += ` (${li.variantTitle})`;
    if (li.sku) noteLine += ` | SKU: ${li.sku}`;
    noteLine += ` → New size requested: ${newSize}.`;
    if (reason) noteLine += ` Reason: ${reason}`;

    const existingNote = order.note || "";
    const newNote =
      existingNote && existingNote.trim().length > 0
        ? `${existingNote}\n\n${noteLine}`
        : noteLine;

    const newTags = [...tags, "exchange-request"];

    // 2) Update the order with note + tag
    const updateMutation = `
      mutation markExchangeRequested($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
            tags
            note
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const updateData = await shopifyGraphQL(updateMutation, {
      input: {
        id: orderId,
        tags: newTags,
        note: newNote,
      },
    });

    const updatePayload = updateData?.orderUpdate;
    const userErrors = updatePayload?.userErrors || [];
    if (userErrors.length > 0) {
      console.error("EXCHANGE_ORDER_UPDATE_ERRORS", userErrors);
      res.status(400).json({
        ok: false,
        error: userErrors[0].message || "Could not save exchange request.",
        errors: userErrors,
      });
      return;
    }

    res.status(200).json({
      ok: true,
      message: "Your size exchange request has been submitted.",
    });
  } catch (err) {
    console.error("EXCHANGE_FATAL_ERROR", err);
    res.status(500).json({
      ok: false,
      error: err.message || "Unexpected error while submitting exchange request.",
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
if (action === "exchangeRequest") {
    await exchangeRequest(req, res);
    return;
  }

  // default ping
  res.status(200).json({
    ok: true,
    message: "Megaska App Proxy (ping)",
    action,
  });
}

