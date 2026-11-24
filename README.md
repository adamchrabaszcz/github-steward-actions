# github-steward-actions

[![test](https://github.com/adamchrabaszcz/github-steward-actions/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/adamchrabaszcz/github-steward-actions/actions/workflows/test.yml)

Shared GitHub Actions for a tidy repository: every issue in one format, pull requests with Conventional Commit titles that close their issue, parent issues that close themselves, and releases versioned from the commits. Used by repositories set up with the [github-steward](https://github.com/adamchrabaszcz/claude-marketplace) Claude Code plugin, and by anyone who wants the same.

Each action is a small Node script with no dependencies, so a workflow needs nothing but `uses:`.

| Action | What it does |
| --- | --- |
| `format` | Issues need "What and why" and "Done when" (otherwise a `needs-format` label and a comment, removed once fixed). Pull requests need a Conventional Commit title and a `Closes #n` line, or the check fails. |
| `close-parent` | When an issue closes, closes its parent once every sub-issue is done. |
| `release` | After CI passes on `main`: the next version from the Conventional Commits since the last tag, a tag, a GitHub release, and a milestone and comment on every pull request and issue it shipped. |

The actions are being built; each one's usage is added here as it lands.

## `format`

```yaml
# .github/workflows/format.yml
name: format
on:
  issues:
    types: [opened, edited, reopened]
  pull_request:
    types: [opened, edited, reopened, synchronize]
permissions:
  contents: read
jobs:
  issue:
    if: github.event_name == 'issues'
    runs-on: ubuntu-latest
    permissions:
      issues: write # the label and the comment
    steps:
      - uses: adamchrabaszcz/github-steward-actions/format@<commit-sha> # vX.Y.Z
  pull-request:
    # Dependabot's pull requests have no issue to close.
    if: github.event_name == 'pull_request' && github.event.pull_request.user.login != 'dependabot[bot]'
    runs-on: ubuntu-latest
    steps:
      - uses: adamchrabaszcz/github-steward-actions/format@<commit-sha> # vX.Y.Z
```

- **Issues** need a "What and why" and a "Done when" section (`##` or `###` headings) with something in them; an issue form field left empty (`_No response_`) counts as missing. Issues can't be blocked, so one that misses a section gets the label and one comment listing what's missing; the label goes once it's fixed. The issue never fails the run.
- **Pull requests** need a Conventional Commit title (`feat`, `fix`, `perf`, `docs`, `ci`, `chore`, `test`, `refactor`, `style`, `build`, with an optional scope and `!`) and a `Closes #n` line (`Fixes` and `Resolves` count too). Otherwise the check fails, with what's missing in the run's annotations. Make the job a required check to block merging.
- **Inputs:** `token` (default `github.token`), `label` (default `needs-format`).
- Needs no checkout.

## Versions

Pin a release by its commit SHA, with the version in a comment, and let Dependabot propose updates:

```yaml
- uses: adamchrabaszcz/github-steward-actions/format@<commit-sha> # v1.0.0
```

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

Releases follow the commits: a breaking change (a renamed input, a stricter rule) is a major version.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`AGENTS.md`](AGENTS.md). Decisions are in [`docs/adr/`](docs/adr/README.md), the structure in [`docs/architecture.md`](docs/architecture.md). Security problems: [`SECURITY.md`](SECURITY.md).

## Licence

[MIT](LICENSE).
