// pages/api/admin/sync-megaska-products.js
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { embedText } from "../../../lib/openaiEmbeddings";

export default async function handler(req, res) {
  // Allow both GET and POST so you can run it from the browser
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // ---- 0. Check env vars clearly ----
    const shop = process.env.SHOPIFY_SHOP_DOMAIN;
    const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!shop || !token || !supabaseUrl || !supabaseKey || !openaiKey) {
      throw new Error(
        `Missing env vars: ${
          !shop ? "SHOPIFY_SHOP_DOMAIN " : ""
        }${!token ? "SHOPIFY_ADMIN_ACCESS_TOKEN " : ""}${
          !supabaseUrl ? "SUPABASE_URL " : ""
        }${!supabaseKey ? "SUPABASE_SERVICE_ROLE_KEY " : ""}${
          !openaiKey ? "OPENAI_API_KEY " : ""
        }`.trim()
      );
    }

    // ---- 1. Fetch products from Shopify ----
    const shopifyRes = await fetch(
      `https://${shop}/admin/api/2024-10/products.json?limit=50`,
      {
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
      }
    );

    if (!shopifyRes.ok) {
      const text = await shopifyRes.text();
      throw new Error(
        `Shopify API error ${shopifyRes.status} ${shopifyRes.statusText}: ${text}`
      );
    }

    const shopifyData = await shopifyRes.json();
    const products = shopifyData.products || [];

    // ---- 2. Loop products, build embeddings, upsert into Supabase ----
    let successCount = 0;
    for (const product of products) {
      try {
        const mainImage =
          product.images && product.images.length > 0
            ? product.images[0].src
            : null;

        const textParts = [
          product.title,
          product.product_type,
          product.body_html?.replace(/<[^>]+>/g, " "), // strip HTML
          product.tags,
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
              collections: [],
              embedding,
            },
            { onConflict: "shopify_product_id" }
          );

        if (error) {
          console.error(
            "Supabase upsert error for product",
            product.id,
            error
          );
        } else {
          successCount += 1;
        }
      } catch (innerErr) {
        console.error(
          "Error processing product",
          product.id,
          innerErr?.message || innerErr
        );
      }
    }

    return res.status(200).json({
      ok: true,
      fetched: products.length,
      embedded: successCount,
    });
  } catch (err) {
    console.error("Sync error:", err);
    return res.status(500).json({
      error: "Sync failed",
      detail: err.message || String(err),
    });
  }
}
