// pages/proxy/index.js
export async function getServerSideProps() {
  // When Shopify hits /apps/megaska-order-help,
  // it maps to /proxy on your Vercel app.
  // We simply redirect that to /proxy/quiz.
  return {
    redirect: {
      destination: '/proxy/quiz',
      permanent: false,
    },
  };
}

// No UI needed because we immediately redirect
export default function ProxyIndex() {
  return null;
}
