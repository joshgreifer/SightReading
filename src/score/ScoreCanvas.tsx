/**
 * ScoreCanvas — renders a horizontally scrolling grand staff score.
 *
 * The notation scrolls right-to-left past a fixed "now" line.
 * X position of notes is linearly proportional to onset time.
 * Note appearance (notehead type, accidentals) follows music notation rules.
 */

import { useRef, useEffect, useCallback } from "react";
import type { Exercise } from "../types/exercise";
import {
  CANVAS_HEIGHT,
  PIXELS_PER_SECOND,
  NOW_LINE_POSITION,
  COLORS,
  TREBLE_STAFF_TOP,
  BASS_STAFF_TOP,
  STAFF_HEIGHT,
  STAFF_LINE_SPACING,
} from "./constants";
import {
  drawGrandStaff,
  drawBarline,
  drawNowLine,
  drawClefs,
  drawFullNote,
  midiNoteToY,
  type RenderableNote,
} from "./noteRenderer";
import { quantizeDuration } from "./quantize";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ScoreCanvasProps {
  exercise: Exercise;
  /** Current playback time in seconds. Controls scroll position. */
  currentTime: number;
  /** Whether playback is active (for future use with highlighting) */
  playing: boolean;
  /** Time window (in seconds) around now-line to highlight notes */
  highlightWindow?: number;
}

// ---------------------------------------------------------------------------
// Precompute renderable notes from exercise data
// ---------------------------------------------------------------------------

interface PreparedScore {
  notes: RenderableNote[];
  barTimes: number[]; // onset times of each barline
}

function prepareScore(exercise: Exercise): PreparedScore {
  const notes: RenderableNote[] = [];

  for (let ti = 0; ti < exercise.tracks.length; ti++) {
    const track = exercise.tracks[ti];
    for (const note of track.notes) {
      const q = quantizeDuration(note.duration, exercise.tempo);
      notes.push({
        note,
        trackIndex: ti,
        x: 0, // filled in during render
        noteType: q.type,
        dotted: q.dotted,
      });
    }
  }

  // Sort by onset for rendering order
  notes.sort((a, b) => a.note.onset - b.note.onset);

  // Compute barline times
  const beatsPerBar =
    exercise.timeSignature[0] *
    (4 / exercise.timeSignature[1]);
  const secondsPerBar = (beatsPerBar / exercise.tempo) * 60;
  const barTimes: number[] = [];
  for (let t = 0; t <= exercise.duration + secondsPerBar; t += secondsPerBar) {
    barTimes.push(t);
  }

  return { notes, barTimes };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScoreCanvas({
  exercise,
  currentTime,
  playing,
  highlightWindow = 0.15,
}: ScoreCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const preparedRef = useRef<PreparedScore | null>(null);

  // Prepare score data once when exercise changes
  useEffect(() => {
    preparedRef.current = prepareScore(exercise);
  }, [exercise]);

  // Render frame
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const prepared = preparedRef.current;
    if (!canvas || !prepared) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const dpr = window.devicePixelRatio || 1;
    const logicalW = W / dpr;
    const logicalH = H / dpr;

    // Now-line position in canvas pixels
    const nowX = logicalW * NOW_LINE_POSITION;

    // Scroll offset: maps currentTime to the now-line position
    // noteScreenX = (note.onset - currentTime) * PIXELS_PER_SECOND + nowX
    const timeToX = (t: number) =>
      (t - currentTime) * PIXELS_PER_SECOND + nowX;

    // Visible time range (with some padding)
    const visibleStartTime = currentTime - nowX / PIXELS_PER_SECOND - 1;
    const visibleEndTime =
      currentTime + (logicalW - nowX) / PIXELS_PER_SECOND + 1;

    // Clear
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, logicalW, logicalH);

    // Draw staff lines across full width
    drawGrandStaff(ctx, 0, logicalW);

    // Draw barlines
    for (const barTime of prepared.barTimes) {
      if (barTime < visibleStartTime || barTime > visibleEndTime) continue;
      const bx = timeToX(barTime);
      if (bx >= 0 && bx <= logicalW) {
        drawBarline(ctx, bx);
      }
    }

    // Draw clefs (fixed position, slight offset from left edge)
    drawClefs(ctx, 24);

    // Draw notes
    for (const rn of prepared.notes) {
      const onset = rn.note.onset;

      // Skip notes outside visible range
      if (onset < visibleStartTime || onset > visibleEndTime) continue;

      const noteX = timeToX(onset);

      // Skip if off-screen
      if (noteX < -30 || noteX > logicalW + 30) continue;

      // Determine color based on position relative to now-line
      let color: string;
      const dt = onset - currentTime;
      if (Math.abs(dt) < highlightWindow) {
        color = COLORS.noteHighlight;
      } else if (dt < -highlightWindow) {
        color = COLORS.notePast;
      } else {
        color = COLORS.noteDefault;
      }

      // Update x position for rendering
      rn.x = noteX;
      drawFullNote(ctx, rn, exercise.keySignature, color);
    }

    // Draw now-line on top
    drawNowLine(ctx, nowX, logicalH);

    ctx.restore();
  }, [currentTime, exercise, highlightWindow]);

  // Handle canvas sizing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = CANVAS_HEIGHT * dpr;
      canvas.style.height = `${CANVAS_HEIGHT}px`;
      renderFrame();
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [renderFrame]);

  // Re-render when currentTime changes
  useEffect(() => {
    renderFrame();
  }, [renderFrame, currentTime]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: CANVAS_HEIGHT,
        display: "block",
      }}
    />
  );
}
