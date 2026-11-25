# diagram-kit

The `create-diagram` skill (plus its scripts) that lets Claude Code and Codex make clear, well-positioned, interactive diagrams. The product is `plugins/diagram-kit/skills/create-diagram/`; everything else packages, tests or demonstrates it.

## Map

```
plugins/diagram-kit/skills/create-diagram/
  SKILL.md              the workflow agents follow
  references/           brief, spec, kinds, layout, design, environment, checklist
  examples/             one small spec per kind (`diagram example <kind>` prints them)
  scripts/diagram.mjs   CLI: variants, build, check, png, react, page, metrics, example
  scripts/lib/          spec -> layout (ELK, sequence, mindmap) -> model -> check, png, html; variants.mjs explores layouts
  assets/viewer/        theme tokens, the SVG renderer and the viewer (browser-safe, shared)
  assets/               fonts, Lucide icons, font metrics, licences
plugins/diagram-kit/.claude-plugin, .codex-plugin   plugin manifests (names and versions agree with plugins/diagram-kit/package.json)
.opencode/commands/       native OpenCode commands; skills are shared from .agents/skills/
plugins/diagram-kit/skills/create-diagram/agents/openai.yaml   Codex display metadata for the skill
.claude-plugin/, .agents/plugins/                   marketplaces
.agents/skills/create-diagram -> the skill (and .claude/skills -> .agents/skills) for dogfooding here
examples/payments/      the showcase: brief, specs and built outputs
docs/                   GitHub Pages: site.yaml lists the sections; `diagram.mjs page site.yaml` builds index.html; how-it-works.dark.png is the README picture; og.png is the link preview (a crop of the dark diagram, 1200x630);
                        3d/ is a toy racing game that adapts payments.layout.json to a drivable town (keeps rows, columns, groups and connections; its own spacing and roads; three.js r187 vendored). Preview locally over http (modules do not load from file://): `python3 -m http.server --bind 127.0.0.1 --directory docs`
tests/                  node:test suites
```

## Commands

- Install once: `npm run setup` (local `node_modules` next to the scripts, used before the shared cache). Installed plugins use `diagram.mjs setup`, which installs into `~/.cache/diagram-kit/deps-<lockfile hash>` because hosts rewrite plugin folders (Codex does on refresh).
- Tests: `npm test`
- Rebuild every example and the showcase: `npm run examples`
- One diagram: `node plugins/diagram-kit/skills/create-diagram/scripts/diagram.mjs build <spec>`

## Rules

- The layout model (`*.layout.json`) is the contract between scripts and renderers. Change its shape only with a `MODEL_VERSION` bump.
- `assets/viewer/*.mjs` must stay DOM-free at import time and free of npm imports: the HTML writer inlines them with a tiny bundler (no multi-line imports, no name clashes across the three files).
- Every visual value is a token in `theme.mjs`. No literal colours elsewhere.
- Keep dependencies few and pinned to exact versions; install with `--ignore-scripts`. New versions wait at least three days after release.
- After a layout or renderer change: `npm test`, `npm run examples`, then look at every PNG in `examples/` before calling it done.
- Agent-facing text (SKILL.md, references) is short bullets that keep every important point. Never write em dashes.
