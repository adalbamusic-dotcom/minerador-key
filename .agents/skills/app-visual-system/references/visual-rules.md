# Visual Rules

## Visual direction

The interface should feel:

- calm;
- professional;
- clear;
- spacious;
- modern without appearing experimental;
- suitable for long periods of use.

The interface should not feel:

- neon;
- excessively futuristic;
- visually noisy;
- overly condensed;
- aggressively contrasted;
- composed entirely of cards.

## Typography

Primary font:

`Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

Type scale:

| Token | Size | Line height | Weight |
|---|---:|---:|---:|
| caption | 12px | 1.4 | 500 |
| label | 14px | 1.4 | 500 |
| body-sm | 14px | 1.55 | 400 |
| body | 16px | 1.6 | 400 |
| body-lg | 18px | 1.55 | 400 |
| title-sm | 20px | 1.3 | 600 |
| title | 24px | 1.25 | 600 |
| heading | 32px | 1.2 | 650 |
| display | 40px | 1.1 | 650 |

Do not use more than three font weights on the same screen.

## Radius

Use only these radius values:

- small: 6px;
- medium: 10px;
- large: 14px;
- pill: 999px.

Default application component radius: 10px.

Do not make every rectangular element pill-shaped.

## Borders

Borders should be subtle and functional.

Use borders for:

- separating interactive controls;
- indicating input boundaries;
- tables;
- selected or focused states.

Do not use borders only to compensate for poor spacing.

## Shadows

Use shadows only for:

- menus;
- popovers;
- dialogs;
- floating elements;
- elevated navigation.

Normal page cards should generally use surface color and border instead of heavy shadow.

## Motion

Default duration:

- fast feedback: 120ms;
- normal interaction: 180ms;
- entering or leaving overlays: 220ms.

Use ease-out for entrances and ease-in for exits.

Respect reduced-motion preferences.