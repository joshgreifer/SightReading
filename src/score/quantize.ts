/**
 * Quantization and music theory utilities.
 */

// ---------------------------------------------------------------------------
// Rhythmic value types
// ---------------------------------------------------------------------------

export type NoteType =
  | "whole"
  | "half"
  | "quarter"
  | "eighth"
  | "sixteenth"
  | "thirtysecond";

export interface QuantizedNote {
  type: NoteType;
  dotted: boolean;
}

/**
 * Duration thresholds for quantization (in beats).
 * Each entry: [minBeats, maxBeats, type, dotted]
 * Ordered from longest to shortest.
 */
const DURATION_TABLE: [number, number, NoteType, boolean][] = [
  [3.5, Infinity, "whole", false], // 4 beats
  [2.5, 3.5, "half", true], // 3 beats (dotted half)
  [1.75, 2.5, "half", false], // 2 beats
  [1.25, 1.75, "quarter", true], // 1.5 beats (dotted quarter)
  [0.75, 1.25, "quarter", false], // 1 beat
  [0.5, 0.75, "eighth", true], // 0.75 beats (dotted eighth)
  [0.3125, 0.5, "eighth", false], // 0.5 beats
  [0.1875, 0.3125, "sixteenth", false], // 0.25 beats
  [0, 0.1875, "thirtysecond", false], // 0.125 beats
];

/**
 * Quantize a duration in seconds (given a tempo) to a musical note type.
 */
export function quantizeDuration(
  durationSecs: number,
  bpm: number,
): QuantizedNote {
  const beatsPerSecond = bpm / 60;
  const beats = durationSecs * beatsPerSecond;

  for (const [min, max, type, dotted] of DURATION_TABLE) {
    if (beats >= min && beats < max) {
      return { type, dotted };
    }
  }
  return { type: "quarter", dotted: false }; // fallback
}

/**
 * Whether a note type uses a filled (solid) notehead.
 */
export function isFilledNotehead(type: NoteType): boolean {
  return type === "quarter" || type === "eighth" || type === "sixteenth" || type === "thirtysecond";
}

/**
 * Whether a note type has a stem.
 */
export function hasStem(type: NoteType): boolean {
  return type !== "whole";
}

// ---------------------------------------------------------------------------
// Pitch / accidental utilities
// ---------------------------------------------------------------------------

/**
 * Note names within an octave, using sharps.
 * Index = pitch class (0 = C, 1 = C#, ... 11 = B)
 */
const SHARP_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
] as const;

/**
 * Note names using flats.
 */
const FLAT_NAMES = [
  "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
] as const;

/**
 * Key signature sharps/flats.
 * Maps key name to set of pitch classes that are sharp or flat.
 * Convention: store the "altered" pitch classes and whether they are sharps or flats.
 */
interface KeySigInfo {
  /** Pitch classes (0-11) that are altered in this key */
  altered: Set<number>;
  /** Whether alterations are sharps (true) or flats (false) */
  useSharps: boolean;
}

const KEY_SIGNATURES: Record<string, KeySigInfo> = {
  "C major": { altered: new Set(), useSharps: true },
  "G major": { altered: new Set([6]), useSharps: true }, // F#
  "D major": { altered: new Set([6, 1]), useSharps: true }, // F#, C#
  "A major": { altered: new Set([6, 1, 8]), useSharps: true }, // F#, C#, G#
  "E major": { altered: new Set([6, 1, 8, 3]), useSharps: true }, // F#, C#, G#, D#
  "B major": { altered: new Set([6, 1, 8, 3, 10]), useSharps: true },
  "F# major": { altered: new Set([6, 1, 8, 3, 10, 5]), useSharps: true },
  "F major": { altered: new Set([10]), useSharps: false }, // Bb
  "Bb major": { altered: new Set([10, 3]), useSharps: false }, // Bb, Eb
  "Eb major": { altered: new Set([10, 3, 8]), useSharps: false }, // Bb, Eb, Ab
  "Ab major": { altered: new Set([10, 3, 8, 1]), useSharps: false },
  "Db major": { altered: new Set([10, 3, 8, 1, 6]), useSharps: false },
  // Minor keys (natural minor = relative major)
  "A minor": { altered: new Set(), useSharps: true },
  "E minor": { altered: new Set([6]), useSharps: true },
  "B minor": { altered: new Set([6, 1]), useSharps: true },
  "F# minor": { altered: new Set([6, 1, 8]), useSharps: true },
  "D minor": { altered: new Set([10]), useSharps: false },
  "G minor": { altered: new Set([10, 3]), useSharps: false },
  "C minor": { altered: new Set([10, 3, 8]), useSharps: false },
  "F minor": { altered: new Set([10, 3, 8, 1]), useSharps: false },
};

/**
 * Accidental to display for a note, given a key signature.
 * Returns null if no accidental needed, or "#", "b", "♮".
 */
export function getAccidental(
  midiNote: number,
  keySignature: string,
): string | null {
  const pitchClass = midiNote % 12;
  const keySig = KEY_SIGNATURES[keySignature];

  if (!keySig) {
    // Unknown key, show accidentals for any black key
    const isBlackKey = [1, 3, 6, 8, 10].includes(pitchClass);
    if (isBlackKey) return "#";
    return null;
  }

  const isAlteredInKey = keySig.altered.has(pitchClass);

  // Check if this pitch class is a "natural" note (white key)
  const isWhiteKey = [0, 2, 4, 5, 7, 9, 11].includes(pitchClass);

  if (keySig.useSharps) {
    // Key has sharps
    if (isAlteredInKey) {
      // This pitch class IS the sharp in the key sig — no accidental needed
      return null;
    }
    // Not in key sig
    if (!isWhiteKey) {
      // Black key not in key sig — needs a sharp or flat
      return "#";
    }
    // White key: check if the key sig has a sharp on this letter name
    // e.g. in D major (F#, C#), playing F natural needs a natural sign
    const sharpVersion = (pitchClass + 1) % 12;
    if (keySig.altered.has(sharpVersion)) {
      // The sharped version of this note is in the key — we need a natural
      return "♮";
    }
    return null;
  } else {
    // Key has flats
    if (isAlteredInKey) {
      // This pitch class IS the flat in the key sig — no accidental needed
      return null;
    }
    if (!isWhiteKey) {
      // Black key not in key sig
      return "b";
    }
    // White key: check if the flat version is in the key sig
    const flatVersion = (pitchClass + 11) % 12; // one semitone down
    if (keySig.altered.has(flatVersion)) {
      // The flatted version is in key, but we're playing the natural — need natural sign
      // Wait, this logic is inverted. If Bb is in key, and we play B natural, we need ♮
      // flatVersion of B(11) = Bb(10). If 10 is in altered set, we need natural for 11.
      return "♮";
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Staff position (Y coordinate) from MIDI note
// ---------------------------------------------------------------------------

/**
 * Maps pitch class to a "staff step" offset from C.
 * C=0, D=1, E=2, F=3, G=4, A=5, B=6
 */
const PITCH_CLASS_TO_STEP: Record<number, number> = {
  0: 0, // C
  1: 0, // C# (same line as C)
  2: 1, // D
  3: 1, // Db/Eb (same line as D or E depending on key)
  4: 2, // E
  5: 3, // F
  6: 3, // F# (same line as F)
  7: 4, // G
  8: 4, // G# (same line as G)
  9: 5, // A
  10: 5, // A#/Bb (same line as A or B)
  11: 6, // B
};

/**
 * Get the diatonic step position for a MIDI note.
 * Returns a number where middle C (MIDI 60) = 0,
 * D = 1, E = 2, etc. Each step = half a staff line spacing.
 * Negative = below middle C, positive = above.
 */
export function midiToStaffStep(midiNote: number): number {
  const octave = Math.floor(midiNote / 12) - 5; // C4 (60) → octave 0
  const pitchClass = midiNote % 12;
  const step = PITCH_CLASS_TO_STEP[pitchClass];
  return octave * 7 + step;
}
