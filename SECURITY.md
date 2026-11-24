# Security

These actions run inside other repositories' workflows, with those workflows' tokens: they read issues and pull requests, add labels and comments, close issues, and create tags and releases. Problems in any of that are taken seriously.

## Reporting a vulnerability

Please don't open a public issue. Report it privately through GitHub: **Security → Report a vulnerability** on this repository. Include what you found, how to reproduce it and which version (the release tag) you use.

You'll get an answer within a week. Fixes are released as a patch version and credited in the release notes unless you prefer otherwise.

## What the actions do to stay safe

- No dependencies: Node's standard library, `git` and `gh` only, so there is no package to compromise.
- Untrusted text (issue and pull request titles and bodies, commit messages) is passed to `gh` as separate arguments, never built into a shell command.
- Each action asks only for the permissions it needs; the README lists them per action.
- GitHub Actions in this repository are pinned to commit SHAs. The AI review's token (`CLAUDE_CODE_OAUTH_TOKEN`) is a repository secret; the review can comment but not push, and only the owner, members and collaborators can start it with `@claude`.

## Supported versions

Only the latest release gets fixes. Pin a release by its commit SHA and let Dependabot propose updates.
