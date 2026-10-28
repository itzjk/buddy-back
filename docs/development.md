# Development

Requires Node.js 20+. The CLI has no runtime dependencies.

## Tests and speed

From a clone:

```sh
npm test
npm run bench
npm pack --dry-run
```

Tests cover hook-to-render reactions, existing status-line composition, names and persistent off, concurrent sessions, malformed inputs, settings edits, shell quoting, backup permissions, and exact install/uninstall restoration. The packaging test installs the package in a clean prefix and exercises the CLI without a checkout. Tests use temporary profiles and never modify personal Claude settings.

For the real terminal UI, run `npm run check:claude` from an interactive terminal. It requires local authentication and checks visible frames in Claude Code, separately from the fixture suite. See the [live checklist and current acceptance blocker](live-check.md). This account-dependent check is not run in CI.

The benchmark measures 30 status processes after five warmups, including Node startup, and fails above a 200 ms p95 budget. It uses local files with no previous status command. Run it on your machine to measure its startup cost.

CI runs tests, the benchmark, and a packaging check on Node 20, 22, and 24 for Linux and macOS.

## Record the demo

Install [VHS](https://github.com/charmbracelet/vhs), with its ttyd and ffmpeg prerequisites, then run from the repository root:

```sh
vhs docs/demo.tape
```

The tape records `node docs/demo-session.mjs` in a clean terminal and writes `docs/demo.gif`. The session script creates a temporary Claude profile, installs the integration, names the cat Mochi, and replays sample session events. Each event goes through an installed hook command; every displayed frame comes from the installed status command reading that state. It then uninstalls the integration and removes the temporary profile.

The recording shows ready, thinking, test success, tool failure, waiting for permission, and sleeping. Hook events are sample input, rather than a live Claude conversation. No Claude session, account, tokens, or network connection is needed to run the replay. The tape lasts about 18 seconds. Celebration after a minute-long turn is covered by the automated suite.

## Alternatives

Other community companions include [coding-buddy](https://github.com/ramarivera/coding-buddy), [ClaudeBuddy](https://github.com/NBS1997/ClaudeBuddy), [save-buddy](https://github.com/jrykn/save-buddy), and [GitAnimals Buddy](https://github.com/git-goods/gitanimals-buddy). buddy-back focuses on four original ASCII companions, local session reactions, and reversible settings changes.
