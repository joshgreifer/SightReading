/**
 * A single note event, as used by both the exercise engine (expected notes)
 * and the audio detector (detected notes).
 */
export interface NoteEvent {
  /** MIDI note number (21–108 for standard 88-key piano) */
  pitch: number;
  /** Onset time in seconds from start of exercise */
  onset: number;
  /** Duration in seconds */
  duration: number;
}

/**
 * A track of notes, corresponding to one staff / hand.
 */
export interface ExerciseTrack {
  /** Track name from the MIDI file, if available */
  name: string;
  /** MIDI channel (0-indexed) */
  channel: number;
  /** Notes in this track, sorted by onset time */
  notes: NoteEvent[];
}

/**
 * Fully parsed exercise, ready for score rendering and grading.
 */
export interface Exercise {
  /** Unique ID from the exercise index */
  id: string;
  /** Display title */
  title: string;
  /** Composer name */
  composer: string;
  /** Difficulty rating (1 = beginner, higher = harder) */
  difficulty: number;
  /** Tempo in BPM */
  tempo: number;
  /** Time signature, e.g. [3, 4] */
  timeSignature: [number, number];
  /** Key signature string, e.g. "D major" */
  keySignature: string;
  /** Total duration in seconds */
  duration: number;
  /** Per-track note data (preserves staff assignment) */
  tracks: ExerciseTrack[];
  /** All notes flattened and sorted by onset (for grading) */
  allNotes: NoteEvent[];
}

/**
 * A single entry in the exercise index JSON file.
 * Tempo, timeSignature, and keySignature are optional overrides —
 * if omitted, values are read from the MIDI file.
 */
export interface ExerciseIndexEntry {
  id: string;
  title: string;
  composer: string;
  difficulty: number;
  midiFile: string;
  tempo?: number;
  timeSignature?: [number, number];
  keySignature?: string;
}