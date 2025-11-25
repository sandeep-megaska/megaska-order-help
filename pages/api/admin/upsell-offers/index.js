// pages/api/admin/upsell-offers/index.js
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { callShopifyAdmin } from "../../../../lib/shopify";

const VARIANT_QUERY = `
  query getVariantPrice($id: ID!) {
    productVariant(id: $id) {
      id
      price
      product { id title }
    }
  }
`;


const CREATE_BXGY_MUTATION = `
  mutation createUpsellBxgy($input: DiscountAutomaticBxgyInput!) {
    discountAutomaticBxgyCreate(automaticBxgyDiscount: $input) {
      automaticDiscountNode {
        id
        automaticDiscount {
          __typename
          ... on DiscountAutomaticBxgy {
            id
            title
            status
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export default async function handler(req, res) {
  // 🔑 Use env vars for single-shop setup
 const shop = process.env.SHOPIFY_SHOP_DOMAIN;
const accessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;


  if (!shop || !accessToken) {
    console.error("Missing SHOPIFY_SHOP or SHOPIFY_ADMIN_API_ACCESS_TOKEN env");
    return res
      .status(500)
      .json({ ok: false, error: "Shopify credentials not configured" });
  }

  if (req.method === "GET") {
    try {
      const { data, error } = await supabaseAdmin
        .from("upsell_offers")
        .select("*")
        .eq("shop_domain", shop)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return res.status(200).json({ ok: true, offers: data });
    } catch (err) {
  console.error("Create upsell offer error:", err);
  return res.status(500).json({
    ok: false,
    error: err.message || "Server error",
  });
}

  }

  if (req.method === "POST") {
    try {
      const {
        title,
        triggerProductIds, // [numeric]
        upsellProductId,
        upsellVariantId,
        targetPrice,
        placementPdp,
        placementCart,
      } = req.body;

      if (!title || !triggerProductIds?.length || !upsellVariantId || !targetPrice) {
        return res.status(400).json({ ok: false, error: "Missing required fields" });
      }

      // 1) Get variant price from Shopify
      const variantGid = `gid://shopify/ProductVariant/${upsellVariantId}`;

      const variantData = await callShopifyAdmin({
        shop,
        accessToken,
        query: VARIANT_QUERY,
        variables: { id: variantGid },
      });

      const variant = variantData.productVariant;
      if (!variant) {
        return res.status(400).json({ ok: false, error: "Variant not found in Shopify" });
      }

      const basePrice = parseFloat(variant.price.amount);
      const currencyCode = variant.price.currencyCode;
      const target = Number(targetPrice);
      const discountAmount = basePrice - target;

      if (discountAmount <= 0) {
        return res
          .status(400)
          .json({ ok: false, error: "Target price must be less than current price" });
      }

      // 2) Build BXGY input
      const triggerProductGids = triggerProductIds.map(
        (id) => `gid://shopify/Product/${id}`
      );
      const upsellProductGid = variant.product.id;
      const nowIso = new Date().toISOString();

      const bxgyInput = {
        title,
        startsAt: nowIso,
        endsAt: null,
        combinesWith: {
          orderDiscounts: true,
          productDiscounts: true,
          shippingDiscounts: true,
        },
        customerBuys: {
          items: {
            products: {
              productsToAdd: triggerProductGids,
            },
          },
          value: {
            quantity: 1,
          },
        },
        customerGets: {
          items: {
            products: {
              productsToAdd: [upsellProductGid],
            },
          },
          value: {
            discountAmount: {
              amount: {
                amount: discountAmount.toFixed(2),
                currencyCode,
              },
              appliesOnEachItem: true,
            },
          },
        },
      };

      const createRes = await callShopifyAdmin({
        shop,
        accessToken,
        query: CREATE_BXGY_MUTATION,
        variables: { input: bxgyInput },
      });

      const payload = createRes.discountAutomaticBxgyCreate;

      if (payload.userErrors?.length) {
        console.error("Discount userErrors:", payload.userErrors);
        return res.status(400).json({
          ok: false,
          error: payload.userErrors.map((e) => e.message).join(", "),
          details: payload.userErrors,
        });
      }

      const discountNode = payload.automaticDiscountNode;
      const discountInfo = discountNode.automaticDiscount;

      // 3) Insert row in Supabase
      const { data, error } = await supabaseAdmin
        .from("upsell_offers")
        .insert({
          shop_domain: shop,
          title,
          trigger_type: "product",
          trigger_product_ids: triggerProductIds,
          upsell_product_id: parseInt(
            upsellProductId || upsellProductGid.split("/").pop(),
            10
          ),
          upsell_variant_id: parseInt(upsellVariantId, 10),
          target_price: target,
          base_price: basePrice,
          discount_amount: discountAmount,
          placement_pdp: !!placementPdp,
          placement_cart: !!placementCart,
          shopify_discount_id: discountNode.id,
          shopify_discount_title: discountInfo.title,
          shopify_discount_status: discountInfo.status,
        })
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({ ok: true, offer: data });
   } catch (err) {
  console.error("List upsell offers error:", err);
  return res.status(500).json({
    ok: false,
    error: err.message || "Server error",
  });
}

  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
