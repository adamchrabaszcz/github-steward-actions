# 0002. JavaScript actions without dependencies

- Status: Accepted
- Date: 2026-11-24

## Context
The format check, the parent-issue closer and releases don't depend on a project's stack: they only read GitHub events and git history, and run in GitHub Actions. Copied into every repository, each copy would need to be in the project's language and kept in step by hand. Shared, they need a language every runner has, and a way to ship that needs nothing installed.

The options: shell with `jq` (tests need bats added to the repository), a composite action that sets up Node and runs a script (an extra, pinned `actions/setup-node` step in every action), or a JavaScript action. A JavaScript action needs a bundled file only when it has npm dependencies; without them it runs the script as it is, on the Node the runner itself brings.

## Decision
Each action is a JavaScript action (`runs.using: node24`) whose `main` is a script (`.mjs`) in the action's folder. Node's standard library only, plus `git` and `gh`, which every GitHub-hosted runner has. No `package.json` dependencies, no bundling, no `node_modules`.

## Consequences
- Callers need only `uses:`; the scripts are readable as shipped and tested with `node --test`.
- Nothing is set up at run time, so the actions start fast and have no action dependencies of their own to pin.
- The Node version follows GitHub's runner (`node24`); when GitHub moves to a newer one, `action.yml` changes with it.
- Inputs arrive as `INPUT_<NAME>` environment variables and outputs go to `GITHUB_OUTPUT`, read and written by hand.
- Self-hosted runners must have `git` and `gh`.
- A rule or helper that would need a package gets written by hand or not at all; adding a dependency means superseding this record.
