// release: after CI passes on main, tags the commit and publishes a GitHub release when the
// merges since the last release shipped something, then marks what shipped: every pull request
// in it, and every issue those closed, gets the version's milestone and a "Released in" comment.
//
// The version comes from the Conventional Commits since the last vX.Y.Z tag: a breaking change
// (`type!:` or a `BREAKING CHANGE:` footer line) bumps the major number, `feat` the minor,
// `fix` and `perf` the patch; docs, ci, chore, test, refactor, style and build release nothing.
//
// Runs as a JavaScript action (action.yml), in a checkout with full history and tags. The rules
// are exported for the tests.
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const VERSION = /^\d+\.\d+\.\d+$/;

// last: 'x.y.z' or null (no release yet); commits: [{ subject, body }].
// Returns the next 'x.y.z', or null when nothing shipped.
function nextVersion(last, commits, first = '0.1.0') {
  const level = commits.reduce((lvl, { subject, body = '' }) => {
    const m = String(subject).match(/^(\w+)(\([^)]*\))?(!)?:/);
    if (!m) return lvl;
    if (m[3] || /^BREAKING[ -]CHANGE:/m.test(body)) return Math.max(lvl, 3);
    if (m[1] === 'feat') return Math.max(lvl, 2);
    if (m[1] === 'fix' || m[1] === 'perf') return Math.max(lvl, 1);
    return lvl;
  }, 0);
  if (!last) return level ? first : null;
  if (!level) return null;
  const [major, minor, patch] = last.split('.').map(Number);
  if (level === 3) return `${major + 1}.0.0`;
  if (level === 2) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// Pull request numbers from merge commit subjects ("Merge pull request #12 from …") and
// squash merges ("feat: … (#12)"), lowest first, no repeats.
function pullRequestNumbers(subjects) {
  const out = new Set();
  for (const s of subjects) {
    const m = String(s).match(/^Merge pull request #(\d+)\b/) || String(s).match(/\(#(\d+)\)$/);
    if (m) out.add(Number(m[1]));
  }
  return [...out].sort((a, b) => a - b);
}

const releasedLine = (tag, url) => `Released in [${tag}](${url}).`;

// git log records: subject \x1f body \x1e.
function parseLog(text) {
  return String(text || '')
    .split('\x1e')
    .map((c) => c.replace(/^\n/, ''))
    .filter((c) => c.trim())
    .map((c) => {
      const [subject, body = ''] = c.split('\x1f');
      return { subject: subject.trim(), body };
    });
}

// The milestone, the comments: each pull request and issue once, re-runs comment nothing twice.
function markShipped({ tag, repo, previous, sha, git, gh, log }) {
  const prs = pullRequestNumbers(git(['log', '--format=%s', previous ? `${previous}..${sha}` : sha]).split('\n'));
  const issues = new Set();
  for (const pr of prs) {
    for (const i of JSON.parse(gh(['pr', 'view', String(pr), '--repo', repo, '--json', 'closingIssuesReferences'])).closingIssuesReferences) issues.add(i.number);
  }
  const url = `https://github.com/${repo}/releases/tag/${tag}`;
  const line = releasedLine(tag, url);
  // Made open so things can be added to it, then closed: it has shipped.
  const existing = JSON.parse(gh(['api', `repos/${repo}/milestones?state=all&per_page=100`])).find((m) => m.title === tag);
  const milestone = existing || JSON.parse(gh(['api', `repos/${repo}/milestones`, '-f', `title=${tag}`, '-f', `description=${url}`]));
  if (milestone.state === 'closed') gh(['api', '-X', 'PATCH', `repos/${repo}/milestones/${milestone.number}`, '-f', 'state=open']);
  const numbers = [...prs, ...[...issues].filter((n) => !prs.includes(n)).sort((a, b) => a - b)];
  for (const n of numbers) {
    gh(['api', '-X', 'PATCH', `repos/${repo}/issues/${n}`, '-F', `milestone=${milestone.number}`]); // issues and pull requests alike
    const comments = JSON.parse(gh(['api', `repos/${repo}/issues/${n}/comments?per_page=100`]));
    if (!comments.some((c) => String(c.body).includes(line))) gh(['api', `repos/${repo}/issues/${n}/comments`, '-f', `body=${line}`]);
  }
  gh(['api', '-X', 'PATCH', `repos/${repo}/milestones/${milestone.number}`, '-f', 'state=closed']);
  log(`${tag}: ${prs.length} pull requests, ${issues.size} issues marked.`);
}

// Returns { released, version, tag }.
function run({ repo, sha, first, marks, git, gh, log = console.log, warn = (m) => console.log(`::warning::${m}`) }) {
  let lastTag = null;
  try {
    lastTag = git(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*.[0-9]*.[0-9]*', sha]).trim() || null;
  } catch {
    // no release yet
  }
  const commits = parseLog(git(['log', '--no-merges', '--format=%s%x1f%b%x1e', lastTag ? `${lastTag}..${sha}` : sha]));
  const version = nextVersion(lastTag ? lastTag.slice(1) : null, commits, first);
  if (!version) {
    log('Nothing to release: no feat, fix, perf or breaking change since ' + (lastTag || 'the start') + '.');
    return { released: false, version: '', tag: '' };
  }
  const tag = `v${version}`;
  gh(['release', 'create', tag, '--repo', repo, '--target', sha, '--title', tag, '--generate-notes']);
  log(`Released ${tag}.`);
  if (marks) {
    // The release is out already: a failure here only leaves the marks missing.
    try {
      markShipped({ tag, repo, previous: lastTag, sha, git, gh, log });
    } catch (e) {
      warn(`Could not mark what ${tag} shipped: ${e.message}`);
    }
  }
  return { released: true, version, tag };
}

function main(env = process.env) {
  const first = env['INPUT_FIRST-VERSION'] || '0.1.0';
  if (!VERSION.test(first)) throw new Error(`first-version must look like 1.0.0, not "${first}"`);
  const exec = (cmd, extra = {}) => (args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...extra });
  const result = run({
    repo: env.GITHUB_REPOSITORY,
    sha: env.INPUT_SHA || env.GITHUB_SHA,
    first,
    marks: env.INPUT_MARKS !== 'false',
    git: exec('git'),
    gh: exec('gh', { env: { ...env, GH_TOKEN: env.INPUT_TOKEN } }),
  });
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `released=${result.released}\nversion=${result.version}\ntag=${result.tag}\n`);
  if (result.released && env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `Released ${result.tag}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

export { nextVersion, pullRequestNumbers, parseLog, releasedLine, run };
