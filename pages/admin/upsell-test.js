import { useEffect, useState } from "react";

export default function UpsellTestPage() {
  const [offers, setOffers] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: "Add swim cap for ₹150",
    triggerProductIds: "",
    upsellProductId: "",
    upsellVariantId: "",
    targetPrice: "150",
    placementPdp: true,
    placementCart: true,
  });

  const fetchOffers = () => {
    setError(null);
    fetch("/api/admin/upsell-offers")
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error || "Error");
        setOffers(data.offers);
      })
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    fetchOffers();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const body = {
        title: form.title,
        triggerProductIds: form.triggerProductIds
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
          .map((x) => Number(x)),
        upsellProductId: Number(form.upsellProductId),
        upsellVariantId: Number(form.upsellVariantId),
        targetPrice: Number(form.targetPrice),
        placementPdp: form.placementPdp,
        placementCart: form.placementCart,
      };

      const res = await fetch("/api/admin/upsell-offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!data.ok) {
        console.error("Create error", data);
        throw new Error(data.error || "Unknown error");
      }

      alert("Offer created!");
      fetchOffers();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ padding: 20, fontFamily: "system-ui" }}>
      <h1>Upsell Offers – Admin Test</h1>

      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      <h2>Create test offer</h2>
      <form onSubmit={handleCreate} style={{ marginBottom: 20 }}>
        <div style={{ marginBottom: 8 }}>
          <label>
            Title:{" "}
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              style={{ width: 300 }}
            />
          </label>
        </div>

        <div style={{ marginBottom: 8 }}>
          <label>
            Trigger product IDs (comma-separated):{" "}
            <input
              name="triggerProductIds"
              value={form.triggerProductIds}
              onChange={handleChange}
              style={{ width: 300 }}
            />
          </label>
        </div>

        <div style={{ marginBottom: 8 }}>
          <label>
            Upsell product ID:{" "}
            <input
              name="upsellProductId"
              value={form.upsellProductId}
              onChange={handleChange}
              style={{ width: 200 }}
            />
          </label>
        </div>

        <div style={{ marginBottom: 8 }}>
          <label>
            Upsell variant ID:{" "}
            <input
              name="upsellVariantId"
              value={form.upsellVariantId}
              onChange={handleChange}
              style={{ width: 200 }}
            />
          </label>
        </div>

        <div style={{ marginBottom: 8 }}>
          <label>
            Target price (₹):{" "}
            <input
              name="targetPrice"
              value={form.targetPrice}
              onChange={handleChange}
              style={{ width: 100 }}
            />
          </label>
        </div>

        <div style={{ marginBottom: 8 }}>
          <label>
            <input
              type="checkbox"
              name="placementPdp"
              checked={form.placementPdp}
              onChange={handleChange}
            />{" "}
            Show on Product Page
          </label>
        </div>

        <div style={{ marginBottom: 8 }}>
          <label>
            <input
              type="checkbox"
              name="placementCart"
              checked={form.placementCart}
              onChange={handleChange}
            />{" "}
            Show on Cart
          </label>
        </div>

        <button type="submit" disabled={creating}>
          {creating ? "Creating…" : "Create Offer"}
        </button>
      </form>

      <h2>Existing offers</h2>
      {offers ? (
        <pre
          style={{
            background: "#111",
            color: "#0f0",
            padding: 10,
            fontSize: 12,
            borderRadius: 8,
            maxHeight: 320,
            overflow: "auto",
          }}
        >
          {JSON.stringify(offers, null, 2)}
        </pre>
      ) : (
        <p>Loading…</p>
      )}
    </div>
  );
}
