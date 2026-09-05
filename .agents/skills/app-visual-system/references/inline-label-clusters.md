# Inline Label / Affordance Clusters

Use the shared `InlineLabelCluster` when a label is accompanied by an
`InfoHint`, a sort indicator or another trailing affordance.

## Fixed contract

- label → InfoHint: `var(--ui-label-info-gap)` = `2px`;
- InfoHint → trailing control: `var(--ui-label-control-gap)` = `4px`;
- label → trailing control without InfoHint: `var(--ui-label-control-gap)` = `4px`;
- cluster: `inline-flex`, centered, atomic and `nowrap`;
- glyphs and controls do not shrink;
- only the text slot may be allowed to truncate when a consumer genuinely needs it.

The shared primitive owns the spacing. Do not add `ml-*`, arbitrary `gap-*`,
negative offsets or consumer-specific positioning to compensate for an
`InfoHint` trigger.

The default `InfoHint` keeps a compact visual glyph slot and a larger
keyboard/pointer interaction area without moving the visible glyph away from
the label. Its hit area must not steal the click of a trailing control.

## Prohibited composition

Do not use `justify-between`, `flex-grow`, `position: absolute` or wrapping
between label, hint and trailing control. In tables, preserve the cluster and
let the existing minimum table width or horizontal scroll solve compression;
never overlap the neighboring column.

For process buttons, the functional icon keeps the button's normal icon-label
spacing. The existing explicit `InfoHint` occupies the following label cluster
inside the action button. Wrap that existing button with `InfoHint` as its
custom trigger and keep the shared glyph in the cluster, so the action remains
a single button without an edge-pushed glyph.
