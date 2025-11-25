// pages/style-quiz.js
import React, { useState } from "react";

const bodyShapes = [
  "Pear (heavier hips/thighs)",
  "Apple (more weight around tummy)",
  "Hourglass (balanced bust & hips)",
  "Rectangle (straight up & down)",
  "Busty (larger bust)",
  "Petite (shorter height)",
  "Plus size / curvy",
  "Not sure",
];

const coverageOptions = [
  "Light coverage",
  "Moderate coverage",
  "Full coverage",
  "Maximum coverage / Modest",
];

const activityOptions = [
  "Beach holiday & photos",
  "Recreational swimming / pool",
  "Swimming classes",
  "Aqua aerobics / water fitness",
  "Water sports / active use",
];

const comfortPriorities = [
  "Bust support",
  "Thigh coverage",
  "Tummy control",
  "Arm coverage",
  "Shoulder / upper chest coverage",
  "Free movement / sporty",
];

const styleVibeOptions = [
  "Simple & elegant",
  "Sporty & powerful",
  "Colourful & fun prints",
  "Classic dark shades",
];

// Build persona text for AI / vector search
function buildPersonaText(answers) {
  const { bodyShape, coverage, activity, comforts = [], styleVibe } = answers;

  return [
    "Indian woman",
    bodyShape || "",
    coverage ? `coverage preference: ${coverage}` : "",
    activity ? `main activity: ${activity}` : "",
    comforts.length
      ? `comfort priorities: ${comforts.join(", ")}`
      : "",
    styleVibe ? `style vibe: ${styleVibe}` : "",
  ]
    .filter(Boolean)
    .join(". ");
}

// Rule-based explanation / style label
function recommendStyle(answers) {
  const { bodyShape, coverage, activity, comforts = [], styleVibe } = answers;

  let mainStyle = "";
  const reasons = [];
  const collections = [];

  const wantsMaxCoverage =
    coverage === "Full coverage" ||
    coverage === "Maximum coverage / Modest" ||
    comforts.includes("Thigh coverage") ||
    comforts.includes("Arm coverage") ||
    comforts.includes("Shoulder / upper chest coverage");

  const sportyUse =
    activity === "Aqua aerobics / water fitness" ||
    activity === "Water sports / active use" ||
    activity === "Swimming classes";

  if (wantsMaxCoverage && sportyUse) {
    mainStyle = "Full-length Modest Swimwear";
    reasons.push(
      "You prefer more coverage with secure support for active movement.",
      "Full-length styles stay in place during laps, classes and aqua fitness."
    );
  } else if (wantsMaxCoverage && !sportyUse) {
    mainStyle = "Burkini or Full-Coverage Frock Style";
    reasons.push(
      "You’re looking for maximum modesty and coverage.",
      "Burkini and full-coverage frock styles give arm, leg and tummy coverage while staying feminine."
    );
  } else if (!wantsMaxCoverage && sportyUse) {
    mainStyle = "Sporty Full-Length or Knee-Length Suit";
    reasons.push(
      "You’re active in the water and want freedom to move.",
      "Sporty full or knee-length pieces are great for classes and fitness."
    );
  } else {
    mainStyle = "Knee-Length / Frock Style Swimsuit";
    reasons.push(
      "You want a balance of coverage and ease.",
      "Knee-length and frock styles are flattering for casual swimming and holidays."
    );
  }

  if (bodyShape === "Pear (heavier hips/thighs)") {
    reasons.push(
      "A-line or frock silhouettes skim the hips and thighs for a balanced look."
    );
  }
  if (bodyShape === "Busty (larger bust)") {
    reasons.push(
      "Higher necklines and built-in bust support help you feel secure and confident."
    );
  }
  if (bodyShape === "Petite (shorter height)") {
    reasons.push(
      "Clean lines and not-too-long hemlines prevent overwhelming your frame."
    );
  }
  if (bodyShape === "Plus size / curvy") {
    reasons.push(
      "Structured coverage and gentle tummy-control panels can enhance comfort."
    );
  }

  if (comforts.includes("Tummy control")) {
    reasons.push(
      "Look for styles with tummy-control panels or darker mid panels."
    );
  }
  if (comforts.includes("Free movement / sporty")) {
    reasons.push(
      "Raglan sleeves and stretchy full-length suits are great for movement."
    );
  }

  let patternTip = "";
  if (styleVibe === "Simple & elegant") {
    patternTip = "Choose solid colours or subtle patterns in deep or jewel tones.";
  } else if (styleVibe === "Sporty & powerful") {
    patternTip =
      "Try colour-blocked or panelled designs that feel energetic and athletic.";
  } else if (styleVibe === "Colourful & fun prints") {
    patternTip =
      "Go for printed frock styles or burkinis with playful patterns.";
  } else if (styleVibe === "Classic dark shades") {
    patternTip =
      "Deep navy, black and wine shades are timeless, slimming and modest.";
  }
  if (patternTip) reasons.push(patternTip);

  return { mainStyle, reasons, collections };
}

export default function StyleQuizPage() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({
    bodyShape: "",
    coverage: "",
    activity: "",
    comforts: [],
    styleVibe: "",
  });
  const [result, setResult] = useState(null);

  const goNext = () => setStep((s) => Math.min(4, s + 1));
  const goPrev = () => setStep((s) => Math.max(0, s - 1));

  const handleAnswer = (field, value, advance = true) => {
    setAnswers((prev) => ({ ...prev, [field]: value }));
    if (advance) goNext();
  };

  const toggleComfort = (value) => {
    setAnswers((prev) => {
      const set = new Set(prev.comforts || []);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...prev, comforts: Array.from(set) };
    });
  };

  const canShowResult =
    answers.bodyShape &&
    answers.coverage &&
    answers.activity &&
    answers.styleVibe;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canShowResult) return;

    const rec = recommendStyle(answers);
    const personaText = buildPersonaText(answers);

    setResult(rec);

    // Call backend AI recommendation
    fetch("/api/style-recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: personaText }),
    })
      .then((res) => res.json())
      .then((data) => {
        setResult((prev) => ({
          ...prev,
          products: data.products || [],
        }));
      })
      .catch((err) => {
        console.error("AI recommendation error", err);
      });

    if (typeof window !== "undefined" && window.parent) {
      window.parent.postMessage(
        { type: "MEGASKA_STYLE_SUGGESTION", style: rec.mainStyle },
        "*"
      );
    }
  };

  return (
         <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "8px",
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "999px",
            background:
              "radial-gradient(circle at 30% 30%, #ffffff, #ffe4ff 40%, #d9d6ff 80%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "14px",
          }}
        >
          ✨
        </div>
        <div>
          <h1
            style={{
              fontSize: "1.3rem",
              margin: 0,
            }}
          >
            Megaska AI Stylist
          </h1>
          <p
            style={{
              fontSize: "0.8rem",
              margin: 0,
              opacity: 0.8,
            }}
          >
            Body Confidence Quiz for Indian women
          </p>
        </div>
      </div>
      <p
        style={{
          fontSize: "0.9rem",
          marginBottom: "14px",
          lineHeight: 1.4,
        }}
      >
       <p>
  Answer a few quick questions and we'll suggest a swimwear style
  that supports your body, comfort and modesty.
</p>


      <form onSubmit={handleSubmit}>
        {step === 0 && (
          <div>
            <h2 style={{ fontSize: "1rem", marginBottom: "8px" }}>
              1. How would you describe your body shape?
            </h2>
            <div>
              {bodyShapes.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleAnswer("bodyShape", opt)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    marginBottom: "6px",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    border:
                      answers.bodyShape === opt
                        ? "2px solid #111"
                        : "1px solid #ddd",
                    background:
                      answers.bodyShape === opt ? "#f5f5f5" : "#fff",
                    fontSize: "0.9rem",
                    cursor: "pointer",
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 style={{ fontSize: "1rem", marginBottom: "8px" }}>
              2. How much coverage do you prefer?
            </h2>
            {coverageOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => handleAnswer("coverage", opt)}
                style={{
  display: "block",
  width: "100%",
  textAlign: "left",
  marginBottom: "6px",
  padding: "8px 10px",
  borderRadius: "8px",
  border:
    answers.coverage === opt
      ? "2px solid #111"
      : "1px solid #ddd",
  background:
    answers.coverage === opt ? "#f5f5f5" : "#fff",
  fontSize: "0.9rem",
  cursor: "pointer",
}}

              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 style={{ fontSize: "1rem", marginBottom: "8px" }}>
              3. Where will you mainly use your swimwear?
            </h2>
            {activityOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => handleAnswer("activity", opt)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  marginBottom: "6px",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border:
                    answers.activity === opt
                      ? "2px solid #111"
                      : "1px solid #ddd",
                  background:
                    answers.activity === opt ? "#f5f5f5" : "#fff",
                  fontSize: "0.9rem",
                  cursor: "pointer",
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 style={{ fontSize: "1rem", marginBottom: "8px" }}>
              4. What matters most for your comfort?
            </h2>
            <p
              style={{
                fontSize: "0.8rem",
                marginBottom: "6px",
                opacity: 0.8,
              }}
            >
              Choose all that apply.
            </p>
            {comfortPriorities.map((opt) => {
              const active = (answers.comforts || []).includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleComfort(opt)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    marginBottom: "6px",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    border: active
                      ? "2px solid #111"
                      : "1px solid #ddd",
                    background: active ? "#f5f5f5" : "#fff",
                    fontSize: "0.9rem",
                    cursor: "pointer",
                  }}
                >
                  {opt}
                </button>
              );
            })}
            <button
              type="button"
              onClick={goNext}
              style={{
                marginTop: "8px",
                padding: "8px 12px",
                borderRadius: "999px",
                border: "none",
                background: "#111",
                color: "#fff",
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              Next
            </button>
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 style={{ fontSize: "1rem", marginBottom: "8px" }}>
              5. Which style vibe feels most like you?
            </h2>
            {styleVibeOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() =>
                  setAnswers((prev) => ({ ...prev, styleVibe: opt }))
                }
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  marginBottom: "6px",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border:
                    answers.styleVibe === opt
                      ? "2px solid #111"
                      : "1px solid #ddd",
                  background:
                    answers.styleVibe === opt ? "#f5f5f5" : "#fff",
                  fontSize: "0.9rem",
                  cursor: "pointer",
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {/* Footer navigation */}
        <div
          style={{
            marginTop: "10px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "0.8rem",
          }}
        >
          <button
            type="button"
            onClick={goPrev}
            disabled={step === 0}
            style={{
              opacity: step === 0 ? 0.4 : 1,
              border: "none",
              background: "transparent",
              cursor: step === 0 ? "default" : "pointer",
              padding: 0,
            }}
          >
            ← Back
          </button>

          <span>Step {step + 1} of 5</span>

          {step === 4 && canShowResult ? (
            <button
              type="submit"
              style={{
                border: "none",
                background: "transparent",
                color: "#111",
                textDecoration: "underline",
                cursor: "pointer",
                padding: 0,
              }}
            >
              See my style match
            </button>
          ) : (
            <span />
          )}
        </div>
      </form>

      {result && (
        <div
          style={{
            marginTop: "16px",
            padding: "12px",
            borderRadius: "10px",
            border: "1px solid #e5e5e5",
            fontSize: "0.9rem",
          }}
        >
          <strong>Your Megaska match: {result.mainStyle}</strong>
          <ul
            style={{
              marginTop: "8px",
              paddingLeft: "18px",
              lineHeight: 1.4,
            }}
          >
            {result.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>

          {result.products && result.products.length > 0 && (
            <div style={{ marginTop: "12px" }}>
              <p
                style={{
                  fontSize: "0.9rem",
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Styles we think you&apos;ll love:
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: "10px",
                }}
              >
                {result.products.map((p) => (
                  <a
                    key={p.url}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      border: "1px solid #eee",
                      borderRadius: "8px",
                      padding: "6px",
                      textDecoration: "none",
                      color: "#111",
                      fontSize: "0.8rem",
                    }}
                  >
                    {p.image && (
                      <div
                        style={{
                          width: "100%",
                          paddingBottom: "120%",
                          position: "relative",
                          marginBottom: "4px",
                          overflow: "hidden",
                          borderRadius: "6px",
                        }}
                      >
                        <img
                          src={p.image}
                          alt={p.title}
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      </div>
                    )}
                    <div>{p.title}</div>
                  </a>
                ))}
              </div>
            </div>
          )}

          <p
            style={{
              marginTop: "14px",
              fontSize: "0.75rem",
              opacity: 0.7,
              lineHeight: 1.4,
            }}
          >
            This quiz is a friendly guide based on Megaska&apos;s experience
            with Indian body types and modest swimwear. You know your body best
            — if you feel safer one step up in coverage, choose the
            higher-coverage style.
          </p>
        </div>
      )}
    </div>
  );
}
