// pages/proxy/index.js

export async function getServerSideProps() {
  // When Shopify hits /apps/megaska-order-help (mapped to /proxy on Vercel),
  // tell the BROWSER to go to /apps/megaska-order-help/quiz,
  // so it stays under the app-proxy path.
  return {
    redirect: {
      destination: '/apps/megaska-order-help/quiz',
      permanent: false,
    },
  };
}

// No UI needed because we immediately redirect
export default function ProxyIndex() {
  return null;
}
