// pages/admin/index.js

import Link from 'next/link';

export default function MegaskaAdminHome() {
  return (
    <div style={{ maxWidth: 960, margin: '24px auto', padding: '0 16px' }}>
      <h1>Megaska Smart Tools – Control Center</h1>
      <p style={{ color: '#555', marginBottom: 24 }}>
        Central hub for all internal tools connected to your Shopify store.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <AdminCard
          title="Upsell Offers"
          description="Create and manage PDP & cart upsell rules."
          href="/admin/upsell"
        />

        <AdminCard
          title="Returns & Exchanges"
          description="Manage cancel, return, exchange, defect workflows."
          href="/admin/returns" // set to your actual path
        />

        <AdminCard
          title="Wallet & Credits"
          description="View and manage Megaska wallet balances and refunds."
          href="/admin/wallet" // your actual path
        />

        <AdminCard
          title="Size & Style Quizzes"
          description="Configure quiz questions and style/size mappings."
          href="/admin/quizzes" // your actual path
        />

        <AdminCard
          title="Discount Filters"
          description="Configure discount % filters for collections."
          href="/admin/discounts" // your actual path
        />
      </div>
    </div>
  );
}

function AdminCard({ title, description, href }) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px solid #ddd',
        padding: 16,
        background: '#fafafa',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 140,
      }}
    >
      <div>
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 18 }}>{title}</h2>
        <p style={{ margin: 0, color: '#555', fontSize: 14 }}>{description}</p>
      </div>
      <div style={{ marginTop: 16 }}>
        <Link
          href={href}
          style={{
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
            padding: '6px 12px',
            borderRadius: 999,
            border: '1px solid #111827',
            color: '#111827',
            display: 'inline-block',
          }}
        >
          Open
        </Link>
      </div>
    </div>
  );
}
