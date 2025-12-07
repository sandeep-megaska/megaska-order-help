// pages/api/profile/ensure.js
import supabaseAdmin from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { user } = req.body;
  if (!user || !user.id || !user.email) {
    return res.status(400).json({ ok: false, error: "Missing user info" });
  }

  const email = user.email.toLowerCase();

  // Determine role based on env
  const superAdminEmails = (process.env.SUPERADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const role = superAdminEmails.includes(email) ? "superadmin" : "employee";

  const { error } = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email,
        role,
      },
      { onConflict: "id" }
    );

  if (error) {
    console.error("Error upserting profile:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }

  return res.status(200).json({ ok: true, role });
}
