// pages/api/style-recommendations.js
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { embedText } from "../../lib/openaiEmbeddings";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { persona } = req.body || {};
  if (!persona) {
    return res.status(400).json({ error: "Missing persona text" });
  }

  try {
    // 1) Embed persona text
    const queryEmbedding = await embedText(persona);

    // 2) Call Supabase RPC to get matching products
    const { data, error } = await supabaseAdmin.rpc(
      "match_megaska_products",
      {
        query_embedding: queryEmbedding,
        match_count: 6,
        min_similarity: 0.2,
      }
    );

    if (error) {
      console.error("Supabase match error:", error);
      return res.status(500).json({ error: "Match query failed" });
    }

    const baseUrl = "https://megaska.com";

    const products = (data || []).map((row) => ({
      title: row.title,
      handle: row.handle,
      url: `${baseUrl}/products/${row.handle}`,
      image: row.image_url,
      similarity: row.similarity,
    }));

    return res.status(200).json({ products });
  } catch (err) {
    console.error("Recommendation error:", err);
    return res.status(500).json({ error: "Recommendation failed" });
  }
}
