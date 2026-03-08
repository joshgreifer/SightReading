import { Midi } from "@tonejs/midi";
import type {
  Exercise,
  ExerciseIndexEntry,
  ExerciseTrack,
  NoteEvent,
} from "../types/exercise";

const EXERCISES_BASE = "/exercises";

/**
 * Fetch and parse the exercise index.
 */
export async function loadExerciseIndex(): Promise<ExerciseIndexEntry[]> {
  const resp = await fetch(`${EXERCISES_BASE}/index.json`);
  if (!resp.ok) {
    throw new Error(`Failed to load exercise index: ${resp.statusText}`);
  }
  return resp.json();
}

/**
 * Fetch a MIDI file and parse it with @tonejs/midi.
 */
async function loadMidiFile(filename: string): Promise<Midi> {
  const url = `${EXERCISES_BASE}/${filename}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to load MIDI file: ${url} (${resp.statusText})`);
  }
  const arrayBuffer = await resp.arrayBuffer();
  return new Midi(arrayBuffer);
}

/**
 * Extract tempo from the MIDI header.
 * Returns the first tempo event's BPM, or 120 as default.
 */
function getMidiTempo(midi: Midi): number {
  if (midi.header.tempos.length > 0) {
    return midi.header.tempos[0].bpm;
  }
  return 120;
}

/**
 * Extract time signature from the MIDI header.
 * Returns the first time signature, or [4, 4] as default.
 */
function getMidiTimeSignature(midi: Midi): [number, number] {
  if (midi.header.timeSignatures.length > 0) {
    const ts = midi.header.timeSignatures[0].timeSignature;
    return [ts[0], ts[1]];
  }
  return [4, 4];
}

/**
 * Extract key signature from the MIDI header.
 * Returns "key scale" string, or "C major" as default.
 */
function getMidiKeySignature(midi: Midi): string {
  if (midi.header.keySignatures.length > 0) {
    const ks = midi.header.keySignatures[0];
    return `${ks.key} ${ks.scale}`;
  }
  return "C major";
}

/**
 * Convert a @tonejs/midi track to our internal ExerciseTrack format.
 */
function convertTrack(
  track: Midi["tracks"][number],
  index: number,
): ExerciseTrack {
  const notes: NoteEvent[] = track.notes.map((n) => ({
    pitch: n.midi,
    onset: n.time,
    duration: n.duration,
  }));

  // Ensure sorted by onset
  notes.sort((a, b) => a.onset - b.onset);

  return {
    name: track.name || `Track ${index + 1}`,
    channel: track.channel,
    notes,
  };
}

/**
 * Load a single exercise by its index entry.
 * Fetches the MIDI file, parses it, and merges with index metadata.
 */
export async function loadExercise(
  entry: ExerciseIndexEntry,
): Promise<Exercise> {
  const midi = await loadMidiFile(entry.midiFile);

  // Filter out empty tracks (e.g. conductor tracks with no notes)
  const tracks = midi.tracks
    .map((t, i) => convertTrack(t, i))
    .filter((t) => t.notes.length > 0);

  // Flatten all notes for grading, sorted by onset
  const allNotes = tracks
    .flatMap((t) => t.notes)
    .sort((a, b) => a.onset - b.onset);

  // Use index overrides where provided, otherwise read from MIDI
  const tempo = entry.tempo ?? getMidiTempo(midi);
  const timeSignature = entry.timeSignature ?? getMidiTimeSignature(midi);
  const keySignature = entry.keySignature ?? getMidiKeySignature(midi);

  return {
    id: entry.id,
    title: entry.title,
    composer: entry.composer,
    difficulty: entry.difficulty,
    tempo,
    timeSignature,
    keySignature,
    duration: midi.duration,
    tracks,
    allNotes,
  };
}

/**
 * Convenience: load the full index and return a specific exercise by ID.
 */
export async function loadExerciseById(id: string): Promise<Exercise> {
  const index = await loadExerciseIndex();
  const entry = index.find((e) => e.id === id);
  if (!entry) {
    throw new Error(`Exercise not found: ${id}`);
  }
  return loadExercise(entry);
}