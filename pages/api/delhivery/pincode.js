// pages/api/delhivery/pincode.js

export default async function handler(req, res) {
  // --- CORS headers ---
  res.setHeader("Access-Control-Allow-Origin", "*"); // you can restrict to https://megaska.com if you want
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
      "https://track.delhivery.com/c/api/pin-codes/json/";
    const originPin = process.env.DELHIVERY_ORIGIN_PIN;
    const tatUrl = process.env.DELHIVERY_TAT_URL; // Expected TAT API URL from your Delhivery docs

    if (!token) {
      return res
        .status(500)
        .json({ ok: false, error: "Delhivery token not configured" });
    }

    // 1) PINCODE SERVICEABILITY
    const svcUrl = `${baseUrl}?token=${encodeURIComponent(
      token
    )}&filter_codes=${encodeURIComponent(pin)}`;

    const dlRes = await fetch(svcUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Token ${token}`,
      },
    });

    const svcText = await dlRes.text();
    let raw;
    try {
      raw = JSON.parse(svcText);
    } catch (e) {
      console.error("[DELHIVERY PINCODE NON-JSON]", svcText);
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

    // If not serviceable, no point calling TAT
    if (!isServiceable) {
      return res.status(200).json({
        ok: true,
        pin,
        isServiceable: false,
        isCod,
        isPrepaid,
        city,
        district,
        stateCode,
        inc,
      });
    }

    // 2) EXPECTED TAT API (origin -> destination)
    let tatDays = null;
    let estimatedDate = null;

    try {
      if (tatUrl && originPin) {
        // NOTE: Adjust method and payload based on your Delhivery docs.
        // This example assumes a GET with query params origin & destination.
        const tatQuery = `${tatUrl}?origin_pincode=${encodeURIComponent(
          originPin
        )}&destination_pincode=${encodeURIComponent(pin)}`;

        const tatRes = await fetch(tatQuery, {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Token ${token}`,
          },
        });

        const tatText = await tatRes.text();
        let tatJson;
        try {
          tatJson = JSON.parse(tatText);
        } catch (e) {
          console.error("[DELHIVERY TAT NON-JSON]", tatText);
          tatJson = null;
        }

        if (tatJson) {
          // 🔴 IMPORTANT:
          // Map these to the actual fields from your Expected TAT API response.
          // Common patterns: tatJson.tat, tatJson.days, tatJson.data.tat, etc.
          tatDays =
            tatJson.tat ||
            tatJson.days ||
            tatJson.expected_tat ||
            null;

          // If API already gives a date, you can map it here instead.
          // Example:
          // estimatedDate = tatJson.expected_delivery_date || null;

          // If you only get days, compute a simple expected date from today:
          if (tatDays && !estimatedDate) {
            const d = new Date();
            d.setDate(d.getDate() + Number(tatDays));
            estimatedDate = d.toISOString().slice(0, 10); // YYYY-MM-DD
          }
        }
      }
    } catch (tatError) {
      console.error("[DELHIVERY TAT ERROR]", tatError);
      // we don't fail the whole API if TAT fails; just skip EDD
    }

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
      tatDays: tatDays ? Number(tatDays) : null,
      estimatedDate, // may be null if TAT call fails
    });
  } catch (error) {
    console.error("[DELHIVERY PINCODE ERROR]", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch serviceability",
    });
  }
}
