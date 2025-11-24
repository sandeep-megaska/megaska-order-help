// pages/size-quiz.js

import { useState } from "react";

const heightOptions = [
  "Below 150 cm",
  "150 – 159 cm",
  "160 – 169 cm",
  "170 – 179 cm",
  "180 cm and above",
];

const weightOptions = [
  "Below 45 kg",
  "45 – 54 kg",
  "55 – 64 kg",
  "65 – 74 kg",
  "75 – 84 kg",
  "85 kg and above",
];

const bustOptions = [
  "Below 82 cm",
  "82 – 87 cm",
  "88 – 93 cm",
  "94 – 99 cm",
  "100 – 105 cm",
  "106 cm and above",
];

const fitPreferenceOptions = [
  "Snug / body hugging",
  "Comfortable fit",
  "Relaxed / a bit loose",
];

// Very simple rule-based engine – adjust ranges as per your real size chart
function calculateSize({ height, weight, bust, fitPreference }) {
  // Convert answers into numeric “score”
  const score =
    heightOptions.indexOf(height) +
    weightOptions.indexOf(weight) +
    bustOptions.indexOf(bust);

  let baseSize;

  if (score <= 3) baseSize = "S";
  else if (score <= 5) baseSize = "M";
  else if (score <= 7) baseSize = "L";
  else if (score <= 9) baseSize = "XL";
  else baseSize = "XXL";

  // Adjust based on fit preference
  if (fitPreference === "Snug / body hugging") {
    if (baseSize === "M") baseSize = "S";
    else if (baseSize === "L") baseSize = "M";
    else if (baseSize === "XL") baseSize = "L";
  }

  if (fitPreference === "Relaxed / a bit loose") {
    if (baseSize === "S") baseSize = "M";
    else if (baseSize === "M") baseSize = "L";
    else if (baseSize === "L") baseSize = "XL";
  }

  return baseSize;
}

export default function SizeQuizPage() {
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [bust, setBust] = useState("");
  const [fitPreference, setFitPreference] = useState("");
  const [result, setResult] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!height || !weight || !bust || !fitPreference) return;

    const size = calculateSize({ height, weight, bust, fitPreference });
    setResult(size);

    // Optional: postMessage to parent window (Shopify) so you can display it outside iframe
    if (typeof window !== "undefined" && window.parent) {
      window.parent.postMessage(
        { type: "MEGASKA_SIZE_SUGGESTION", size },
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
        Answer a few quick questions to find your recommended Megaska size.
      </p>

      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", marginBo
