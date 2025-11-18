// pages/api/proxy.js
import { createClient } from "@supabase/supabase-js";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
} else {
  console.warn("Supabase env vars missing: SUPABASE_URL or SUPABASE_SERVICE_KEY");
}



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
async function sendAdminAlert(subject, text) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_ALERT_EMAIL;
  const from = process.env.ALERT_FROM_EMAIL || "Megaska Order Bot <noreply@megaska.com>";

  if (!apiKey || !to) {
    console.log("ADMIN_ALERT_SKIPPED", { reason: "missing env", subject });
    return;
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error("ADMIN_ALERT_FAILED", resp.status, body);
    }
  } catch (err) {
    console.error("ADMIN_ALERT_ERROR", err);
  }
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
    await sendAdminAlert(
      `Megaska: Order cancellation request – ${orderId}`,
      `A customer has requested cancellation.\n\nOrder ID: ${orderId}\nCustomer email: ${customerEmail}\nJob ID: ${payload.job?.id || "n/a"}`
    );

    
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
          await sendAdminAlert(
      `Megaska: Size exchange request – ${order.name || orderId}`,
      `A customer has requested a size exchange.\n\nOrder: ${order.name || orderId}\nCustomer email: ${customerEmail}\nProduct: ${li.name}${li.variantTitle ? " (" + li.variantTitle + ")" : ""}\nSKU: ${li.sku || "-"}\nNew size requested: ${newSize}\nReason: ${reason || "not provided"}`
    );

    res.status(200).json({
      ok: true,
      message: "Your size exchange request has been submitted.",
    });

      res.status(400).json({
        ok: false,
        error: "An exchange request has already been submitted for this order.",
      });
      return;
    }

    // Find the line item being exchanged
    // Find the line item being exchanged
const edges = order.lineItems?.edges || [];
const line = edges.find((e) => {
  const nodeId = e?.node?.id;
  if (!nodeId) return false;

  // Exact match (GID)
  if (nodeId === lineItemId) return true;

  // If frontend sent numeric ID from Liquid, match by suffix
  if (/^\d+$/.test(lineItemId)) {
    return nodeId.endsWith(`/${lineItemId}`);
  }

  return false;
});

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
await sendAdminAlert(
      `Megaska: Size exchange request – ${order.name || orderId}`,
      `A customer has requested a size exchange.\n\nOrder: ${order.name || orderId}\nCustomer email: ${customerEmail}\nProduct: ${li.name}${li.variantTitle ? " (" + li.variantTitle + ")" : ""}\nSKU: ${li.sku || "-"}\nNew size requested: ${newSize}\nReason: ${reason || "not provided"}`
    );
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

async function defectReport(req, res) {
  let orderId = req.query.order_id;
  const customerEmail = req.query.customer_email;
  const lineItemId = req.query.line_item_id;
  const issueType = (req.query.issue_type || "").trim();
  const description = (req.query.description || "").trim();

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
  if (!issueType) {
    res.status(400).json({ ok: false, error: "issue_type is required" });
    return;
  }

  // Numeric → GID
  if (/^\d+$/.test(orderId)) {
    orderId = `gid://shopify/Order/${orderId}`;
  }

  console.log("DEBUG_DEFECT_INPUT", {
    orderId,
    customerEmail,
    lineItemId,
    issueType,
    description,
  });

  const getOrderQuery = `
    query getOrderForDefect($id: ID!) {
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

    const orderEmail = order.customer?.email || order.email || "";
    if (!orderEmail || orderEmail.toLowerCase() !== customerEmail.toLowerCase()) {
      res.status(403).json({
        ok: false,
        error: "You are not allowed to report an issue for this order.",
      });
      return;
    }

    if (order.cancelledAt) {
      res.status(400).json({
        ok: false,
        error: "This order is cancelled and not eligible for issue reporting.",
      });
      return;
    }

    if (order.displayFulfillmentStatus !== "FULFILLED") {
      res.status(400).json({
        ok: false,
        error:
          "This order is not marked as delivered/fulfilled yet. Please report issues after delivery.",
      });
      return;
    }

    const tags = order.tags || [];
    if (tags.includes("quality-issue")) {
      res.status(400).json({
        ok: false,
        error: "A quality issue has already been reported for this order.",
      });
      return;
    }

    const edges = order.lineItems?.edges || [];
    const line = edges.find((e) => {
      const nodeId = e?.node?.id;
      if (!nodeId) return false;
      if (nodeId === lineItemId) return true;
      if (/^\d+$/.test(lineItemId)) {
        return nodeId.endsWith(`/${lineItemId}`);
      }
      return false;
    });

    if (!line) {
      res.status(400).json({
        ok: false,
        error: "The selected item was not found in this order.",
      });
      return;
    }

    const li = line.node;
    let noteLine = `[QUALITY ISSUE] Product: ${li.name}`;
    if (li.variantTitle) noteLine += ` (${li.variantTitle})`;
    if (li.sku) noteLine += ` | SKU: ${li.sku}`;
    noteLine += ` | Issue: ${issueType}.`;
    if (description) noteLine += ` Details: ${description}`;

    const existingNote = order.note || "";
    const newNote =
      existingNote && existingNote.trim().length > 0
        ? `${existingNote}\n\n${noteLine}`
        : noteLine;

    const newTags = [...tags, "quality-issue"];

    const updateMutation = `
      mutation markQualityIssue($input: OrderInput!) {
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
      console.error("DEFECT_ORDER_UPDATE_ERRORS", userErrors);
      res.status(400).json({
        ok: false,
        error: userErrors[0].message || "Could not save quality issue report.",
        errors: userErrors,
      });
      return;
    }
await sendAdminAlert(
      `Megaska: Quality issue reported – ${order.name || orderId}`,
      `A customer has reported a quality issue.\n\nOrder: ${order.name || orderId}\nCustomer email: ${customerEmail}\nProduct: ${li.name}${li.variantTitle ? " (" + li.variantTitle + ")" : ""}\nSKU: ${li.sku || "-"}\nIssue type: ${issueType}\nDetails: ${description || "not provided"}`
    );
    res.status(200).json({
      ok: true,
      message: "Your quality issue report has been submitted.",
    });
  } catch (err) {
    console.error("DEFECT_FATAL_ERROR", err);
    res.status(500).json({
      ok: false,
      error: err.message || "Unexpected error while submitting quality issue.",
    });
  }
}

async function walletPing(req, res) {
  if (!supabase) {
    res.status(500).json({
      ok: false,
      error: "Supabase client not initialized. Check SUPABASE_URL and SUPABASE_SERVICE_KEY env vars.",
    });
    return;
  }

  try {
    // Try a very simple read on the wallets table
    const { data, error } = await supabase
      .from("megaska_wallets")
      .select("id")
      .limit(1);

    if (error) {
      console.error("WALLET_PING_DB_ERROR", error);
      res.status(500).json({
        ok: false,
        error: "Supabase query failed",
        details: error.message || error,
      });
      return;
    }

    res.status(200).json({
      ok: true,
      message: "Supabase wallet ping OK",
      rowsChecked: data ? data.length : 0,
    });
  } catch (err) {
    console.error("WALLET_PING_FATAL", err);
    res.status(500).json({
      ok: false,
      error: err.message || "Unexpected error during wallet ping",
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
if (action === "defectReport") {
    await defectReport(req, res);
    return;
  }
    if (action === "walletPing") {
  return await walletPing(req, res);
}


  // default ping
  res.status(200).json({
    ok: true,
    message: "Megaska App Proxy (ping)",
    action,
  });
}

