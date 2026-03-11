/**
 * Converts parsed Exercise data into VexFlow-compatible structures.
 *
 * Pipeline:
 *   Exercise
 *     → groupNotesIntoBars()    — assign notes to bars, snap onsets to beat grid
 *     → groupIntoChords()       — cluster simultaneous notes, compute rhythmic value
 *     → fillBarWithRests()      — pad gaps/trailing space with rests
 *     → createStaveNotes()      — produce VexFlow StaveNote objects
 */

import { StaveNote, Accidental, Dot } from "vexflow";
import type { Exercise, NoteEvent } from "../types/exercise";

// Set to true to see console logs tracing bar/chord/rest logic
const DEBUG = true;

// ---------------------------------------------------------------------------
// Duration mapping: beat count → VexFlow duration string
// ---------------------------------------------------------------------------

interface DurationEntry {
  minBeats: number;
  maxBeats: number;
  vexDuration: string;
  beats: number;
  dotted: boolean;
}

const DURATION_TABLE: DurationEntry[] = [
  { minBeats: 3.5,    maxBeats: Infinity, vexDuration: "w",  beats: 4,     dotted: false },
  { minBeats: 2.5,    maxBeats: 3.5,      vexDuration: "h",  beats: 3,     dotted: true  },
  { minBeats: 1.75,   maxBeats: 2.5,      vexDuration: "h",  beats: 2,     dotted: false },
  { minBeats: 1.25,   maxBeats: 1.75,     vexDuration: "q",  beats: 1.5,   dotted: true  },
  { minBeats: 0.75,   maxBeats: 1.25,     vexDuration: "q",  beats: 1,     dotted: false },
  { minBeats: 0.625,  maxBeats: 0.75,     vexDuration: "8",  beats: 0.75,  dotted: true  },
  { minBeats: 0.3125, maxBeats: 0.625,    vexDuration: "8",  beats: 0.5,   dotted: false },
  { minBeats: 0.1875, maxBeats: 0.3125,   vexDuration: "16", beats: 0.25,  dotted: false },
  { minBeats: 0,      maxBeats: 0.1875,   vexDuration: "32", beats: 0.125, dotted: false },
];

/** Quantize a seconds-based duration to VexFlow. */
export function quantizeToVexDuration(
  durationSecs: number,
  bpm: number,
): { vexDuration: string; beats: number; dotted: boolean } {
  const beats = durationSecs * (bpm / 60);
  return quantizeBeats(beats);
}

/** Quantize a beat count to the nearest VexFlow duration. */
function quantizeBeats(beats: number): { vexDuration: string; beats: number; dotted: boolean } {
  for (const entry of DURATION_TABLE) {
    if (beats >= entry.minBeats && beats < entry.maxBeats) {
      return { vexDuration: entry.vexDuration, beats: entry.beats, dotted: entry.dotted };
    }
  }
  return { vexDuration: "q", beats: 1, dotted: false };
}

// ---------------------------------------------------------------------------
// Beat grid helpers
// ---------------------------------------------------------------------------

const REST_DURATIONS: { beats: number; vexDuration: string; dotted: boolean }[] = [
  { beats: 4,     vexDuration: "w",  dotted: false },
  { beats: 3,     vexDuration: "h",  dotted: true  },
  { beats: 2,     vexDuration: "h",  dotted: false },
  { beats: 1.5,   vexDuration: "q",  dotted: true  },
  { beats: 1,     vexDuration: "q",  dotted: false },
  { beats: 0.75,  vexDuration: "8",  dotted: true  },
  { beats: 0.5,   vexDuration: "8",  dotted: false },
  { beats: 0.25,  vexDuration: "16", dotted: false },
  { beats: 0.125, vexDuration: "32", dotted: false },
];

/** Snap to nearest 16th-note grid point. */
function snapBeat(beat: number, grid: number = 0.25): number {
  return Math.round(beat / grid) * grid;
}

// ---------------------------------------------------------------------------
// Pitch helpers
// ---------------------------------------------------------------------------

const SHARP_MAP: [string, string | null][] = [
  ["c", null],  ["c", "#"],  ["d", null],  ["d", "#"],
  ["e", null],  ["f", null], ["f", "#"],   ["g", null],
  ["g", "#"],   ["a", null], ["a", "#"],   ["b", null],
];

const FLAT_MAP: [string, string | null][] = [
  ["c", null],  ["d", "b"],  ["d", null],  ["e", "b"],
  ["e", null],  ["f", null], ["g", "b"],   ["g", null],
  ["a", "b"],   ["a", null], ["b", "b"],   ["b", null],
];

const FLAT_KEYS = new Set([
  "F major", "Bb major", "Eb major", "Ab major", "Db major", "Gb major",
  "D minor", "G minor", "C minor", "F minor", "Bb minor", "Eb minor",
]);

export function midiToVexKey(
  midiNote: number,
  keySignature: string,
): { key: string; accidental: string | null } {
  const octave = Math.floor(midiNote / 12) - 1;
  const pitchClass = midiNote % 12;
  const useFlats = FLAT_KEYS.has(keySignature);
  const map = useFlats ? FLAT_MAP : SHARP_MAP;
  const [noteName, naturalAccidental] = map[pitchClass];
  const key = `${noteName}/${octave}`;
  const accidentalToShow = getDisplayAccidental(
    pitchClass, naturalAccidental, keySignature, useFlats,
  );
  return { key, accidental: accidentalToShow };
}

// ---------------------------------------------------------------------------
// Key signature logic
// ---------------------------------------------------------------------------

const KEY_SIG_DEFS: Record<string, { altered: Set<number> }> = {
  "C major": { altered: new Set() },
  "G major": { altered: new Set([6]) },
  "D major": { altered: new Set([6, 1]) },
  "A major": { altered: new Set([6, 1, 8]) },
  "E major": { altered: new Set([6, 1, 8, 3]) },
  "B major": { altered: new Set([6, 1, 8, 3, 10]) },
  "F# major": { altered: new Set([6, 1, 8, 3, 10, 5]) },
  "F major": { altered: new Set([10]) },
  "Bb major": { altered: new Set([10, 3]) },
  "Eb major": { altered: new Set([10, 3, 8]) },
  "Ab major": { altered: new Set([10, 3, 8, 1]) },
  "Db major": { altered: new Set([10, 3, 8, 1, 6]) },
  "Gb major": { altered: new Set([10, 3, 8, 1, 6, 11]) },
  "A minor": { altered: new Set() },
  "E minor": { altered: new Set([6]) },
  "B minor": { altered: new Set([6, 1]) },
  "F# minor": { altered: new Set([6, 1, 8]) },
  "D minor": { altered: new Set([10]) },
  "G minor": { altered: new Set([10, 3]) },
  "C minor": { altered: new Set([10, 3, 8]) },
  "F minor": { altered: new Set([10, 3, 8, 1]) },
  "Bb minor": { altered: new Set([10, 3, 8, 1, 6]) },
  "Eb minor": { altered: new Set([10, 3, 8, 1, 6, 11]) },
};

function getDisplayAccidental(
  pitchClass: number,
  naturalAccidental: string | null,
  keySignature: string,
  useFlats: boolean,
): string | null {
  const keySig = KEY_SIG_DEFS[keySignature];
  if (!keySig) return naturalAccidental;
  const inKey = keySig.altered.has(pitchClass);

  if (useFlats) {
    if (inKey) return null;
    if (naturalAccidental === "b") return "b";
    const flatVersion = (pitchClass + 11) % 12;
    if (keySig.altered.has(flatVersion)) return "n";
    return naturalAccidental;
  } else {
    if (inKey) return null;
    if (naturalAccidental === "#") return "#";
    const sharpVersion = (pitchClass + 1) % 12;
    if (keySig.altered.has(sharpVersion)) return "n";
    return naturalAccidental;
  }
}

// ---------------------------------------------------------------------------
// Bar grouping
// ---------------------------------------------------------------------------

export interface BarData {
  barIndex: number;
  startTime: number;
  endTime: number;
  trackNotes: Map<number, NoteEvent[]>;
}

export function groupNotesIntoBars(exercise: Exercise): BarData[] {
  const beatsPerBar =
    exercise.timeSignature[0] * (4 / exercise.timeSignature[1]);
  const secsPerBeat = 60 / exercise.tempo;
  const secsPerBar = beatsPerBar * secsPerBeat;
  const totalBars = Math.ceil(exercise.duration / secsPerBar) + 1;

  const bars: BarData[] = [];
  for (let i = 0; i < totalBars; i++) {
    bars.push({
      barIndex: i,
      startTime: i * secsPerBar,
      endTime: (i + 1) * secsPerBar,
      trackNotes: new Map(),
    });
  }

  for (let ti = 0; ti < exercise.tracks.length; ti++) {
    for (const note of exercise.tracks[ti].notes) {
      const beatPos = snapBeat(note.onset / secsPerBeat);
      const barIdx = Math.floor(beatPos / beatsPerBar);

      if (barIdx >= 0 && barIdx < bars.length) {
        if (!bars[barIdx].trackNotes.has(ti)) {
          bars[barIdx].trackNotes.set(ti, []);
        }
        bars[barIdx].trackNotes.get(ti)!.push({
          ...note,
          onset: beatPos * secsPerBeat,
        });
      }
    }
  }

  while (bars.length > 0 && bars[bars.length - 1].trackNotes.size === 0) {
    bars.pop();
  }

  if (DEBUG) {
    console.log(`[midiToVex] ${bars.length} bars, beatsPerBar=${beatsPerBar}, secsPerBar=${secsPerBar.toFixed(3)}`);
    bars.forEach((b, i) => {
      const parts: string[] = [];
      b.trackNotes.forEach((notes, ti) => {
        parts.push(`T${ti}:[${notes.map(n => `p${n.pitch}@${(n.onset / secsPerBeat).toFixed(2)}b dur=${(n.duration / secsPerBeat).toFixed(2)}b`).join(", ")}]`);
      });
      if (parts.length > 0) {
        console.log(`  Bar ${i} (${b.startTime.toFixed(2)}s-${b.endTime.toFixed(2)}s): ${parts.join("  ")}`);
      }
    });
  }

  return bars;
}

// ---------------------------------------------------------------------------
// Chord grouping
// ---------------------------------------------------------------------------

export interface ChordGroup {
  onset: number;
  onsetBeat: number;
  notes: NoteEvent[];
  vexDuration: string;
  beats: number;
  dotted: boolean;
}

/**
 * Group simultaneous notes into chords and compute rhythmic duration.
 *
 * Duration strategy:
 *   - Non-last chord in bar -> onset-to-onset gap (reliable rhythmic spacing)
 *   - Last chord in bar -> MIDI sustain duration (no next onset to reference)
 */
export function groupIntoChords(
  notes: NoteEvent[],
  bpm: number,
  barStartTime: number,
  beatsPerBar: number,
  tolerance: number = 0.01,
): ChordGroup[] {
  if (notes.length === 0) return [];

  const secsPerBeat = 60 / bpm;
  const sorted = [...notes].sort((a, b) => a.onset - b.onset);

  // Pass 1: cluster simultaneous notes
  const clusters: { onset: number; onsetBeat: number; notes: NoteEvent[] }[] = [];
  let current: NoteEvent[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].onset - current[0].onset <= tolerance) {
      current.push(sorted[i]);
    } else {
      clusters.push({
        onset: current[0].onset,
        onsetBeat: snapBeat((current[0].onset - barStartTime) / secsPerBeat),
        notes: [...current],
      });
      current = [sorted[i]];
    }
  }
  clusters.push({
    onset: current[0].onset,
    onsetBeat: snapBeat((current[0].onset - barStartTime) / secsPerBeat),
    notes: [...current],
  });

  // Pass 2: compute rhythmic duration per cluster
  const groups: ChordGroup[] = [];
  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i];
    let slotBeats: number;

    if (i + 1 < clusters.length) {
      slotBeats = snapBeat(clusters[i + 1].onsetBeat - c.onsetBeat);
    } else {
      const minDur = Math.min(...c.notes.map((n) => n.duration));
      slotBeats = snapBeat(minDur / secsPerBeat);
    }

    // Clamp to remaining bar space; floor at 16th note
    slotBeats = Math.min(slotBeats, snapBeat(beatsPerBar - c.onsetBeat));
    if (slotBeats < 0.125) slotBeats = 0.25;

    const q = quantizeBeats(slotBeats);

    if (DEBUG) {
      const isLast = i + 1 >= clusters.length;
      console.log(
        `    [chord] beat=${c.onsetBeat} pitches=[${c.notes.map(n => n.pitch)}] ` +
        `rawSlot=${slotBeats} -> ${q.vexDuration}(${q.beats}b${q.dotted ? ",dot" : ""})` +
        ` [${isLast ? "LAST-useMidiDur" : "onset-gap"}]`
      );
    }

    groups.push({
      onset: c.onset,
      onsetBeat: c.onsetBeat,
      notes: c.notes,
      vexDuration: q.vexDuration,
      beats: q.beats,
      dotted: q.dotted,
    });
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Rest filling
// ---------------------------------------------------------------------------

export interface VoiceItem {
  type: "note" | "rest";
  chord?: ChordGroup;
  vexDuration: string;
  beats: number;
  dotted: boolean;
  clef: string;
}

/**
 * Pad a bar's chord groups with rests so total ticks = beatsPerBar.
 */
export function fillBarWithRests(
  chords: ChordGroup[],
  beatsPerBar: number,
  clef: string,
): VoiceItem[] {
  if (chords.length === 0) {
    if (DEBUG) console.log(`  [fill ${clef}] empty -> ${beatsPerBar}b of rests`);
    return makeRests(beatsPerBar, clef);
  }

  const items: VoiceItem[] = [];
  let cursor = 0;
  const sorted = [...chords].sort((a, b) => a.onsetBeat - b.onsetBeat);

  for (const chord of sorted) {
    const gap = snapBeat(chord.onsetBeat - cursor);
    if (gap > 0.001) {
      if (DEBUG) console.log(`  [fill ${clef}] gap rest: ${cursor}->${chord.onsetBeat} = ${gap}b`);
      items.push(...makeRests(gap, clef));
    }

    items.push({
      type: "note",
      chord,
      vexDuration: chord.vexDuration,
      beats: chord.beats,
      dotted: chord.dotted,
      clef,
    });
    cursor = Math.min(snapBeat(chord.onsetBeat + chord.beats), beatsPerBar);
  }

  const remaining = snapBeat(beatsPerBar - cursor);
  if (remaining > 0.001) {
    if (DEBUG) console.log(`  [fill ${clef}] trailing rest: ${cursor}->${beatsPerBar} = ${remaining}b`);
    items.push(...makeRests(remaining, clef));
  }

  if (DEBUG) {
    const total = items.reduce((s, it) => s + it.beats, 0);
    const desc = items.map(it =>
      it.type === "rest" ? `R:${it.vexDuration}${it.dotted ? "." : ""}(${it.beats})` : `N:${it.vexDuration}${it.dotted ? "." : ""}(${it.beats})`
    ).join(" ");
    console.log(`  [fill ${clef}] TOTAL=${total}b: ${desc}`);
  }

  return items;
}

function makeRests(totalBeats: number, clef: string): VoiceItem[] {
  const rests: VoiceItem[] = [];
  let remaining = snapBeat(totalBeats);

  for (const rd of REST_DURATIONS) {
    while (remaining >= rd.beats - 0.001) {
      rests.push({
        type: "rest",
        vexDuration: rd.vexDuration,
        beats: rd.beats,
        dotted: rd.dotted,
        clef,
      });
      remaining = snapBeat(remaining - rd.beats);
      if (remaining < 0.001) break;
    }
    if (remaining < 0.001) break;
  }

  return rests;
}

// ---------------------------------------------------------------------------
// VexFlow StaveNote creation
// ---------------------------------------------------------------------------

const REST_KEYS: Record<string, string> = {
  treble: "b/4",
  bass: "d/3",
};

export function createStaveNotes(
  items: VoiceItem[],
  keySignature: string,
): StaveNote[] {
  return items.map((item) => {
    if (item.type === "rest") {
      const restKey = REST_KEYS[item.clef] ?? "b/4";
      const sn = new StaveNote({
        keys: [restKey],
        duration: item.vexDuration + "r",
        clef: item.clef,
      });
      if (item.dotted) {
        sn.addModifier(new Dot(), 0);
      }
      return sn;
    }

    const chord = item.chord!;
    const keysWithAcc = chord.notes
      .map((n) => ({ ...midiToVexKey(n.pitch, keySignature), pitch: n.pitch }))
      .sort((a, b) => a.pitch - b.pitch);

    const keys = keysWithAcc.map((k) => k.key);

    const sn = new StaveNote({
      keys,
      duration: item.vexDuration,
      clef: item.clef,
      autoStem: true,
    });

    keysWithAcc.forEach((k, i) => {
      if (k.accidental) {
        sn.addModifier(new Accidental(k.accidental), i);
      }
    });

    if (item.dotted) {
      for (let ki = 0; ki < keys.length; ki++) {
        sn.addModifier(new Dot(), ki);
      }
    }

    return sn;
  });
}

// ---------------------------------------------------------------------------
// Key / time signature conversion
// ---------------------------------------------------------------------------

export function toVexKeySignature(keySignature: string): string {
  const parts = keySignature.split(" ");
  if (parts.length < 2) return "C";
  const note = parts[0];
  const mode = parts[1].toLowerCase();
  if (mode === "minor") return note + "m";
  return note;
}

export function toVexTimeSignature(ts: [number, number]): string {
  return `${ts[0]}/${ts[1]}`;
}