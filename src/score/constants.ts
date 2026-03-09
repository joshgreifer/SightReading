/**
 * Score rendering constants.
 * All vertical dimensions in CSS pixels. Horizontal dimensions derived from
 * pixelsPerSecond at render time.
 */

// ---------------------------------------------------------------------------
// Staff geometry
// ---------------------------------------------------------------------------

/** Pixels between adjacent staff lines */
export const STAFF_LINE_SPACING = 10;

/** Number of lines per staff */
export const LINES_PER_STAFF = 5;

/** Height of one staff (4 gaps between 5 lines) */
export const STAFF_HEIGHT = STAFF_LINE_SPACING * (LINES_PER_STAFF - 1);

/** Gap between bottom of treble staff and top of bass staff */
export const STAFF_GAP = STAFF_LINE_SPACING * 4;

/** Top padding above treble staff (room for ledger lines / high notes) */
export const TOP_PADDING = STAFF_LINE_SPACING * 6;

/** Bottom padding below bass staff */
export const BOTTOM_PADDING = STAFF_LINE_SPACING * 6;

/** Y of the top line of the treble staff */
export const TREBLE_STAFF_TOP = TOP_PADDING;

/** Y of the bottom line of the treble staff */
export const TREBLE_STAFF_BOTTOM = TREBLE_STAFF_TOP + STAFF_HEIGHT;

/** Y of the top line of the bass staff */
export const BASS_STAFF_TOP = TREBLE_STAFF_BOTTOM + STAFF_GAP;

/** Y of the bottom line of the bass staff */
export const BASS_STAFF_BOTTOM = BASS_STAFF_TOP + STAFF_HEIGHT;

/** Total canvas height */
export const CANVAS_HEIGHT =
  TOP_PADDING + STAFF_HEIGHT + STAFF_GAP + STAFF_HEIGHT + BOTTOM_PADDING;

// ---------------------------------------------------------------------------
// Note rendering
// ---------------------------------------------------------------------------

/** Horizontal radius of a notehead ellipse */
export const NOTEHEAD_RX = STAFF_LINE_SPACING * 0.65;

/** Vertical radius of a notehead ellipse */
export const NOTEHEAD_RY = STAFF_LINE_SPACING * 0.45;

/** Stem height in pixels */
export const STEM_HEIGHT = STAFF_LINE_SPACING * 3.5;

/** Stem line width */
export const STEM_WIDTH = 1.5;

/** Accidental font size (relative to staff spacing) */
export const ACCIDENTAL_FONT_SIZE = STAFF_LINE_SPACING * 1.8;

/** Horizontal offset of accidental from notehead center (to the left) */
export const ACCIDENTAL_OFFSET_X = STAFF_LINE_SPACING * 1.4;

// ---------------------------------------------------------------------------
// Layout & scrolling
// ---------------------------------------------------------------------------

/** Pixels per second — controls horizontal density */
export const PIXELS_PER_SECOND = 80;

/** Fraction of canvas width where the now-line sits (from left) */
export const NOW_LINE_POSITION = 1 / 3;

/** Width of barline stroke */
export const BARLINE_WIDTH = 1;

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export const COLORS = {
  background: "#1a1a2e",
  staffLine: "#4a4a6a",
  barline: "#4a4a6a",
  nowLine: "#ff6b6b",
  nowLineGlow: "rgba(255, 107, 107, 0.15)",
  noteDefault: "#c8c8e0",
  noteHighlight: "#ffd93d",
  notePast: "#5a5a7a",
  accidental: "#c8c8e0",
  accidentalHighlight: "#ffd93d",
  clefText: "#6a6a8a",
} as const;

// ---------------------------------------------------------------------------
// MIDI / music theory helpers
// ---------------------------------------------------------------------------

/**
 * MIDI note number for middle C (C4).
 * Treble staff bottom line = E4 (64), Bass staff top line = G3 (55).
 */
export const MIDDLE_C = 60;

/** Treble staff bottom line note (E4) */
export const TREBLE_BOTTOM_LINE_MIDI = 64;

/** Bass staff top line note (A3) */
export const BASS_TOP_LINE_MIDI = 57;

/** Treble staff top line note (F5) */
export const TREBLE_TOP_LINE_MIDI = 77;

/** Bass staff bottom line note (G2) */
export const BASS_BOTTOM_LINE_MIDI = 43;
