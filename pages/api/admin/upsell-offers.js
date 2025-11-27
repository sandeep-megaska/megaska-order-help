// pages/api/admin/upsell-offers.js

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminTokenEnv = process.env.ADMIN_WALLET_TOKEN;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('[UPSSELL ADMIN] Missing Supabase env vars');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ---- Helpers ----

function getAdminTokenFromRequest(req) {
  const headerToken =
    req.headers['x-admin-token'] ||
    req.headers['x-admin-dashboard-token'] ||
    '';

  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : '';

  return headerToken || bearerToken || '';
}

function normalizeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    // Try JSON parse if it looks like ["a","b"]
    const trimmed = value.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // ignore and fall through
      }
    }
    // Fallback: comma-separated string → array
    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [trimmed];
  }
  return [value];
}

/**
 * Compute numeric prices from the request body.
 *
 * Accepts:
 * - base_price / basePrice
 * - target_price / targetPrice
 * Computes:
 * - discount_amount = base_price - target_price (if both present)
 */
function derivePriceFields(body) {
  const basePriceRaw =
    body.base_price != null
      ? body.base_price
      : body.basePrice != null
      ? body.basePrice
      : null;

  const targetPriceRaw =
    body.target_price != null
      ? body.target_price
      : body.targetPrice != null
      ? body.targetPrice
      : null;

  const basePriceNum =
    basePriceRaw !== null && basePriceRaw !== undefined
      ? Number(basePriceRaw)
      : null;

  const targetPriceNum =
    targetPriceRaw !== null && targetPriceRaw !== undefined
      ? Number(targetPriceRaw)
      : null;

  let discountAmountNum = null;
  if (
    basePriceNum !== null &&
    !Number.isNaN(basePriceNum) &&
    targetPriceNum !== null &&
    !Number.isNaN(targetPriceNum)
  ) {
    discountAmountNum = basePriceNum - targetPriceNum;
  }

  return {
    base_price: basePriceNum,
    target_price: targetPriceNum,
    discount_amount: discountAmountNum,
  };
}
function toNumberOrNull(value) {
  if (value === undefined || value === null) return null;
  if (value === '') return null;           // important: empty string → null, not 0
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ---- Main handler ----

export default async function handler(req, res) {
  // CORS preflight (if needed)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,POST,PUT,DELETE,OPTIONS'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Admin-Token, X-Admin-Dashboard-Token'
    );
    return res.status(200).end();
  }

  // Basic CORS
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Auth check
  const incomingToken = getAdminTokenFromRequest(req);
  if (!adminTokenEnv || !incomingToken || incomingToken !== adminTokenEnv) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized: invalid admin token',
    });
  }

  try {
    switch (req.method) {
      // ----------------- GET: List offers -----------------
      case 'GET': {
        const { shop_domain } = req.query;

        let query = supabase
          .from('upsell_offers')
          .select('*')
          .order('created_at', { ascending: false });

        if (shop_domain) {
          query = query.eq('shop_domain', shop_domain);
        }

        const { data, error } = await query;

        if (error) {
          console.error('[UPSELL ADMIN GET] Supabase error', error);
          return res.status(500).json({
            ok: false,
            error: 'Failed to fetch upsell offers',
          });
        }

        return res.status(200).json({ ok: true, offers: data || [] });
      }

      // ----------------- POST: Create offer -----------------
          // ----------------- POST: Create offer -----------------
    case 'POST': {
      const body = req.body || {};

      const {
        shop_domain,
        title,
        status = 'active',
        trigger_type,
        trigger_collection_handles,
        trigger_product_ids,
        upsell_product_id,
        upsell_variant_id,
        placement_pdp,
        placement_cart,
        box_title,
        box_subtitle,
        box_button_label,
      } = body;

      // Validate minimum required fields
      if (!shop_domain || !title || !trigger_type || !upsell_variant_id) {
        return res.status(400).json({
          ok: false,
          error:
            'Missing required fields: shop_domain, title, trigger_type, upsell_variant_id',
        });
      }

      // --- Price fields: read exactly what the form sends ---
      const basePriceNum = toNumberOrNull(
        body.base_price != null ? body.base_price : body.basePrice
      );
      const targetPriceNum = toNumberOrNull(
        body.target_price != null ? body.target_price : body.targetPrice
      );

      // We can compute discount on the frontend from base & target.
      // Keep discount_amount null for now to avoid weird negatives.
      const discountAmountNum = null;

      // Normalize trigger arrays
      function normalizeArray(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
          return value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        }
        return [value];
      }

      const triggerType = trigger_type;
      const triggerCollectionHandles = normalizeArray(
        trigger_collection_handles
      );
      const triggerProductIds = normalizeArray(trigger_product_ids);

      if (triggerType === 'product' && triggerProductIds.length === 0) {
        return res.status(400).json({
          ok: false,
          error:
            'trigger_type=product requires at least one trigger_product_id',
        });
      }

      const { data, error } = await supabase
        .from('upsell_offers')
        .insert([
          {
            shop_domain,
            title,
            status,
            trigger_type: triggerType,
            trigger_collection_handles: triggerCollectionHandles,
            trigger_product_ids: triggerProductIds,
            upsell_product_id,
            upsell_variant_id,
            target_price: targetPriceNum,
            base_price: basePriceNum,
            discount_amount: discountAmountNum,
            placement_pdp: !!placement_pdp,
            placement_cart: !!placement_cart,
            box_title,
            box_subtitle,
            box_button_label,
          },
        ])
        .select('*')
        .single();

      if (error) {
        console.error('[UPSELL ADMIN POST] Supabase error', error);
        return res.status(500).json({
          ok: false,
          error: 'Failed to create upsell offer',
        });
      }

      return res.status(200).json({ ok: true, offer: data });
    }

      // ----------------- PUT: Update offer -----------------
      case 'PUT': {
        const body = req.body || {};
        const { id } = body;

        if (!id) {
          return res
            .status(400)
            .json({ ok: false, error: 'Missing offer id for update' });
        }

        const {
          title,
          status,
          trigger_type,
          trigger_collection_handles,
          trigger_product_ids,
          upsell_product_id,
          upsell_variant_id,
          placement_pdp,
          placement_cart,
          box_title,
          box_subtitle,
          box_button_label,
        } = body;

        const priceFields = derivePriceFields(body);
        const { base_price, target_price, discount_amount } = priceFields;

        const updatePayload = {
          // Only set if provided; otherwise leave unchanged
        };

        if (title !== undefined) updatePayload.title = title;
        if (status !== undefined) updatePayload.status = status;
        if (trigger_type !== undefined)
          updatePayload.trigger_type = trigger_type;
        if (trigger_collection_handles !== undefined)
          updatePayload.trigger_collection_handles = normalizeArray(
            trigger_collection_handles
          );
        if (trigger_product_ids !== undefined)
          updatePayload.trigger_product_ids = normalizeArray(
            trigger_product_ids
          );
        if (upsell_product_id !== undefined)
          updatePayload.upsell_product_id = upsell_product_id;
        if (upsell_variant_id !== undefined)
          updatePayload.upsell_variant_id = upsell_variant_id;

        if (target_price !== null) updatePayload.target_price = target_price;
        if (base_price !== null) updatePayload.base_price = base_price;
        if (discount_amount !== null)
          updatePayload.discount_amount = discount_amount;

        if (placement_pdp !== undefined)
          updatePayload.placement_pdp = !!placement_pdp;
        if (placement_cart !== undefined)
          updatePayload.placement_cart = !!placement_cart;

        if (box_title !== undefined) updatePayload.box_title = box_title;
        if (box_subtitle !== undefined)
          updatePayload.box_subtitle = box_subtitle;
        if (box_button_label !== undefined)
          updatePayload.box_button_label = box_button_label;

        const { data, error } = await supabase
          .from('upsell_offers')
          .update(updatePayload)
          .eq('id', id)
          .select('*')
          .single();

        if (error) {
          console.error('[UPSELL ADMIN PUT] Supabase error', error);
          return res.status(500).json({
            ok: false,
            error: 'Failed to update upsell offer',
          });
        }

        return res.status(200).json({ ok: true, offer: data });
      }

      // ----------------- DELETE: Delete offer -----------------
      case 'DELETE': {
        const { id } = req.query;

        if (!id) {
          return res
            .status(400)
            .json({ ok: false, error: 'Missing offer id for delete' });
        }

        const { error } = await supabase
          .from('upsell_offers')
          .delete()
          .eq('id', id);

        if (error) {
          console.error('[UPSELL ADMIN DELETE] Supabase error', error);
          return res.status(500).json({
            ok: false,
            error: 'Failed to delete upsell offer',
          });
        }

        return res.status(200).json({ ok: true, deleted_id: id });
      }

      // ----------------- Unsupported method -----------------
      default:
        return res.status(405).json({
          ok: false,
          error: `Method ${req.method} not allowed`,
        });
    }
  } catch (err) {
    console.error('[UPSELL ADMIN] Unhandled error', err);
    return res.status(500).json({
      ok: false,
      error: 'Unexpected server error',
    });
  }
}
