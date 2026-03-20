import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import supabase from "../../lib/supabaseClient";

export default function ErpDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let authSubscription;

    async function loadUser() {
      if (!supabase) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase.auth.getUser();

      if (error || !data?.user) {
        router.replace("/login");
        return;
      }

      setUser(data.user);
      setCheckingAuth(false);

      authSubscription = supabase.auth.onAuthStateChange((_event, session) => {
        if (!session?.user) {
          router.replace("/login");
        } else {
          setUser(session.user);
        }
      }).data.subscription;
    }

    loadUser();

    return () => {
      authSubscription?.unsubscribe?.();
    };
  }, [router]);

  if (checkingAuth) {
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
            background: "#fff",
            padding: "20px 24px",
            borderRadius: "12px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            fontSize: "14px",
            color: "#555",
          }}
        >
          Checking authentication...
        </div>
      </main>
    );
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
          width: "100%",
          maxWidth: "720px",
          background: "#fff",
          borderRadius: "16px",
          padding: "32px 28px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "12px",
          }}
        >
          <div>
            <p
              style={{
                fontSize: "13px",
                margin: 0,
                color: "#888",
                letterSpacing: "0.5px",
              }}
            >
              Bigonbuy ERP
            </p>
            <h1 style={{ margin: "4px 0 0", fontSize: "22px" }}>
              Operations Console
            </h1>
          </div>
          {user && (
            <div
              style={{
                fontSize: "12px",
                padding: "6px 10px",
                borderRadius: "999px",
                backgroundColor: "#f5f5f5",
                border: "1px solid #eee",
                color: "#444",
              }}
            >
              {user.email || "Employee"}
            </div>
          )}
        </header>

        <p style={{ marginTop: 0, color: "#555", fontSize: "14px" }}>
          Lightweight ERP home for product, variant, and inventory controls.
        </p>

        <div
          style={{
            marginTop: "20px",
            display: "grid",
            gap: "12px",
          }}
        >
          {[
            { href: "/erp/products", label: "Products" },
            { href: "/erp/variants", label: "Variants" },
            { href: "/erp/inventory", label: "Inventory" },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              style={{
                display: "block",
                padding: "14px 16px",
                borderRadius: "12px",
                border: "1px solid #e6e6e6",
                textDecoration: "none",
                color: "#111",
                backgroundColor: "#fafafa",
                transition: "box-shadow 0.2s ease, transform 0.2s ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span style={{ fontSize: "15px" }}>{item.label}</span>
                <span style={{ color: "#999", fontSize: "13px" }}>
                  placeholder →
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
