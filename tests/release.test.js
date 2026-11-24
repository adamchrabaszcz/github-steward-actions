// The release action: the next version, which pull requests shipped, and what it does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextVersion, pullRequestNumbers, parseLog, run } from '../release/release.mjs';

const c = (subject, body = '') => ({ subject, body });

test('the first release is the first version, once something ships', () => {
  assert.equal(nextVersion(null, [c('feat: export')]), '0.1.0');
  assert.equal(nextVersion(null, [c('fix: export')], '1.0.0'), '1.0.0');
  assert.equal(nextVersion(null, [c('chore: setup'), c('docs: readme')]), null, 'nothing shipped yet');
});

test('fix and perf bump the patch version', () => {
  assert.equal(nextVersion('1.2.3', [c('fix: export')]), '1.2.4');
  assert.equal(nextVersion('1.2.3', [c('perf(core): faster')]), '1.2.4');
});

test('feat bumps the minor version', () => {
  assert.equal(nextVersion('1.2.3', [c('fix: a'), c('feat: b')]), '1.3.0');
});

test('a breaking change bumps the major version, by ! or a footer line', () => {
  assert.equal(nextVersion('1.2.3', [c('feat!: new format')]), '2.0.0');
  assert.equal(nextVersion('1.2.3', [c('refactor(core)!: rename')]), '2.0.0');
  assert.equal(nextVersion('1.2.3', [c('fix: x', 'Why.\n\nBREAKING CHANGE: callers must rename the input')]), '2.0.0');
  assert.equal(nextVersion('1.2.3', [c('fix: x', 'BREAKING-CHANGE: same')]), '2.0.0');
});

test('a squash body mentioning BREAKING CHANGE mid-line is not a footer', () => {
  assert.equal(nextVersion('1.2.3', [c('fix: x', 'No BREAKING CHANGE: here, see above.')]), '1.2.4');
});

test('docs, ci, chore, test, refactor, style, build and non-conventional commits release nothing', () => {
  const none = ['docs: a', 'ci: b', 'chore: c', 'test: d', 'refactor: e', 'style: f', 'build: g', 'Update README', 'Merge branch x'];
  assert.equal(nextVersion('1.2.3', none.map((s) => c(s))), null);
});

test('pull request numbers come from merge and squash subjects, once each', () => {
  assert.deepEqual(
    pullRequestNumbers(['feat: export (#12)', 'Merge pull request #9 from o/feat/x', 'fix: a (#12)', 'docs: mentions (#3) in the middle', 'chore: no number']),
    [9, 12],
  );
});

test('git log records split into subject and body', () => {
  const log = 'feat: a (#2)\x1fBody line\n\nBREAKING CHANGE: x\n\x1e\nfix: b\x1f\x1e\n';
  assert.deepEqual(parseLog(log), [c('feat: a (#2)', 'Body line\n\nBREAKING CHANGE: x\n'), c('fix: b', '')]);
});

// A fake checkout and GitHub: tags, commits and what gh returns. newestTag: the newest release tag
// in the repository (default: the last one reachable from the commit); laterTag: true when it's
// on a later commit, not in this one's history. closing: pull request -> issues it closes, as
// numbers (this repository) or "owner/repo#n" (another).
function world({ lastTag = 'v1.2.3', newestTag, laterTag = false, log = '', subjects = '', closing = {}, milestones = [], comments = {} } = {}) {
  const calls = [];
  const newest = newestTag ?? lastTag ?? '';
  const ref = (x) => {
    const m = String(x).match(/^(.+)\/(.+)#(\d+)$/);
    return m ? { number: Number(m[3]), repository: { name: m[2], owner: { login: m[1] } } } : { number: x, repository: { name: 'r', owner: { login: 'o' } } };
  };
  const git = (args) => {
    calls.push(['git', ...args]);
    if (args[0] === 'tag') return newest ? newest + '\nv0.9.0\n' : '';
    if (args[0] === 'merge-base') {
      if (laterTag) throw new Error('exit 1');
      return '';
    }
    if (args[0] === 'describe') {
      if (!lastTag) throw new Error('no names found');
      return lastTag + '\n';
    }
    if (args.includes('--no-merges')) return log;
    return subjects;
  };
  const gh = (args) => {
    calls.push(['gh', ...args]);
    if (args[0] === 'pr') return JSON.stringify({ closingIssuesReferences: (closing[args[2]] || []).map(ref) });
    if (args[0] === 'api' && args[1].startsWith('repos/o/r/milestones?')) return JSON.stringify(milestones);
    if (args[0] === 'api' && args[1] === 'repos/o/r/milestones') return JSON.stringify({ number: 4, state: 'open' });
    if (args[0] === 'api' && /comments\?per_page/.test(args[1])) return JSON.stringify(comments[args[1].split('/')[4]] || []);
    return '';
  };
  return { calls, git, gh, gh_calls: () => calls.filter((x) => x[0] === 'gh').map((x) => x.slice(1)) };
}

test('nothing shipped: no release, no calls to GitHub', () => {
  const w = world({ log: 'docs: readme\x1f\x1e' });
  assert.deepEqual(run({ repo: 'o/r', sha: 'abc', first: '0.1.0', marks: true, git: w.git, gh: w.gh, log: () => {} }), { released: false, version: '', tag: '' });
  assert.deepEqual(w.gh_calls(), []);
});

test('a release counts from the last tag, tags the given commit and marks what shipped', () => {
  const w = world({
    log: 'feat: export (#12)\x1f\x1e\nfix: typo (#13)\x1f\x1e',
    subjects: 'feat: export (#12)\nfix: typo (#13)\n',
    closing: { 12: [5], 13: [5, 6] },
    comments: { 6: [{ body: 'Released in [v1.3.0](https://github.com/o/r/releases/tag/v1.3.0).' }] },
  });
  const result = run({ repo: 'o/r', sha: 'abc', first: '0.1.0', marks: true, git: w.git, gh: w.gh, log: () => {} });
  assert.deepEqual(result, { released: true, version: '1.3.0', tag: 'v1.3.0' });
  assert.ok(w.calls.some((x) => x[0] === 'git' && x.includes('v1.2.3..abc')), 'counts from the last tag');
  const gh = w.gh_calls();
  assert.deepEqual(gh[0], ['release', 'create', 'v1.3.0', '--repo', 'o/r', '--target', 'abc', '--title', 'v1.3.0', '--generate-notes']);
  const marked = gh.filter((a) => a[1] === '-X' && /issues\/\d+$/.test(a[3])).map((a) => Number(a[3].split('/').pop()));
  assert.deepEqual(marked, [12, 13, 5, 6], 'pull requests first, then the issues they closed, each once');
  const commented = gh.filter((a) => /issues\/\d+\/comments$/.test(a[1])).map((a) => Number(a[1].split('/')[4]));
  assert.deepEqual(commented, [12, 13, 5], '#6 already has the line');
  assert.deepEqual(gh.at(-1), ['api', '-X', 'PATCH', 'repos/o/r/milestones/4', '-f', 'state=closed']);
});

test('the first release uses the first version and the whole history', () => {
  const w = world({ lastTag: null, log: 'chore: setup\x1f\x1e\nfeat: format (#6)\x1f\x1e', subjects: 'feat: format (#6)\n' });
  const result = run({ repo: 'o/r', sha: 'abc', first: '1.0.0', marks: false, git: w.git, gh: w.gh, log: () => {} });
  assert.equal(result.tag, 'v1.0.0');
  assert.deepEqual(w.gh_calls().map((a) => a.slice(0, 3).join(' ')), ['release create v1.0.0'], 'marks: false makes no marks');
});

test('an existing closed milestone is reopened, used and closed again', () => {
  const w = world({ log: 'fix: a (#2)\x1f\x1e', subjects: 'fix: a (#2)\n', milestones: [{ title: 'v1.2.4', number: 9, state: 'closed' }] });
  run({ repo: 'o/r', sha: 'abc', first: '0.1.0', marks: true, git: w.git, gh: w.gh, log: () => {} });
  const gh = w.gh_calls();
  assert.ok(!gh.some((a) => a[1] === 'repos/o/r/milestones'), 'no second milestone');
  assert.ok(gh.some((a) => a.join(' ') === 'api -X PATCH repos/o/r/milestones/9 -f state=open'));
  assert.ok(gh.some((a) => a.join(' ') === 'api -X PATCH repos/o/r/issues/2 -F milestone=9'));
});

test('a failure while marking only warns: the release is out', () => {
  const w = world({ log: 'fix: a (#2)\x1f\x1e', subjects: 'fix: a (#2)\n' });
  const gh = (args) => {
    if (args[0] === 'pr') throw new Error('rate limited');
    return w.gh(args);
  };
  const warnings = [];
  const result = run({ repo: 'o/r', sha: 'abc', first: '0.1.0', marks: true, git: w.git, gh, log: () => {}, warn: (m) => warnings.push(m) });
  assert.equal(result.released, true);
  assert.match(warnings[0], /Could not mark what v1\.2\.4 shipped: rate limited/);
});

test('an issue a pull request closes in another repository is not marked here', () => {
  const w = world({ log: 'fix: a (#2)\x1f\x1e', subjects: 'fix: a (#2)\n', closing: { 2: [5, 'other-org/other-repo#6', 'O/R#7'] } });
  run({ repo: 'o/r', sha: 'abc', first: '0.1.0', marks: true, git: w.git, gh: w.gh, log: () => {} });
  const marked = w.gh_calls().filter((a) => a[1] === '-X' && /issues\/\d+$/.test(a[3])).map((a) => Number(a[3].split('/').pop()));
  assert.deepEqual(marked, [2, 5, 7], '#6 belongs to another repository; O/R is this one');
});

test('runs finishing out of order: a later commit already released, so an earlier one is not', () => {
  // CI for a later commit finished first and made v1.3.0, which contains this commit.
  const w = world({ newestTag: 'v1.3.0', laterTag: true, log: 'fix: a (#2)\x1f\x1e' });
  const lines = [];
  assert.deepEqual(run({ repo: 'o/r', sha: 'old', first: '0.1.0', marks: true, git: w.git, gh: w.gh, log: (l) => lines.push(l) }), { released: false, version: '', tag: '' });
  assert.deepEqual(w.gh_calls(), [], 'no release, no marks');
  assert.match(lines[0], /v1\.3\.0 is on a later commit/);
});

test('a re-run on the commit that is already released makes nothing new', () => {
  // The newest tag is on this very commit: it is its own ancestor, and nothing came after it.
  const w = world({ lastTag: 'v1.3.0', log: '' });
  assert.equal(run({ repo: 'o/r', sha: 'abc', first: '0.1.0', marks: true, git: w.git, gh: w.gh, log: () => {} }).released, false);
  assert.deepEqual(w.gh_calls(), []);
});
