/**
 * Low-level canvas drawing functions for music notation elements.
 */

import {
  STAFF_LINE_SPACING,
  LINES_PER_STAFF,
  STAFF_HEIGHT,
  TREBLE_STAFF_TOP,
  BASS_STAFF_TOP,
  NOTEHEAD_RX,
  NOTEHEAD_RY,
  STEM_HEIGHT,
  STEM_WIDTH,
  ACCIDENTAL_FONT_SIZE,
  ACCIDENTAL_OFFSET_X,
  BARLINE_WIDTH,
  COLORS,
  TREBLE_BOTTOM_LINE_MIDI,
  BASS_TOP_LINE_MIDI,
  STAFF_GAP,
} from "./constants";
import {
  type NoteType,
  isFilledNotehead,
  hasStem,
  midiToStaffStep,
  getAccidental,
  quantizeDuration,
} from "./quantize";
import type { NoteEvent } from "../types/exercise";

// ---------------------------------------------------------------------------
// Staff position helpers
// ---------------------------------------------------------------------------

/**
 * Middle C sits on a ledger line between the two staves.
 * We define its Y as halfway between treble bottom and bass top.
 */
const MIDDLE_C_Y =
  TREBLE_STAFF_TOP + STAFF_HEIGHT + STAFF_GAP / 2;

/**
 * Convert a MIDI note to a Y pixel position on the grand staff.
 * Each diatonic step = half a staff line spacing.
 * Higher notes → lower Y (canvas convention).
 */
export function midiNoteToY(midiNote: number): number {
  const step = midiToStaffStep(midiNote); // 0 = middle C
  return MIDDLE_C_Y - step * (STAFF_LINE_SPACING / 2);
}

/**
 * Determine which staff a note belongs to, based on its assigned track.
 * Track 0 → treble, Track 1 → bass. If more tracks, use index % 2.
 */
export function trackToStaff(trackIndex: number): "treble" | "bass" {
  return trackIndex % 2 === 0 ? "treble" : "bass";
}

// ---------------------------------------------------------------------------
// Drawing primitives
// ---------------------------------------------------------------------------

/**
 * Draw the 5 lines of a staff.
 */
export function drawStaffLines(
  ctx: CanvasRenderingContext2D,
  topY: number,
  startX: number,
  width: number,
) {
  ctx.strokeStyle = COLORS.staffLine;
  ctx.lineWidth = 1;
  for (let i = 0; i < LINES_PER_STAFF; i++) {
    const y = topY + i * STAFF_LINE_SPACING;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(startX + width, y);
    ctx.stroke();
  }
}

/**
 * Draw both treble and bass staves across the full visible width.
 */
export function drawGrandStaff(
  ctx: CanvasRenderingContext2D,
  startX: number,
  width: number,
) {
  drawStaffLines(ctx, TREBLE_STAFF_TOP, startX, width);
  drawStaffLines(ctx, BASS_STAFF_TOP, startX, width);
}

/**
 * Draw a barline spanning both staves.
 */
export function drawBarline(
  ctx: CanvasRenderingContext2D,
  x: number,
) {
  ctx.strokeStyle = COLORS.barline;
  ctx.lineWidth = BARLINE_WIDTH;
  ctx.beginPath();
  ctx.moveTo(x, TREBLE_STAFF_TOP);
  ctx.lineTo(x, BASS_STAFF_TOP + STAFF_HEIGHT);
  ctx.stroke();
}

/**
 * Draw a notehead (filled or open ellipse).
 */
export function drawNotehead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  filled: boolean,
  color: string,
) {
  ctx.save();
  ctx.translate(x, y);
  // Slight rotation for a more natural look
  ctx.rotate(-0.15);
  ctx.beginPath();
  ctx.ellipse(0, 0, NOTEHEAD_RX, NOTEHEAD_RY, 0, 0, Math.PI * 2);
  if (filled) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw a stem from a notehead.
 * Stem goes up if note is below the middle line of its staff, down otherwise.
 */
export function drawStem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  stemUp: boolean,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = STEM_WIDTH;
  const stemX = stemUp ? x + NOTEHEAD_RX - 1 : x - NOTEHEAD_RX + 1;
  const stemEndY = stemUp ? y - STEM_HEIGHT : y + STEM_HEIGHT;
  ctx.beginPath();
  ctx.moveTo(stemX, y);
  ctx.lineTo(stemX, stemEndY);
  ctx.stroke();
}

/**
 * Draw ledger lines for notes above or below the staff.
 */
export function drawLedgerLines(
  ctx: CanvasRenderingContext2D,
  x: number,
  noteY: number,
  staffTopY: number,
  staffBottomY: number,
) {
  ctx.strokeStyle = COLORS.staffLine;
  ctx.lineWidth = 1;
  const ledgerHalfWidth = NOTEHEAD_RX * 1.6;

  // Ledger lines above the staff
  if (noteY < staffTopY) {
    for (
      let ly = staffTopY - STAFF_LINE_SPACING;
      ly >= noteY - STAFF_LINE_SPACING / 4;
      ly -= STAFF_LINE_SPACING
    ) {
      ctx.beginPath();
      ctx.moveTo(x - ledgerHalfWidth, ly);
      ctx.lineTo(x + ledgerHalfWidth, ly);
      ctx.stroke();
    }
  }

  // Ledger lines below the staff
  if (noteY > staffBottomY) {
    for (
      let ly = staffBottomY + STAFF_LINE_SPACING;
      ly <= noteY + STAFF_LINE_SPACING / 4;
      ly += STAFF_LINE_SPACING
    ) {
      ctx.beginPath();
      ctx.moveTo(x - ledgerHalfWidth, ly);
      ctx.lineTo(x + ledgerHalfWidth, ly);
      ctx.stroke();
    }
  }

  // Middle C ledger line (between staves)
  if (
    Math.abs(noteY - MIDDLE_C_Y) < STAFF_LINE_SPACING / 4
  ) {
    ctx.beginPath();
    ctx.moveTo(x - ledgerHalfWidth, MIDDLE_C_Y);
    ctx.lineTo(x + ledgerHalfWidth, MIDDLE_C_Y);
    ctx.stroke();
  }
}

/**
 * Draw an accidental symbol to the left of a notehead.
 */
export function drawAccidental(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  accidental: string,
  color: string,
) {
  ctx.font = `${ACCIDENTAL_FONT_SIZE}px serif`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(accidental, x - ACCIDENTAL_OFFSET_X, y);
}

/**
 * Draw a dot (for dotted notes) to the right of a notehead.
 */
export function drawDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
) {
  const dotX = x + NOTEHEAD_RX + STAFF_LINE_SPACING * 0.4;
  // If note is on a line, shift dot up slightly
  const dotY = y;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(dotX, dotY, STAFF_LINE_SPACING * 0.15, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draw the now-line (vertical line at the current playback position).
 */
export function drawNowLine(
  ctx: CanvasRenderingContext2D,
  x: number,
  canvasHeight: number,
) {
  // Glow
  ctx.fillStyle = COLORS.nowLineGlow;
  ctx.fillRect(x - 12, 0, 24, canvasHeight);
  // Line
  ctx.strokeStyle = COLORS.nowLine;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, TREBLE_STAFF_TOP - STAFF_LINE_SPACING);
  ctx.lineTo(x, BASS_STAFF_TOP + STAFF_HEIGHT + STAFF_LINE_SPACING);
  ctx.stroke();
}

/**
 * Draw simple clef labels (text-based for MVP).
 */
export function drawClefs(
  ctx: CanvasRenderingContext2D,
  x: number,
) {
  ctx.font = `bold ${STAFF_LINE_SPACING * 3}px serif`;
  ctx.fillStyle = COLORS.clefText;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Treble clef approximation
  ctx.fillText(
    "𝄞",
    x,
    TREBLE_STAFF_TOP + STAFF_HEIGHT / 2,
  );
  // Bass clef approximation
  ctx.fillText(
    "𝄢",
    x,
    BASS_STAFF_TOP + STAFF_HEIGHT / 2,
  );
}

// ---------------------------------------------------------------------------
// Composite: draw a full note with all decorations
// ---------------------------------------------------------------------------

export interface RenderableNote {
  note: NoteEvent;
  trackIndex: number;
  x: number;
  noteType: NoteType;
  dotted: boolean;
}

/**
 * Determine stem direction. Stem up if note is below the middle line of its
 * assigned staff.
 */
function shouldStemUp(y: number, trackIndex: number): boolean {
  if (trackIndex % 2 === 0) {
    // Treble staff — middle line is line 3 (B4, index 2 from top)
    const middleY = TREBLE_STAFF_TOP + 2 * STAFF_LINE_SPACING;
    return y > middleY;
  } else {
    // Bass staff — middle line is line 3 (D3)
    const middleY = BASS_STAFF_TOP + 2 * STAFF_LINE_SPACING;
    return y > middleY;
  }
}

/**
 * Draw a complete note: notehead, stem, accidental, ledger lines, dot.
 */
export function drawFullNote(
  ctx: CanvasRenderingContext2D,
  rn: RenderableNote,
  keySignature: string,
  color: string,
) {
  const y = midiNoteToY(rn.note.pitch);
  const x = rn.x;
  const filled = isFilledNotehead(rn.noteType);

  // Staff boundaries for ledger lines
  const staffTop = rn.trackIndex % 2 === 0 ? TREBLE_STAFF_TOP : BASS_STAFF_TOP;
  const staffBottom = staffTop + STAFF_HEIGHT;

  // Ledger lines
  drawLedgerLines(ctx, x, y, staffTop, staffBottom);

  // Accidental
  const accidental = getAccidental(rn.note.pitch, keySignature);
  if (accidental) {
    drawAccidental(ctx, x, y, accidental, color);
  }

  // Notehead
  drawNotehead(ctx, x, y, filled, color);

  // Stem
  if (hasStem(rn.noteType)) {
    const stemUp = shouldStemUp(y, rn.trackIndex);
    drawStem(ctx, x, y, stemUp, color);
  }

  // Dot
  if (rn.dotted) {
    drawDot(ctx, x, y, color);
  }
}
