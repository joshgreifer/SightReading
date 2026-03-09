import { useEffect, useState, useRef, useCallback } from "react";
import { loadExerciseById } from "./engine/exerciseLoader";
import type { Exercise } from "./types/exercise";
import ScoreCanvas from "./score/ScoreCanvas";

function App() {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const animFrameRef = useRef<number>(0);
  const startWallTimeRef = useRef<number>(0);
  const startPlayTimeRef = useRef<number>(0);

  useEffect(() => {
    loadExerciseById("fur-elise")
      .then(setExercise)
      .catch((e) => setError(e.message));
  }, []);

  // Animation loop for playback
  const tick = useCallback(() => {
    const elapsed = (performance.now() - startWallTimeRef.current) / 1000;
    setCurrentTime(startPlayTimeRef.current + elapsed);
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const togglePlayback = useCallback(() => {
    if (playing) {
      cancelAnimationFrame(animFrameRef.current);
      setPlaying(false);
    } else {
      startWallTimeRef.current = performance.now();
      startPlayTimeRef.current = currentTime;
      setPlaying(true);
      animFrameRef.current = requestAnimationFrame(tick);
    }
  }, [playing, currentTime, tick]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  if (error) return <pre style={{ color: "red" }}>Error: {error}</pre>;
  if (!exercise) return <p>Loading...</p>;

  return (
    <div
      style={{
        background: "#1a1a2e",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "12px 20px",
          color: "#c8c8e0",
          fontFamily: "monospace",
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          gap: 20,
        }}
      >
        <strong>
          {exercise.title} — {exercise.composer}
        </strong>
        <span>
          {exercise.tempo.toFixed(0)} BPM | {exercise.timeSignature.join("/")}{" "}
          | {exercise.keySignature}
        </span>
        <button
          onClick={togglePlayback}
          style={{
            padding: "6px 16px",
            background: playing ? "#ff6b6b" : "#4a9eff",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontFamily: "monospace",
          }}
        >
          {playing ? "Stop" : "Play"}
        </button>
        <span>{currentTime.toFixed(1)}s</span>
      </div>

      <ScoreCanvas
        exercise={exercise}
        currentTime={currentTime}
        playing={playing}
      />

      {/* Time scrubber for manual testing */}
      <div style={{ padding: "12px 20px" }}>
        <input
          type="range"
          min={0}
          max={exercise.duration}
          step={0.1}
          value={currentTime}
          onChange={(e) => {
            if (!playing) {
              setCurrentTime(parseFloat(e.target.value));
            }
          }}
          style={{ width: "100%" }}
        />
      </div>
    </div>
  );
}

export default App;
