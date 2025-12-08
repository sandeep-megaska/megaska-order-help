// pages/index.js
import { useEffect, useState } from "react";
import supabase from "../lib/supabaseClient";

export default function Home() {
  const [user, setUser] = useState(null);
  const [checkingUser, setCheckingUser] = useState(true);

  // Load current user on mount and subscribe to auth changes
  useEffect(() => {
    async function loadUser() {
      if (!supabase) {
        setCheckingUser(false);
        return;
      }

      const { data, error } = await supabase.auth.getUser();
      if (!error) {
        setUser(data.user || null);
      }
      setCheckingUser(false);
    }

    loadUser();

    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription?.unsubscribe?.();
    };
  }, []);

  async function handleLogout() {
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
      setUser(null);
    } catch (err) {
      console.error("Logout error:", err);
    }
  }

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
          maxWidth: "720px",
          width: "100%",
          background: "#fff",
          borderRadius: "16px",
          padding: "32px 28px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        }}
      >
        {/* Header: Bigonbuy logo only */}
        <header
          style={{
            marginBottom: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <img
            src="/LOGO BigOnBuY.png"
            alt="Bigonbuy"
            style={{ height: "48px", width: "auto" }}
          />

          {/* Welcome pill when logged in */}
          {!checkingUser && user && (
            <div
              style={{
                fontSize: "12px",
                padding: "6px 10px",
                borderRadius: "999px",
                backgroundColor: "#f5f5f5",
                border: "1px solid #eee",
                color: "#444",
                maxWidth: "260px",
                textAlign: "right",
              }}
            >
              Welcome,&nbsp;
              <strong style={{ fontWeight: 600 }}>
                {user.email || "Employee"}
              </strong>
            </div>
          )}
        </header>

        {/* Our Brands section with only Megaska */}
        <section style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "16px", marginBottom: "12px" }}>Our Brands</h2>
          <div
            style={{
              display: "flex",
              gap: "16px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <a
              href="https://www.megaska.com"
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 14px",
                borderRadius: "999px",
                border: "1px solid #ddd",
                textDecoration: "none",
                color: "#111",
                fontSize: "14px",
              }}
            >
              <img
                src="/logo megaska.png" // adjust if your file name differs
                alt="Megaska"
                style={{ height: "28px", width: "auto" }}
              />
              <span>Megaska</span>
            </a>
          </div>
        </section>

        {/* Internal tools */}
        <section style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "16px", marginBottom: "8px" }}>Internal Apps</h2>
          <ul
            style={{
              paddingLeft: "18px",
              margin: 0,
              color: "#333",
              fontSize: "14px",
            }}
          >
            <li>
              <a href="/order-help">🛍 Megaska Order Help App</a>
            </li>
            <li>👥 HR (coming soon)</li>
            <li>📊 Finance (coming soon)</li>
            <li>📦 ERP Dashboard (coming soon)</li>
          </ul>
        </section>

        {/* Auth / footer section */}
        <section
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid #eee",
            paddingTop: "16px",
            gap: "12px",
          }}
        >
          {user ? (
            <>
              <span style={{ fontSize: "13px", color: "#777" }}>
                Logged in as{" "}
                <strong style={{ fontWeight: 600 }}>
                  {user.email || "employee"}
                </strong>
              </span>
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  padding: "10px 18px",
                  borderRadius: "999px",
                  border: "none",
                  backgroundColor: "#111",
                  color: "#fff",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Logout
              </button>
            </>
          ) : (
            <>
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
            </>
          )}
        </section>
      </div>
    </main>
  );
}
