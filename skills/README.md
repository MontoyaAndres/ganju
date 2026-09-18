# Skills

[Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)
that teach an AI coding agent to work with Ganju.

| Skill | What it teaches |
| --- | --- |
| [ganju-cli](ganju-cli/) | Writing, testing, deploying and debugging custom tools with the `ganju` CLI and `@ganju/sdk` |

## Install for Claude Code

```bash
git clone --depth 1 https://github.com/MontoyaAndres/ganju.git /tmp/ganju
mkdir -p ~/.claude/skills
cp -r /tmp/ganju/skills/ganju-cli ~/.claude/skills/
```

To share it with everyone working in a tools repository, copy it to
`.claude/skills/ganju-cli` in that repository instead, and commit it.

Full docs: <https://ganju.ai/docs/tools/agent-skill/>
