import { useEffect, useState } from "react";
import { loadExerciseById } from "./engine/exerciseLoader";
import type { Exercise } from "./types/exercise";

function App() {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadExerciseById("gymnopedie-1")
      .then(setExercise)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <pre style={{ color: "red" }}>Error: {error}</pre>;
  if (!exercise) return <p>Loading...</p>;

  return (
    <div style={{ fontFamily: "monospace", padding: 20 }}>
      <h2>{exercise.title} — {exercise.composer}</h2>
      <p>
        Tempo: {exercise.tempo.toFixed(1)} BPM | Time sig:{" "}
        {exercise.timeSignature.join("/")} | Key: {exercise.keySignature} |
        Duration: {exercise.duration.toFixed(1)}s | Difficulty:{" "}
        {exercise.difficulty}
      </p>
      <p>
        Tracks: {exercise.tracks.length} | Total notes:{" "}
        {exercise.allNotes.length}
      </p>

      {exercise.tracks.map((track, i) => (
        <div key={i}>
          <h3>
            {track.name} (ch {track.channel}, {track.notes.length} notes)
          </h3>
          <p>
            Pitch range: {Math.min(...track.notes.map((n) => n.pitch))}–
            {Math.max(...track.notes.map((n) => n.pitch))} | First onset:{" "}
            {track.notes[0]?.onset.toFixed(3)}s | Last onset:{" "}
            {track.notes[track.notes.length - 1]?.onset.toFixed(3)}s
          </p>
          <details>
            <summary>First 20 notes</summary>
            <table>
              <thead>
                <tr>
                  <th>Pitch</th>
                  <th>Onset (s)</th>
                  <th>Duration (s)</th>
                </tr>
              </thead>
              <tbody>
                {track.notes.slice(0, 20).map((n, j) => (
                  <tr key={j}>
                    <td>{n.pitch}</td>
                    <td>{n.onset.toFixed(3)}</td>
                    <td>{n.duration.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      ))}
    </div>
  );
}

export default App;