import { useState } from "react";

export default function Quiz() {
  const [step, setStep] = useState(1);

  return (
    <main style={{ padding: 30, fontFamily: "system-ui" }}>
      <h1>Megaska Body Confidence Quiz</h1>

      {step === 1 && (
        <>
          <p>What type of coverage makes you feel most confident?</p>
          <button onClick={() => setStep(2)}>Full coverage</button>
          <button onClick={() => setStep(2)}>Mid coverage</button>
          <button onClick={() => setStep(2)}>Minimal coverage</button>
        </>
      )}

      {step === 2 && (
        <>
          <p>What is your preferred fit?</p>
          <button onClick={() => setStep(3)}>Relaxed</button>
          <button onClick={() => setStep(3)}>Regular</button>
          <button onClick={() => setStep(3)}>Slim</button>
        </>
      )}

      {step === 3 && (
        <>
          <h2>✨ Your recommended styles</h2>
          <p>Based on your answers, we think you will love:</p>
          <ul>
            <li>Megaska Full-Length Swimwear</li>
            <li>Megaska Burkini Range</li>
            <li>Megaska Knee-Length Dresses</li>
          </ul>
        </>
      )}
    </main>
  );
}
