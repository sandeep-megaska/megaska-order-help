import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST required" });
  }

  const adminToken = process.env.ADMIN_WALLET_TOKEN;
  const { admin_token, id, status } = req.body || {};

  if (!adminToken || !admin_token || admin_token !== adminToken) {
    return res.status(403).json({ ok: false, error: "Unauthorized" });
  }

  if (!id || !status) {
    return res.status(400).json({ ok: false, error: "id and status required" });
  }

  const next = String(status).toUpperCase();
  const update = { status: next };

  if (next === "DONE") {
    update.handled_at = new Date().toISOString();
  }

  const { error } = await supabaseAdmin
    .from("shopify_order_request_notifications")
    .update(update)
    .eq("id", id);

  if (error) {
    console.error("OPS_INBOX_UPDATE_ERROR", error);
    return res.status(500).json({ ok: false, error: "DB error" });
  }

  return res.status(200).json({ ok: true });
}
