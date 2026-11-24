# TeXexpress

Type a LaTeX equation, see it rendered live, and copy it as a vector graphic straight into
PowerPoint, Affinity Designer, Keynote, Word and other apps. No LaTeX installation needed:
equations are rendered with [MathJax](https://www.mathjax.org/), bundled with the app.

- **Copy SVG** pastes into PowerPoint as an editable vector graphic at the exact size
  (a 20 pt equation matches 20 pt text), and into Affinity Designer as a group of curves.
- **Copy PDF** gives a tightly cropped vector PDF; **Copy PNG** a transparent high-DPI image.
- **Drag** the preview onto an app or a folder to drop an `.svg` file.
- Four math fonts, each for a purpose: Computer Modern (LaTeX's default), Palatino (theses
  and books), Times (journal articles), Fira Sans (slides). Bold, colours, display/inline
  mode, padding.
- Autocomplete for LaTeX commands, an Insert menu, your own macros, a searchable history with
  previews, light/dark theme, "keep on top".
- Includes the `amsmath`, `physics`, `mathtools`, `cancel`, `braket` and `mhchem` (`\ce`)
  commands, plus `\SI`, `\si`, `\qty`, `\num` for common units.

## Install

Download the latest installer from the **Releases** page:

| System  | File | First launch |
|---------|------|--------------|
| Windows | `TeXexpress-Setup-x.y.z.exe` | Windows may show *"Windows protected your PC"* because the app isn't code-signed. Click **More info → Run anyway**. |
| macOS   | `TeXexpress-x.y.z-mac.dmg` | Drag the app to *Applications*. Because it isn't signed by Apple, right-click it → **Open** the first time. If macOS says the app *"is damaged"*, run `xattr -cr "/Applications/TeXexpress.app"` in Terminal once. |

## Use

1. Type LaTeX math in the *Equation* box (no `$` signs), e.g. `\frac{a}{b} + \sqrt{x}`.
2. Pick font, size, colour in the toolbar.
3. Click **Copy SVG** and press Ctrl+V (⌘V on Mac) in your document.

Press **F1** in the app for the full guide and shortcuts.

## Develop

Requires Node.js 20+.

```sh
npm install
npm start            # run the app (copies MathJax files to src/vendor first)
npm run dist:win     # build the Windows installer into dist/
npm run dist:mac     # build the macOS .dmg (must be run on a Mac)
```

Pushing to GitHub builds both installers automatically (see `.github/workflows/build.yml`);
pushing a tag such as `v0.2.0` also publishes a release.

### How it works

- `src/renderer/mathjax-frame.html` – one hidden page per font running MathJax (TeX → SVG,
  no network access).
- `src/renderer/svgtools.js` – converts MathJax output to an SVG sized in points, plus the
  Affinity variant (content wrapped in a nested `<svg>` so Affinity pastes a group, not a layer).
- `src/main/clipboard.js` – puts several named formats on the clipboard at once:
  `image/svg+xml` for Office, `image/x-inkscape-svg` / `Scalable Vector Graphics` for Affinity.
  Windows uses `user32` through [koffi](https://koffi.dev/); macOS uses `NSPasteboard` through
  JavaScript for Automation.
- `src/main/main.js` – window, PDF export (Chromium's PDF printer), drag-out, save dialogs.

### Not yet verified

- macOS clipboard: the pasteboard types PowerPoint and Affinity read on macOS still need testing
  on a Mac (`src/main/main.js`, `copy:svg`).

## License

Copyright © 2026 Pierre Lefloïc. Released under the MIT License (see `LICENSE`).

Third-party software and fonts (MathJax, Electron, koffi, New Computer Modern, TeX Gyre
Pagella/Termes, Fira Math) keep their own licenses: see `THIRD-PARTY-NOTICES.md`, the texts in
`src/licenses/`, or **Help → About & licenses** in the app.
