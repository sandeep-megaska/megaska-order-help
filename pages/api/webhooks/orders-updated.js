// pages/api/shopify/webhooks/orders-updated.js
import crypto from "crypto";
import nodemailer from "nodemailer";
import supabaseAdmin from "../../../lib/supabaseAdmin"; // service role client

export const config = {
  api: { bodyParser: false }, // IMPORTANT: needed for raw body verification
};

function buffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function verifyShopifyHmac(rawBody, hmacHeader, secret) {
  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader || ""));
}

function extractRequest(order) {
  const note = (order?.note || "").toLowerCase();
  const attrs = Array.isArray(order?.note_attributes) ? order.note_attributes : [];

  // Example: prefer structured note_attributes if your app sets these
  const reqTypeAttr = attrs.find((a) => (a?.name || "").toLowerCase() === "request_type");
  const reqIdAttr = attrs.find((a) => (a?.name || "").toLowerCase() === "request_id");
  const reqMsgAttr = attrs.find((a) => (a?.name || "").toLowerCase() === "request_message");

  const request_type =
    (reqTypeAttr?.value || "").toLowerCase() ||
    (note.includes("exchange") ? "exchange" : note.includes("return") ? "return" : "");

  const request_id = (reqIdAttr?.value || "").trim();
  const request_message =
    (reqMsgAttr?.value || "").trim() ||
    (order?.note || "").trim();

  if (!request_type) return null;

  return { request_type, request_id, request_message };
}

async function sendEmail({ subject, text }) {
  // Use SMTP creds or switch to Resend/Sendgrid if you prefer
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: process.env.NOTIFY_FROM,          // e.g. "Megaska Ops <no-reply@megaska.com>"
    to: process.env.NOTIFY_TO,              // e.g. "support@megaska.com"
    subject,
    text,
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const rawBody = await buffer(req);
  const hmac = req.headers["x-shopify-hmac-sha256"];
  const topic = req.headers["x-shopify-topic"];
  const shop = req.headers["x-shopify-shop-domain"];

  const ok = verifyShopifyHmac(rawBody, hmac, process.env.SHOPIFY_WEBHOOK_SECRET);
  if (!ok) return res.status(401).send("Invalid HMAC");

  // Shopify expects fast 200 responses; but we can still do work quickly here.
  const order = JSON.parse(rawBody.toString("utf8"));

  // Only handle orders/updated
  if (topic !== "orders/updated") return res.status(200).send("Ignored");

  const reqInfo = extractRequest(order);
  if (!reqInfo) return res.status(200).send("No request detected");

  // ---- DEDUPE (important: orders/updated fires a lot) ----
  const orderId = String(order.id);
  const key =
    reqInfo.request_id
      ? `${orderId}:${reqInfo.request_id}`
      : `${orderId}:${crypto.createHash("sha1").update(reqInfo.request_message).digest("hex")}`;

  // store & skip if already notified
  const { data: existing, error: findErr } = await supabaseAdmin
    .from("shopify_order_request_notifications")
    .select("id")
    .eq("dedupe_key", key)
    .maybeSingle();

  if (findErr) console.error(findErr);
  if (existing) return res.status(200).send("Already notified");

  const orderName = order?.name || `#${orderId}`;
  const customerEmail = order?.email || order?.customer?.email || "";
  const customerName =
    [order?.customer?.first_name, order?.customer?.last_name].filter(Boolean).join(" ") ||
    order?.shipping_address?.name ||
    "Customer";

  const subject = `[Order Help] ${reqInfo.request_type.toUpperCase()} request - ${orderName}`;
  const text = [
    `Shop: ${shop}`,
    `Order: ${orderName}`,
    `Customer: ${customerName}`,
    `Customer Email: ${customerEmail}`,
    `Request Type: ${reqInfo.request_type}`,
    ``,
    `Message / Note:`,
    reqInfo.request_message,
    ``,
    `Shopify Admin: https://${shop}/admin/orders/${orderId}`,
  ].join("\n");

  await sendEmail({ subject, text });

  // log notification
  const { error: insErr } = await supabaseAdmin
    .from("shopify_order_request_notifications")
    .insert({
      dedupe_key: key,
      shop_domain: shop,
      order_id: orderId,
      order_name: orderName,
      request_type: reqInfo.request_type,
      request_id: reqInfo.request_id || null,
      payload: order,
    });

  if (insErr) console.error(insErr);

  return res.status(200).send("OK");
}
