import type { NextPage } from "next";

const Home: NextPage = () => {
  return (
    <main style={{ padding: 20, fontFamily: "system-ui" }}>
      <h1>Megaska Order Help App</h1>
      <p>
        Backend is running. This page is only for testing – Shopify will mainly
        talk to our <code>/api/proxy</code> endpoint.
      </p>
    </main>
  );
};

export default Home;
