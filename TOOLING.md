# Tooling

MCP servers, skills, and plugins installed in this Claude Code environment, with the command to install each.

## MCP servers

| Name | Scope | Transport | Endpoint / command |
| --- | --- | --- | --- |
| `sgai` (ScrapeGraphAI) | user | http | `https://mcp.scrapegraphai.com/mcp`, `Authorization: Bearer ${SGAI_API_KEY}` |
| `obscura` | user | stdio | `obscura mcp` |
| `supabase` | project (**this** repo, via `.mcp.json`) | http | `https://mcp.supabase.com/mcp?project_ref=<ref>&features=docs,account,database,debugging,development,functions,branching` |
| `Lucid` | claude.ai account connector | http | added in claude.ai → Settings → Connectors, not in `~/.claude.json` |
| `expo` | shipped by the `expo` plugin | http | `https://mcp.expo.dev/mcp` — Expo docs search. **Needs a one-time authorization in `/mcp`**; unavailable until then ([`docs/expo.md` §5](./docs/expo.md#5-the-expo-mcp-server)) |

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
| `fallow`, `fallow-review` | fallow audits; `fallow-review` is the first collector in [`docs/testing-workflow.md` §2.1](./docs/testing-workflow.md) |
| `find-skills` | "find a skill for X" |
| `graphify` | `/graphify` |
| `install-anti-slop` | "add anti-slop lint rules" |
| `supabase` | any Supabase task |
| `supabase-postgres-best-practices` | any Postgres schema / RLS / migration work |
| `vercel-react-native-skills` | React Native / Expo components, lists, animation, navigation — part of the skill review ([`docs/optimization.md`](./docs/optimization.md)) |
| `vercel-react-best-practices` | React re-render and rendering rules; its Next.js / DOM rules do not apply here ([`docs/optimization.md`](./docs/optimization.md) rule 2) |
| `web-design-guidelines` | web UI review — arrived with the Vercel pack; this app has no web UI to review |

`~/.claude/CLAUDE.md` makes `graphify` mandatory on `/graphify` before anything else runs.

#### Install

```bash
claude plugin marketplace add anthropics/skills
claude plugin install <skill-name>@skills

# the three Vercel skills above
npx skills add vercel-labs/agent-skills
```

`npx skills add` installs into `~/.agents/skills/` and links each skill into `~/.claude/skills/`.
Those links work on this machine; the plugin install below does not (see Plugins).

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
| `feature-dev` | commit-pinned | `claude-plugins-official` | `anthropics/claude-plugins-official` | user |
| `expo` | `1.13.5` | `claude-plugins-official` | `anthropics/claude-plugins-official` | **project** (`.claude/settings.json`) and user |
| `building-react-native-apps` | `0.2.0` | `callstack-agent-skills` | `callstackincubator/agent-skills` | user — **installed but its skills do not load**, below |

Versions are what is on disk under `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`.

`expo` brings 24 `expo-*` / `eas-*` skills and the Expo MCP server; how this repo uses them is
[`docs/expo.md`](./docs/expo.md). This repo's `.claude/settings.json` enables it, so a fresh clone
still has to install it — the others follow the machine, not the repo.

### `building-react-native-apps` does not load on Windows

Its `skills/` entries are **git symlinks**
(`react-native-best-practices -> ../../../skills/react-native-best-practices`). With git's
`core.symlinks` set to `false` — the Windows default without Developer Mode — they check out as
32–46-byte text files holding the target path, so no `SKILL.md` is found and none of its five skills
(`react-native-best-practices`, `react-navigation`, `react-native-tv-best-practices`,
`create-react-native-library`, `upgrading-react-native`) appear in `/help`. Verified 2026-09-17:
`git config core.symlinks` → `false` in the marketplace clone. The real skill folders exist only in
`~/.claude/plugins/marketplaces/callstack-agent-skills/skills/`.

Fix, once, by the human:

1. Windows Settings → System → For developers → **Developer Mode** on (lets git create symlinks without
   admin).
2. `git config --global core.symlinks true`
3. Remove and reinstall the plugin (through `/plugin`, or `claude plugin uninstall` then
   `claude plugin install building-react-native-apps@callstack-agent-skills`), so the cache is checked
   out again with real symlinks. If the marketplace clone keeps the text-file entries, remove and
   re-add the marketplace too.
4. Confirm `react-native-best-practices` is listed in `/help`.

Until step 4 passes, the skill review falls back to the Ultimate Guide markdown it was built from
([`docs/optimization.md` §2](./docs/optimization.md#2-the-skills-and-the-ultimate-guide)). The pass
after it passes deletes that markdown.

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

# building-react-native-apps (Callstack) — fix symlinks first, section above
claude plugin marketplace add callstackincubator/agent-skills
claude plugin install building-react-native-apps@callstack-agent-skills
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
{
  "enabledPlugins": {
    "expo@claude-plugins-official": true,
    "frontend-design@claude-plugins-official": false
  }
}
```

The whole file. It is the one piece of tooling config a clone inherits. `frontend-design` is switched
off for this repo: it steers toward a fresh aesthetic direction, and the look here is already fixed by
the mockups, `docs/visual-language.md` and `docs/typography.md`.

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
