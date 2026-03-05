import { requireShopifyStaff } from "../../../../lib/verifyShopifySessionToken";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  try {
    const { shopDomain } = await requireShopifyStaff(req);

    // optional: ensure shopDomain matches your expected store
    // if (shopDomain !== process.env.SHOPIFY_SHOP_DOMAIN) return res.status(403).json({ ok:false, error:"Wrong shop" });

    // ...existing supabase query...
  } catch (err) {
    return res.status(401).json({ ok: false, error: err.message || "Unauthorized" });
  }
}

  const status = (req.query.status || "NEW").toUpperCase();
  const type = (req.query.type || "ALL").toUpperCase();

  let q = supabaseAdmin
    .from("shopify_order_request_notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) q = q.eq("status", status);
  if (type && type !== "ALL") q = q.eq("request_type", type);

  const { data, error } = await q;
  if (error) {
    console.error("OPS_INBOX_LIST_ERROR", error);
    return res.status(500).json({ ok: false, error: "DB error" });
  }

  return res.status(200).json({ ok: true, rows: data || [] });
}
