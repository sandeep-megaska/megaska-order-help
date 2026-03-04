import { useEffect, useMemo, useState } from "react";

export default function OpsInbox() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("NEW");
  const [type, setType] = useState("ALL");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("megaska_admin_token") || "";
    setToken(saved);
  }, []);

  const canLoad = useMemo(() => token && token.trim().length > 0, [token]);

  async function load() {
    if (!canLoad) return;
    setErr("");
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("admin_token", token);
      qs.set("status", status);
      if (type !== "ALL") qs.set("type", type);

      const res = await fetch(`/api/admin/order-requests/list?${qs.toString()}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to load");

      setRows(data.rows || []);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function update(id, nextStatus) {
    setErr("");
    try {
      const res = await fetch(`/api/admin/order-requests/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ admin_token: token, id, status: nextStatus }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Update failed");
      await load();
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Megaska Ops Inbox</h1>
      <p style={{ color: "#4b5563", marginTop: 0 }}>
        Exchange + Defect requests captured from customer account page.
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Admin Token</div>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste ADMIN_WALLET_TOKEN"
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", minWidth: 320 }}
          />
          <button
            onClick={() => localStorage.setItem("megaska_admin_token", token)}
            style={{ marginLeft: 8, padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff" }}
          >
            Save
          </button>
        </div>

        <div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Status</div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            <option value="NEW">NEW</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="DONE">DONE</option>
          </select>
        </div>

        <div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Type</div>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            <option value="ALL">ALL</option>
            <option value="EXCHANGE">EXCHANGE</option>
            <option value="DEFECT">DEFECT</option>
          </select>
        </div>

        <button
          disabled={!canLoad || loading}
          onClick={load}
          style={{
            padding: "10px 14px",
            borderRadius: 999,
            border: "1px solid #111827",
            background: "#111827",
            color: "#fff",
            fontWeight: 700,
            opacity: !canLoad || loading ? 0.6 : 1,
          }}
        >
          {loading ? "Loading..." : "Load"}
        </button>
      </div>

      {err ? (
        <div style={{ background: "#fee2e2", border: "1px solid #fecaca", padding: 12, borderRadius: 12, marginBottom: 12 }}>
          {err}
        </div>
      ) : null}

      <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f9fafb", textAlign: "left" }}>
              {["Created", "Type", "Order", "Customer", "Details", "Actions"].map((h) => (
                <th key={h} style={{ padding: 12, borderBottom: "1px solid #e5e7eb", fontSize: 12, color: "#6b7280" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((r) => {
              const p = r.payload || {};
              const details =
                r.request_type === "EXCHANGE"
                  ? `New size: ${p.new_size || "-"} | SKU: ${p.sku || "-"} | ${p.product_name || ""}`
                  : `Issue: ${p.issue_type || "-"} | SKU: ${p.sku || "-"} | ${p.product_name || ""}`;

              return (
                <tr key={r.id}>
                  <td style={{ padding: 12, borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap" }}>
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #f3f4f6" }}>{r.request_type}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid #f3f4f6" }}>
                    <div style={{ fontWeight: 700 }}>{r.order_name || "-"}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>{r.order_id || ""}</div>
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #f3f4f6" }}>
                    <div>{r.customer_email || "-"}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>{r.customer_phone || ""}</div>
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #f3f4f6" }}>{details}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap" }}>
                    {r.status !== "IN_PROGRESS" ? (
                      <button
                        onClick={() => update(r.id, "IN_PROGRESS")}
                        style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", marginRight: 8 }}
                      >
                        In Progress
                      </button>
                    ) : null}
                    {r.status !== "DONE" ? (
                      <button
                        onClick={() => update(r.id, "DONE")}
                        style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #111827", background: "#111827", color: "#fff" }}
                      >
                        Done
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}

            {!rows || rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 16, color: "#6b7280" }}>
                  No rows.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
