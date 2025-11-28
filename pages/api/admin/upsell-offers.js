// pages/api/admin/upsell-offers.js

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// We reuse the same admin token that you already use for wallet admin.
const adminTokenEnv = process.env.ADMIN_WALLET_TOKEN || '';

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

function toNumberOrNull(value) {
  if (value === undefined || value === null) return null;
  if (value === '') return null; // important: empty string => null, not 0
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

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

export default async function handler(req, res) {
  // Admin auth – only affects this admin endpoint, not customer flows.
  const incomingToken = getAdminTokenFromRequest(req);
  if (adminTokenEnv && incomingToken !== adminTokenEnv) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized: invalid admin token',
    });
  }

  try {
    switch (req.method) {
      // -----------------------------------------------
      // GET: list offers (optionally filtered by shop)
      // -----------------------------------------------
      case 'GET': {
        const shopDomain =
          req.query.shop_domain || req.query.shopDomain || null;

        let query = supabase.from('upsell_offers').select('*');
        if (shopDomain) {
          query = query.eq('shop_domain', shopDomain);
        }

        const { data, error } = await query.order('created_at', {
          ascending: false,
        });

        if (error) {
          console.error('[UPSELL ADMIN GET] Supabase error', error);
          return res.status(500).json({
            ok: false,
            error: 'Failed to load upsell offers',
          });
        }

        return res.status(200).json({ ok: true, offers: data || [] });
      }

      // -----------------------------------------------
      // POST: create offer
      // -----------------------------------------------
      case 'POST': {
        const body = req.body || {};

        const {
          shop_domain,
          title,
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

        if (!shop_domain || !title || !trigger_type || !upsell_variant_id) {
          return res.status(400).json({
            ok: false,
            error:
              'Missing required fields: shop_domain, title, trigger_type, upsell_variant_id',
          });
        }

        // Prices from dashboard
        const basePriceNum = toNumberOrNull(
          body.base_price != null ? body.base_price : body.basePrice
        );
        const targetPriceNum = toNumberOrNull(
          body.target_price != null ? body.target_price : body.targetPrice
        );

        // Compute discount: base - target if both present and base >= target
        let discountAmountNum = null;
        if (basePriceNum != null && targetPriceNum != null) {
          const diff = basePriceNum - targetPriceNum;
          discountAmountNum = diff >= 0 ? diff : 0;
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
              status: 'active',
              trigger_type: triggerType,
              trigger_collection_handles: triggerCollectionHandles,
              trigger_product_ids: triggerProductIds,
              upsell_product_id,
              upsell_variant_id,
              base_price: basePriceNum,
              target_price: targetPriceNum,
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

      // -----------------------------------------------
      // PUT: update existing offer by id
      // -----------------------------------------------
      case 'PUT': {
        const body = req.body || {};
        const { id } = body;

        if (!id) {
          return res.status(400).json({
            ok: false,
            error: 'Missing id for update',
          });
        }

        const {
          shop_domain,
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

        const basePriceNum = toNumberOrNull(
          body.base_price != null ? body.base_price : body.basePrice
        );
        const targetPriceNum = toNumberOrNull(
          body.target_price != null ? body.target_price : body.targetPrice
        );

        let discountAmountNum = null;
        if (basePriceNum != null && targetPriceNum != null) {
          const diff = basePriceNum - targetPriceNum;
          discountAmountNum = diff >= 0 ? diff : 0;
        }

        const triggerType = trigger_type;
        const triggerCollectionHandles = normalizeArray(
          trigger_collection_handles
        );
        const triggerProductIds = normalizeArray(trigger_product_ids);

        const updatePayload = {
          ...(shop_domain != null && { shop_domain }),
          ...(title != null && { title }),
          ...(status != null && { status }),
          ...(triggerType != null && { trigger_type: triggerType }),
          ...(trigger_collection_handles != null && {
            trigger_collection_handles: triggerCollectionHandles,
          }),
          ...(trigger_product_ids != null && {
            trigger_product_ids: triggerProductIds,
          }),
          ...(upsell_product_id != null && { upsell_product_id }),
          ...(upsell_variant_id != null && { upsell_variant_id }),
          ...(basePriceNum !== null && { base_price: basePriceNum }),
          ...(targetPriceNum !== null && { target_price: targetPriceNum }),
          ...(discountAmountNum !== null && {
            discount_amount: discountAmountNum,
          }),
          ...(placement_pdp != null && { placement_pdp: !!placement_pdp }),
          ...(placement_cart != null && { placement_cart: !!placement_cart }),
          ...(box_title != null && { box_title }),
          ...(box_subtitle != null && { box_subtitle }),
          ...(box_button_label != null && { box_button_label }),
        };

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

      // -----------------------------------------------
      // DELETE: delete offer by id
      // -----------------------------------------------
      case 'DELETE': {
        const id = req.query.id || req.body?.id;
        if (!id) {
          return res.status(400).json({
            ok: false,
            error: 'Missing id for delete',
          });
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

        return res.status(200).json({ ok: true });
      }

      default: {
        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        return res.status(405).json({
          ok: false,
          error: `Method ${req.method} Not Allowed`,
        });
      }
    }
  } catch (err) {
    console.error('[UPSELL ADMIN] Unhandled error', err);
    return res.status(500).json({
      ok: false,
      error: 'Unexpected server error in upsell admin endpoint',
    });
  }
}
