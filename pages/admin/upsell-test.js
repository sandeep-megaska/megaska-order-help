import { useEffect, useState } from "react";

export default function UpsellTestPage() {
  const [offers, setOffers] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/admin/upsell-offers")
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error || "Error");
        setOffers(data.offers);
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: "system-ui" }}>
      <h1>Upsell Offers – Smoke Test</h1>
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {offers ? (
        <pre
          style={{
            background: "#111",
            color: "#0f0",
            padding: 10,
            fontSize: 12,
            borderRadius: 8,
            maxHeight: 300,
            overflow: "auto",
          }}
        >
          {JSON.stringify(offers, null, 2)}
        </pre>
      ) : (
        !error && <p>Loading…</p>
      )}
    </div>
  );
}
