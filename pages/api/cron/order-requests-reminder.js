import { supabaseAdmin } from "../../../lib/supabaseAdmin";

async function sendAdminAlert(subject, text) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_ALERT_EMAIL; // set to bigonbuy1@gmail.com
  const from = process.env.ALERT_FROM_EMAIL || "Megaska Order Bot <noreply@megaska.com>";

  if (!apiKey || !to) {
    console.log("ADMIN_ALERT_SKIPPED", { reason: "missing env", subject });
    return;
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    console.error("ADMIN_ALERT_FAILED", resp.status, body);
  }
}

export default async function handler(req, res) {
  // Optional: protect cron endpoint
  const cronKey = process.env.CRON_SECRET;
  if (cronKey && req.query.key !== cronKey) {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }

  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();

  try {
    // 1) Reminders: NEW older than 2h and not reminded in last 2h
    const { data: remindRows, error: remindErr } = await supabaseAdmin
      .from("shopify_order_request_notifications")
      .select("*")
      .eq("status", "NEW")
      .lte("created_at", twoHoursAgo)
      .or(`last_reminded_at.is.null,last_reminded_at.lte.${twoHoursAgo}`)
      .order("created_at", { ascending: true })
      .limit(50);

    if (remindErr) throw remindErr;

    for (const r of remindRows || []) {
      const p = r.payload || {};
      const details =
        r.request_type === "EXCHANGE"
          ? `New size: ${p.new_size || "-"} | SKU: ${p.sku || "-"} | ${p.product_name || ""}`
          : `Issue: ${p.issue_type || "-"} | SKU: ${p.sku || "-"} | ${p.product_name || ""}`;

      await sendAdminAlert(
        `Megaska REMINDER: ${r.request_type} pending – ${r.order_name || r.order_id || ""}`,
        `Pending request (no action yet).\n\nType: ${r.request_type}\nOrder: ${r.order_name || "-"}\nOrder ID: ${r.order_id || "-"}\nCustomer: ${r.customer_email || "-"} | ${r.customer_phone || "-"}\nDetails: ${details}\nCreated: ${r.created_at}\n\nOpen Ops Inbox in Shopify app and mark IN_PROGRESS/DONE.`
      );

      await supabaseAdmin
        .from("shopify_order_request_notifications")
        .update({ last_reminded_at: new Date().toISOString() })
        .eq("id", r.id);
    }

    // 2) Escalations: NEW older than 12h and never escalated
    const { data: escRows, error: escErr } = await supabaseAdmin
      .from("shopify_order_request_notifications")
      .select("*")
      .eq("status", "NEW")
      .lte("created_at", twelveHoursAgo)
      .is("escalated_at", null)
      .order("created_at", { ascending: true })
      .limit(50);

    if (escErr) throw escErr;

    for (const r of escRows || []) {
      const p = r.payload || {};
      const details =
        r.request_type === "EXCHANGE"
          ? `New size: ${p.new_size || "-"} | SKU: ${p.sku || "-"} | ${p.product_name || ""}`
          : `Issue: ${p.issue_type || "-"} | SKU: ${p.sku || "-"} | ${p.product_name || ""}`;

      await sendAdminAlert(
        `Megaska ESCALATION: ${r.request_type} pending 12h – ${r.order_name || r.order_id || ""}`,
        `Escalation: request still NEW after 12 hours.\n\nType: ${r.request_type}\nOrder: ${r.order_name || "-"}\nOrder ID: ${r.order_id || "-"}\nCustomer: ${r.customer_email || "-"} | ${r.customer_phone || "-"}\nDetails: ${details}\nCreated: ${r.created_at}\n\nOpen Ops Inbox in Shopify app and take action immediately.`
      );

      await supabaseAdmin
        .from("shopify_order_request_notifications")
        .update({ escalated_at: new Date().toISOString() })
        .eq("id", r.id);
    }

    return res.status(200).json({
      ok: true,
      reminded: (remindRows || []).length,
      escalated: (escRows || []).length,
    });
  } catch (err) {
    console.error("ORDER_REQUESTS_CRON_FATAL", err);
    return res.status(500).json({ ok: false, error: err.message || "Server error" });
  }
}
