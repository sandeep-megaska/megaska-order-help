// pages/admin/upsell.js

import { useEffect, useState } from 'react';

const ADMIN_TOKEN = process.env.NEXT_PUBLIC_ADMIN_WALLET_TOKEN;
const SHOP_DOMAIN = 'bigonbuy-fashions.myshopify.com';

function emptyForm() {
  return {
    id: null,
    title: 'Add swim cap for ₹150',
    trigger_type: 'product', // or 'collection'
    trigger_collection_handles: 'swimwears',
    trigger_product_ids: '',
    upsell_product_id: '',
    upsell_variant_id: '',
    base_price: '',
    target_price: '',
    placement_pdp: true,
    placement_cart: true,
    box_title: 'Perfect match for your new swimsuit',
    box_subtitle: 'Classic silicone cap for comfort & coverage',
    box_button_label: 'Add swim cap for ₹150',
  };
}

export default function UpsellAdminPage() {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(emptyForm());

  // ------------------------------------
  // Helpers
  // ------------------------------------

  async function fetchOffers() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/admin/upsell-offers?shop_domain=${encodeURIComponent(
          SHOP_DOMAIN
        )}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-admin-dashboard-token': ADMIN_TOKEN || '',
          },
        }
      );

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load offers');
      }
      setOffers(data.offers || []);
    } catch (err) {
      console.error('Fetch offers error', err);
      setError(err.message || 'Failed to load offers');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchOffers();
  }, []);

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }

  function editOffer(offer) {
    setForm({
      id: offer.id,
      title: offer.title || '',
      trigger_type: offer.trigger_type || 'product',
      trigger_collection_handles:
        (offer.trigger_collection_handles || []).join(','),
      trigger_product_ids: (offer.trigger_product_ids || []).join(','),
      upsell_product_id: offer.upsell_product_id || '',
      upsell_variant_id: offer.upsell_variant_id || '',
      base_price:
        offer.base_price !== null && offer.base_price !== undefined
          ? String(offer.base_price)
          : '',
      target_price:
        offer.target_price !== null && offer.target_price !== undefined
          ? String(offer.target_price)
          : '',
      placement_pdp: !!offer.placement_pdp,
      placement_cart: !!offer.placement_cart,
      box_title: offer.box_title || '',
      box_subtitle: offer.box_subtitle || '',
      box_button_label: offer.box_button_label || '',
    });
    setMessage(`Editing offer ${offer.id}`);
    setError('');
  }

  function resetForm() {
    setForm(emptyForm());
    setMessage('');
    setError('');
  }

  // ------------------------------------
  // Create / Update
  // ------------------------------------

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        shop_domain: SHOP_DOMAIN,
        ...form,
      };

      // Clean up some fields
      if (payload.trigger_product_ids) {
        payload.trigger_product_ids = payload.trigger_product_ids
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        payload.trigger_product_ids = [];
      }

      if (payload.trigger_collection_handles) {
        payload.trigger_collection_handles = payload.trigger_collection_handles
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        payload.trigger_collection_handles = [];
      }

      const method = form.id ? 'PUT' : 'POST';

      const res = await fetch('/api/admin/upsell-offers', {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-admin-dashboard-token': ADMIN_TOKEN || '',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to save offer');
      }

      setMessage(form.id ? 'Offer updated' : 'Offer created');
      setError('');
      setForm(emptyForm());
      await fetchOffers();
    } catch (err) {
      console.error('Save offer error', err);
      setError(err.message || 'Failed to save offer');
    } finally {
      setSaving(false);
    }
  }

  // ------------------------------------
  // Delete
  // ------------------------------------

  async function handleDelete(id) {
    if (!window.confirm('Delete this upsell offer?')) return;
    setError('');
    setMessage('');
    try {
      const res = await fetch(
        `/api/admin/upsell-offers?id=${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-dashboard-token': ADMIN_TOKEN || '',
          },
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to delete offer');
      }
      setMessage('Offer deleted');
      await fetchOffers();
      if (form.id === id) {
        resetForm();
      }
    } catch (err) {
      console.error('Delete offer error', err);
      setError(err.message || 'Failed to delete offer');
    }
  }

  // ------------------------------------
  // Render
  // ------------------------------------

  return (
    <div style={{ maxWidth: 900, margin: '24px auto', padding: '0 16px' }}>
      <h1>Megaska Upsell Offers</h1>
      <p style={{ color: '#555' }}>
        Admin dashboard for managing PDP & Cart upsell rules.
      </p>

      {error && (
        <div
          style={{
            background: '#ffe5e5',
            padding: '8px 12px',
            borderRadius: 6,
            marginBottom: 12,
            color: '#b00020',
          }}
        >
          {error}
        </div>
      )}

      {message && (
        <div
          style={{
            background: '#e6ffed',
            padding: '8px 12px',
            borderRadius: 6,
            marginBottom: 12,
            color: '#046b2c',
          }}
        >
          {message}
        </div>
      )}

      <section
        style={{
          marginBottom: 24,
          padding: 16,
          borderRadius: 10,
          border: '1px solid #ddd',
        }}
      >
        <h2 style={{ marginTop: 0 }}>
          {form.id ? 'Edit Upsell Offer' : 'Create Upsell Offer'}
        </h2>
        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gap: 12 }}>
            {form.id && (
              <div>
                <label style={{ fontSize: 12, color: '#666' }}>ID</label>
                <div style={{ fontSize: 12 }}>{form.id}</div>
              </div>
            )}

            <div>
              <label>Title</label>
              <input
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label>Trigger type</label>
              <select
                name="trigger_type"
                value={form.trigger_type}
                onChange={handleChange}
              >
                <option value="product">Product</option>
                <option value="collection">Collection</option>
              </select>
            </div>

            {form.trigger_type === 'collection' && (
              <div>
                <label>Collection handles (comma separated)</label>
                <input
                  type="text"
                  name="trigger_collection_handles"
                  value={form.trigger_collection_handles}
                  onChange={handleChange}
                  placeholder="swimwears"
                  style={{ width: '100%' }}
                />
              </div>
            )}

            {form.trigger_type === 'product' && (
              <div>
                <label>Trigger product IDs (comma separated)</label>
                <input
                  type="text"
                  name="trigger_product_ids"
                  value={form.trigger_product_ids}
                  onChange={handleChange}
                  placeholder="8737107968136"
                  style={{ width: '100%' }}
                />
              </div>
            )}

            <div>
              <label>Upsell product ID</label>
              <input
                type="text"
                name="upsell_product_id"
                value={form.upsell_product_id}
                onChange={handleChange}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label>Upsell variant ID</label>
              <input
                type="text"
                name="upsell_variant_id"
                value={form.upsell_variant_id}
                onChange={handleChange}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label>Base price (MRP)</label>
                <input
                  type="number"
                  name="base_price"
                  value={form.base_price}
                  onChange={handleChange}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label>Offer price (target)</label>
                <input
                  type="number"
                  name="target_price"
                  value={form.target_price}
                  onChange={handleChange}
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div>
              <label>Box title</label>
              <input
                type="text"
                name="box_title"
                value={form.box_title}
                onChange={handleChange}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label>Box subtitle</label>
              <input
                type="text"
                name="box_subtitle"
                value={form.box_subtitle}
                onChange={handleChange}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label>Button label</label>
              <input
                type="text"
                name="box_button_label"
                value={form.box_button_label}
                onChange={handleChange}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 16 }}>
              <label>
                <input
                  type="checkbox"
                  name="placement_pdp"
                  checked={form.placement_pdp}
                  onChange={handleChange}
                />{' '}
                Show on PDP
              </label>
              <label>
                <input
                  type="checkbox"
                  name="placement_cart"
                  checked={form.placement_cart}
                  onChange={handleChange}
                />{' '}
                Show in Cart
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="submit"
                disabled={saving || !ADMIN_TOKEN}
                style={{ padding: '6px 16px' }}
              >
                {saving ? 'Saving...' : form.id ? 'Update Offer' : 'Create Offer'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                style={{ padding: '6px 16px' }}
              >
                Reset
              </button>
            </div>

            {!ADMIN_TOKEN && (
              <div style={{ fontSize: 12, color: '#b00020' }}>
                NEXT_PUBLIC_ADMIN_DASHBOARD_TOKEN is not set – API calls will be
                unauthorized.
              </div>
            )}
          </div>
        </form>
      </section>

      <section
        style={{
          padding: 16,
          borderRadius: 10,
          border: '1px solid #ddd',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Existing Offers</h2>
        {loading ? (
          <div>Loading offers…</div>
        ) : offers.length === 0 ? (
          <div>No upsell offers yet.</div>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
            }}
          >
            <thead>
              <tr>
                <th align="left">Title</th>
                <th align="left">Trigger</th>
                <th align="left">Price</th>
                <th align="left">Placement</th>
                <th align="left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => (
                <tr key={offer.id}>
                  <td>{offer.title}</td>
                  <td>
                    {offer.trigger_type === 'product'
                      ? `Product (${(offer.trigger_product_ids || []).join(
                          ', '
                        )})`
                      : `Collection (${(offer.trigger_collection_handles ||
                          []).join(', ')})`}
                  </td>
                  <td>
                    ₹{offer.target_price}{' '}
                    {offer.base_price
                      ? ` / MRP ₹${offer.base_price}`
                      : ''}
                  </td>
                  <td>
                    {offer.placement_pdp && 'PDP '}
                    {offer.placement_cart && 'Cart'}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => editOffer(offer)}
                      style={{ marginRight: 8 }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(offer.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
