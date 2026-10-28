# Configuration and recovery

## Reactions

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

A long task means one prompt-to-Stop turn, not the lifetime of a session. The test detector recognizes common npm/pnpm/yarn/bun, Node test runner, Jest/Vitest, pytest/unittest, Go, and Cargo commands. It requires a success summary or an explicit zero exit code. Custom commands and unfamiliar output may leave the buddy thinking. Failed-test evidence takes priority over a pass summary.

Session files are isolated by a SHA-256 hash of `session_id`. They store mood, timing, working status, and active tool IDs. Prompts, command text, output, and transcripts are not saved. Files older than seven days are removed on the next session start. Abandoned working states sleep after 15 minutes without an event.

## Installation and removal

Before changing settings, buddy-back saves their original bytes in a private backup under `~/.claude/buddy-back/`. It also copies its runtime there, so the hooks don't depend on a checkout, npm's temporary cache, or a global executable staying installed. Node must remain available at its installed path. Re-running `install` leaves the original backup and preferences intact.

Remove the integration before uninstalling the package:

```sh
buddy-back uninstall
npm uninstall -g buddy-back
```

If settings are unchanged since installation, uninstall restores the original file byte for byte, including its permission mode, or removes the generated file if none existed. If you've edited settings meanwhile, uninstall removes its own hook commands and restores its command status line while preserving unrelated edits and a replacement status line. Formatting can change in that case. Preferences and backups remain for recovery.

Invalid JSON and symbolic-link settings files are refused without overwriting them. If an operation is interrupted, a lock may remain in `~/.claude/buddy-back/`; the error identifies it. Remove that lock only after confirming no buddy-back command is running. If the installation record is damaged, recover from the saved `settings.before-*.json` file. Backups can contain sensitive settings, so keep them private.

## Separate profiles

Set `CLAUDE_CONFIG_DIR` consistently for installation, customization, and removal. Installed hooks and status commands remember that profile automatically:

```sh
CLAUDE_CONFIG_DIR="$PWD/.test-home" buddy-back install
CLAUDE_CONFIG_DIR="$PWD/.test-home" buddy-back name Mochi
CLAUDE_CONFIG_DIR="$PWD/.test-home" buddy-back uninstall
```

Names accept 1-24 printable ASCII characters. Quote names containing spaces. `off` persists across restarts, hides the buddy, and stops hook state writes. Your previous status line keeps working; `on` restores the same companion and name.

## Troubleshooting

Restart Claude Code after installing or uninstalling. Check `/hooks` if reactions are missing. Project or managed settings can override the user status line or disable hooks.

Claude Code [temporarily hides the status line](https://code.claude.com/docs/en/statusline#how-status-lines-work) during permission prompts and some other UI interactions. The waiting state is recorded, but the expression may not be visible while the prompt is open.

The installer sets `refreshInterval: 1`, supported by the current [status line schema](https://code.claude.com/docs/en/statusline). Older releases may refresh only on session events. Update Claude Code if frames do not advance while idle.

Hooks are silent, exit successfully even on malformed input, and never approve or block tools. JSON input is capped at 1 MiB; oversized events are ignored. Skipped hooks, a process crash, truncated inputs, or stopped refreshes can leave an outdated expression until another event.

An existing status command adds its own startup and work. Its output is bounded to 64 KiB and its shell is killed after 500 ms; errors are suppressed so the buddy can still render. Existing commands should be short-lived and should not spawn background jobs.

## Other terminal agents

The renderer accepts `{"session_id":"any-stable-id"}` on stdin. An agent with a custom command status line can call `buddy-back status` and send local events to `buddy-back hook` using Claude's hook event names. Both integrations must be supplied by the adapter.

After installing the CLI, try an isolated profile:

```sh
export CLAUDE_CONFIG_DIR="$(mktemp -d)"
printf '%s' '{"session_id":"example-session","hook_event_name":"UserPromptSubmit"}' | buddy-back hook
printf '%s' '{"session_id":"example-session"}' | buddy-back status
```

The second command prints a thinking buddy. Keep the session ID stable and distinct for each concurrent session. Without a command status line, this cannot be installed as one. There are no bundled adapters for other agents.
