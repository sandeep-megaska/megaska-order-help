// pages/api/proxy.js

export default async function handler(req, res) {
  const action = req.query.action || "ping";

  // For now, ignore all other actions. Just prove the route builds.
  res.status(200).json({
    ok: true,
    message: "Megaska App Proxy is alive (minimal handler).",
    action: action
  });
}
