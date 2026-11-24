# Contributing

Thanks for helping. These actions run in other people's repositories, so changes are small, tested and released on purpose.

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md). Editors pick up the shared settings (UTF-8, LF, final newline, 2-space indent) from `.editorconfig`. Security problems go through [`SECURITY.md`](SECURITY.md), not issues.

Where things are written down:

- `AGENTS.md`: the short version for coding agents (guardrails, what to decide alone and what to ask). Claude Code reads it directly, so the repository has no `CLAUDE.md`.
- `docs/adr/`: architecture decision records, numbered, never deleted.
- `docs/architecture.md`: how the actions are put together.

## Workflow

1. Find or open an issue for the change (format below).
2. Branch from the latest `main`: `<type>/<short-topic>`, e.g. `fix/closes-line-case`.
3. Make the change, focused on one thing, with its tests.
4. Run the checks (below).
5. Open a pull request into `main`. CI must be green before merging. The code owners (`.github/CODEOWNERS`) are asked for review automatically, and Claude reviews it once it's opened or marked ready (`AGENTS.md`, "Code review"); `@claude review` in a comment asks for another pass.
6. Pull requests are squash merged: `main` gets one commit per pull request, with the title as its subject and the description as its body. That's why the title must be a Conventional Commit (it decides the release) and the description ends with `Closes #<issue>`.

### One issue per pull request

- Each feature, fix or docs change gets its own branch and pull request, even when several are asked for at once.
- Keep them independent: each starts from `main` and can be merged in any order. When a step needs an earlier one, open it after that one is merged.
- If `main` moves and a pull request conflicts, merge `main` into the branch. No force-pushes.

### Definition of done

- [ ] it closes exactly one issue, and every "Done when" item there is met
- [ ] a test fails without the change and passes with it
- [ ] the checks pass locally and CI is green
- [ ] docs it makes wrong are updated: README, this file, `AGENTS.md`, `docs/`, the `action.yml` descriptions
- [ ] a change callers notice is marked breaking (`!`) with what they must change
- [ ] a decision that is costly to reverse has an ADR in `docs/adr/`
- [ ] no personal data and no secrets
- [ ] the title is a Conventional Commit with the right type, and the description ends with `Closes #<issue>`

## Commits: Conventional Commits

Format: `<type>(<optional scope>): <summary>`, summary in the imperative, lowercase, no full stop.

| Type | For | Release |
| --- | --- | --- |
| `feat` | a new action, input or behaviour callers can use | minor |
| `fix` | a bug fix | patch |
| `perf` | faster, same behaviour | patch |
| `docs` | documentation only | none |
| `test` | tests only | none |
| `refactor` | code change that neither fixes a bug nor adds a feature | none |
| `style` | formatting | none |
| `build` / `ci` | tooling, this repository's own workflows | none |
| `chore` | anything else | none |

Scopes: the action's name (`format`, `close-parent`, `release`).

A change callers must adapt to (a renamed input, a stricter rule, a different default) gets a `!` after the type and a `BREAKING CHANGE:` footer saying what they need to do. It makes a major release.

## Planned work: GitHub issues

- The roadmap is the [issue list](https://github.com/adamchrabaszcz/github-steward-actions/issues).
- Every task starts as an issue; its pull request ends with `Closes #<issue>`.

### Issues and pull requests

**Issues** use one format. The issue forms write it; when you write the body yourself, use the same headings:

```markdown
### What and why
What should change and why, in plain words. For a bug: what happens, what should, and how to see it.

### Done when
- [ ] A short checklist that says when it is finished

### Blast radius
Optional. What else it touches or could break, and for whom (repositories calling the action).

### Parent
Optional. #n, when it is one step of bigger work (also add it as a sub-issue there).
```

- **Title:** plain words, no type prefix.
- **Labels:** `enhancement`, `bug`, `documentation` or `chore`, set by the form.

**Pull requests** follow `.github/pull_request_template.md`. This repository checks its own issues and pull requests with its `format` action, and closes parent issues with its `close-parent` action.

## Releases

After CI passes on `main`, the `release` action tags the commit and publishes a GitHub release if the merge shipped something (`feat`, `fix`, `perf` or a breaking change). Callers pin a release's commit SHA with the version in a comment (`uses: adamchrabaszcz/github-steward-actions/format@<sha> # v1.2.0`), and Dependabot proposes the next one.

## Checks

```sh
node --test                                         # all tests (Node 24, as the actions run on)
find . -name '*.mjs' -not -path './node_modules/*' -print0 | xargs -0 -n1 node --check   # every script parses
```

## Code conventions

- Node's standard library only; no dependencies (`docs/adr/0002-javascript-actions.md`).
- One folder per action: `<action>/action.yml` and its scripts. Rules are pure functions, exported and tested; the GitHub side stays in a small `main`.
- Untrusted text (titles, bodies, commit messages) is passed to `gh` as separate arguments or files, never built into a shell command.
- GitHub Actions in this repository's workflows are pinned to a full commit SHA with the version in a comment; Dependabot proposes updates. Dependabot's pull requests are the one exception to "every pull request closes an issue".
- Comments explain *why*, not *what*.
