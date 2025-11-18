import { useRouter } from "next/router";
import { useState } from "react";

export default function WalletAdmin() {
  const router = useRouter();
  const [orderId, setOrderId] = useState(router.query.order_id || "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("COD refund approved");
  const [status, setStatus] = useState("Ready");

  async function handleCredit() {
    if (!orderId) {
      alert("Please enter an order ID (numeric).");
      return;
    }

    setStatus("Processing wallet credit...");

    try {
      const params = new URLSearchParams({
        action: "adminCreditWallet",
        admin_token: process.env.NEXT_PUBLIC_ADMIN_WALLET_TOKEN,
        order_ref: orderId,
      });

      // Optional: allow custom amount override
      if (amount) {
        params.set("amount", amount);
      }
      if (reason) {
        params.set("reason", reason);
      }

      const res = await fetch("/api/proxy?" + params.toString());
      const data = await res.json();

      if (!data.ok) {
        console.error("ADMIN_CREDIT_ERROR", data);
        setStatus("Error: " + (data.error || "Failed to credit wallet"));
        return;
      }

      setStatus(
        `Wallet credited successfully. New balance: ₹${data.newBalance}`
      );
    } catch (err) {
      console.error(err);
      setStatus("Network error while crediting wallet.");
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Megaska Wallet Admin</h1>
      <p style={{ maxWidth: 600 }}>
        Use this panel to issue <strong>wallet credits for COD orders</strong>.
        Prepaid refunds should be processed in Razorpay and not via wallet.
      </p>

      <div style={{ marginTop: 20, maxWidth: 400 }}>
        <label style={{ display: "block", marginBottom: 4 }}>
  Shopify Order Number (e.g. 521225)
</label>
<input
  type="text"
  value={orderId}
  onChange={(e) => setOrderId(e.target.value)}
  style={{
    width: "100%",
    padding: "8px 10px",
    borderRadius: 4,
    border: "1px solid #ccc",
  }}
  placeholder="e.g. 521225"
/>


        <label style={{ display: "block", marginTop: 12, marginBottom: 4 }}>
          Amount to credit (leave blank to use full order total)
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 4,
            border: "1px solid #ccc",
          }}
          placeholder="e.g. 349"
        />

        <label style={{ display: "block", marginTop: 12, marginBottom: 4 }}>
          Reason
        </label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 4,
            border: "1px solid #ccc",
          }}
        />

        <button
          onClick={handleCredit}
          style={{
            marginTop: 18,
            padding: "10px 16px",
            borderRadius: 4,
            border: "none",
            background: "#111827",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Issue Wallet Credit
        </button>

        <p style={{ marginTop: 16 }}>{status}</p>
      </div>
    </main>
  );
}
