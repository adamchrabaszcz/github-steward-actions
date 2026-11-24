// The format action: the issue and pull request rules, and what it does on each event.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sections, checkIssue, checkPullRequest, run } from '../format/format.mjs';

const ISSUE = `### What and why
The export loses the file name.

### Done when
- [ ] The export keeps it

### Blast radius
_No response_
`;

test('a complete issue passes, an empty optional section included', () => {
  const s = sections(ISSUE);
  assert.equal(s['What and why'], 'The export loses the file name.');
  assert.equal(s['Blast radius'], '');
  assert.deepEqual(checkIssue(ISSUE), []);
});

test('an issue without "Done when", or with it left empty in the form, is reported', () => {
  assert.deepEqual(checkIssue('### What and why\nBecause.\n'), ['a "### Done when" section with something in it']);
  assert.deepEqual(checkIssue('### What and why\nBecause.\n\n### Done when\n_No response_\n'), ['a "### Done when" section with something in it']);
});

test('two-hash headings and CRLF line endings are fine', () => {
  assert.deepEqual(checkIssue('## What and why\r\nBecause.\r\n\r\n## Done when\r\n- [ ] it works\r\n'), []);
});

test('a blank issue misses both sections', () => {
  assert.equal(checkIssue('Just a sentence.').length, 2);
  assert.equal(checkIssue(null).length, 2);
});

test('good pull requests pass: scopes, breaking changes, fixes and resolves', () => {
  for (const [title, body] of [
    ['feat(export): keep the file name', 'Closes #9'],
    ['fix: keep the file name', 'What\n\nfixes #12.'],
    ['feat!: new saved format', 'Resolves #3'],
    ['ci(release, format): tags', 'closes #1'],
    ['fix: keep the file name', 'Closes: #9'],
    ['fix: keep the file name', 'Closes some-owner/some.repo#9'],
  ]) assert.deepEqual(checkPullRequest({ title, body }), [], `${title} / ${body}`);
});

test('titles without a known type or a space after the colon fail', () => {
  for (const title of ['Add the export', 'feature: export', 'feat:export', '']) {
    assert.equal(checkPullRequest({ title, body: 'Closes #9' }).length, 1, title);
  }
});

test('descriptions without a real Closes line fail', () => {
  for (const body of ['Part of #9', 'Closes 9', 'disclosed #9', '', null]) {
    assert.equal(checkPullRequest({ title: 'feat: export', body }).length, 1, String(body));
  }
});

// run() with a recorded gh, so no test calls GitHub.
function recorder() {
  const calls = [];
  const gh = (args, input) => {
    calls.push({ args, input });
    if (args[0] === 'label' && args[1] === 'create') throw new Error('already exists');
    if (args[0] === 'api' && args[1].endsWith('/comments')) return '101\n102\n'; // our earlier comments
    return '';
  };
  return { calls, gh, log: () => {} };
}
const issueEvent = (body, labels = []) => ({ issue: { number: 7, body, labels: labels.map((name) => ({ name })) } });

test('a pull request missing both fails with both reported', () => {
  const lines = [];
  const code = run({ eventName: 'pull_request', event: { pull_request: { title: 'nope', body: '' } }, log: (l) => lines.push(l) });
  assert.equal(code, 1);
  assert.equal(lines.filter((l) => l.startsWith('::error::Missing: ')).length, 2);
  assert.equal(run({ eventName: 'pull_request', event: { pull_request: { title: 'fix: it', body: 'Closes #1' } }, log: () => {} }), 0);
});

test('an issue that misses a section gets the label and one comment listing what is missing', () => {
  const r = recorder();
  const code = run({ eventName: 'issues', event: issueEvent('### What and why\nBecause.\n'), repo: 'o/r', label: 'needs-format', ...r });
  assert.equal(code, 0, 'issues are never blocked');
  assert.deepEqual(r.calls.map((c) => c.args.slice(0, 2).join(' ')), ['label create', 'issue edit', 'issue comment']);
  assert.ok(r.calls[1].args.includes('--add-label'));
  assert.match(r.calls[2].input, /- a "### Done when" section/);
  assert.match(r.calls[2].input, /needs-format label and this comment go away/);
  assert.match(r.calls[2].input, /<!-- github-steward-actions:format -->$/, 'marked, so it can be found and deleted');
});

test('an issue that already has the label gets no second comment', () => {
  const r = recorder();
  run({ eventName: 'issues', event: issueEvent('nothing', ['needs-format']), repo: 'o/r', label: 'needs-format', ...r });
  assert.deepEqual(r.calls, []);
});

test('a fixed issue loses the label and the action\'s own comments; a fine issue without it is left alone', () => {
  const r = recorder();
  run({ eventName: 'issues', event: issueEvent(ISSUE, ['needs-format']), repo: 'o/r', label: 'needs-format', ...r });
  assert.ok(r.calls[0].args.includes('--remove-label'));
  const find = r.calls[1].args;
  assert.equal(find[1], 'repos/o/r/issues/7/comments');
  assert.match(find.at(-1), /contains\("<!-- github-steward-actions:format -->"\)/, 'only comments with the marker');
  assert.deepEqual(r.calls.slice(2).map((c) => c.args.join(' ')), ['api -X DELETE repos/o/r/issues/comments/101', 'api -X DELETE repos/o/r/issues/comments/102']);
  const quiet = recorder();
  run({ eventName: 'issues', event: issueEvent(ISSUE), repo: 'o/r', label: 'needs-format', ...quiet });
  assert.deepEqual(quiet.calls, []);
});

test('untrusted text reaches gh only as an argument or stdin, never in a command line', () => {
  const r = recorder();
  const body = '### What and why\n$(rm -rf /) `x` ; echo pwned\n';
  run({ eventName: 'issues', event: issueEvent(body), repo: 'o/r', label: 'needs-format', ...r });
  for (const c of r.calls) for (const a of c.args) assert.ok(!a.includes('rm -rf'), a);
});

test('other events are ignored', () => {
  const r = recorder();
  assert.equal(run({ eventName: 'push', event: {}, ...r }), 0);
  assert.deepEqual(r.calls, []);
});
