# diagram-kit

Agents are bad at placing boxes!:D diagram-kit gives Claude Code, Codex and OpenCode a layout engine ([ELK.js](https://github.com/kieler/elkjs)) and a skill, `create-diagram`, with the instructions and intuition to draw clear, well-positioned diagrams in whatever medium you work in.

<a href="https://alireza29675.github.io/diagram-kit/"><img alt="How diagram-kit works, top to bottom: /create-diagram; inside diagram-kit, shape an initial diagram, layout engine calculations (ELK.js, mind maps, sequences), programmatic layout checks and agentic visual checks, where either check sends it back to be reshaped when it looks incorrect; then implement it in any medium" src="docs/how-it-works.dark.png"></a>

**[See it live in action →](https://alireza29675.github.io/diagram-kit/)**

## Install & use

Claude Code

```
/plugin marketplace add Alireza29675/diagram-kit
/plugin install diagram-kit@diagram-kit
```

Codex

```
codex plugin marketplace add Alireza29675/diagram-kit
codex plugin add diagram-kit@diagram-kit
```

OpenCode

[Installation instructions](docs/opencode.md)

Then ask your agent for a diagram using `/create-diagram explain what you want`.

MIT · [Notice](NOTICE.md)
