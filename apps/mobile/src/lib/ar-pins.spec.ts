import { describe, expect, it } from 'vitest';
import {
  MAX_PINS,
  PIN_ANCHOR,
  PIN_CHIP_HEIGHT,
  PIN_CHIP_MAX_WIDTH,
  PIN_LEADER,
  PIN_NUDGE,
  PIN_ROW_TOLERANCE,
  estimateChipWidth,
  layoutPins,
  type PinFrame,
  type PinItem,
} from './ar-pins';

function boxAt(cx: number, cy: number, size = 0.02): NonNullable<PinItem['box']> {
  return { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
}

function item(
  id: string,
  box: PinItem['box'],
  options: Partial<Pick<PinItem, 'chipWidth' | 'confidence'>> = {},
): PinItem {
  return { id, box, confidence: options.confidence ?? 0.9, chipWidth: options.chipWidth ?? 80 };
}

const baseFrame: PinFrame = {
  width: 400,
  height: 300,
  imageWidth: 400,
  imageHeight: 300,
  safeTop: 0,
  safeBottom: 0,
};

describe('layoutPins geometry constants', () => {
  it('pins the spec values used by the capture overlay', () => {
    expect(PIN_ANCHOR).toBe(14);
    expect(PIN_LEADER).toBe(26);
    expect(PIN_CHIP_HEIGHT).toBe(44);
    expect(PIN_CHIP_MAX_WIDTH).toBe(160);
    expect(PIN_NUDGE).toBe(40);
    expect(MAX_PINS).toBe(8);
    expect(PIN_ROW_TOLERANCE).toBe(24);
  });
});

describe('layoutPins cover mapping', () => {
  it('maps a portrait image into a landscape frame with cover-crop offsets', () => {
    const frame: PinFrame = {
      width: 400,
      height: 200,
      imageWidth: 100,
      imageHeight: 200,
      safeTop: 0,
      safeBottom: 0,
    };

    const { pins, tray } = layoutPins([item('center', boxAt(0.5, 0.5))], frame, 'ltr');

    expect(tray).toEqual([]);
    // s = max(400 / 100, 200 / 200) = 4; ox = 0; oy = (200 - 200 * 4) / 2 = -300.
    // The box centre is (0.5, 0.5), so anchor = (0 + 50 * 4, -300 + 100 * 4).
    expect(pins[0]!.anchor).toEqual({ x: 200, y: 100 });
  });

  it('maps a landscape image into a portrait frame with cover-crop offsets', () => {
    const frame: PinFrame = {
      width: 200,
      height: 400,
      imageWidth: 400,
      imageHeight: 100,
      safeTop: 0,
      safeBottom: 0,
    };

    const { pins, tray } = layoutPins([item('center', boxAt(0.5, 0.5))], frame, 'ltr');

    expect(tray).toEqual([]);
    // s = max(200 / 400, 400 / 100) = 4; ox = (200 - 400 * 4) / 2 = -700; oy = 0.
    // The box centre is (0.5, 0.5), so anchor = (-700 + 200 * 4, 0 + 50 * 4).
    expect(pins[0]!.anchor).toEqual({ x: 100, y: 200 });
  });
});

describe('layoutPins rejection rules', () => {
  it('sends out-of-crop anchors and safe-zone anchors to the tray', () => {
    const cropped: PinFrame = {
      width: 400,
      height: 200,
      imageWidth: 100,
      imageHeight: 200,
      safeTop: 0,
      safeBottom: 0,
    };
    const safe: PinFrame = { ...baseFrame, safeTop: 80, safeBottom: 60 };

    expect(layoutPins([item('cropped', boxAt(0.5, 0.05))], cropped, 'ltr').tray).toEqual([
      'cropped',
    ]);
    expect(
      layoutPins(
        [item('top-safe', boxAt(0.5, 0.1)), item('bottom-safe', boxAt(0.5, 0.9))],
        safe,
        'ltr',
      ).tray,
    ).toEqual(['top-safe', 'bottom-safe']);
  });

  it('sends null, undefined and overflowing boxes to the tray', () => {
    const { pins, tray } = layoutPins(
      [
        item('null-box', null),
        item('undefined-box', undefined),
        item('overflowing-box', { x: 0.9, y: 0.2, w: 0.2, h: 0.2 }),
      ],
      baseFrame,
      'ltr',
    );

    expect(pins).toEqual([]);
    expect(tray).toEqual(['null-box', 'undefined-box', 'overflowing-box']);
  });

  it('keeps the tray in input order across different rejection rules', () => {
    const frame: PinFrame = { ...baseFrame, safeTop: 80 };

    const { tray } = layoutPins(
      [
        item('top-safe', boxAt(0.5, 0.1)),
        item('null-box', null),
        item('overflowing-box', { x: 0.9, y: 0.2, w: 0.2, h: 0.2 }),
      ],
      frame,
      'ltr',
    );

    expect(tray).toEqual(['top-safe', 'null-box', 'overflowing-box']);
  });
});

describe('layoutPins placement', () => {
  it('flips below when the above chip would clip the top safe zone', () => {
    const frame: PinFrame = { ...baseFrame, height: 240, imageHeight: 240, safeTop: 70 };

    const { pins, tray } = layoutPins([item('near-top', boxAt(0.5, 100 / 240))], frame, 'ltr');

    expect(tray).toEqual([]);
    expect(pins[0]!.placement).toBe('below');
    expect(pins[0]!.chip.y).toBe(100 + PIN_ANCHOR / 2 + PIN_LEADER);
  });

  it('flips below when the above chip overlaps a placed chip', () => {
    const { pins, tray } = layoutPins(
      [item('first', boxAt(100 / 400, 0.5)), item('second', boxAt(130 / 400, 0.5))],
      baseFrame,
      'ltr',
    );

    expect(tray).toEqual([]);
    expect(pins.map((pin) => [pin.id, pin.placement])).toEqual([
      ['first', 'above'],
      ['second', 'below'],
    ]);
  });

  it('nudges horizontally until an overlapping chip fits', () => {
    const { pins, tray } = layoutPins(
      [
        item('above-blocker', boxAt(100 / 400, 0.5), { chipWidth: 44 }),
        item('below-blocker', boxAt(105 / 400, 0.5), { chipWidth: 44 }),
        item('nudged', boxAt(130 / 400, 0.5), { chipWidth: 44 }),
      ],
      baseFrame,
      'ltr',
    );

    expect(tray).toEqual([]);
    const nudged = pins.find((pin) => pin.id === 'nudged')!;
    expect(nudged.placement).toBe('above');
    expect(nudged.chip.x).toBe(130 - 44 / 2 + 16);
  });

  it('demotes to the tray when nudging up to forty points cannot avoid overlap', () => {
    const { pins, tray } = layoutPins(
      [
        item('above-blocker', boxAt(100 / 400, 0.5), { chipWidth: PIN_CHIP_MAX_WIDTH }),
        item('below-blocker', boxAt(105 / 400, 0.5), { chipWidth: PIN_CHIP_MAX_WIDTH }),
        item('trapped', boxAt(120 / 400, 0.5), { chipWidth: PIN_CHIP_MAX_WIDTH }),
      ],
      baseFrame,
      'ltr',
    );

    expect(pins.map((pin) => pin.id)).toEqual(['above-blocker', 'below-blocker']);
    expect(tray).toEqual(['trapped']);
  });

  it('caps pins at eight, demoting the lowest confidence and later reading-order tie', () => {
    const items = Array.from({ length: 10 }, (_, index) =>
      item(`pin-${index}`, boxAt(((index + 1) * 90) / 1000, 0.5), {
        chipWidth: 44,
        confidence: index === 2 ? 0.1 : index === 4 || index === 8 ? 0.2 : 0.9,
      }),
    );
    const frame: PinFrame = { ...baseFrame, width: 1000, imageWidth: 1000 };

    const { pins, tray } = layoutPins(items, frame, 'ltr');

    expect(pins).toHaveLength(MAX_PINS);
    expect(tray).toEqual(['pin-2', 'pin-8']);
    expect(pins.map((pin) => pin.id)).not.toContain('pin-2');
    expect(pins.map((pin) => pin.id)).not.toContain('pin-8');
  });
});

describe('layoutPins ordering and direction', () => {
  it('changes RTL reading order without changing any coordinates', () => {
    const items = [
      item('left', boxAt(0.25, 0.5), { chipWidth: 44 }),
      item('right', boxAt(0.75, 0.5), { chipWidth: 44 }),
    ];

    const ltr = layoutPins(items, baseFrame, 'ltr').pins;
    const rtl = layoutPins(items, baseFrame, 'rtl').pins;

    expect(ltr.map((pin) => pin.id)).toEqual(['left', 'right']);
    expect(rtl.map((pin) => pin.id)).toEqual(['right', 'left']);
    for (const ltrPin of ltr) {
      const rtlPin = rtl.find((pin) => pin.id === ltrPin.id)!;
      expect(rtlPin.anchor).toEqual(ltrPin.anchor);
      expect(rtlPin.chip).toEqual(ltrPin.chip);
    }
  });

  it('sorts pins by rows, then by inline position inside each row', () => {
    const { pins } = layoutPins(
      [
        item('bottom-right', boxAt(0.8, 0.7), { chipWidth: 44 }),
        item('top-right', boxAt(0.8, 0.2), { chipWidth: 44 }),
        item('bottom-left', boxAt(0.2, 0.7), { chipWidth: 44 }),
        item('top-left', boxAt(0.2, 0.2), { chipWidth: 44 }),
      ],
      baseFrame,
      'ltr',
    );

    expect(pins.map((pin) => pin.id)).toEqual([
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
    ]);
  });
});

describe('estimateChipWidth', () => {
  it('clamps very short labels to the 44 point touch target', () => {
    expect(estimateChipWidth('')).toBe(44);
  });

  it('clamps long labels to the maximum chip width', () => {
    expect(estimateChipWidth('a very long ingredient label that should truncate')).toBe(
      PIN_CHIP_MAX_WIDTH,
    );
  });
});
