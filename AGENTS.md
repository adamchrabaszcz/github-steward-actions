# github-steward-actions: agent instructions

Shared GitHub Actions that repositories call from their workflows: `format` (issue and pull request format), `close-parent` (closes a parent issue with its last sub-issue) and `release` (version, tag and release from Conventional Commits). Each is a JavaScript action running a Node script with no dependencies. Other repositories pin them to a commit SHA, so every change here reaches them only through a release and a Dependabot update. MIT licensed.

This file is the rulebook for coding agents. The details are in `CONTRIBUTING.md`, the decisions in `docs/adr/`, the structure in `docs/architecture.md`. Link to those instead of copying them here.

## Guardrails

1. Never commit or push directly to `main`. Branch and open a pull request.
2. An agent never merges a pull request. Merging is a human action.
3. Never rewrite shared history (`push --force`, rebasing `main`). To update a branch from `main`, merge `main` into it.
4. Ask before any outward-facing action beyond pushing a branch and opening its pull request: comments, creating or editing issues, releases, tags, repository settings.
5. Destructive commands (deleting branches, tags or files outside your change) need explicit confirmation for that specific action, with the evidence shown first.
6. No secrets in this repository, not even as examples. CI's token for the AI review (`CLAUDE_CODE_OAUTH_TOKEN`) is a GitHub Actions secret.
7. No personal data in code, tests, examples, issues or commits. Test fixtures use made-up names and `@example.com` addresses.

## Decide on your own

- **Branch name:** `<type>/<short-topic>` from the latest `main`, e.g. `fix/closes-line-case`.
- **Commit and pull request title:** a Conventional Commit; the type decides the release (table in `CONTRIBUTING.md`).
- **Tests:** every change adds or updates a test in `tests/` that fails without it.
- **Docs the change makes wrong:** update them in the same pull request (README, `CONTRIBUTING.md`, `docs/`, the action's `action.yml` descriptions).
- **Small cleanups inside the files you change.** Bigger refactors are their own issue.
- **Working notes and plans:** in `.plan/` (ignored by git).

## Ask first

- A change to an action's inputs, outputs or behaviour that callers rely on: that is a breaking change (`!`, a major version).
- A new dependency of any kind (the actions have none, `docs/adr/0002-javascript-actions.md`).
- Changes to CI, releases or repository settings beyond what the issue asks.
- A decision that deserves an ADR: propose it, don't settle it alone.
- Work that grows past its issue: suggest a follow-up issue instead of widening the pull request.

## Workflow

1. Every change starts from a GitHub issue (format in `CONTRIBUTING.md`). One issue, one branch, one pull request.
2. Branch from the latest `main`; make the change with its tests and docs; run the checks below before every push.
3. The pull request follows `.github/pull_request_template.md` and ends with `Closes #<issue>`. Pull requests are squash merged, so the title becomes the commit on `main`.
4. Done means the definition of done in `CONTRIBUTING.md`.

## Checks

```sh
node --test                                         # all tests (Node 24, as the actions run on)
find . -name '*.mjs' -not -path './node_modules/*' -print0 | xargs -0 -n1 node --check   # every script parses
```

CI (`.github/workflows/test.yml`) runs the same on every pull request and push to `main`.

## Code rules that bite

- **No dependencies:** Node's standard library only, and `gh`/`git`, which every GitHub-hosted runner has. No `npm install` anywhere, not even for tests.
- **Pure logic, thin edges:** the rules (what a title must look like, which version comes next) are pure functions exported for tests; reading the event, calling `gh` and writing outputs happen in a small `main` that tests don't need.
- **Outside text is untrusted:** issue and pull request titles and bodies, commit messages. They go to `gh` as separate arguments or files, never into a shell string.
- **Inputs stay compatible:** an input or output that callers use isn't renamed or removed without a major release.
- **GitHub Actions** are pinned to a full commit SHA with the version in a comment.

## Code review

Claude reviews each pull request when it's opened or marked ready (`.github/workflows/claude-review.yml`); `@claude review` in a comment asks for another pass (only the owner, members and collaborators can start it; fork pull requests get no automatic review). When reviewing, look first at what CI can't see:

- **Callers:** a change to an action's inputs, outputs, defaults or behaviour without a `!` and a note on what callers must change.
- **Untrusted text:** a title, body or commit message that reaches a shell string, or is used without escaping.
- **Dependencies:** anything that needs `npm install` or a tool a GitHub-hosted runner doesn't have.
- **Tests:** a rule without a test that fails without it; a test that calls GitHub.
- **Releases and closing issues:** a change that could tag the wrong version or close an issue that should stay open.
- **No personal data or secrets** in code, tests, docs or examples.

Skip what the tests already catch. The summary is a checklist of these points and the definition of done, `[x]` when fine and `[ ]` with what needs attention (leaving out what doesn't apply), then the verdict. If nothing important turns up, keep it short.
