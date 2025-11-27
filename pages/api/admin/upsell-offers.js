// pages/api/admin/upsell-offers.js
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

const SHOP_DOMAIN =
  process.env.SHOPIFY_SHOP_DOMAIN || "bigonbuy-fashions.myshopify.com";

// Optional admin token header (you can ignore for now if not using)
const ADMIN_TOKEN_HEADER = "x-megaska-admin-token";
const ADMIN_TOKEN = process.env.ADMIN_DASHBOARD_TOKEN || "";

// ---- Helpers ----
function parseIdArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((n) => Number(n)).filter(Boolean);
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .map((n) => Number(n))
    .filter(Boolean);
}

function parseHandleArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseNumberOrNull(val) {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req, res) {
  // 🔐 Optional admin gating; if you haven’t set a token, this is skipped
  if (ADMIN_TOKEN) {
    const token = req.headers[ADMIN_TOKEN_HEADER];
    if (!token || token !== ADMIN_TOKEN) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized admin access",
      });
    }
  }

  // GET → list offers
  if (req.method === "GET") {
    try {
      const { data, error } = await supabaseAdmin
        .from("upsell_offers")
        .select("*")
        .eq("shop_domain", SHOP_DOMAIN)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return res.status(200).json({ ok: true, offers: data || [] });
    } catch (err) {
      console.error("[UPSELL_ADMIN_LIST_ERROR]", err);
      return res.status(500).json({
        ok: false,
        error: err.message || "Failed to load upsell offers",
      });
    }
  }

  // POST/PUT → create / update
  if (req.method === "POST" || req.method === "PUT") {
    try {
      const {
        id,
        status = "active",
        trigger_type = "collection",
        trigger_product_ids,
        trigger_collection_handles,

        upsell_product_id,
        upsell_variant_id,
        base_price,
        target_price,

        placement_pdp = true,
        placement_cart = false,

        title,
        box_title,
        box_subtitle,
        box_button_label,
      } = req.body || {};

      const upsellProductIdNum = parseNumberOrNull(upsell_product_id);
      const upsellVariantIdNum = parseNumberOrNull(upsell_variant_id);
      const basePriceNum = parseNumberOrNull(base_price);
      const targetPriceNum = parseNumberOrNull(target_price);

      const triggerProductIds = parseIdArray(trigger_product_ids);
      const triggerCollectionHandles = parseHandleArray(
        trigger_collection_handles
      );

      // ✅ Minimal required validation
      if (!upsellProductIdNum || !targetPriceNum) {
        return res.status(400).json({
          ok: false,
          error: "Upsell product ID and offer price are required",
        });
      }

      if (trigger_type === "product" && triggerProductIds.length === 0) {
        return res.status(400).json({
          ok: false,
          error: "At least one trigger product ID is required",
        });
      }

      if (trigger_type === "collection" && triggerCollectionHandles.length === 0) {
        return res.status(400).json({
          ok: false,
          error: "At least one trigger collection handle is required",
        });
      }

      const discountAmount =
        basePriceNum && targetPriceNum
          ? basePriceNum - targetPriceNum
          : null;

      const row = {
        shop_domain: SHOP_DOMAIN,

        status,
        trigger_type,

        trigger_product_ids:
          trigger_type === "product" ? triggerProductIds : [],
        trigger_collection_handles:
          trigger_type === "collection" ? triggerCollectionHandles : [],

        upsell_product_id: upsellProductIdNum,
        upsell_variant_id: upsellVariantIdNum,
        base_price: basePriceNum,
        target_price: targetPriceNum,
        discount_amount: discountAmount,

        placement_pdp: !!placement_pdp,
        placement_cart: !!(placement_cart && placement_cart !== "false"),

        title: title || null,
        box_title: box_title || null,
        box_subtitle: box_subtitle || null,
        box_button_label: box_button_label || null,
      };

      let result;

      if (req.method === "POST") {
        result = await supabaseAdmin
          .from("upsell_offers")
          .insert(row)
          .select()
          .single();
      } else {
        if (!id) {
          return res.status(400).json({
            ok: false,
            error: "Missing id for update",
          });
        }
        result = await supabaseAdmin
          .from("upsell_offers")
          .update(row)
          .eq("id", id)
          .select()
          .single();
      }

      const { data, error } = result;
      if (error) throw error;

      return res.status(200).json({
        ok: true,
        offer: data,
      });
    } catch (err) {
      console.error("[UPSELL_ADMIN_SAVE_ERROR]", err);
      return res.status(500).json({
        ok: false,
        error: err.message || "Failed to save upsell",
      });
    }
  }

  // DELETE (optional)
  if (req.method === "DELETE") {
    try {
      const { id } = req.body || {};
      if (!id) {
        return res.status(400).json({
          ok: false,
          error: "Missing id for delete",
        });
      }

      const { error } = await supabaseAdmin
        .from("upsell_offers")
        .delete()
        .eq("id", id);

      if (error) throw error;

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("[UPSELL_ADMIN_DELETE_ERROR]", err);
      return res.status(500).json({
        ok: false,
        error: err.message || "Failed to delete upsell",
      });
    }
  }

  // Fallback
  res.setHeader("Allow", "GET,POST,PUT,DELETE");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
