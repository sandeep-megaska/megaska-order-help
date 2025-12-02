// pages/api/delhivery/pincode.js

export default async function handler(req, res) {
  // --- CORS headers ---
  res.setHeader("Access-Control-Allow-Origin", "*"); // you can tighten to https://megaska.com later
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
    const originPin = process.env.DELHIVERY_ORIGIN_PIN;
    const tatBaseUrl =
      process.env.DELHIVERY_TAT_URL ||
      "https://track.delhivery.com/api/dc/expected_tat";

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

    // If not serviceable, no need to call TAT API
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
        tatDays: null,
        estimatedDate: null,
      });
    }

    // 2) EXPECTED TAT API (origin_pin + destination_pin + mot + pdt)
    let tatDays = null;
    let estimatedDate = null;

    try {
      if (tatBaseUrl && originPin) {
        // You said: origin_pin, destination_pin, mot (S/E), pdt (B2B/B2C/empty)
        // We'll use Surface (S) and B2C.
        const mot = "E";
        const pdt = "B2C";

        const tatUrl =
          tatBaseUrl +
          `?origin_pin=${encodeURIComponent(originPin)}` +
          `&destination_pin=${encodeURIComponent(pin)}` +
          `&mot=${encodeURIComponent(mot)}` +
          `&pdt=${encodeURIComponent(pdt)}`;

        const tatRes = await fetch(tatUrl, {
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

        console.log("[DELHIVERY TAT JSON]", tatJson);

        if (tatJson) {
          // 🔴 IMPORTANT: adjust these fields to what your TAT API actually returns.
          // Common patterns – you can tweak after checking logs:
          tatDays =
            tatJson.tat ||
            tatJson.days ||
            tatJson.expected_tat ||
            tatJson.tat_days ||
            (tatJson.data && (tatJson.data.tat || tatJson.data.expected_tat)) ||
            null;

          estimatedDate =
            tatJson.expected_delivery_date ||
            tatJson.delivery_date ||
            (tatJson.data &&
              (tatJson.data.expected_delivery_date ||
                tatJson.data.delivery_date)) ||
            null;

          // If API only gives days and no date, derive date from today
          if (tatDays && !estimatedDate) {
            const d = new Date();
            d.setDate(d.getDate() + Number(tatDays));
            estimatedDate = d.toISOString().slice(0, 10); // YYYY-MM-DD
          }
        }
      }
    } catch (tatErr) {
      console.error("[DELHIVERY TAT ERROR]", tatErr);
      // Don't break the whole API just because TAT failed
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
      tatDays: tatDays != null ? Number(tatDays) : null,
      estimatedDate,
    });
  } catch (error) {
    console.error("[DELHIVERY PINCODE ERROR]", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch serviceability",
    });
  }
}
