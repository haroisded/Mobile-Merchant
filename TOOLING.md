# Tooling

MCP servers, skills, and plugins installed in this Claude Code environment, with the command to install each.

## MCP servers

| Name | Scope | Transport | Endpoint / command |
| --- | --- | --- | --- |
| `sgai` (ScrapeGraphAI) | user | http | `https://mcp.scrapegraphai.com/mcp`, `Authorization: Bearer ${SGAI_API_KEY}` |
| `obscura` | user | stdio | `obscura mcp` |
| `supabase` | project (**this** repo, via `.mcp.json`) | http | `https://mcp.supabase.com/mcp?project_ref=<ref>&features=docs,account,database,debugging,development,functions,branching` |
| `Lucid` | claude.ai account connector | http | added in claude.ai → Settings → Connectors, not in `~/.claude.json` |

### Install

```bash
# sgai — set SGAI_API_KEY in the shell environment first
claude mcp add --transport http --scope user sgai https://mcp.scrapegraphai.com/mcp \
  --header "Authorization: Bearer ${SGAI_API_KEY}"

# obscura — binary must be on PATH
claude mcp add --scope user obscura obscura mcp

# supabase — swap in the project ref; drop --scope for the current project only.
# `.mcp.json` in this repo already declares it, pointed at this project's ref and NOT read-only —
# apply_migration and generate_typescript_types both work through it, which is the way round the
# CLI's "Initialising login role…" stall. The CLI's own fix for that stall is to set
# SUPABASE_DB_PASSWORD (README.md, Database schema).
claude mcp add --transport http --scope project supabase \
  "https://mcp.supabase.com/mcp?project_ref=<project_ref>&features=docs,account,database,debugging,development,functions,branching"
```

Lucid: claude.ai → Settings → Connectors → Add → Lucid → authorize. Nothing to install locally.

Verify: `claude mcp list`.

## Skills

Skills reach a session from three places. Only the first needs installing — the other two arrive
with something already listed on this page, so nothing below them is a separate `install` step.

### Personal — `~/.claude/skills/`

| Skill | Trigger |
| --- | --- |
| `find-skills` | "find a skill for X" |
| `graphify` | `/graphify` |
| `install-anti-slop` | "add anti-slop lint rules" |
| `supabase` | any Supabase task |
| `supabase-postgres-best-practices` | any Postgres schema / RLS / migration work |

`~/.claude/CLAUDE.md` makes `graphify` mandatory on `/graphify` before anything else runs.

#### Install

```bash
claude plugin marketplace add anthropics/skills
claude plugin install <skill-name>@skills
```

Or manually — one directory per skill, each holding a `SKILL.md` with `name` and `description` frontmatter:

```bash
mkdir -p ~/.claude/skills/<skill-name>
# place SKILL.md (plus any references/, scripts/) inside
```

### From plugins — nothing extra to install

Each plugin under [Plugins](#plugins) ships its own `skills/`, and two also ship `commands/`; caveman
ships `agents/` as well. Installing the plugin installs all of it. Entry points worth knowing:

| Plugin | Contributes | Start here |
| --- | --- | --- |
| `superpowers` | skills only | `superpowers:brainstorming` before creative work, `superpowers:systematic-debugging` before a fix, `superpowers:test-driven-development` before an implementation |
| `caveman` | skills, commands, agents | `/caveman lite\|full\|ultra` sets prose intensity; `/caveman-help` lists the rest; `cavecrew-investigator` / `-builder` / `-reviewer` are its subagents |
| `ponytail` | skills, commands | `/ponytail lite\|full\|ultra` sets laziness intensity; `/ponytail-help` lists the rest; `/ponytail-debt` harvests `ponytail:` comments |

Both `caveman` and `ponytail` install a SessionStart hook, so their modes are **on by default in every
session** — that is why this repo's replies are terse and its diffs small. Turn either off in-session
with "stop caveman" / "stop ponytail"; the level persists until changed or the session ends.

Deliberately not enumerated here: the full skill list of each plugin. It changes on every plugin
update, and a table that has quietly started lying is worse than no table. Run `/help` for the live
list.

### Bundled with Claude Code — nothing to install

`code-review`, `simplify`, `security-review`, `run`, `init`, `loop`, `schedule`, `update-config`,
`claude-api`, `design`, `dataviz`, `artifact-*`, `keybindings-help`, `fewer-permission-prompts`.
These ship with the CLI. They appear alongside the ones above in `/help`, so they are easy to mistake
for something this machine was configured with — it was not, and there is no install command for them.

Verify all three groups: `/help`, or `claude plugin list` for the plugin half.

## Plugins

| Plugin | Version | Marketplace | Repo | Scope |
| --- | --- | --- | --- | --- |
| `caveman` | `c72984e4` | `caveman` | `JuliusBrussee/caveman` | user |
| `ponytail` | `4.9.0` | `ponytail` | `DietrichGebert/ponytail` | user |
| `superpowers` | `6.3.0` | `claude-plugins-official` | `anthropics/claude-plugins-official` | user |
| `expo` | — | `claude-plugins-official` | `anthropics/claude-plugins-official` | **project** (`.claude/settings.json`) |

Versions are what is on disk under `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`.

`expo` is the odd one out: this repo's `.claude/settings.json` enables it, but it is **not in the
plugin cache**, so on a fresh clone it resolves to nothing until installed. It is the only entry here
that a new contributor has to install — the other three are enabled from `~/.claude/settings.json`
and follow the machine, not the repo.

### Install

```bash
# caveman
claude plugin marketplace add JuliusBrussee/caveman
claude plugin install caveman@caveman

# ponytail
claude plugin marketplace add DietrichGebert/ponytail
claude plugin install ponytail@ponytail

# superpowers (official marketplace is preinstalled)
claude plugin install superpowers@claude-plugins-official

# expo — enabled by this repo's .claude/settings.json
claude plugin install expo@claude-plugins-official
```

Verify: `claude plugin list`, or `/plugin`.

## Related settings

Three files, and which one a setting belongs in is the part that matters: the user file follows the
machine, the two project files follow the repo — and only one of those is committed.

### `~/.claude/settings.json` — user, not committed

Plugin enablement, the extra marketplaces, the model and effort defaults, and a ponytail status line:

```json
{
  "permissions": { "defaultMode": "auto" },
  "model": "opus[1m]",
  "effortLevel": "high",
  "modelSettings": { "claude-opus-5": { "effortLevel": "high" } },
  "autoUpdatesChannel": "latest",
  "theme": "dark",
  "enabledPlugins": {
    "caveman@caveman": true,
    "ponytail@ponytail": true,
    "superpowers@claude-plugins-official": true
  },
  "extraKnownMarketplaces": {
    "caveman":  { "source": { "source": "github", "repo": "JuliusBrussee/caveman"  } },
    "ponytail": { "source": { "source": "github", "repo": "DietrichGebert/ponytail" } }
  },
  "statusLine": {
    "type": "command",
    "command": "powershell -ExecutionPolicy Bypass -Command \"gci $env:USERPROFILE\.claude\plugins\cache\ponytail\ponytail\*\hooks\ponytail-statusline.ps1 | sort {[version]$_.Directory.Parent.Name} -Descending | select -First 1 | % { & $_.FullName }\""
  }
}
```

`permissions.defaultMode: "auto"` is why tool calls in this project rarely prompt. It applies to
every project on this machine, not just this one.

### `.claude/settings.json` — project, committed

```json
{ "enabledPlugins": { "expo@claude-plugins-official": true } }
```

The whole file. It is the one piece of tooling config a clone inherits, which is why `expo` is the
only plugin above a new contributor must install.

### `.claude/settings.local.json` — project, **not** committed

Per-machine consent for this repo. It carries `enableAllProjectMcpServers` and
`enabledMcpjsonServers: ["supabase"]` — the approval that lets `.mcp.json`'s Supabase server actually
load — plus a small allowlist of Bash and PowerShell commands approved during earlier sessions.

Nothing here is required to run the project. A fresh clone approves the MCP server on first launch
and rebuilds its own allowlist as it goes. Do not commit it: it names absolute paths on one machine.

To grow the allowlist deliberately rather than one prompt at a time, run `/fewer-permission-prompts`,
which scans transcripts for repeated read-only calls and proposes a batch.

Change any of these three through `/config` or the `update-config` skill rather than by hand — a
malformed `settings.json` is skipped silently, with no error to point at it.
