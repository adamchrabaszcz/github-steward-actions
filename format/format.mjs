// format: checks an issue or a pull request against the format in CONTRIBUTING.md
// ("Issues and pull requests").
//
// Issues: "What and why" and "Done when" sections with something under them ("Blast radius"
// and "Parent" are optional; the issue forms write these headings). Issues can't be blocked,
// so one that misses a section gets a label and a comment, both removed once it's fixed.
// Pull requests: a Conventional Commit title and a "Closes #n" line, or the check fails.
//
// Runs as a JavaScript action (action.yml); the rules are exported for the tests.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const REQUIRED = ['What and why', 'Done when'];
const TYPES = ['feat', 'fix', 'perf', 'docs', 'ci', 'chore', 'test', 'refactor', 'style', 'build'];
const TITLE = new RegExp(`^(${TYPES.join('|')})(\\([\\w ,./-]+\\))?!?: \\S`);
// \b keeps "disclosed #9" from counting; the "#" keeps "Closes 9" from counting.
const CLOSES = /\b(close[sd]?|fix(e[sd])?|resolve[sd]?) +#\d+\b/i;

// "## Heading" or "### Heading" sections of a body: heading -> text under it, trimmed.
// "_No response_" is what an issue form writes for a field left empty.
function sections(body) {
  const out = {};
  let current = null;
  for (const line of String(body || '').split(/\r?\n/)) {
    const h = line.match(/^#{2,3} +(.+?) *$/);
    if (h) out[(current = h[1])] = '';
    else if (current) out[current] += line + '\n';
  }
  for (const k of Object.keys(out)) out[k] = out[k].trim() === '_No response_' ? '' : out[k].trim();
  return out;
}

function checkIssue(body) {
  const s = sections(body);
  return REQUIRED.filter((name) => !s[name]).map((name) => `a "### ${name}" section with something in it`);
}

function checkPullRequest({ title, body }) {
  const problems = [];
  if (!TITLE.test(title || '')) problems.push(`a Conventional Commit title (${TYPES.join(', ')}), e.g. "fix: the export keeps the file name"`);
  if (!CLOSES.test(body || '')) problems.push('a "Closes #<issue>" line in the description, so merging closes the issue');
  return problems;
}

function issueComment(problems, label) {
  return [
    'This issue is missing:',
    ...problems.map((p) => `- ${p}`),
    '',
    `The format is in CONTRIBUTING.md ("Issues and pull requests"); the issue forms write it for you. The ${label} label goes away once it is fixed.`,
  ].join('\n');
}

// gh(args, input): runs the GitHub CLI. Passed in, so the tests can record the calls.
function ghCli(token) {
  return (args, input) =>
    execFileSync('gh', args, { env: { ...process.env, GH_TOKEN: token }, input, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' });
}

// What to do for this event. Returns the exit code: 1 when a pull request misses something.
function run({ eventName, event, repo, label, gh, log = console.log }) {
  if (eventName === 'pull_request' || eventName === 'pull_request_target') {
    const problems = checkPullRequest(event.pull_request);
    for (const p of problems) log(`::error::Missing: ${p}`);
    if (!problems.length) log('Format OK.');
    return problems.length ? 1 : 0;
  }
  if (eventName !== 'issues') {
    log(`Nothing to check for a "${eventName}" event.`);
    return 0;
  }
  const { number, body, labels = [] } = event.issue;
  const problems = checkIssue(body);
  const hasLabel = labels.some((l) => l.name === label);
  for (const p of problems) log(`Missing: ${p}`);
  if (problems.length && !hasLabel) {
    try {
      gh(['label', 'create', label, '--repo', repo, '--color', 'fbca04', '--description', 'Issue misses a required section']);
    } catch {
      // it exists already
    }
    gh(['issue', 'edit', String(number), '--repo', repo, '--add-label', label]);
    gh(['issue', 'comment', String(number), '--repo', repo, '--body-file', '-'], issueComment(problems, label));
  } else if (!problems.length && hasLabel) {
    gh(['issue', 'edit', String(number), '--repo', repo, '--remove-label', label]);
    log('Format OK; label removed.');
  } else if (!problems.length) {
    log('Format OK.');
  }
  return 0;
}

function main(env = process.env) {
  process.exitCode = run({
    eventName: env.GITHUB_EVENT_NAME,
    event: JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')),
    repo: env.GITHUB_REPOSITORY,
    label: env.INPUT_LABEL || 'needs-format',
    gh: ghCli(env.INPUT_TOKEN),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

export { sections, checkIssue, checkPullRequest, issueComment, run };
