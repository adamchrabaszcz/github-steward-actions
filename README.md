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
