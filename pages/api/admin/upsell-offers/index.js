// pages/api/admin/upsell-offers/index.js
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

const SHOP_DOMAIN =
  process.env.SHOPIFY_SHOP_DOMAIN || "bigonbuy-fashions.myshopify.com";

// Optional admin token (if you don't use it, leave env empty)
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
  // 🔐 Admin gate – only enforced if ADMIN_TOKEN is set
  if (ADMIN_TOKEN) {
    const token = req.headers[ADMIN_TOKEN_HEADER];
    if (!token || token !== ADMIN_TOKEN) {
      return res.status(401).json({
        ok: false,
        error: "ADMIN_UNAUTHORIZED",
      });
    }
  }

  // ---- GET: list offers ----
  if (req.method === "GET") {
    try {
      const { data, error } = await supabaseAdmin
        .from("upsell_offers")
        .select("*")
        .eq("shop_domain", SHOP_DOMAIN)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[UPSELL_LIST_SUPABASE_ERROR]", error);
        return res.status(500).json({
          ok: false,
          error: error.message || "LIST_FAILED",
        });
      }

      return res.status(200).json({ ok: true, offers: data || [] });
    } catch (err) {
      console.error("[UPSELL_LIST_FATAL]", err);
      return res.status(500).json({
        ok: false,
        error: err.message || "LIST_FATAL",
      });
    }
  }

  // ---- POST / PUT: create or update offer ----
  if (req.method === "POST" || req.method === "PUT") {
    console.log("[UPSELL_ADMIN_RAW_BODY]", req.body);

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

      // 🔴 Explicit validation (no "Missing required fields" anymore)
      if (!upsellProductIdNum || !targetPriceNum) {
        return res.status(400).json({
          ok: false,
          error: "REQUIRED: upsell_product_id and target_price",
        });
      }

      if (trigger_type === "product" && triggerProductIds.length === 0) {
        return res.status(400).json({
          ok: false,
          error: "REQUIRED: at least one trigger_product_id",
        });
      }

      if (
        trigger_type === "collection" &&
        triggerCollectionHandles.length === 0
      ) {
        return res.status(400).json({
          ok: false,
          error: "REQUIRED: at least one trigger_collection_handle",
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

      console.log("[UPSELL_ADMIN_COMPUTED_ROW]", row);

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
            error: "REQUIRED: id for UPDATE",
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
      if (error) {
        console.error("[UPSELL_ADMIN_SUPABASE_ERROR]", error);
        return res.status(500).json({
          ok: false,
          error: error.message || "SUPABASE_SAVE_FAILED",
        });
      }

      return res.status(200).json({ ok: true, offer: data });
    } catch (err) {
      console.error("[UPSELL_ADMIN_SAVE_FATAL]", err);
      return res.status(500).json({
        ok: false,
        error: err.message || "SAVE_FATAL",
      });
    }
  }

  res.setHeader("Allow", "GET,POST,PUT");
  return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
}
