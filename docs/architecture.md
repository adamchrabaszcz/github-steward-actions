# Architecture

Three JavaScript actions, each in its own folder with an `action.yml` and a Node script. A caller's workflow runs them on a GitHub-hosted runner, which brings Node, `git` and `gh`; nothing is installed.

| Path | What |
| --- | --- |
| `format/` | Checks an issue or a pull request against the format (`CONTRIBUTING.md`, "Issues and pull requests") |
| `close-parent/` | Closes a parent issue with its last sub-issue |
| `release/` | The next version, tag, release, and marks on what shipped |
| `tests/` | `node --test`, one file per action |
| `.github/workflows/` | This repository's own CI, review and use of its actions |

## Shape of an action

- **`action.yml`:** `runs.using: node24` with the script as `main`. The runner passes inputs as `INPUT_<NAME>` environment variables; outputs go to `GITHUB_OUTPUT`. No bundle to build and no `node_modules` to commit (`docs/adr/0002-javascript-actions.md`).
- **The script:** the rules as pure functions, exported for the tests (`checkIssue(body)`, `nextVersion(last, commits)`), and a `main` that reads the event (`GITHUB_EVENT_PATH`), calls `gh` and writes outputs (`GITHUB_OUTPUT`). `main` runs only when the file is executed, not when a test imports it.
- **Untrusted text** (titles, bodies, commit messages) reaches `gh` as separate arguments through `execFileSync`, never through a shell.

## Using them here

This repository calls its own actions from `.github/workflows/` with a local path (`uses: ./format`), so a change is checked on its own pull request before any caller sees it.
