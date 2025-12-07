// pages/index.js

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        backgroundColor: "#f5f5f5",
        padding: "24px",
      }}
    >
      <div
        style={{
          maxWidth: "720px",
          width: "100%",
          background: "#fff",
          borderRadius: "16px",
          padding: "32px 28px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        }}
      >
        <header style={{ marginBottom: "24px" }}>
          <h1 style={{ margin: 0, fontSize: "24px" }}>Bigonbuy Business Console</h1>
          <p style={{ margin: "8px 0 0", color: "#555" }}>
            Internal tools for <strong>Megaska</strong> &amp; Bigonbuy Trading Pvt Ltd.
          </p>
        </header>

        {/* Public brand link */}
        <section style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "16px", marginBottom: "8px" }}>Customer Website</h2>
          <a
            href="https://www.megaska.com"
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-block",
              padding: "10px 16px",
              borderRadius: "999px",
              border: "1px solid #ddd",
              textDecoration: "none",
              color: "#111",
              fontSize: "14px",
            }}
          >
            🌐 Visit megaska.com
          </a>
        </section>

        {/* Internal tools */}
        <section style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "16px", marginBottom: "8px" }}>Internal Apps</h2>
          <ul style={{ paddingLeft: "18px", margin: 0, color: "#333", fontSize: "14px" }}>
            <li>
              <a href="/order-help">🛍 Megaska Order Help App</a>
            </li>
            <li>👥 HR (coming soon)</li>
            <li>📊 Finance (coming soon)</li>
            <li>📦 ERP Dashboard (coming soon)</li>
          </ul>
        </section>

        {/* Auth section */}
        <section
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid #eee",
            paddingTop: "16px",
          }}
        >
          <span style={{ fontSize: "13px", color: "#777" }}>
            Authorized employees only.
          </span>
          <a
            href="/login"
            style={{
              padding: "10px 18px",
              borderRadius: "999px",
              backgroundColor: "#111",
              color: "#fff",
              textDecoration: "none",
              fontSize: "14px",
            }}
          >
            Login to Console
          </a>
        </section>
      </div>
    </main>
  );
}
