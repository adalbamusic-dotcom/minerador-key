---
name: app-visual-system
description: Apply and review the project's visual system whenever creating, editing, refactoring or reviewing frontend interfaces, layouts, components, typography, colors, spacing, responsive behavior, light mode or dark mode. Do not use for backend-only tasks.
---

# App Visual System

## Objective

Create interfaces that are visually consistent, readable, accessible and aligned with the existing design system.

Do not invent a new visual language for each screen.

## Activation

Use this skill whenever the task involves:

- pages or screens;
- React, Vue, Svelte or frontend components;
- CSS, Tailwind or styled components;
- typography;
- colors;
- spacing;
- layout;
- responsive behavior;
- light or dark themes;
- UI review or visual corrections.

Do not use this skill for backend-only changes.

## Source of truth

Follow this order of precedence:

1. The canonical project document in `docs/compartilhado/sistema-visual.md`.
2. Existing tokens and global styles, currently centered in `app/globals.css`.
3. Existing reusable components in `components/` and module-owned components in `modules/`.
4. Existing validated implementation patterns of the project.

The rules in `references/visual-rules.md` are auxiliary guidance and do not override this precedence.

Never create a parallel design system.

If a token or component already exists, reuse it.

## Required workflow

Before writing frontend code:

1. Read `docs/compartilhado/sistema-visual.md`.
2. Inspect existing tokens and global styles, beginning with `app/globals.css`.
3. Inspect similar components already implemented in `components/` and `modules/`.
4. Identify whether the task requires a new component or only composition.
5. Read when present:
   - `references/visual-rules.md`
6. Determine how the screen behaves in light and dark mode.

During implementation:

1. Use semantic design tokens.
2. Reuse existing components.
3. Keep typography and spacing consistent.
4. Avoid arbitrary values.
5. Avoid inline visual styles.
6. Avoid creating component-specific color systems.
7. Preserve responsive behavior.
8. Implement all relevant interaction states.

After implementation:

1. Run the project's lint and type-check commands.
2. Run `node .agents/skills/app-visual-system/scripts/check-visual-system.mjs` when that script exists in the checkout.
3. Review the interface in light mode.
4. Review the interface in dark mode.
5. Check mobile, tablet and desktop widths.
6. Check hover, focus, active, disabled, loading and error states.
7. Report any visual-system exception explicitly.

## Color rules

Use semantic tokens such as:

- `--color-background`
- `--color-surface`
- `--color-surface-subtle`
- `--color-text`
- `--color-text-muted`
- `--color-border`
- `--color-primary`
- `--color-danger`
- `--color-success`
- `--color-warning`

Do not use raw hexadecimal, RGB, HSL or OKLCH values inside application components.

Raw color values may exist only inside the central token file.

Do not use pure black as the main dark-mode background.

Do not use pure white for large blocks of dark-mode text.

Dark mode is not a simple inversion of light mode.

Use small differences between background, surface and elevated surface instead of strong borders around every element.

Use accent colors selectively.

Do not make every heading, icon and button use the primary color.

## Dark-mode rules

Dark mode must remain comfortable for long reading sessions.

Use:

- a dark neutral background;
- slightly lighter surfaces;
- off-white primary text;
- softer secondary text;
- low-emphasis borders;
- restrained shadows;
- muted decorative colors.

Avoid:

- `#000000` backgrounds;
- `#ffffff` body text;
- bright saturated surfaces;
- glowing borders;
- excessive gradients;
- high-contrast separators;
- a border around every container.

Dark-mode hierarchy should come primarily from surface elevation and spacing, not aggressive contrast.

## Typography rules

Use one primary sans-serif font family unless the project explicitly defines another one.

Do not introduce a new font without explicit approval.

Body text:

- minimum preferred size: 16px;
- minimum interface-support size: 14px;
- normal weight: 400 or 450;
- line height: between 1.5 and 1.7;
- maximum long-form line width: 68 characters.

Headings:

- use a consistent type scale;
- line height between 1.1 and 1.3;
- avoid excessive boldness;
- use hierarchy through size, spacing and weight;
- do not use uppercase for long headings.

Buttons and labels:

- prefer 14px to 16px;
- avoid very small text;
- avoid excessive letter spacing;
- avoid uppercase unless it is an established product pattern.

Do not use muted colors for important instructions, form values or essential information.

## Spacing rules

Use the project's spacing scale.

Preferred spacing progression:

- 4px
- 8px
- 12px
- 16px
- 24px
- 32px
- 48px
- 64px

Avoid arbitrary values such as:

- 13px
- 17px
- 22px
- 29px
- 37px

Exceptions must have a concrete layout reason.

Related elements should be closer together than unrelated groups.

Do not solve weak hierarchy by adding more cards.

## Layout rules

Start with content hierarchy before decoration.

Each screen should have:

1. A clear primary action or purpose.
2. A visible information hierarchy.
3. Consistent alignment.
4. Predictable spacing.
5. Responsive behavior.
6. Empty, loading and error states when applicable.

Prefer:

- composition;
- whitespace;
- grouped sections;
- reusable layout primitives.

Avoid:

- nested cards inside cards;
- excessive panels;
- unnecessary sidebars;
- decorative elements competing with content;
- inconsistent content widths;
- center alignment for long text.

## Component rules

Before creating a new component, search the project for an equivalent component.

Use variants instead of copying a component and changing its styles.

Components must support relevant states:

- default;
- hover;
- focus-visible;
- active;
- disabled;
- loading;
- invalid or error;
- selected, when applicable.

Interactive elements must have a visible focus state.

Do not remove outlines without providing a usable replacement.

## Responsive rules

Build mobile behavior intentionally.

Do not merely shrink the desktop interface.

Check at least:

- 360px;
- 768px;
- 1024px;
- 1440px.

On smaller screens:

- preserve readable text sizes;
- stack content when appropriate;
- avoid horizontal scrolling;
- keep actions reachable;
- reduce decorative complexity before reducing legibility.

## Prohibited patterns

Do not:

- add random gradients;
- introduce glassmorphism without an explicit request;
- use shadows on every card;
- use multiple competing border radii;
- create unique colors for individual components;
- hardcode theme-specific colors in JSX or templates;
- mix several icon libraries;
- use placeholder text as a visible form label;
- use font sizes below 12px;
- use animation only for decoration;
- redesign unrelated parts of the application.

## Completion report

At the end of the task, report:

- components reused;
- components created;
- tokens reused;
- tokens added or changed;
- light-mode validation;
- dark-mode validation;
- responsive widths checked;
- commands executed;
- remaining visual exceptions.
