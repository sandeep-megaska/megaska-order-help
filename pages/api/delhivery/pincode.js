// pages/api/delhivery/pincode.js

export default async function handler(req, res) {
  // Allow only GET
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const pin = (req.query.pin || "").toString().trim();

  if (!pin || pin.length < 4) {
    return res.status(400).json({ ok: false, error: "Invalid pincode" });
  }

  try {
    const token = process.env.DELHIVERY_API_TOKEN;
    const baseUrl =
      process.env.DELHIVERY_PINCODE_URL ||
      "https://track.delhivery.com/c/api/pin-codes/json/";

    if (!token) {
      return res
        .status(500)
        .json({ ok: false, error: "Delhivery token not configured" });
    }

    const url = `${baseUrl}?token=${encodeURIComponent(
      token
    )}&filter_codes=${encodeURIComponent(pin)}`;

    const dlRes = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        // Some setups use Header token instead of query param token – you can keep both
        "Authorization": `Token ${token}`,
      },
    });

    const data = await dlRes.json();

    // Normalise result for frontend
    // You may need to adjust according to exact Delhivery response format
    const codes = data.delivery_codes || data["delivery_codes"] || [];
    const entry = codes[0] || {};
    const postalCodeInfo = entry.postal_code || entry["postal_code"] || {};

    // Example structure – adjust to match actual response from Delhivery
    const isServiceable = !!codes.length;
    const isCod = !!postalCodeInfo.cod;
    const isPrepaid = !!postalCodeInfo.prepaid;
    const state = postalCodeInfo.state || null;
    const district = postalCodeInfo.district || null;

    return res.status(200).json({
      ok: true,
      pin,
      isServiceable,
      isCod,
      isPrepaid,
      state,
      district,
      raw: data, // keep for debugging for now; remove later if you want
    });
  } catch (error) {
    console.error("[DELHIVERY PINCODE ERROR]", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch serviceability",
    });
  }
}
