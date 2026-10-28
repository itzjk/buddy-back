# Interactive Claude Code check

The fixture suite and hook replay cannot establish that Claude Code displays the buddy. This separate check runs the real interactive CLI in a terminal, records its display temporarily, and requires the actual ASCII frames for six reactions. It never treats missing authentication or a partial recording as a pass.

## Run it

From a clone, with Claude Code installed:

```sh
npm run check:claude
```

The first run checks authentication in an isolated profile under `.test-home/claude-live`. If it reports `BLOCKED`, run the local login command it prints and rerun the check. Complete login in Claude's own flow. Do not paste credentials into an issue or a test report. This profile has its own login; being signed in under your usual profile does not guarantee it is authenticated.

The check installs this checkout into that profile and launches Claude in `.test-home/live-workspace`, with personal project settings and MCP servers excluded. Choose a theme and approve trust for that disposable workspace if prompted. Your usual `~/.claude/settings.json` is not modified.

The initial prompt asks Claude to execute a passing Node test, pause, execute an intentionally failing test, and wait 65 seconds before finishing. Approve those commands in the UI. The failed test is expected; do not repair it. This conversation uses your account's model allowance. buddy-back itself still makes no model calls.

After Claude finishes, leave the terminal idle for another 65 seconds, then enter `/exit`. The checker requires ready, thinking, tests passed, something failed, long task done, and napping frames, plus at least two distinct thinking frames. It fails if any are absent, if the session fails, or after a ten-minute timeout. Permission prompts can hide the status line, so the waiting expression is excluded from these assertions.

The integration is uninstalled afterward. Terminal recordings are deleted without printing their contents. The ignored test profile retains its Claude login and session history, so treat it as private. Delete `.test-home` when finished if you no longer need that login. Do not publish that directory.

## Latest observation

On October 27, 2026, Claude Code 2.1.150 reported `loggedIn: false` with `authMethod: none` in this environment. The new check exited with status 2 (`BLOCKED`) before installing or launching a conversation. The earlier user review also stopped at `Select login method:`. Neither observation demonstrates a product failure, and neither verifies the live integration.

An authenticated run remains required before acceptance. Record the Claude version, operating system, checker exit status, visible reactions, and animation result after that run. Do not replace this observation with a pass based on fixture tests or the GIF replay.

## Live run, October 27, 2026 (Claude Code v2.1.150, Haiku 4.5)

Observed in the recorded status line, in order: `ready` → `thinking` (animated frames) → `tests passed` after the
passing probe → `something failed` after the failing probe → `napping` during the 65-second sleep, then back to `ready`.
The automatic scorer in `scripts/check-claude.mjs` still reports "incomplete" because Claude Code redraws the screen in
place and the recording drops repeated characters (`LiveBudy`), so text matching misses frames. Scoring from the
buddy's own state file instead of the screen is the next fix.
