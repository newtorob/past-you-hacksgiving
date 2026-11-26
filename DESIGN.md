---
version: alpha
colors:
  ink: "#153746"
  canvas: "#e9f2f4"
  paper: "#ffffff"
  highlight: "#f4de83"
  action: "#14635e"
  muted: "#506d77"
  warning: "#9a424d"
typography:
  display:
    fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif'
  body:
    fontFamily: '"Avenir Next", "Segoe UI", sans-serif'
  utility:
    fontFamily: '"SFMono-Regular", Consolas, monospace'
rounded:
  control: 10px
  panel: 18px
---

## Overview

Past You is a working desk for a developer checking whether a proposed change repeats an old mistake. The interface should feel like a thoughtful note passed between two versions of the same person. It is a focused investigation tool, not a general chat client or a dense dashboard.

## Colors

Cool blue-grey is the desk; white is the working surface. Ink supplies contrast, and restrained moss-teal marks the primary action. A soft yellow paper note is the signature element, reserved for the earlier decision. Red describes a demonstrated failed test and always has text alongside it. These values are documented mirrors of the canonical `:root` CSS variables in `public/styles.css`.

## Typography

The literary display face makes the note feel personal; the humanist sans keeps controls and longer findings practical. The monospace face is reserved for commit IDs, test names, and short status labels. All stacks fall back to local system fonts without a network request.

## Layout

On a wide screen, the question and the evidence sit side by side, joined by a small dashed trail. On narrow screens they become a single readable sequence. The result area reserves space for loading and failure messages, and there are no sticky controls covering content.

## Elevation & Depth

Use only a subtle panel shadow. The note uses a slight rotation and a small pin to evoke a physical handoff without compromising legibility.

## Shapes

Panels are gently rounded. Interactive controls have consistent radii, clear focus rings, and a distinct enabled state. Decorative lines never imply clickability.

## Components

The proposal field, primary action, result note, source citation, and paired test results are the shared vocabulary for this one-screen product. Runtime mappings are `colors.ink` → `--ink`, `colors.canvas` → `--canvas`, `colors.paper` → `--paper`, `colors.highlight` → `--highlight`, `colors.action` → `--action`, `colors.muted` → `--muted`, and `colors.warning` → `--warning`. CSS custom properties own the runtime values.

## Do's and Don'ts

Show whether an investigation used an offline sample, a live connector, or a model. Distinguish an actual test from a hypothetical change. Keep generated analysis separate from source and test evidence. Avoid faux terminal output, made-up activity, heavy animation, and stock dashboard decoration. Respect reduced motion and use semantic form controls throughout.
