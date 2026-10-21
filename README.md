# Doodle Symmetry

A kaleidoscope drawing toy that runs in the browser. Draw anywhere on the canvas and each stroke is repeated around the center.

## Run it

It's one HTML file with no build step and no dependencies. Open `index.html` in any modern browser.

## Controls

| Control | What it does |
| --- | --- |
| **Slices** | How many times each stroke repeats around the center (4–16) |
| **Mirror** | Also draws a reflected copy in each slice |
| **Color** | Stroke color |
| **Rainbow** | Changes the hue continuously as you draw (overrides Color) |
| **Size** | Line width |
| **Glow** | Soft additive glow around strokes |
| **Undo** / `Ctrl+Z` (`Cmd+Z` on Mac) | Removes the last stroke |
| **Clear** | Clears the canvas |
| **Download PNG** | Saves the current drawing as `doodle-symmetry.png` |

Settings apply to new strokes, so you can change the slice count or color partway through and earlier strokes stay as they were.
