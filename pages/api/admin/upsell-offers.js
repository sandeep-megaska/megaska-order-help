// pages/api/admin/upsell-offers.js
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

const SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;

// super simple guard (improve later: OAuth from Shopify admin, etc.)
function checkAdminAuth(req, res) {
  const token = req.headers["x-megaska-admin-token"];
  const expected = process.env.ADMIN_DASHBOARD_TOKEN || "";
  if (!expected || token !== expected) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  if (!checkAdminAuth(req, res)) return;

  if (!supabaseAdmin) {
    res.status(500).json({ ok: false, error: "Supabase not configured" });
    return;
  }

  try {
    switch (req.method) {
      case "GET": {
        // List all offers for this shop
        const { data, error } = await supabaseAdmin
          .from("upsell_offers")
          .select("*")
          .eq("shop_domain", SHOP_DOMAIN)
          .order("created_at", { ascending: false });

        if (error) throw error;

        res.status(200).json({ ok: true, offers: data || [] });
        break;
      }

      case "POST": {
        const body = req.body || {};
        const payload = {
          shop_domain: SHOP_DOMAIN,
          status: body.status || "active",
          trigger_type: body.trigger_type || "collection", // "product" | "collection"
          trigger_product_ids: body.trigger_product_ids || [],
          trigger_collection_handles: body.trigger_collection_handles || [],
          upsell_product_id: body.upsell_product_id || null,
          upsell_variant_id: body.upsell_variant_id || null,
          target_price: body.target_price || null,
          base_price: body.base_price || null,
          discount_amount: body.discount_amount || null,
          placement_pdp: !!body.placement_pdp,
          placement_cart: !!body.placement_cart,
          title: body.title || "",
          box_title: body.box_title || null,
          box_subtitle: body.box_subtitle || null,
          box_button_label: body.box_button_label || null,
        };

        const { data, error } = await supabaseAdmin
          .from("upsell_offers")
          .insert(payload)
          .select()
          .single();

        if (error) throw error;

        res.status(200).json({ ok: true, offer: data });
        break;
      }

      case "PUT": {
        const body = req.body || {};
        const id = body.id;
        if (!id) {
          res.status(400).json({ ok: false, error: "id is required" });
          return;
        }

        const updateFields = {
          status: body.status,
          trigger_type: body.trigger_type,
          trigger_product_ids: body.trigger_product_ids,
          trigger_collection_handles: body.trigger_collection_handles,
          upsell_product_id: body.upsell_product_id,
          upsell_variant_id: body.upsell_variant_id,
          target_price: body.target_price,
          base_price: body.base_price,
          discount_amount: body.discount_amount,
          placement_pdp: !!body.placement_pdp,
          placement_cart: !!body.placement_cart,
          title: body.title,
          box_title: body.box_title,
          box_subtitle: body.box_subtitle,
          box_button_label: body.box_button_label,
        };

        const { data, error } = await supabaseAdmin
          .from("upsell_offers")
          .update(updateFields)
          .eq("id", id)
          .eq("shop_domain", SHOP_DOMAIN)
          .select()
          .single();

        if (error) throw error;

        res.status(200).json({ ok: true, offer: data });
        break;
      }

      default: {
        res.setHeader("Allow", ["GET", "POST", "PUT"]);
        res.status(405).json({ ok: false, error: "Method not allowed" });
      }
    }
  } catch (err) {
    console.error("ADMIN_UPSELL_API_ERROR", err);
    res
      .status(500)
      .json({ ok: false, error: err.message || "Unexpected server error" });
  }
}
