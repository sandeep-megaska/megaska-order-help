export default function Home() {
  return (
    <main style={{ padding: 20, fontFamily: "system-ui" }}>
      <h1>Megaska Order Help App</h1>
      <p>
        Backend is running. Shopify will mainly call our
        {" "}
        <code>/api/proxy</code>
        {" "}
        endpoint via App Proxy.
      </p>
    </main>
  );
}
