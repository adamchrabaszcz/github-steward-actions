// close-parent: when an issue closes, closes its parent once every sub-issue of that parent is
// done, with a comment naming the last one (CONTRIBUTING.md, "Work that takes several pull
// requests"). Then the same one level up: closing with the workflow's token starts no new
// workflow run, so a grandparent would otherwise stay open.
//
// Runs as a JavaScript action (action.yml); the decision is exported for the tests.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const MAX_LEVELS = 10; // a guard against a cycle, far above any real nesting

const PARENT_QUERY = `query($owner: String!, $repo: String!, $n: Int!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $n) { parent { number state repository { nameWithOwner } subIssuesSummary { total completed } } }
  }
}`;

// parent: { number, state, repository: { nameWithOwner }, subIssuesSummary: { total, completed } }
// or null; repo: this repository ("owner/name"). Returns { close: true } or { close: false, why }.
function decide(parent, repo) {
  if (!parent) return { close: false, why: 'no parent' };
  // Sub-issues can have a parent in another repository. The same number here is a different
  // issue, and this workflow's token can't close one over there, so leave it.
  const where = parent.repository?.nameWithOwner;
  if (!where || where.toLowerCase() !== repo.toLowerCase()) return { close: false, why: `parent ${where || 'in an unknown repository'}#${parent.number} is in another repository; close it there` };
  if (parent.state !== 'OPEN') return { close: false, why: `parent #${parent.number} is already closed` };
  const { completed, total } = parent.subIssuesSummary;
  if (completed !== total) return { close: false, why: `parent #${parent.number}: ${completed} of ${total} sub-issues done` };
  return { close: true };
}

function ghCli(token) {
  return (args) => execFileSync('gh', args, { env: { ...process.env, GH_TOKEN: token }, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' });
}

function parentOf(gh, repo, number) {
  const [owner, name] = repo.split('/');
  // -f sends text: with the typed -F, an owner or repository called "2048" or "true" would
  // arrive as a number or a boolean and fail the String! variables. Only n is a number.
  const out = gh(['api', 'graphql', '-f', `owner=${owner}`, '-f', `repo=${name}`, '-F', `n=${number}`, '-f', `query=${PARENT_QUERY}`, '--jq', '.data.repository.issue.parent']);
  const text = String(out || '').trim();
  return text && text !== 'null' ? JSON.parse(text) : null;
}

// Closes parents up the chain from the issue that just closed; returns the numbers closed.
function run({ issueNumber, repo, gh, log = console.log }) {
  const closed = [];
  let child = issueNumber;
  for (let level = 0; level < MAX_LEVELS; level++) {
    const parent = parentOf(gh, repo, child);
    const verdict = decide(parent, repo);
    if (!verdict.close) {
      log(`#${child}: ${verdict.why}.`);
      break;
    }
    gh(['issue', 'close', String(parent.number), '--repo', repo, '--reason', 'completed', '--comment', `All its sub-issues are done (the last one was #${child}), so this is done too.`]);
    log(`Closed parent #${parent.number}.`);
    closed.push(parent.number);
    child = parent.number;
  }
  return closed;
}

function main(env = process.env) {
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  if (env.GITHUB_EVENT_NAME !== 'issues' || event.action !== 'closed') {
    console.log(`Nothing to do for "${env.GITHUB_EVENT_NAME}${event.action ? ' ' + event.action : ''}"; run this on issues: closed.`);
    return;
  }
  run({ issueNumber: event.issue.number, repo: env.GITHUB_REPOSITORY, gh: ghCli(env.INPUT_TOKEN) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

export { decide, run };
