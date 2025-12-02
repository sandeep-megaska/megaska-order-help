// pages/api/delhivery/pincode.js

export default async function handler(req, res) {
  // --- CORS headers ---
  res.setHeader("Access-Control-Allow-Origin", "*"); // or "https://megaska.com"
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

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
      "https://track.delhivery.com/c/api/pin-codes/json/?filter_codes=pin_code";

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
        Authorization: `Token ${token}`,
      },
    });

    const text = await dlRes.text();

    let raw;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      console.error("[DELHIVERY PINCODE NON-JSON]", text);
      return res.status(500).json({
        ok: false,
        error: "Unexpected response from Delhivery",
      });
    }

    const codes = raw.delivery_codes || [];
    const postal = codes[0]?.postal_code || {};

    const isServiceable = codes.length > 0;
    const isCod = postal.cod === "Y" || postal.cash === "Y";
    const isPrepaid = postal.pre_paid === "Y";

    const city = postal.city || null;
    const district = postal.district || city || null;
    const stateCode = postal.state_code || null;
    const inc = postal.inc || null;

    return res.status(200).json({
      ok: true,
      pin,
      isServiceable,
      isCod,
      isPrepaid,
      city,
      district,
      stateCode,
      inc,
      // raw, // you can comment this out later if not needed
    });
  } catch (error) {
    console.error("[DELHIVERY PINCODE ERROR]", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch serviceability",
    });
  }
}
