// pages/size-quiz.js
import { useState } from "react";

// Megaska size chart (in inches)
const sizeOrder = ["S", "M", "L", "XL", "XXL"];

const sizeChart = [
  { size: "S", bustMax: 34, waistMax: 30, hipMax: 36 },
  { size: "M", bustMax: 36, waistMax: 32, hipMax: 38 },
  { size: "L", bustMax: 38, waistMax: 34, hipMax: 40 },
  { size: "XL", bustMax: 40, waistMax: 36, hipMax: 42 },
  { size: "XXL", bustMax: 42, waistMax: 38, hipMax: 44 },
];

function getSizeFromMeasurement(value, type) {
  if (!value || Number.isNaN(value)) return null;

  for (const row of sizeChart) {
    if (type === "bust" && value <= row.bustMax) return row.size;
    if (type === "waist" && value <= row.waistMax) return row.size;
    if (type === "hip" && value <= row.hipMax) return row.size;
  }

  // If above XXL range, default to largest size
  return "XXL";
}

function adjustForFitPreference(baseSize, fitPreference) {
  if (!baseSize) return null;

  const idx = sizeOrder.indexOf(baseSize);
  if (idx === -1) return baseSize;

  if (fitPreference === "Snug / body hugging") {
    // go one size down if possible
    return sizeOrder[Math.max(0, idx - 1)];
  }

  if (fitPreference === "Relaxed / a bit loose") {
    // go one size up if possible
    return sizeOrder[Math.min(sizeOrder.length - 1, idx + 1)];
  }

  // Comfortable fit → no change
  return baseSize;
}

function calculateSize({ bust, waist, hip, fitPreference }) {
  const bustSize = getSizeFromMeasurement(bust, "bust");
  const waistSize = getSizeFromMeasurement(waist, "waist");
  const hipSize = getSizeFromMeasurement(hip, "hip");

  // Pick the largest size among bust/waist/hip for modest fit
  const sizes = [bustSize, waistSize, hipSize].filter(Boolean);
  if (sizes.length === 0) return null;

  let maxIndex = 0;
  sizes.forEach((s) => {
    const idx = sizeOrder.indexOf(s);
    if (idx > maxIndex) maxIndex = idx;
  });

  let baseSize = sizeOrder[maxIndex];

  // Adjust for fit preference
  const finalSize = adjustForFitPreference(baseSize, fitPreference);

  return { finalSize, bustSize, waistSize, hipSize };
}

export default function SizeQuizPage() {
  const [bust, setBust] = useState("");
  const [waist, setWaist] = useState("");
  const [hip, setHip] = useState("");
  const [fitPreference, setFitPreference] = useState("");
  const [result, setResult] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();

    const bustNum = parseFloat(bust);
    const waistNum = parseFloat(waist);
    const hipNum = parseFloat(hip);

    if (
      !bust ||
      !waist ||
      !hip ||
      !fitPreference ||
      Number.isNaN(bustNum) ||
      Number.isNaN(waistNum) ||
      Number.isNaN(hipNum)
    ) {
      return;
    }

    const sizeResult = calculateSize({
      bust: bustNum,
      waist: waistNum,
      hip: hipNum,
      fitPreference,
    });

    setResult(sizeResult);

    if (sizeResult?.finalSize && typeof window !== "undefined" && window.parent) {
      window.parent.postMessage(
        {
          type: "MEGASKA_SIZE_SUGGESTION",
          size: sizeResult.finalSize,
        },
        "*"
      );
    }
  };

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        padding: "20px",
        maxWidth: "420px",
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "1.4rem", marginBottom: "12px" }}>
        Megaska Size Helper
      </h1>
      <p style={{ fontSize: "0.9rem", marginBottom: "16px", lineHeight: 1.4 }}>
        Enter your body measurements in inches to find your recommended Megaska size.
      </p>

      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", marginBottom: "12px" }}>
          <span style={{ fontSize: "0.85rem" }}>Bust (inches)</span>
          <input
            type="number"
            step="0.5"
            min="28"
            max="50"
            value={bust}
            onChange={(e) => setBust(e.target.value)}
            style={{
              width: "100%",
              padding: "8px",
              marginTop: "4px",
            }}
            required
          />
        </label>

        <label style={{ display: "block", marginBottom: "12px" }}>
          <span style={{ fontSize: "0.85rem" }}>Waist (inches)</span>
          <input
            type="number"
            step="0.5"
            min="24"
            max="48"
            value={waist}
            onChange={(e) => setWaist(e.target.value)}
            style={{
              width: "100%",
              padding: "8px",
              marginTop: "4px",
            }}
            required
          />
        </label>

        <label style={{ display: "block", marginBottom: "16px" }}>
          <span style={{ fontSize: "0.85rem" }}>Hips (inches)</span>
          <input
            type="number"
            step="0.5"
            min="30"
            max="52"
            value={hip}
            onChange={(e) => setHip(e.target.value)}
            style={{
              width: "100%",
              padding: "8px",
              marginTop: "4px",
            }}
            required
          />
        </label>

        <label style={{ display: "block", marginBottom: "16px" }}>
          <span style={{ fontSize: "0.85rem" }}>Fit preference</span>
          <select
            value={fitPreference}
            onChange={(e) => setFitPreference(e.target.value)}
            style={{
              width: "100%",
              padding: "8px",
              marginTop: "4px",
            }}
            required
          >
            <option value="">Select fit preference</option>
            <option value="Snug / body hugging">Snug / body hugging</option>
            <option value="Comfortable fit">Comfortable fit</option>
            <option value="Relaxed / a bit loose">Relaxed / a bit loose</option>
          </select>
        </label>

        <button
          type="submit"
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: "999px",
            border: "none",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Find my size
        </button>
      </form>

      {result?.finalSize && (
        <div
          style={{
            marginTop: "16px",
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid #e5e5e5",
            fontSize: "0.9rem",
          }}
        >
          <strong>Suggested size: {result.finalSize}</strong>
          <p style={{ marginTop: "4px" }}>
            Based on your measurements:
          </p>
          <ul style={{ marginTop: "4px", paddingLeft: "18px" }}>
            <li>Bust best match: {result.bustSize}</li>
            <li>Waist best match: {result.waistSize}</li>
            <li>Hips best match: {result.hipSize}</li>
          </ul>
          <p style={{ marginTop: "6px" }}>
            We recommend starting with <b>{result.finalSize}</b> for a modest
            coverage fit. If you’re between sizes, we usually suggest the
            larger size.
          </p>
        </div>
      )}

      <p style={{ fontSize: "0.75rem", marginTop: "16px", opacity: 0.7 }}>
        Measurements are body measurements in inches. For layered modest swimwear,
        many customers prefer a slightly relaxed fit rather than very tight.
      </p>
    </div>
  );
}
