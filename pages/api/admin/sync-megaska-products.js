// pages/api/admin/sync-megaska-products.js
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { embedText } from "../../../lib/openaiEmbeddings";


export default async function handler(req, res) {
  // optional simple protection
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const shop = process.env.SHOPIFY_SHOP_DOMAIN;
    const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

    // Start small: get first 100–200 products
    const shopifyRes = await fetch(
      `https://${shop}/admin/api/2025-01/products.json?limit=100`,
      {
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
      }
    );

    const shopifyData = await shopifyRes.json();
    const products = shopifyData.products || [];

    for (const product of products) {
      const mainImage =
        product.images && product.images.length > 0
          ? product.images[0].src
          : null;

      // Build rich text for embedding
      const textParts = [
        product.title,
        product.product_type,
        product.body_html?.replace(/<[^>]+>/g, " "), // strip HTML
        product.tags,
        // you can add manual labels here:
        // e.g. "full length swimwear", "burkini", "modest coverage"
      ].filter(Boolean);

      const fullText = textParts.join(". ");

      const embedding = await embedText(fullText);

      const { error } = await supabaseAdmin
        .from("megaska_products")
        .upsert(
          {
            shopify_product_id: product.id,
            handle: product.handle,
            title: product.title,
            description: product.body_html,
            tags: product.tags,
            image_url: mainImage,
            collections: [], // can fill later if you map collections
            embedding,
          },
          { onConflict: "shopify_product_id" }
        );

      if (error) {
        console.error("Supabase upsert error:", error);
      }
    }

    return res.status(200).json({ ok: true, count: products.length });
  } catch (err) {
    console.error("Sync error:", err);
    return res.status(500).json({ error: "Sync failed" });
  }
}
