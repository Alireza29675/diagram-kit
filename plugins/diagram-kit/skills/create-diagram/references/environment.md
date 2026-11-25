# Environment: where the diagram goes

Decide this first; it changes the output, not the spec.

## Choosing the destination

- The user named it ("put it in the app", "make an artifact", "a PNG for the README"): do that.
- Not named, and you can ask: ask once, together with any other questions, offering only what this environment supports. Recommend the option that fits the context first:

| Option | Offer it when | What you produce |
|---|---|---|
| Their own medium | The workspace has its own way to show diagrams: an app, a canvas or drawing library, a docs or design tool | The same diagram rebuilt in that medium from `layout.json`, with their components and style (see below) |
| Cloud artifact | The host has a publishing tool (Claude Code's Artifact tool) | The HTML page published as a private artifact, and its link |
| Standalone page | Always | `<name>.html` in a folder the user picks or the repo's diagram folder |
| Image for docs | The diagram goes into Markdown, a PR, slides or chat | `<name>.png` (and `--dark`), with the HTML linked for interaction |

- Cannot ask (headless, scheduled or `exec` runs, no question tool, no answer): use the standalone page in the default folder below and report the path.
- Layout happens when you build. An app that needs live layout for data that changes at runtime should render `layout.json` for fixed diagrams only, or call the scripts again when the spec changes.

## Working in the user's medium

1. Plan with the kit first: spec, variants, build, check, look, exactly as for a standalone page. The checked `layout.json` and its PNG are the reference: what sits beside what, in which order, in which group, along which path, and how big. `--spacing <factor>` gives more room when that is all the medium needs.
2. Read their environment: how they already draw (components, canvas or SVG code, a diagram library, a docs format), their styles and tokens, their folder conventions.
3. Adapt, do not copy: the reference is a role model, not a contract. Keep its structure (reading order, rows and columns, groups, every connection, the main path) and choose positions, spacing, sizes and routing that suit the medium. Compressing columns into an even grid, giving a 3D world room to move through, or routing wires as roads between rows are all fine; reversing the reading order, splitting a group or dropping a connection is not. Keep the spec next to the result so the diagram can be rebuilt.
4. Fit check: if it fits what exists, integrate it. If it would need a new dependency, a new component pattern, a style change or a structural change, describe the change, recommend one option and ask before touching anything. Never restyle or restructure their environment to suit the diagram.
5. Language, tone and detail follow the user and the medium: details go only where the medium has a natural place for them.

## Where files go

- Inside a repository: follow its convention (`docs/diagrams/`, `design/`, ...). With none, use `docs/diagrams/<slug>/` and keep the spec, brief and outputs together.
- In the user's medium: the result goes where they keep similar things (for example next to their other diagrams or components); the spec and brief still live in the diagram folder so the diagram can be rebuilt.
- Outside a repository: next to the document being explained, or a folder the user names.
- Add `*.png` previews to version control only if the project keeps images; the spec rebuilds everything.

## Outputs

| Situation | Deliver |
|---|---|
| Default | `<name>.html`: one self-contained page (fonts, data and viewer inlined, no network). Open it or give its path. |
| Claude Code with the Artifact tool | Publish `<name>.html` as an artifact. It already follows the artifact page contract: tokens on `:root`, dark mode by media query and `data-theme`, an explicit body background, no external requests. |
| A React app with nothing of its own for diagrams | `build <spec> --react src/diagrams/<name>` writes `Diagram.tsx` (a client component), `diagram-viewer.js`, `diagram.css` (tokens scoped to `.dk-root`, Geist via `fonts/`), `<name>.layout.json` and a usage example. Import the JSON and render `<Diagram model={model} />`. Next.js Pages Router: import `diagram.css` from `pages/_app` instead. |
| Markdown, slides, chat, a PR | `<name>.png` (light) and `--dark` for `<name>.dark.png`. Link the HTML for the interactive version. |
| The user's own medium | `<name>.layout.json` and its PNG are the reference: every node, group and wire with coordinates and routes. Rebuild it with their primitives, adapted to the medium (see Working in the user's medium). |

## Several views on one page

`node <skill>/scripts/diagram.mjs page page.yaml [--out index.html]` builds one page holding several diagrams, each interactive, scrolling like a normal page:

```yaml
title: Payments
tagline: How a card payment moves through the system.   # optional
description: Card payments, end to end.                 # optional: for search and link previews (under 125 characters); defaults to the tagline
repo: https://github.com/org/repo                        # optional: a prominent link
url: https://org.github.io/repo/                         # optional: the page's public address, for link previews
image: og.png                                            # optional: link preview image (1200x630), relative to url
sections:
  - spec: payments-overview.yaml
    hero: true                      # first and largest, no heading
  - spec: payments-saga.yaml
    title: Card authorization       # the section's heading; defaults to the diagram's title, false for none
    maxHeight: 1100                 # optional: let a tall diagram grow past the default 720px
    text: The saga behind step 4.   # one line
    showSpec: true                  # show the YAML under the diagram
  - spec: payments-refund.yaml
    continues: true                 # same section as the one above
  - heading: Install                # a big divider heading, with an optional line
    install: true                   # place the manifest's install blocks here
  - iframe: 3d/index.html           # embed another page of the site (relative path or https)
    title: In 3D
    ratio: 1.6
install:
  - { label: Claude Code, code: "/plugin install ..." }
```

## The interactive page

- Drag or scroll to pan; Ctrl/⌘ + scroll or pinch to zoom; F to fit, T for the theme.
- Hover a part or wire to trace its connections; click a part, wire or group for `about`, `details`, facts and sources.
- Flows: play, pause and step with Space and the arrow keys; a packet travels each wire in order.
- Works on phones: controls stay reachable, the inspector becomes a bottom sheet.

## Hosts

- **Claude Code**: look at previews with the Read tool. Skills live in `.claude/skills/` (project) or `~/.claude/skills/` (user), or come from the plugin.
- **Codex**: look at previews with `view_image`. The PNG renderer needs no browser, so it works inside the sandbox. Skills live in `.agents/skills/` or `~/.agents/skills/`, or come from the plugin (`$CODEX_HOME/plugins/cache/`, which Codex rewrites on refresh). The one-time `diagram.mjs setup` needs network and writes to `~/.cache/diagram-kit/`, so request escalation for it; builds afterwards only read that cache and write to the output folder.
- **OpenCode**: skills in `.agents/skills/` or `~/.agents/skills/` and commands in `.opencode/commands/` or `~/.config/opencode/commands/` are discovered natively. Use `read` for PNG inspection with a vision-capable model, `question` for interactive choices, and `shell` for setup/build/open commands subject to the selected agent's permissions. Open the self-contained HTML only when requested or enabled; use `xdg-open` on Linux, `open` on macOS, PowerShell `Start-Process` on Windows, or `wslview` then PowerShell from WSL. If unavailable or in SSH/headless/container use, report the absolute path. Do not start a server just to view it.
- All hosts: dependencies live in `~/.cache/diagram-kit/deps-<lockfile hash>` (or `$DIAGRAM_KIT_DEPS`), outside any plugin folder, so one setup serves every host and survives plugin updates that keep the same lockfile. The CLI prints the exact command when setup is needed.
