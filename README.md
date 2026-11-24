# github-steward-actions

[![test](https://github.com/adamchrabaszcz/github-steward-actions/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/adamchrabaszcz/github-steward-actions/actions/workflows/test.yml)

Shared GitHub Actions for a tidy repository: every issue in one format, pull requests with Conventional Commit titles that close their issue, parent issues that close themselves, and releases versioned from the commits. Used by repositories set up with the [github-steward](https://github.com/adamchrabaszcz/claude-marketplace) Claude Code plugin, and by anyone who wants the same.

Each action is a small Node script with no dependencies, so a workflow needs nothing but `uses:`.

| Action | What it does |
| --- | --- |
| `format` | Issues need "What and why" and "Done when" (otherwise a `needs-format` label and a comment, removed once fixed). Pull requests need a Conventional Commit title and a `Closes #n` line, or the check fails. |
| `close-parent` | When an issue closes, closes its parent once every sub-issue is done. |
| `release` | After CI passes on `main`: the next version from the Conventional Commits since the last tag, a tag, a GitHub release, and a milestone and comment on every pull request and issue it shipped. |

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

- **Issues** need a "What and why" and a "Done when" section (`##` or `###` headings) with something in them; an issue form field left empty (`_No response_`) counts as missing. Issues can't be blocked, so one that misses a section gets the label and one comment listing what's missing; once it's fixed, the label goes and the action deletes its comment (also when someone removed the label by hand). It only ever deletes its own comments: bot comments carrying its hidden marker. The issue never fails the run.
- **Pull requests** need a Conventional Commit title (`feat`, `fix`, `perf`, `docs`, `ci`, `chore`, `test`, `refactor`, `style`, `build`, with an optional scope and `!`) and a line that closes an issue, in the forms GitHub closes issues for: `Closes #9`, `Closes: #9`, `Closes owner/repo#9` and `Closes https://github.com/owner/repo/issues/9`, with `Fixes` and `Resolves` too. Otherwise the check fails, with what's missing in the run's annotations. Make the job a required check to block merging.
- **Inputs:** `token` (default `github.token`), `label` (default `needs-format`).
- Needs no checkout.

## `close-parent`

```yaml
# .github/workflows/issues.yml
name: issues
on:
  issues:
    types: [closed]
permissions:
  contents: read
jobs:
  close-parent:
    runs-on: ubuntu-latest
    permissions:
      issues: write # closing the parent
    steps:
      - uses: adamchrabaszcz/github-steward-actions/close-parent@<commit-sha> # vX.Y.Z
```

- Work that takes several pull requests is a parent issue with GitHub sub-issues, one per step. When the last open sub-issue closes, the parent closes too (as completed), with a comment naming that last one.
- Then the same one level up, and so on: a parent that is itself the last step of a bigger issue closes that one too. Closing with the workflow's token starts no new workflow run, so the action walks up the chain itself (at most 10 levels).
- A parent with open sub-issues, an already closed parent, or no parent: nothing happens. "Done" is GitHub's own sub-issue count (the progress shown on the parent).
- A parent in **another repository** (GitHub allows sub-issues across repositories) is left open with a note: the workflow's token can only close issues in its own repository.
- **Input:** `token` (default `github.token`). Needs no checkout.

## `release`

```yaml
# .github/workflows/release.yml
name: release
on:
  workflow_run:
    workflows: [test] # your CI workflow's name
    types: [completed]
    branches: [main]
permissions:
  contents: read
concurrency:
  group: release
  cancel-in-progress: false
jobs:
  release:
    if: github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push'
    runs-on: ubuntu-latest
    permissions:
      contents: write # the tag and the release
      issues: write # milestones and comments on what shipped
      pull-requests: write
    steps:
      - uses: actions/checkout@<commit-sha> # vX.Y.Z
        with:
          ref: ${{ github.event.workflow_run.head_sha }}
          fetch-depth: 0 # the tags and the commits since the last one
      - id: release
        uses: adamchrabaszcz/github-steward-actions/release@<commit-sha> # vX.Y.Z
        with:
          sha: ${{ github.event.workflow_run.head_sha }}
      # Optional: attach a file to the release.
      # - if: steps.release.outputs.released == 'true'
      #   run: gh release upload "${{ steps.release.outputs.tag }}" dist/app.zip
      #   env:
      #     GH_TOKEN: ${{ github.token }}
```

- **When:** after CI passes on a push to `main`, so only tested commits are released. Every merge to `main` is a candidate; nothing is released by hand. CI runs can finish out of order: when the newest release tag is already on a later commit, that release contains this one, and nothing is released.
- **The version** comes from the Conventional Commits since the last `vX.Y.Z` tag. A breaking change (`!` after the type, or a `BREAKING CHANGE:` footer line) bumps the major number, `feat` the minor, `fix` and `perf` the patch. `docs`, `ci`, `chore`, `test`, `refactor`, `style` and `build` release nothing. With squash merges, each pull request's title decides.
- **The first release** waits for the first `feat`, `fix`, `perf` or breaking change, and is `first-version` (default `0.1.0`).
- **The release:** a `vX.Y.Z` tag on the commit and a GitHub release with generated notes.
- **The marks:** every pull request in the release (from squash `… (#12)` and merge `Merge pull request #12` subjects), and every issue in this repository those closed, gets the `vX.Y.Z` milestone and a "Released in vX.Y.Z" comment, once. A failure here only warns: the release is out already. `marks: false` turns it off.
- **Inputs:** `token` (default `github.token`), `sha` (default `github.sha`), `first-version` (default `0.1.0`), `marks` (default `true`).
- **Outputs:** `released` (`true` or `false`), `version` (`1.4.0`), `tag` (`v1.4.0`).
- Needs a checkout with full history and tags (`fetch-depth: 0`).

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
