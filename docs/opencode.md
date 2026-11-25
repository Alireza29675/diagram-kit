# OpenCode

## Install

To try it in this repository:

```sh
git clone https://github.com/Alireza29675/diagram-kit.git
cd diagram-kit
opencode
```

For user-level use, link the skill and command from your checkout. Check for existing entries before creating the links:

```sh
mkdir -p ~/.config/opencode/skills ~/.config/opencode/commands
ln -s /absolute/path/to/diagram-kit/plugins/diagram-kit/skills/create-diagram ~/.config/opencode/skills/create-diagram
ln -s /absolute/path/to/diagram-kit/.opencode/commands/create-diagram.md ~/.config/opencode/commands/create-diagram.md
```

For one project, use its `.opencode/skills/` and `.opencode/commands/` directories instead. For local development, point the links at your modified checkout.

## Use

Run `/create-diagram explain the architecture of this project`. Setup needs Node.js 22.12+ and npm; run `node plugins/diagram-kit/skills/create-diagram/scripts/diagram.mjs setup` once from the diagram-kit checkout. It installs to the shared `~/.cache/diagram-kit/` cache.

The interactive HTML opens in your browser when requested. No server is needed; headless sessions report its path. Questions need TUI support, and PNG inspection needs an image-capable model.

## Update, uninstall and troubleshoot

Pull the repository to update. Keep the checkout in place while the links are installed. To uninstall a user-level installation, remove `~/.config/opencode/skills/create-diagram` and `~/.config/opencode/commands/create-diagram.md`. For a project-level installation, remove those entries from the project's `.opencode/` directory.

If the command is missing, run `/reload` and check the skill and shell permissions.
