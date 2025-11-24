// pages/proxy/index.js

export default function ProxyIndex() {
  // This is what Shopify will embed at /apps/megaska-order-help
  return (
    <main style={{ padding: "32px", fontFamily: "system-ui", maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.8rem", marginBottom: "12px" }}>
        Megaska Smart Tools
      </h1>
      <p style={{ marginBottom: "16px", color: "#4b5563" }}>
        Welcome to Megaska’s customer tools. From here you can:
      </p>
      <ul style={{ marginBottom: "20px", paddingLeft: "20px", color: "#111827" }}>
        <li>Check order & size exchange options</li>
        <li>Report delivery issues</li>
        <li>Use your Megaska wallet</li>
        <li><strong>Try the Body Confidence Quiz</strong> to find your best-fit styles</li>
      </ul>

      <a
        href="/apps/megaska-order-help/quiz"
        style={{
          display: "inline-block",
          padding: "10px 18px",
          borderRadius: "999px",
          background: "#111827",
          color: "#ffffff",
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        Start Body Confidence Quiz
      </a>
    </main>
  );
}
