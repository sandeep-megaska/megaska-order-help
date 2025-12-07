// pages/login.js

export default function Login() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        backgroundColor: "#f5f5f5",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#fff",
          borderRadius: "16px",
          padding: "28px 24px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        }}
      >
        <img
          src="/bigonbuy-logo.png"
          alt="Bigonbuy"
          style={{ height: "36px", width: "auto", marginBottom: "12px" }}
        />
        <h1 style={{ marginTop: 0, fontSize: "20px" }}>Login to Console</h1>
        <p style={{ fontSize: "14px", color: "#666", marginBottom: "16px" }}>
          Access is restricted to Bigonbuy / Megaska employees.
        </p>

        <p style={{ fontSize: "13px", color: "#999" }}>
          Authentication system will be added here (superadmin, employees, etc.).
          For now this page simply prevents the 404 error.
        </p>
      </div>
    </main>
  );
}
