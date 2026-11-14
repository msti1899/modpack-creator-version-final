---
version: alpha
name: Modpack Creator — Copper Workshop
description: Warm stone surfaces, parchment text and a single copper accent for an open-source Minecraft modpack tool.
omitted:
  - spacing
  - components
colors:
  background: "#FBF8F4"
  foreground: "#1C1917"
  card: "#FFFFFF"
  card-foreground: "#1C1917"
  popover: "#FFFFFF"
  popover-foreground: "#1C1917"
  primary: "#C2410C"
  primary-foreground: "#FFF8F2"
  secondary: "#F1EAE1"
  secondary-foreground: "#1C1917"
  muted: "#F1EAE1"
  muted-foreground: "#6B6259"
  accent: "#F1EAE1"
  accent-foreground: "#1C1917"
  destructive: "#B91C1C"
  destructive-foreground: "#FEF2F2"
  border: "#E2D9CD"
  input: "#E2D9CD"
  ring: "#C2410C"
  chart-1: "#D9C9B4"
  chart-2: "#A8967F"
  chart-3: "#7A6853"
  chart-4: "#55483A"
  chart-5: "#2E2720"
  sidebar: "#F4EEE6"
  sidebar-foreground: "#1C1917"
  sidebar-primary: "#C2410C"
  sidebar-primary-foreground: "#FFF8F2"
  sidebar-accent: "#EAE0D4"
  sidebar-accent-foreground: "#1C1917"
  sidebar-border: "#E2D9CD"
  sidebar-ring: "#C2410C"
typography:
  sans:
    fontFamily: ui-sans-serif, system-ui, sans-serif
rounded:
  sm: 0.375rem
  md: 0.5rem
  lg: 0.625rem
  xl: 0.875rem
  2xl: 1.125rem
  3xl: 1.375rem
  4xl: 1.625rem
---

## Overview

Modpack Creator is an open-source application for assembling, publishing, and discussing Minecraft modpacks. Its interface is a workshop rather than a game screen: warm stone surfaces, parchment-toned text, and one copper accent reserved for the action that matters. Chrome stays quiet so pack contents lead — mod names, versions, and compatibility notes are the loudest thing on any view. Light is the working default and dark is a first-class equal, not an inverted afterthought.

## Colors

The palette is built from one warm neutral family (stone and parchment) plus a single copper accent. Every neutral tint carries the same warm hue so surfaces never drift toward cold grey.

- **Primary:** Copper marks the one action that matters per view. It is deliberately scarce; two copper elements competing on the same screen both lose meaning.
- **Surface pairing:** Text always uses the foreground token that belongs to its own surface — `background` with `foreground`, `card` with `card-foreground`, `popover` with `popover-foreground`, `sidebar` with `sidebar-foreground`. Cross-pairing a text token with a different surface's background forfeits the measured contrast.
- **Muted and secondary:** Both are the same resting stone tone. Use `muted` for de-emphasised content inside a surface and `secondary` for the fill of a secondary control; never use either as a page background.
- **Border and input:** A hairline, not a signal. It separates regions and draws control edges; it never carries meaning on its own and never renders text.
- **Destructive:** Reserved for irreversible actions and destructive validation. It is not a second accent and never appears as decoration.
- **Sidebar tokens:** A sidebar is a slightly deeper stone than the page, so it reads as an adjacent working surface rather than a floating panel.

## Themes

Dark mode uses the same semantic token names with alternate values. These values are documentation only: the spec version in use cannot encode themes in the frontmatter, so the canonical tokens above stay on the light values.

| Token | Dark value |
| --- | --- |
| background | #16120E |
| foreground | #F5EFE8 |
| card | #1E1813 |
| card-foreground | #F5EFE8 |
| popover | #1E1813 |
| popover-foreground | #F5EFE8 |
| primary | #E8944A |
| primary-foreground | #2A1B0C |
| secondary | #241D16 |
| secondary-foreground | #F5EFE8 |
| muted | #241D16 |
| muted-foreground | #B4A597 |
| accent | #241D16 |
| accent-foreground | #F5EFE8 |
| destructive | #F87171 |
| destructive-foreground | #2A0E0B |
| border | #33291F |
| input | #33291F |
| ring | #E8944A |
| chart-1 | #D9C9B4 |
| chart-2 | #A8967F |
| chart-3 | #7A6853 |
| chart-4 | #55483A |
| chart-5 | #2E2720 |
| sidebar | #1B1510 |
| sidebar-foreground | #F5EFE8 |
| sidebar-primary | #E8944A |
| sidebar-primary-foreground | #2A1B0C |
| sidebar-accent | #2A211A |
| sidebar-accent-foreground | #F5EFE8 |
| sidebar-border | #33291F |
| sidebar-ring | #E8944A |

## Typography

One family carries the whole product. Hierarchy comes from size and weight, never from a second face — introducing a display or serif face for headings would break the workshop tone and the token set has no slot for it.

- Body copy sits at the default weight; headings and the primary label of a control step up one weight. More than two weights in one view flattens the hierarchy it was meant to create.
- Long-form text (mod descriptions, changelogs) stays at the body weight with generous line height; reserve the heavier weight for short labels and headings.
- Uppercase is never used for running text, only for short metadata labels if at all.

## Shapes

The corner radius is one scale with one origin: every step is the base radius multiplied, so changing the base keeps the whole product coherent. Controls sit at the `lg` step; compact controls and nested chips step down to `md` or `sm` rather than repeating the parent's radius. Never place a sharp corner next to a rounded one in the same control cluster.

## Do's and Don'ts

- Do keep the paired surface/foreground combinations. Every pairing named in this document reaches at least 4.5:1 in both themes.
- Do reserve `primary` for a single action per view; let `secondary`, `outline`, and `muted` carry the rest.
- Do keep `border` and `input` at hairline weight as separators only.
- Don't introduce a third hue family. `primary` is the only accent; status colours beyond `destructive` do not exist yet.
- Don't use `border` or `input` as a text colour or as the only indication of focus or error.
- Don't use `primary` as the fill behind running text; the copper surface is sized for short labels, not paragraphs.
- Don't toggle dark mode per surface; a theme applies to the whole view so paired tokens stay paired.
