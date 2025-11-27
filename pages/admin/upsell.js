// pages/admin/upsell.js
import { useEffect, useState } from "react";

const ADMIN_TOKEN_HEADER = "x-megaska-admin-token";

export default function UpsellAdminPage() {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    status: "active",
    trigger_type: "collection", // "product" | "collection"
    trigger_product_ids_raw: "", // comma-separated
    trigger_collection_handles_raw: "swimwears",
    upsell_product_id: "",
    upsell_variant_id: "",
    base_price: "",
    target_price: "",
    title: "Add swim cap for ₹150",
    box_title: "Perfect match for your new swimsuit",
    box_subtitle: "Classic silicone cap for comfort & coverage",
    box_button_label: "Add swim cap for ₹150",
    placement_pdp: true,
    placement_cart: false,
  });

  // You can hardcode this for now while testing (but better to set via env + inline script)
  const adminToken =
    process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_TOKEN || ""; // optional: expose a public version

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function loadOffers() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/upsell-offers", {
        headers: { [ADMIN_TOKEN_HEADER]: adminToken },
      });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to load upsell offers");
      }
      setOffers(json.offers || []);
    } catch (err) {
      console.error(err);
      setError(err.message || "Error loading offers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOffers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function parseNumberOrNull(val) {
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function parseIdArray(raw) {
    if (!raw) return [];
    return raw
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x)
      .map((x) => parseInt(x, 10))
      .filter((n) => !Number.isNaN(n));
  }

  function parseHandleArray(raw) {
    if (!raw) return [];
    return raw
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x);
  }

 async function handleSubmit(e) {
  e.preventDefault();
  setSaving(true);
  setError("");

  // --- Basic client-side validation ---
  // Upsell product & offer price are always required
  if (!form.upsell_product_id || !form.target_price) {
    setError("Upsell product ID and offer price are required");
    setSaving(false);
    return;
  }

  // At least one trigger, depending on type
  if (
    form.trigger_type === "product" &&
    !form.trigger_product_ids_raw.trim()
  ) {
    setError("Please enter at least one trigger product ID");
    setSaving(false);
    return;
  }

  if (
    form.trigger_type === "collection" &&
    !form.trigger_collection_handles_raw.trim()
  ) {
    setError("Please enter at least one collection handle");
    setSaving(false);
    return;
  }

  try {
    const payload = {
      id: editingId || undefined,
      status: form.status,
      trigger_type: form.trigger_type,

      // product-trigger vs collection-trigger
      trigger_product_ids:
        form.trigger_type === "product"
          ? parseIdArray(form.trigger_product_ids_raw)
          : [],
      trigger_collection_handles:
        form.trigger_type === "collection"
          ? parseHandleArray(form.trigger_collection_handles_raw)
          : [],

      upsell_product_id: parseNumberOrNull(form.upsell_product_id),
      upsell_variant_id: parseNumberOrNull(form.upsell_variant_id),
      base_price: parseNumberOrNull(form.base_price),
      target_price: parseNumberOrNull(form.target_price),

      // auto compute discount if possible
      discount_amount:
        parseNumberOrNull(form.base_price) &&
        parseNumberOrNull(form.target_price)
          ? parseNumberOrNull(form.base_price) -
            parseNumberOrNull(form.target_price)
          : null,

      placement_pdp: form.placement_pdp,
      placement_cart: form.placement_cart,

      title: form.title,
      box_title: form.box_title,
      box_subtitle: form.box_subtitle,
      box_button_label: form.box_button_label,
    };

    // Extra safeguard: ensure we’re not sending empty arrays for triggers
    if (
      payload.trigger_type === "product" &&
      (!payload.trigger_product_ids || payload.trigger_product_ids.length === 0)
    ) {
      setError("At least one trigger product ID is required");
      setSaving(false);
      return;
    }

    if (
      payload.trigger_type === "collection" &&
      (!payload.trigger_collection_handles ||
        payload.trigger_collection_handles.length === 0)
    ) {
      setError("At least one trigger collection handle is required");
      setSaving(false);
      return;
    }

    const method = editingId ? "PUT" : "POST";

    const res = await fetch("/api/admin/upsell-offers", {
      method,
      headers: {
        "Content-Type": "application/json",
        [ADMIN_TOKEN_HEADER]: adminToken,
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    console.log("[UPSELL_ADMIN_SAVE_RESPONSE]", json); // helpful while debugging

    if (!json.ok) {
      // show *actual* error from API, not a generic one
      throw new Error(json.error || "Failed to save upsell");
    }

    await loadOffers();
    setEditingId(null);

    // Reset only the trigger/product bits; keep your texts as defaults
    setForm((prev) => ({
      ...prev,
      trigger_product_ids_raw: "",
      // leave collection handles + text fields as-is
    }));
  } catch (err) {
    console.error("UPSELL_ADMIN_SAVE_ERROR", err);
    setError(err.message || "Error saving upsell");
  } finally {
    setSaving(false);
  }
}

  function handleEdit(offer) {
    setEditingId(offer.id);
    setForm({
      status: offer.status || "active",
      trigger_type: offer.trigger_type || "collection",
      trigger_product_ids_raw: Array.isArray(offer.trigger_product_ids)
        ? offer.trigger_product_ids.join(",")
        : "",
      trigger_collection_handles_raw: Array.isArray(
        offer.trigger_collection_handles
      )
        ? offer.trigger_collection_handles.join(",")
        : "",
      upsell_product_id: offer.upsell_product_id || "",
      upsell_variant_id: offer.upsell_variant_id || "",
      base_price: offer.base_price || "",
      target_price: offer.target_price || "",
      title: offer.title || "",
      box_title: offer.box_title || "",
      box_subtitle: offer.box_subtitle || "",
      box_button_label: offer.box_button_label || "",
      placement_pdp: !!offer.placement_pdp,
      placement_cart: !!offer.placement_cart,
    });
  }

  function handleCancelEdit() {
    setEditingId(null);
    setError("");
  }

  return (
    <main
      style={{
        padding: "24px",
        fontFamily:
          '-apple-system, BlinkMacSystemFont,"Segoe UI", system-ui, sans-serif',
        maxWidth: "960px",
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "1.8rem", marginBottom: "4px" }}>
        Megaska Upsell Offers
      </h1>
      <p style={{ marginBottom: "16px", color: "#4b5563" }}>
        Create and manage smart upsell rules for PDP and Cart.
      </p>

      {error && (
        <div
          style={{
            marginBottom: "12px",
            padding: "8px 12px",
            borderRadius: "6px",
            background: "#fee2e2",
            color: "#b91c1c",
            fontSize: "0.9rem",
          }}
        >
          {error}
        </div>
      )}

      {/* Form */}
      <section
        style={{
          borderRadius: "10px",
          border: "1px solid #e5e7eb",
          padding: "16px",
          marginBottom: "24px",
          background: "#f9fafb",
        }}
      >
        <h2 style={{ fontSize: "1.1rem", marginBottom: "12px" }}>
          {editingId ? "Edit Upsell Offer" : "Create Upsell Offer"}
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Status + Placement */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <label style={{ fontSize: "0.9rem" }}>
              Status
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                style={{
                  display: "block",
                  marginTop: "4px",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                }}
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </label>

            <label style={{ fontSize: "0.9rem" }}>
              <input
                type="checkbox"
                name="placement_pdp"
                checked={form.placement_pdp}
                onChange={handleChange}
                style={{ marginRight: "4px" }}
              />
              PDP
            </label>

            <label style={{ fontSize: "0.9rem" }}>
              <input
                type="checkbox"
                name="placement_cart"
                checked={form.placement_cart}
                onChange={handleChange}
                style={{ marginRight: "4px" }}
              />
              Cart
            </label>
          </div>

          {/* Trigger type */}
          <div style={{ marginBottom: "12px" }}>
            <span style={{ fontSize: "0.9rem", marginRight: "8px" }}>
              Trigger by:
            </span>
            <label style={{ fontSize: "0.9rem", marginRight: "12px" }}>
              <input
                type="radio"
                name="trigger_type"
                value="collection"
                checked={form.trigger_type === "collection"}
                onChange={handleChange}
                style={{ marginRight: "4px" }}
              />
              Collection
            </label>
            <label style={{ fontSize: "0.9rem" }}>
              <input
                type="radio"
                name="trigger_type"
                value="product"
                checked={form.trigger_type === "product"}
                onChange={handleChange}
                style={{ marginRight: "4px" }}
              />
              Product IDs
            </label>
          </div>

          {form.trigger_type === "collection" ? (
            <label
              style={{
                display: "block",
                marginBottom: "12px",
                fontSize: "0.9rem",
              }}
            >
              Collection handle(s) (comma separated)
              <input
                type="text"
                name="trigger_collection_handles_raw"
                value={form.trigger_collection_handles_raw}
                onChange={handleChange}
                placeholder="swimwears, burkinis"
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "4px",
                  padding: "6px 8px",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                }}
              />
            </label>
          ) : (
            <label
              style={{
                display: "block",
                marginBottom: "12px",
                fontSize: "0.9rem",
              }}
            >
              Trigger product IDs (comma separated)
              <input
                type="text"
                name="trigger_product_ids_raw"
                value={form.trigger_product_ids_raw}
                onChange={handleChange}
                placeholder="8737107968136, 8737107968137"
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "4px",
                  padding: "6px 8px",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                }}
              />
            </label>
          )}

          {/* Upsell product + pricing */}
          <div
            style={{
              display: "grid",
              gap: "12px",
              gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
              marginBottom: "12px",
            }}
          >
            <label style={{ fontSize: "0.9rem" }}>
              Upsell product ID
              <input
                type="text"
                name="upsell_product_id"
                value={form.upsell_product_id}
                onChange={handleChange}
                placeholder="8680600567944"
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "4px",
                  padding: "6px 8px",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                }}
              />
            </label>

            <label style={{ fontSize: "0.9rem" }}>
              Upsell variant ID
              <input
                type="text"
                name="upsell_variant_id"
                value={form.upsell_variant_id}
                onChange={handleChange}
                placeholder="44300318539912"
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "4px",
                  padding: "6px 8px",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                }}
              />
            </label>

            <label style={{ fontSize: "0.9rem" }}>
              Base price (₹)
              <input
                type="text"
                name="base_price"
                value={form.base_price}
                onChange={handleChange}
                placeholder="280"
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "4px",
                  padding: "6px 8px",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                }}
              />
            </label>

            <label style={{ fontSize: "0.9rem" }}>
              Offer price (₹)
              <input
                type="text"
                name="target_price"
                value={form.target_price}
                onChange={handleChange}
                placeholder="150"
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "4px",
                  padding: "6px 8px",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                }}
              />
            </label>
          </div>

          {/* Box texts */}
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              fontSize: "0.9rem",
            }}
          >
            Internal title (simple label)
            <input
              type="text"
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="Add swim cap for ₹150"
              style={{
                display: "block",
                width: "100%",
                marginTop: "4px",
                padding: "6px 8px",
                borderRadius: "6px",
                border: "1px solid #d1d5db",
              }}
            />
          </label>

          <label
            style={{
              display: "block",
              marginBottom: "8px",
              fontSize: "0.9rem",
            }}
          >
            Box headline (shown on PDP)
            <input
              type="text"
              name="box_title"
              value={form.box_title}
              onChange={handleChange}
              placeholder="Perfect match for your new swimsuit"
              style={{
                display: "block",
                width: "100%",
                marginTop: "4px",
                padding: "6px 8px",
                borderRadius: "6px",
                border: "1px solid #d1d5db",
              }}
            />
          </label>

          <label
            style={{
              display: "block",
              marginBottom: "8px",
              fontSize: "0.9rem",
            }}
          >
            Box subtext
            <input
              type="text"
              name="box_subtitle"
              value={form.box_subtitle}
              onChange={handleChange}
              placeholder="Classic silicone cap for comfort & coverage"
              style={{
                display: "block",
                width: "100%",
                marginTop: "4px",
                padding: "6px 8px",
                borderRadius: "6px",
                border: "1px solid #d1d5db",
              }}
            />
          </label>

          <label
            style={{
              display: "block",
              marginBottom: "12px",
              fontSize: "0.9rem",
            }}
          >
            Button label
            <input
              type="text"
              name="box_button_label"
              value={form.box_button_label}
              onChange={handleChange}
              placeholder="Add swim cap for ₹150"
              style={{
                display: "block",
                width: "100%",
                marginTop: "4px",
                padding: "6px 8px",
                borderRadius: "6px",
                border: "1px solid #d1d5db",
              }}
            />
          </label>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "8px 14px",
                borderRadius: "999px",
                border: "none",
                background: "#111827",
                color: "#fff",
                fontSize: "0.9rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {saving
                ? editingId
                  ? "Saving..."
                  : "Creating..."
                : editingId
                ? "Save changes"
                : "Create upsell"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                style={{
                  padding: "8px 14px",
                  borderRadius: "999px",
                  border: "1px solid #d1d5db",
                  background: "#f9fafb",
                  fontSize: "0.9rem",
                  cursor: "pointer",
                }}
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </section>

      {/* Existing offers */}
      <section>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "8px" }}>
          Existing Offers
        </h2>
        {loading ? (
          <p style={{ fontSize: "0.9rem", color: "#6b7280" }}>Loading...</p>
        ) : offers.length === 0 ? (
          <p style={{ fontSize: "0.9rem", color: "#6b7280" }}>
            No upsell offers yet.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.85rem",
              }}
            >
              <thead>
                <tr style={{ background: "#f3f4f6" }}>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Trigger</th>
                  <th style={thStyle}>Upsell product</th>
                  <th style={thStyle}>Pricing</th>
                  <th style={thStyle}>Placement</th>
                  <th style={thStyle}>Headline</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {offers.map((o) => {
                  const placements = [];
                  if (o.placement_pdp) placements.push("PDP");
                  if (o.placement_cart) placements.push("Cart");
                  return (
                    <tr key={o.id}>
                      <td style={tdStyle}>{o.status}</td>
                      <td style={tdStyle}>
                        {o.trigger_type === "product" ? (
                          <>
                            <div>Product IDs</div>
                            <div style={{ color: "#4b5563" }}>
                              {(o.trigger_product_ids || []).join(", ")}
                            </div>
                          </>
                        ) : (
                          <>
                            <div>Collection(s)</div>
                            <div style={{ color: "#4b5563" }}>
                              {(o.trigger_collection_handles || []).join(", ")}
                            </div>
                          </>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <div>ID: {o.upsell_product_id}</div>
                        <div style={{ color: "#4b5563" }}>
                          Variant: {o.upsell_variant_id}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div>Base: ₹{o.base_price}</div>
                        <div>Offer: ₹{o.target_price}</div>
                        {o.discount_amount ? (
                          <div style={{ color: "#059669" }}>
                            Save: ₹{o.discount_amount}
                          </div>
                        ) : null}
                      </td>
                      <td style={tdStyle}>{placements.join(", ")}</td>
                      <td style={tdStyle}>
                        <div>{o.box_title || o.title}</div>
                        {o.box_subtitle && (
                          <div style={{ color: "#4b5563" }}>
                            {o.box_subtitle}
                          </div>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          onClick={() => handleEdit(o)}
                          style={{
                            padding: "4px 10px",
                            borderRadius: "999px",
                            border: "1px solid #d1d5db",
                            background: "#f9fafb",
                            cursor: "pointer",
                          }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

const thStyle = {
  textAlign: "left",
  padding: "8px",
  borderBottom: "1px solid #e5e7eb",
};

const tdStyle = {
  padding: "8px",
  borderBottom: "1px solid #f3f4f6",
  verticalAlign: "top",
};
