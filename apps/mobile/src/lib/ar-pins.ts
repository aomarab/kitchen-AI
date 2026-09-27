import { normalizedBoxSchema } from '@kitchen/contracts';
import { isLowConfidence } from './capture';

export const PIN_ANCHOR = 14;
export const PIN_LEADER = 26;
export const PIN_CHIP_HEIGHT = 44;
export const PIN_CHIP_MAX_WIDTH = 160;
export const PIN_NUDGE = 40;
export const MAX_PINS = 8;
export const PIN_ROW_TOLERANCE = 24;

const PIN_CHIP_MIN_WIDTH = 44;
const PIN_CHIP_CHAR_WIDTH = 8;
const PIN_CHIP_HORIZONTAL_PADDING = 24;
const PIN_CHIP_DOT_AND_GAP = 16;
const PIN_NUDGE_STEP = 8;

export interface PinItem {
  id: string;
  box: { x: number; y: number; w: number; h: number } | null | undefined;
  confidence: number;
  chipWidth: number;
}

export interface PinFrame {
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
  safeTop: number;
  safeBottom: number;
}

export interface PlacedPin {
  id: string;
  anchor: { x: number; y: number };
  chip: { x: number; y: number; width: number; height: number };
  placement: 'above' | 'below';
  lowConfidence: boolean;
}

interface Candidate {
  item: PinItem;
  inputIndex: number;
  anchor: { x: number; y: number };
}

interface Row {
  firstY: number;
  candidates: Candidate[];
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function estimateChipWidth(label: string): number {
  return clamp(
    label.length * PIN_CHIP_CHAR_WIDTH + PIN_CHIP_HORIZONTAL_PADDING + PIN_CHIP_DOT_AND_GAP,
    PIN_CHIP_MIN_WIDTH,
    PIN_CHIP_MAX_WIDTH,
  );
}

export function layoutPins(
  items: readonly PinItem[],
  frame: PinFrame,
  direction: 'ltr' | 'rtl',
): { pins: PlacedPin[]; tray: string[] } {
  const trayIndexes = new Set<number>();
  const candidates: Candidate[] = [];

  if (!isUsableFrame(frame)) {
    return { pins: [], tray: items.map((item) => item.id) };
  }

  items.forEach((item, inputIndex) => {
    const parsed = normalizedBoxSchema.safeParse(item.box);
    if (!parsed.success) {
      trayIndexes.add(inputIndex);
      return;
    }

    const anchor = anchorForBox(parsed.data, frame);
    if (!isAnchorVisible(anchor, frame)) {
      trayIndexes.add(inputIndex);
      return;
    }

    candidates.push({ item, inputIndex, anchor });
  });

  const order = new Map<number, number>();
  sortReadingOrder(candidates, direction).forEach((candidate, index) => {
    order.set(candidate.inputIndex, index);
  });

  let placeable = candidates;
  if (placeable.length > MAX_PINS) {
    const demoted = new Set(
      [...placeable]
        .sort((a, b) => {
          const confidence = a.item.confidence - b.item.confidence;
          if (confidence !== 0) return confidence;
          return (order.get(b.inputIndex) ?? 0) - (order.get(a.inputIndex) ?? 0);
        })
        .slice(0, placeable.length - MAX_PINS)
        .map((candidate) => candidate.inputIndex),
    );
    demoted.forEach((inputIndex) => trayIndexes.add(inputIndex));
    placeable = placeable.filter((candidate) => !demoted.has(candidate.inputIndex));
  }

  const pins: PlacedPin[] = [];
  for (const candidate of sortReadingOrder(placeable, direction)) {
    const placed = placeCandidate(candidate, frame, pins);
    if (placed) {
      pins.push(placed);
    } else {
      trayIndexes.add(candidate.inputIndex);
    }
  }

  return {
    pins,
    tray: items
      .map((item, index) => (trayIndexes.has(index) ? item.id : null))
      .filter((id): id is string => id !== null),
  };
}

function isUsableFrame(frame: PinFrame): boolean {
  return [frame.width, frame.height, frame.imageWidth, frame.imageHeight].every(
    (value) => Number.isFinite(value) && value > 0,
  );
}

function anchorForBox(
  box: { x: number; y: number; w: number; h: number },
  frame: PinFrame,
): { x: number; y: number } {
  const scale = Math.max(frame.width / frame.imageWidth, frame.height / frame.imageHeight);
  const offsetX = (frame.width - frame.imageWidth * scale) / 2;
  const offsetY = (frame.height - frame.imageHeight * scale) / 2;
  return {
    x: offsetX + (box.x + box.w / 2) * frame.imageWidth * scale,
    y: offsetY + (box.y + box.h / 2) * frame.imageHeight * scale,
  };
}

function isAnchorVisible(anchor: { x: number; y: number }, frame: PinFrame): boolean {
  return (
    anchor.x >= 0 &&
    anchor.x <= frame.width &&
    anchor.y >= frame.safeTop &&
    anchor.y <= frame.height - frame.safeBottom
  );
}

function sortReadingOrder(candidates: readonly Candidate[], direction: 'ltr' | 'rtl'): Candidate[] {
  const rows: Row[] = [];
  for (const candidate of [...candidates].sort((a, b) => {
    const y = a.anchor.y - b.anchor.y;
    if (y !== 0) return y;
    const x = a.anchor.x - b.anchor.x;
    if (x !== 0) return x;
    return a.inputIndex - b.inputIndex;
  })) {
    const current = rows[rows.length - 1];
    if (current && Math.abs(candidate.anchor.y - current.firstY) <= PIN_ROW_TOLERANCE) {
      current.candidates.push(candidate);
    } else {
      rows.push({ firstY: candidate.anchor.y, candidates: [candidate] });
    }
  }

  return rows.flatMap((row) =>
    row.candidates.sort((a, b) => {
      const x = direction === 'ltr' ? a.anchor.x - b.anchor.x : b.anchor.x - a.anchor.x;
      if (x !== 0) return x;
      return a.inputIndex - b.inputIndex;
    }),
  );
}

function placeCandidate(
  candidate: Candidate,
  frame: PinFrame,
  placed: readonly PlacedPin[],
): PlacedPin | null {
  const chipWidth = Math.min(candidate.item.chipWidth, PIN_CHIP_MAX_WIDTH);
  const centeredX = clamp(candidate.anchor.x - chipWidth / 2, 0, frame.width - chipWidth);
  const direct = tryPositions(candidate, frame, placed, chipWidth, centeredX);
  if (direct) return direct;

  for (let offset = PIN_NUDGE_STEP; offset <= PIN_NUDGE; offset += PIN_NUDGE_STEP) {
    for (const signedOffset of [offset, -offset]) {
      const nudgedX = clamp(centeredX + signedOffset, 0, frame.width - chipWidth);
      const nudged = tryPositions(candidate, frame, placed, chipWidth, nudgedX);
      if (nudged) return nudged;
    }
  }

  return null;
}

function tryPositions(
  candidate: Candidate,
  frame: PinFrame,
  placed: readonly PlacedPin[],
  chipWidth: number,
  x: number,
): PlacedPin | null {
  const aboveY = candidate.anchor.y - PIN_ANCHOR / 2 - PIN_LEADER - PIN_CHIP_HEIGHT;
  const above = rect(x, aboveY, chipWidth);
  if (aboveY >= frame.safeTop && !overlapsAny(above, placed)) {
    return toPlacedPin(candidate, above, 'above');
  }

  const belowY = candidate.anchor.y + PIN_ANCHOR / 2 + PIN_LEADER;
  const below = rect(x, belowY, chipWidth);
  if (belowY + PIN_CHIP_HEIGHT <= frame.height - frame.safeBottom && !overlapsAny(below, placed)) {
    return toPlacedPin(candidate, below, 'below');
  }

  return null;
}

function rect(x: number, y: number, width: number): Rect {
  return { x, y, width, height: PIN_CHIP_HEIGHT };
}

function toPlacedPin(candidate: Candidate, chip: Rect, placement: 'above' | 'below'): PlacedPin {
  return {
    id: candidate.item.id,
    anchor: candidate.anchor,
    chip,
    placement,
    lowConfidence: isLowConfidence(candidate.item.confidence),
  };
}

function overlapsAny(rectangle: Rect, placed: readonly PlacedPin[]): boolean {
  return placed.some((pin) => overlaps(rectangle, pin.chip));
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
