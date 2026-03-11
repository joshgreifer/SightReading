/**
 * ScoreRenderer — renders a scrolling grand staff score using VexFlow.
 *
 * Each bar's treble and bass voices are rest-filled to the correct beat count,
 * then formatted together in a single Formatter.format() call so notes at the
 * same tick align vertically across staves.
 */

import { useRef, useEffect } from "react";
import {
  Renderer,
  Stave,
  Voice,
  VoiceMode,
  Formatter,
  Beam,
  Fraction,
  StaveConnector,
} from "vexflow";
import type { Exercise } from "../types/exercise";
import {
  groupNotesIntoBars,
  groupIntoChords,
  fillBarWithRests,
  createStaveNotes,
  toVexKeySignature,
  toVexTimeSignature,
} from "./midiToVexFlow";

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const STAFF_SPACING = 120;
const TREBLE_Y = 10;
const BASS_Y = TREBLE_Y + STAFF_SPACING;
const CANVAS_HEIGHT = BASS_Y + 90;
const MIN_BAR_WIDTH = 150;
const STAVE_START_PADDING = 20;
const NOW_LINE_FRACTION = 1 / 3;

const COLORS = {
  background: "#c6c6ff",
  nowLine: "#ff6b6b",
};

// ---------------------------------------------------------------------------
// Time <-> X mapping
// ---------------------------------------------------------------------------

interface BarLayout {
  barIndex: number;
  xStart: number;
  width: number;
  startTime: number;
  endTime: number;
}

function buildTimeToX(barLayouts: BarLayout[]): (time: number) => number {
  return (time: number): number => {
    if (barLayouts.length === 0) return 0;
    if (time <= barLayouts[0].startTime) return barLayouts[0].xStart;

    for (const bar of barLayouts) {
      if (time >= bar.startTime && time < bar.endTime) {
        const frac = (time - bar.startTime) / (bar.endTime - bar.startTime);
        return bar.xStart + frac * bar.width;
      }
    }

    const last = barLayouts[barLayouts.length - 1];
    return last.xStart + last.width;
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ScoreRendererProps {
  exercise: Exercise;
  currentTime: number;
  playing: boolean;
  highlightWindow?: number;
}

export default function ScoreRenderer({
  exercise,
  currentTime,
}: ScoreRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgWrapperRef = useRef<HTMLDivElement>(null);
  const barLayoutsRef = useRef<BarLayout[]>([]);
  const timeToXRef = useRef<(t: number) => number>(() => 0);
  const noteElementsRef = useRef<
    { element: SVGElement; onset: number }[]
  >([]);
  const totalWidthRef = useRef(0);

  // Render the full score once on exercise change
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";
    noteElementsRef.current = [];

    const svgWrapper = document.createElement("div");
    svgWrapper.style.position = "absolute";
    svgWrapper.style.top = "0";
    svgWrapper.style.left = "0";
    svgWrapper.style.willChange = "transform";
    container.appendChild(svgWrapper);
    (svgWrapperRef as React.MutableRefObject<HTMLDivElement>).current =
      svgWrapper;

    // Prepare data
    const bars = groupNotesIntoBars(exercise);
    if (bars.length === 0) return;

    const vexKeySig = toVexKeySignature(exercise.keySignature);
    const vexTimeSig = toVexTimeSignature(exercise.timeSignature);
    const beatsPerBar =
      exercise.timeSignature[0] * (4 / exercise.timeSignature[1]);
    const hasBassTrack = exercise.tracks.length > 1;

    // Create VexFlow renderer
    const estimatedWidth = bars.length * 300 + STAVE_START_PADDING * 2;
    const renderer = new Renderer(svgWrapper, Renderer.Backends.SVG);
    renderer.resize(estimatedWidth, CANVAS_HEIGHT);
    const context = renderer.getContext();
    context.setFont("Arial", 10);

    const svgEl = svgWrapper.querySelector("svg");
    if (svgEl) {
      svgEl.style.background = COLORS.background;
    }

    const barLayouts: BarLayout[] = [];
    let xCursor = STAVE_START_PADDING;

    // Render each bar
    for (let bi = 0; bi < bars.length; bi++) {
      const bar = bars[bi];
      const isFirstBar = bi === 0;

      // Build chord groups (with bar-relative beat positions)
      const trebleChords = groupIntoChords(
        bar.trackNotes.get(0) ?? [],
        exercise.tempo,
        bar.startTime,
        beatsPerBar,
      );
      const bassChords = hasBassTrack
        ? groupIntoChords(
            bar.trackNotes.get(1) ?? [],
            exercise.tempo,
            bar.startTime,
            beatsPerBar,
          )
        : [];

      // Fill each voice with rests so ticks sum to beatsPerBar
      const trebleItems = fillBarWithRests(trebleChords, beatsPerBar, "treble");
      const bassItems = fillBarWithRests(bassChords, beatsPerBar, "bass");

      // Convert to VexFlow StaveNote objects
      const trebleNotes = createStaveNotes(trebleItems, exercise.keySignature);
      const bassNotes = createStaveNotes(bassItems, exercise.keySignature);

      // Build voices (SOFT as safety net; ticks should already match)
      const voiceTime = {
        numBeats: exercise.timeSignature[0],
        beatValue: exercise.timeSignature[1],
      };

      const trebleVoice = new Voice(voiceTime).setMode(VoiceMode.SOFT);
      trebleVoice.addTickables(trebleNotes);

      const bassVoice = new Voice(voiceTime).setMode(VoiceMode.SOFT);
      bassVoice.addTickables(bassNotes);

      // --- Create staves FIRST so we can measure preamble width ---
      // Step 1: compute minimum note width from formatter
      const formatter = new Formatter();
      formatter.joinVoices([trebleVoice]);
      formatter.joinVoices([bassVoice]);
      const minNoteWidth = formatter.preCalculateMinTotalWidth([
        trebleVoice,
        bassVoice,
      ]);

      // Step 2: create a temporary stave to measure preamble width
      // (clef + key sig + time sig eat into the bar's note area)
      const tempStave = new Stave(0, 0, 500);
      if (isFirstBar) {
        tempStave.addClef("treble").addKeySignature(vexKeySig).addTimeSignature(vexTimeSig);
      }
      tempStave.setContext(context);
      // getNoteStartX requires the stave to have a context but NOT be drawn
      const preambleWidth = tempStave.getNoteStartX() - tempStave.getX();

      // Step 3: total bar width = preamble + note area + padding
      const noteAreaWidth = Math.max(minNoteWidth + 40, MIN_BAR_WIDTH - preambleWidth);
      const barWidth = preambleWidth + noteAreaWidth + 20;

      // Step 4: create the real staves at the correct position and width
      const trebleStave = new Stave(xCursor, TREBLE_Y, barWidth);
      const bassStave = new Stave(xCursor, BASS_Y, barWidth);

      if (isFirstBar) {
        trebleStave
          .addClef("treble")
          .addKeySignature(vexKeySig)
          .addTimeSignature(vexTimeSig);
        bassStave
          .addClef("bass")
          .addKeySignature(vexKeySig)
          .addTimeSignature(vexTimeSig);
      }

      trebleStave.setContext(context).draw();
      bassStave.setContext(context).draw();

      // Step 5: format voices using the ACTUAL available note area
      const actualNoteWidth = trebleStave.getNoteEndX() - trebleStave.getNoteStartX();
      formatter.format([trebleVoice, bassVoice], actualNoteWidth);

      // Connectors
      if (isFirstBar) {
        new StaveConnector(trebleStave, bassStave)
          .setType("brace")
          .setContext(context)
          .draw();
        new StaveConnector(trebleStave, bassStave)
          .setType("singleLeft")
          .setContext(context)
          .draw();
      }
      new StaveConnector(trebleStave, bassStave)
        .setType("singleRight")
        .setContext(context)
        .draw();

      // Auto-beam BEFORE drawing voices, so that note.setBeam() is called
      // before draw(). This suppresses individual flags on beamed notes.
      // Use half-bar grouping (2 beats per beam group in 4/4 = 4 eighths per group).
      const beamGroupBeats = Math.max(1, Math.floor(beatsPerBar / 2));
      const beamGroups = [new Fraction(beamGroupBeats, exercise.timeSignature[1])];

      const trebleBeamable = trebleNotes.filter(
        (n) => !n.getDuration().includes("r"),
      );
      const bassBeamable = bassNotes.filter(
        (n) => !n.getDuration().includes("r"),
      );

      let trebleBeams: Beam[] = [];
      let bassBeams: Beam[] = [];

      try {
        if (trebleBeamable.length > 0) {
          trebleBeams = Beam.generateBeams(trebleBeamable, {
            groups: beamGroups,
          });
        }
      } catch { /* beaming can fail on edge cases */ }

      try {
        if (bassBeamable.length > 0) {
          bassBeams = Beam.generateBeams(bassBeamable, {
            groups: beamGroups,
          });
        }
      } catch { /* beaming can fail on edge cases */ }

      // NOW draw voices (flags will be suppressed on beamed notes)
      trebleVoice.draw(context, trebleStave);
      bassVoice.draw(context, bassStave);

      // Draw the beams
      trebleBeams.forEach((b) => b.setContext(context).draw());
      bassBeams.forEach((b) => b.setContext(context).draw());

      // Record note SVG elements for future highlighting
      for (let idx = 0; idx < trebleItems.length; idx++) {
        const item = trebleItems[idx];
        if (item.type === "note" && item.chord) {
          const sn = trebleNotes[idx];
          const svgElement =
            (sn as unknown as { el?: SVGElement }).el ??
            (sn as unknown as { attrs?: { el?: SVGElement } }).attrs?.el;
          if (svgElement) {
            noteElementsRef.current.push({
              element: svgElement,
              onset: item.chord.onset,
            });
          }
        }
      }
      for (let idx = 0; idx < bassItems.length; idx++) {
        const item = bassItems[idx];
        if (item.type === "note" && item.chord) {
          const sn = bassNotes[idx];
          const svgElement =
            (sn as unknown as { el?: SVGElement }).el ??
            (sn as unknown as { attrs?: { el?: SVGElement } }).attrs?.el;
          if (svgElement) {
            noteElementsRef.current.push({
              element: svgElement,
              onset: item.chord.onset,
            });
          }
        }
      }

      barLayouts.push({
        barIndex: bi,
        xStart: xCursor,
        width: barWidth,
        startTime: bar.startTime,
        endTime: bar.endTime,
      });

      xCursor += barWidth;
    }

    // Resize SVG to actual width
    const totalWidth = xCursor + STAVE_START_PADDING;
    renderer.resize(totalWidth, CANVAS_HEIGHT);
    totalWidthRef.current = totalWidth;
    barLayoutsRef.current = barLayouts;
    timeToXRef.current = buildTimeToX(barLayoutsRef.current);
  }, [exercise]);

  // Scroll on time change
  useEffect(() => {
    const wrapper = svgWrapperRef.current;
    const container = containerRef.current;
    if (!wrapper || !container) return;

    const containerWidth = container.clientWidth;
    const nowLineX = containerWidth * NOW_LINE_FRACTION;
    const scoreX = timeToXRef.current(currentTime);
    const translateX = nowLineX - scoreX;

    wrapper.style.transform = `translateX(${translateX}px)`;
  }, [currentTime]);

  return (
    <div style={{ position: "relative", width: "100%", overflow: "hidden" }}>
      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: "100%",
          height: CANVAS_HEIGHT,
          background: COLORS.background,
          overflow: "hidden",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: `${NOW_LINE_FRACTION * 100}%`,
          width: 2,
          height: CANVAS_HEIGHT,
          background: COLORS.nowLine,
          pointerEvents: "none",
          boxShadow: `0 0 12px ${COLORS.nowLine}`,
          zIndex: 10,
        }}
      />
    </div>
  );
}