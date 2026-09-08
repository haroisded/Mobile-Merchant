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
# CLI's "Initialising login role…" stall (README.md, Database schema).
claude mcp add --transport http --scope project supabase \
  "https://mcp.supabase.com/mcp?project_ref=<project_ref>&features=docs,account,database,debugging,development,functions,branching"
```

Lucid: claude.ai → Settings → Connectors → Add → Lucid → authorize. Nothing to install locally.

Verify: `claude mcp list`.

## Skills

Personal skills in `~/.claude/skills/`.

| Skill | Trigger |
| --- | --- |
| `find-skills` | "find a skill for X" |
| `graphify` | `/graphify` |
| `install-anti-slop` | "add anti-slop lint rules" |
| `supabase` | any Supabase task |
| `supabase-postgres-best-practices` | any Postgres schema / RLS / migration work |

### Install

```bash
claude plugin marketplace add anthropics/skills
claude plugin install <skill-name>@skills
```

Or manually — one directory per skill, each holding a `SKILL.md` with `name` and `description` frontmatter:

```bash
mkdir -p ~/.claude/skills/<skill-name>
# place SKILL.md (plus any references/, scripts/) inside
```

Verify: `/help`, or `claude plugin list`.

## Plugins

| Plugin | Version | Marketplace | Repo |
| --- | --- | --- | --- |
| `caveman` | `c72984e4` | `caveman` | `JuliusBrussee/caveman` |
| `ponytail` | `4.9.0` | `ponytail` | `DietrichGebert/ponytail` |
| `superpowers` | `6.3.0` | `claude-plugins-official` | `anthropics/claude-plugins-official` |

`.claude/settings.json` in this repo also enables `expo@claude-plugins-official`; it is not present in the plugin cache, so install it before it resolves.

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

`~/.claude/settings.json` carries the plugin enablement, the extra marketplaces, and a ponytail status line:

```json
{
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
