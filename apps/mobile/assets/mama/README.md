# Mama's orb

The body of `OrbMascot` (mobile redesign spec §8.3). The eyes are not in the
artwork: they are drawn over it as `View`s so they can blink, glance and grow.

## Provenance

Exported from the Apricot Bento Figma file, direction F, screen F5: the header
orb (node `39:32`, 38pt, in the F5 frame `39:11`), with the eyes hidden. The
orb keeps its drop shadow, `#FF4F81` at 30% with a 19pt blur and a 6pt drop,
so the glow is part of the image.

The clone sat centred in a clipped frame 2.4 times its own size, so the glow
never touches the edge, and was rescaled to 120pt before export. Figma's
exporter composites transparency onto grey, so the frame was exported once
over white and once over black and the alpha recovered from the difference.
The PNGs are lossless: palette quantisation banded the glow.

## Geometry

- Every file is square, 8-bit RGBA, and fully transparent at the edge.
- The orb's circle is 1/2.4 of the image, centred, so a 120pt orb draws a
  288pt image offset by -84pt on both axes (`lib/orb.ts`, `ORB_IMAGE_SCALE`).
- One asset serves every size from 28 to 120pt.

| File         | Pixels  | sha256                                                             |
| ------------ | ------- | ------------------------------------------------------------------ |
| `orb.png`    | 288×288 | `5fa7455eadcbf41f110ff830950c46b78290be31e1a40732fcbc69b0d1c425a0` |
| `orb@2x.png` | 576×576 | `c30bbb472406683569238dae6dbe4f6968337f194bc55c4a7822caafdb6e3b7e` |
| `orb@3x.png` | 864×864 | `e4a4ae6ae6998bd5a9c60980b396ac6c6903f3459dbc57b5db2aaa8565e7c4fc` |
