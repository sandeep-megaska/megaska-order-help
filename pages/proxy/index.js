export default function ProxyHome() {
  return (
    <main style={{ padding: "40px", maxWidth: "600px", margin: "0 auto" }}>
      <h1>Megaska Smart Tools</h1>
      <p>
        This app powers:
      </p>

      <ul>
        <li>Order Cancellation</li>
        <li>Size Exchange Requests</li>
        <li>Defect Reporting</li>
        <li>Megaska Wallet</li>
        <li>✨ New: Body Confidence Quiz</li>
      </ul>

      <a 
        href="/apps/megaska-order-help/quiz" 
        style={{
          display: "inline-block",
          padding: "12px 20px",
          background: "#111",
          color: "#fff",
          borderRadius: "8px",
          marginTop: "20px",
          textDecoration: "none"
        }}
      >
        Start Body Confidence Quiz
      </a>
    </main>
  );
}
