# buddy-back

Your terminal companion is back. An animated ASCII buddy for Claude Code's status line that reacts to your session, with zero tokens and no network calls.

![A cat thinks, celebrates passing tests, worries about an error, and falls asleep](docs/demo.gif)

*Demo uses simulated hook events and the real renderer. Cat, robot, ghost, and dragon included. No feeding schedule required.*

**Install and configure in one command** (Node.js 20+, macOS or Linux):

```sh
npm i -g github:itzjk/buddy-back && buddy-back install
```

Restart Claude Code, then give your buddy a name:

```sh
buddy-back name Mochi
```

Community project. Not affiliated with, endorsed by, or a product of Anthropic. Original ASCII companions; this does not restore Anthropic's original sprites or saved pets.

## A small friend, a smaller footprint

```text
 /\_/\  (=^.^=)  Mochi | ready
 /\_/\  (=o.o=) .  Mochi | thinking
 /\_/\  (=^w^=) +  Mochi | tests passed
 /\_/\  (=o_o=) !  Mochi | something failed
 /\_/\  (=-.-=) z  Mochi | napping
 /\_/\  (=^w^=) *+*  Mochi | long task done!
 /\_/\  (=o.o=) ?  Mochi | needs you
```

This is actual output from `buddy-back demo`, after naming the cat Mochi. Frames change once per second. There is no daemon, MCP server, model prompt, telemetry, runtime dependency, or transcript reader.

## Meet your buddy

```sh
buddy-back list
buddy-back choose dragon
buddy-back name Ember
buddy-back demo
buddy-back demo --animate
buddy-back off
buddy-back on
```

`off` persists across restarts. It hides your buddy and stops hook state writes. Your previous status line keeps working. `on` brings back the same buddy and name. Names accept 1-24 printable ASCII characters; quote names containing spaces.

## Why this exists

People wanted their buddy back. [Claude Code issue #45596, “Bring Back Buddy”](https://github.com/anthropics/claude-code/issues/45596) had **1,195 thumbs-up reactions on October 27, 2026**, confirmed with the GitHub API. The issue reports that `/buddy` disappeared in v2.1.97 and collects requests for persistent companions and customization.

Other people have answered that call, too: [coding-buddy](https://github.com/ramarivera/coding-buddy), [ClaudeBuddy](https://github.com/NBS1997/ClaudeBuddy), [save-buddy](https://github.com/jrykn/save-buddy), and [GitAnimals Buddy](https://github.com/git-goods/gitanimals-buddy). This is a deliberately small alternative: four original ASCII buddies, deterministic reactions, and reversible configuration. It does not claim to be the first or only companion.

## How it works

The installer merges a [command status line](https://code.claude.com/docs/en/statusline) and nine [command hooks](https://code.claude.com/docs/en/hooks) into `~/.claude/settings.json`. It keeps unrelated settings and existing hooks. An existing command status line is run with the same JSON input and displayed above your buddy.

| Event | Reaction |
| --- | --- |
| Session starts | Ready |
| You send a prompt, or a tool starts | Thinking |
| A recognized test command reports success | Happy for 15 seconds |
| A tool fails or reports a nonzero exit code | Worried for 30 seconds |
| Permission needed | Waiting for you |
| Turn finishes after at least 60 seconds | Celebrates for 15 seconds |
| Turn finishes sooner | Ready |
| Idle for 60 seconds, or session ends | Sleeping |

“Long task” means one prompt-to-Stop turn, not the lifetime of your session. These are activity signals, not judgments about code quality. The test detector recognizes common npm/pnpm/yarn/bun, Node test runner, Jest/Vitest, pytest/unittest, Go, and Cargo commands. It requires a success summary or an explicit zero exit code. Custom commands and unfamiliar output may stay in the thinking state. Failed-test evidence takes priority over a pass summary.

Session files are isolated by a SHA-256 hash of `session_id`. They store only mood, timing, working status, and active tool IDs. Prompts, command text, output, and transcripts are not saved. Session files older than seven days are removed on the next session start. Abandoned working states sleep after 15 minutes without an event.

### Safe installation and removal

Before changing settings, buddy-back saves their original bytes in a private backup under `~/.claude/buddy-back/`. It also copies its runtime there, so the hooks don't depend on your checkout, npm's temporary cache, or a global executable staying installed. Node must remain available at its installed path. Re-running `install` leaves the original backup and preferences intact.

To remove the integration:

```sh
buddy-back uninstall
npm uninstall -g buddy-back
```

Run those in that order. If settings are unchanged since installation, uninstall restores the original file **byte for byte**, including its permission mode, or removes the generated file if none existed. If you've edited settings meanwhile, uninstall removes its own hook commands and restores its command status line while preserving unrelated edits and a replacement status line. Formatting can change in that case. Preferences and backups remain for recovery.

Invalid JSON and symbolic-link settings files are refused without overwriting them. If an operation is interrupted, a lock may remain in `~/.claude/buddy-back/`; the error identifies it. Remove that lock only after confirming no buddy-back command is running. If the installation record is damaged, recover from the saved `settings.before-*.json` file. Backups can contain sensitive settings, so keep them private.

Use a separate Claude profile by setting `CLAUDE_CONFIG_DIR` consistently for install, customization, and uninstall. Installed hooks and status commands remember that profile automatically:

```sh
CLAUDE_CONFIG_DIR="$PWD/.test-home" buddy-back install
CLAUDE_CONFIG_DIR="$PWD/.test-home" buddy-back uninstall
```

### Speed

The status command reads small local files and prints one frame. It never writes session state. On the development machine with Node 24, the initial benchmark measured **25.0 ms median / 26.7 ms p95**, including process startup, across 30 runs after five warmups. Your machine will differ. Run `npm run bench` from a checkout to measure it; CI enforces a generous 200 ms p95 budget.

An existing status command adds its own startup and work. Its output is bounded to 64 KiB and its shell is killed after 500 ms; errors are suppressed so the buddy can still render. Existing commands should be short-lived and should not spawn background jobs. Hooks are silent, exit successfully even on malformed input, and never approve or block tools. JSON input is capped at 1 MiB; oversized events are ignored.

## Limitations

- Requires Claude Code's terminal status line. This does not add a companion panel to VS Code or a desktop app.
- `refreshInterval: 1` uses the current documented settings schema. Older Claude Code releases may refresh only on session events, so animation and sleep transitions can appear less often. Update Claude Code if frames do not advance while idle.
- Project or managed settings can override the user status line or disable hooks. Restart Claude Code after installing or uninstalling, and check `/hooks` if reactions are missing.
- Success detection is conservative and based on structured hook input plus recognizable test output. It cannot prove arbitrary shell commands succeeded. Skipped hooks, truncated inputs, a process crash, or stopped refreshes can leave an outdated expression until another event.
- macOS and Linux are supported by the installer. On Windows, use WSL with Node inside WSL. Native PowerShell is not supported.
- The automated suite feeds documented JSON shapes through the installed commands. An interactive Claude Code session has not been verified for this release. CI configuration is included; hosted CI results are only available after publication.
- This repository must be published before the GitHub installation command can resolve it. The package is not on npm yet, so bare `npx buddy-back` is not an advertised installation path.

## Other terminal agents

The renderer accepts `{"session_id":"any-stable-id"}` on stdin. Any terminal agent that can run a custom command status line can call `buddy-back status`. It can send local events to `buddy-back hook` using the Claude hook event names in the table above. No model is needed. You must provide both integrations yourself; no native support for other agents is claimed. Without a documented custom command status line, this cannot be installed as one.

For a quick manual check:

```sh
printf '%s' '{"session_id":"example-session","hook_event_name":"UserPromptSubmit"}' | buddy-back hook
printf '%s' '{"session_id":"example-session"}' | buddy-back status
```

## Development

From a clone, install the CLI and configure an isolated profile:

```sh
npm install -g . && CLAUDE_CONFIG_DIR="$PWD/.test-home" buddy-back install
```

Run the tests and benchmark:

```sh
npm test
npm run bench
```

The tests cover hook-to-render reactions, original status-line composition, names and persistent off, concurrent sessions, malformed inputs, adversarial settings edits, shell quoting, backup permissions, and exact install/uninstall restoration. They use temporary profiles and never modify your real Claude settings.

To render example Claude Code input without installing the integration:

```sh
node bin/buddy-back.mjs hook < test/fixtures/prompt.json
node bin/buddy-back.mjs status < test/fixtures/status.json
```

Set `CLAUDE_CONFIG_DIR` to a temporary directory first if you want to keep this example state separate. To regenerate the GIF, install Pillow separately and run `python3 scripts/demo-gif.py`; Pillow is only a documentation tool.

## License

[MIT](LICENSE).
