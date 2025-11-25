// pages/api/proxy.js
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

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
async function ensureWalletRow(customerEmail, customerId) {
  if (!supabase) {
    throw new Error("Supabase client not initialized");
  }

  // Try to fetch existing row
  let { data: walletRow, error } = await supabase
    .from("megaska_wallets")
    .select("*")
    .eq("customer_email", customerEmail)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows found
    console.error("ENSURE_WALLET_FETCH_ERROR", error);
    throw new Error("Could not fetch wallet");
  }

  if (!walletRow) {
    const { data: newRow, error: insertError } = await supabase
      .from("megaska_wallets")
      .insert({
        customer_email: customerEmail,
        customer_id: customerId || null,
        balance: 0,
      })
      .select()
      .single();

    if (insertError) {
      console.error("ENSURE_WALLET_INSERT_ERROR", insertError);
      throw new Error("Could not create wallet");
    }

    walletRow = newRow;
  }

  return walletRow;
}
async function recordWalletTransaction(customerEmail, type, amount, reason, orderId) {
  if (!supabase) return;

  const numericAmount = Number(amount || 0);
  if (!numericAmount || !["CREDIT", "DEBIT"].includes(type)) return;

  const { error } = await supabase
    .from("megaska_wallet_transactions")
    .insert({
      customer_email: customerEmail,
      type,
      amount: numericAmount,
      reason: reason || null,
      order_id: orderId || null,
    });

  if (error) {
    console.error("WALLET_TXN_INSERT_ERROR", error);
  }
}
async function creditWalletForOrder(order, rawAmount, reason, orderId) {
  if (!supabase) {
    throw new Error("Supabase client not initialized");
  }

  const customerEmail = order.customer?.email || order.email;
  const customerId = order.customer?.id || null;

  if (!customerEmail) {
    throw new Error("Order has no customer email, cannot credit wallet");
  }

  const amount = Number(rawAmount || 0);
  if (!amount || amount <= 0) {
    throw new Error("Invalid amount for wallet credit");
  }

  // Ensure wallet exists
  const walletRow = await ensureWalletRow(customerEmail, customerId);
  const newBalance = Number(walletRow.balance || 0) + amount;

  // Update balance
  const { error: updateError } = await supabase
    .from("megaska_wallets")
    .update({
      balance: newBalance,
      last_updated: new Date().toISOString(),
    })
    .eq("customer_email", customerEmail);

  if (updateError) {
    console.error("WALLET_BALANCE_UPDATE_ERROR", updateError);
    throw new Error("Failed to update wallet balance");
  }

  // Record transaction
  await recordWalletTransaction(customerEmail, "CREDIT", amount, reason, orderId);

  console.log("WALLET_CREDIT_SUCCESS", {
    customerEmail,
    amount,
    newBalance,
    reason,
    orderId,
  });

  // Admin email
  await sendAdminAlert(
    `Megaska Wallet Credit – ₹${amount}`,
    `Wallet credit issued.\n\nCustomer: ${customerEmail}\nAmount: ₹${amount}\nReason: ${reason}\nOrder: ${orderId || order.name || order.id}\nNew Balance: ₹${newBalance}`
  );

  return newBalance;
}
async function getWalletBalanceHandler(req, res) {
  if (!supabase) {
    res.status(500).json({ ok: false, error: "Supabase not configured" });
    return;
  }

  const customerEmail = (req.query.customer_email || "").trim().toLowerCase();

  if (!customerEmail) {
    res.status(400).json({ ok: false, error: "customer_email is required" });
    return;
  }

  try {
    const { data, error } = await supabase
      .from("megaska_wallets")
      .select("balance")
      .eq("customer_email", customerEmail)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("GET_WALLET_BALANCE_ERROR", error);
      res.status(500).json({ ok: false, error: "Failed to fetch wallet balance" });
      return;
    }

    const balance = data ? Number(data.balance || 0) : 0;

    res.status(200).json({
      ok: true,
      email: customerEmail,
      balance,
    });
  } catch (err) {
    console.error("GET_WALLET_BALANCE_FATAL", err);
    res.status(500).json({
      ok: false,
      error: err.message || "Unexpected error fetching wallet balance",
    });
  }
}
async function adminCreditWalletHandler(req, res) {
  const adminToken = process.env.ADMIN_WALLET_TOKEN;
  const providedToken = req.query.admin_token;

  if (!adminToken || !providedToken || adminToken !== providedToken) {
    res.status(403).json({ ok: false, error: "Unauthorized admin access" });
    return;
  }

  const orderRefRaw = (req.query.order_ref || "").trim(); // 👈 instead of order_id
  const amountRaw = req.query.amount;
  const reason = (req.query.reason || "Admin wallet credit").trim();

  if (!orderRefRaw) {
    res.status(400).json({ ok: false, error: "order_ref (order number) is required" });
    return;
  }

  let orderId = null;  // Shopify GID
  let order = null;    // full order object we’ll fill

  try {
    // 🔹 CASE 1: orderRef looks like long numeric ID (e.g. 6302697357448)
    if (/^\d{10,}$/.test(orderRefRaw)) {
      orderId = `gid://shopify/Order/${orderRefRaw}`;

      const orderQueryById = `
        query getOrderById($id: ID!) {
          order(id: $id) {
            id
            name
            email
            customer { id email }
            totalPriceSet { shopMoney { amount currencyCode } }
            paymentGatewayNames
            displayFinancialStatus
            tags
            note
          }
        }
      `;

      const data = await shopifyGraphQL(orderQueryById, { id: orderId });
      order = data?.order;
    } else {
      // 🔹 CASE 2: treat orderRef as Megaska order number, e.g. "521225"
      const orderQueryByName = `
        query getOrderByName($query: String!) {
          orders(first: 1, query: $query) {
            edges {
              node {
                id
                name
                email
                customer { id email }
                totalPriceSet { shopMoney { amount currencyCode } }
                paymentGatewayNames
                displayFinancialStatus
                tags
                note
              }
            }
          }
        }
      `;

      // Shopify search syntax: name:521225
      const search = `name:${orderRefRaw}`;
      const data = await shopifyGraphQL(orderQueryByName, { query: search });

      const node = data?.orders?.edges?.[0]?.node;
      if (node) {
        order = node;
        orderId = node.id;
      }
    }

    if (!order || !orderId) {
      res.status(404).json({ ok: false, error: "Order not found. Check the order number." });
      return;
    }

    const gateways = (order.paymentGatewayNames || []).map(g => (g || "").toLowerCase());
const isCOD = gateways.some(g => g.includes("cod") || g.includes("cash on delivery"));
const financial = order.displayFinancialStatus; // "PAID", "PENDING", "REFUNDED", "VOIDED", ...

if (!isCOD) {
  return res.status(400).json({
    ok: false,
    error: "This order is not a COD order. For prepaid orders, refund via Razorpay.",
  });
}

if (financial === "REFUNDED" || financial === "VOIDED") {
  return res.status(400).json({
    ok: false,
    error: "This COD order has already been refunded/voided in Shopify. Do not issue wallet credit again.",
  });
}

if (financial !== "PAID") {
  return res.status(400).json({
    ok: false,
    error: "This COD order is not marked as PAID yet. Confirm delivery/payment before issuing wallet credit.",
  });
}


    const orderTotal = Number(order.totalPriceSet?.shopMoney?.amount || 0);
    let amount = amountRaw ? Number(amountRaw) : orderTotal;

    if (!amount || amount <= 0) {
      res.status(400).json({ ok: false, error: "Invalid amount for wallet credit" });
      return;
    }

    if (amount > orderTotal) {
      amount = orderTotal;
    }

    const newBalance = await creditWalletForOrder(
      order,
      amount,
      reason,
      order.name || orderId
    );

    // update note + tags (same as before)...
    const existingNote = order.note || "";
    const noteLine = `[WALLET CREDIT] ₹${amount} credited to Megaska Wallet. Reason: ${reason}. New wallet balance: ₹${newBalance}.`;
    const newNote =
      existingNote && existingNote.trim().length > 0
        ? `${existingNote}\n\n${noteLine}`
        : noteLine;

    const existingTags = order.tags || [];
    const newTags = existingTags.includes("wallet-credit")
      ? existingTags
      : [...existingTags, "wallet-credit"];

    const noteMutation = `
      mutation updateOrderWalletNote($input: OrderInput!) {
        orderUpdate(input: $input) {
          order { id }
          userErrors { field message }
        }
      }
    `;

    const updateData = await shopifyGraphQL(noteMutation, {
      input: { id: orderId, note: newNote, tags: newTags },
    });

    const updateErrors = updateData?.orderUpdate?.userErrors || [];
    if (updateErrors.length > 0) {
      console.error("ORDER_NOTE_TAG_UPDATE_ERRORS", updateErrors);
    }

    res.status(200).json({
      ok: true,
      message: `Wallet credited with ₹${amount}. New balance: ₹${newBalance}.`,
      newBalance,
    });
  } catch (err) {
    console.error("ADMIN_CREDIT_WALLET_FATAL", err);
    res.status(500).json({
      ok: false,
      error: err.message || "Unexpected error crediting wallet",
    });
  }
}
async function createWalletDiscountHandler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST required" });
  }

  const customerEmail = (req.query.customer_email || "").trim().toLowerCase();

  if (!customerEmail) {
    return res.status(400).json({ ok: false, error: "customer_email required" });
  }

  // 1. Get wallet balance
  const { data: walletRow, error: walletErr } = await supabase
    .from("megaska_wallets")
    .select("balance")
    .eq("customer_email", customerEmail)
    .single();

  if (walletErr) {
    console.error("WALLET_FETCH_ERROR", walletErr);
    return res.status(500).json({ ok: false, error: "Wallet fetch failed" });
  }

  const balance = Number(walletRow?.balance || 0);
  if (balance <= 0) {
    return res.status(400).json({ ok: false, error: "Zero balance" });
  }

  // 2. Generate unique discount code
  const uniquePart = Math.random().toString(36).substring(2, 7).toUpperCase();
  const code = `MEG-WALLET-${balance}-${uniquePart}`;

  // 3. Create discount code using Shopify API
  const mutation = `
    mutation walletDiscount($input: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $input) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              title
            }
          }
        }
        userErrors { field message }
      }
    }
  `;

  const discountInput = {
    title: code,
    code,
    customerSelection: {
      customerEmails: [customerEmail]
    },
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // expires in 3 days
    usageLimit: 1,
    appliesOncePerCustomer: true,
    value: {
      amount: balance,
      valueType: "FIXED_AMOUNT"
    }
  };

  const resp = await shopifyGraphQL(mutation, { input: discountInput });

  if (resp.discountCodeBasicCreate?.userErrors?.length) {
    console.error("DISCOUNT_CREATE_ERRORS", resp.discountCodeBasicCreate.userErrors);
    return res.status(500).json({ ok: false, error: "Discount creation failed" });
  }

  return res.status(200).json({
    ok: true,
    code
  });
}
// === MEGASKA Body Confidence Quiz → Personalized Product Matching ===

async function quizRecommend(req, res) {
  try {
    const shop = req.query.shop || process.env.SHOPIFY_SHOP;
    if (!shop) {
      res.status(400).json({ ok: false, error: "Missing shop context" });
      return;
    }

    // Read quiz answers from query params
    const shape = (req.query.shape || "").toLowerCase();       // pear, apple, hourglass, rectangle, plus
    const coverage = (req.query.coverage || "").toLowerCase(); // light, moderate, full
    const thighs = (req.query.thighs || "").toLowerCase();     // short, knee, full
    const activity = (req.query.activity || "").toLowerCase(); // casual, lap, aqua, modest
    const style = (req.query.style || "").toLowerCase();       // simple, prints, sporty

    // Build a Shopify product query string based on rules
    // NOTE: You must ensure your products have tags that match these keywords.
    const queryParts = [];

    // Prefer only in-stock + published products
    queryParts.push("status:active");
    queryParts.push("inventory_total:>0");

    // Coverage rule
    if (coverage === "full") {
      // e.g. full-length swimsuits, burkini, high coverage
      queryParts.push("(tag:full-coverage OR tag:burkini OR tag:full-length)");
    } else if (coverage === "moderate") {
      // knee length, dress type
      queryParts.push("(tag:knee-length OR tag:modest OR tag:dress-type)");
    } else if (coverage === "light") {
      // shorter, more open styles (future tankini, etc.)
      queryParts.push("(tag:short-length OR tag:tankini)");
    }

    // Body shape hints (optional; you can adjust tags later)
    if (shape === "pear") {
      queryParts.push("(tag:hip-coverage OR tag:a-line)");
    } else if (shape === "apple") {
      queryParts.push("(tag:tummy-control OR tag:ruched)");
    } else if (shape === "hourglass") {
      queryParts.push("(tag:waist-emphasis OR tag:fit-and-flare)");
    } else if (shape === "plus") {
      queryParts.push("(tag:plus-friendly OR tag:curve-fit)");
    }

    // Thigh coverage
    if (thighs === "full") {
      queryParts.push("(tag:full-leg OR tag:ankle-length)");
    } else if (thighs === "knee") {
      queryParts.push("(tag:knee-length)");
    } else if (thighs === "short") {
      queryParts.push("(tag:above-knee)");
    }

    // Activity
    if (activity === "aqua") {
      queryParts.push("(tag:aqua-aerobics OR tag:performance)");
    } else if (activity === "lap") {
      queryParts.push("(tag:lap-swim OR tag:sport-fit)");
    } else if (activity === "modest") {
      queryParts.push("(tag:burkini OR tag:modest OR tag:full-coverage)");
    } else if (activity === "beach") {
      queryParts.push("(tag:holiday OR tag:vacation)");
    }

    // Style preference
    if (style === "simple") {
      queryParts.push("(tag:solid OR tag:minimal)");
    } else if (style === "prints") {
      queryParts.push("(tag:print OR tag:floral OR tag:pattern)");
    } else if (style === "sporty") {
      queryParts.push("(tag:sporty OR tag:rashguard)");
    }

    // Fallback if query too narrow
    let query = queryParts.join(" AND ");
    if (!query || query.trim().length === 0) {
      // just show active + in-stock swimwear
      query = "product_type:Swimwear AND status:active AND inventory_total:>0";
    }

    console.log("[QUIZ] Shopify product query:", query);

    const gql = `
      query QuizProducts($first: Int!, $query: String!) {
        products(first: $first, query: $query) {
          edges {
            node {
              id
              handle
              title
              onlineStoreUrl
              featuredImage {
                url
                altText
              }
              priceRangeV2 {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
              metafield(namespace: "custom", key: "short_description") {
                value
              }
            }
          }
        }
      }
    `;

    // Use your existing helper for Shopify Admin GraphQL
    const data = await shopifyGraphQL(gql, { first: 8, query });

    const edges = data?.products?.edges || [];
    const products = edges.map(edge => {
      const p = edge.node;
      const price = p.priceRangeV2?.minVariantPrice;
      return {
        id: p.id,
        handle: p.handle,
        title: p.title,
        url: p.onlineStoreUrl || `https://${shop}/products/${p.handle}`,
        image: p.featuredImage?.url || null,
        imageAlt: p.featuredImage?.altText || p.title,
        price: price ? `${price.amount} ${price.currencyCode}` : null,
        shortDescription: p.metafield?.value || "",
      };
    });

    res.status(200).json({
      ok: true,
      query,
      count: products.length,
      products,
    });
  } catch (err) {
    console.error("QUIZ_RECOMMEND_ERROR", err);
    res.status(500).json({
      ok: false,
      error: err.message || "Unexpected error in quizRecommend",
    });
  }
}

// ---- Main handler ----
async function getUpsellOffers(req, res, { shop }) {
  try {
    const { product_id, cart_product_ids, placement } = req.query;

    if (!product_id && !cart_product_ids) {
      return res.status(400).json({
        ok: false,
        error: 'Missing product_id or cart_product_ids',
      });
    }

    let query = supabaseAdmin
      .from('upsell_offers')
      .select('*')
      .eq('shop_domain', shop)
      .eq('status', 'active');

    if (placement === 'pdp') {
      query = query.eq('placement_pdp', true);
    } else if (placement === 'cart') {
      query = query.eq('placement_cart', true);
    }

    if (product_id) {
      const pid = parseInt(product_id, 10);

      // Triggered by single product (PDP)
      query = query.contains('trigger_product_ids', [pid]);
    } else if (cart_product_ids) {
      const ids = cart_product_ids
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => parseInt(x, 10));

      // Any overlap with trigger_product_ids
      query = query.overlaps('trigger_product_ids', ids);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.status(200).json({
      ok: true,
      offers: data || [],
    });
  } catch (err) {
    console.error('getUpsellOffers error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
export default async function handler(req, res) {
  setCORS(res);

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
const shop =
    req.query.shop ||
    process.env.SHOPIFY_SHOP_DOMAIN || // your real env
    process.env.SHOPIFY_SHOP;          // fallback if exists

  if (!shop) {
    console.error("No shop domain found in proxy handler");
    return res.status(500).json({ ok: false, error: "Missing shop domain" });
  }
  const action = req.query.action || "ping";

  console.log("DEBUG_ACTION", action);

  switch (action) {
    case "listOrders":
      return await listOrders(req, res);

    case "cancelOrder":
      return await cancelOrder(req, res);

    case "exchangeRequest":
      return await exchangeRequest(req, res);

    case "defectReport":
      return await defectReport(req, res);

    case "walletPing":
      return await walletPing(req, res);
    case "getWalletBalance":
      return await getWalletBalanceHandler(req, res);

    case "adminCreditWallet":
  return await adminCreditWalletHandler(req, res);
    case "upsellOffers":
      return await getUpsellOffers(req, res, { shop });
case "createWalletDiscount":
  return await createWalletDiscountHandler(req, res);
    case "quizRecommend":
      return await quizRecommend(req, res);

    default:
      return res.status(200).json({
        ok: true,
        message: "Megaska App Proxy (ping)",
        action,
      });
  }
}

