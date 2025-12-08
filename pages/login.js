// pages/login.js
import { useState } from "react";
import supabase from "../lib/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!supabase) {
      setErrorMsg(
        "Auth is not configured on the server. Please check Supabase env variables."
      );
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("Login error:", error);
        setErrorMsg(error.message || "Login failed");
        return;
      }

      setSuccessMsg("Login successful. Redirecting...");
      window.location.href = "/";
    } catch (err) {
      console.error("Unexpected login error:", err);
      setErrorMsg("Unexpected error during login. Please try again.");
    } finally {
      setLoading(false);
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
          width: "100%",
          maxWidth: "420px",
          background: "#fff",
          borderRadius: "16px",
          padding: "28px 24px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        }}
      >
        <img
          src="/LOGO BigOnBuY.png"
          alt="Bigonbuy"
          style={{ height: "36px", width: "auto", marginBottom: "12px" }}
        />

        <h1 style={{ marginTop: 0, fontSize: "20px" }}>Login to Console</h1>
        <p style={{ fontSize: "14px", color: "#666", marginBottom: "16px" }}>
          Access is restricted to Bigonbuy / Megaska employees.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "12px" }}>
            <label
              htmlFor="email"
              style={{
                display: "block",
                fontSize: "13px",
                marginBottom: "4px",
              }}
            >
              Work Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: "8px",
                border: "1px solid #ccc",
                fontSize: "14px",
              }}
            />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="password"
              style={{
                display: "block",
                fontSize: "13px",
                marginBottom: "4px",
              }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: "8px",
                border: "1px solid #ccc",
                fontSize: "14px",
              }}
            />
          </div>

          {errorMsg && (
            <p style={{ color: "red", fontSize: "13px", marginBottom: "8px" }}>
              {errorMsg}
            </p>
          )}

          {successMsg && (
            <p
              style={{ color: "green", fontSize: "13px", marginBottom: "8px" }}
            >
              {successMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px 16px",
              borderRadius: "999px",
              border: "none",
              backgroundColor: "#111",
              color: "#fff",
              fontSize: "14px",
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </main>
  );
}
