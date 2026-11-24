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
    ['fix: keep the file name', 'Closes https://github.com/some-owner/some.repo/issues/9'],
  ]) assert.deepEqual(checkPullRequest({ title, body }), [], `${title} / ${body}`);
});

test('titles without a known type or a space after the colon fail', () => {
  for (const title of ['Add the export', 'feature: export', 'feat:export', '']) {
    assert.equal(checkPullRequest({ title, body: 'Closes #9' }).length, 1, title);
  }
});

test('descriptions without a real Closes line fail', () => {
  for (const body of ['Part of #9', 'Closes 9', 'disclosed #9', 'Closes https://example.com/o/r/issues/9', 'Closes https://github.com/o/r/pull/9', '', null]) {
    assert.equal(checkPullRequest({ title: 'feat: export', body }).length, 1, String(body));
  }
});

// run() with a recorded gh, so no test calls GitHub. earlier: ids of the action's own earlier
// comments, which the comment search returns.
function recorder(earlier = []) {
  const calls = [];
  const gh = (args, input) => {
    calls.push({ args, input });
    if (args[0] === 'label' && args[1] === 'create') throw new Error('already exists');
    if (args[0] === 'api' && args[1].endsWith('/comments')) return earlier.map((id) => id + '\n').join('');
    return '';
  };
  return { calls, gh, log: () => {} };
}
const shape = (r) => r.calls.map((c) => (c.args[0] === 'api' ? c.args.slice(0, c.args[1] === '-X' ? 4 : 2) : c.args.slice(0, 2)).join(' '));
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
  assert.deepEqual(shape(r), ['label create', 'issue edit', 'api repos/o/r/issues/7/comments', 'issue comment']);
  assert.ok(r.calls[1].args.includes('--add-label'));
  const comment = r.calls.at(-1).input;
  assert.match(comment, /- a "### Done when" section/);
  assert.match(comment, /needs-format label and this comment go away/);
  assert.match(comment, /<!-- github-steward-actions:format -->$/, 'marked, so it can be found and deleted');
});

test('the label removed by hand on a still incomplete issue: the old comment is replaced, not doubled', () => {
  const r = recorder([101]);
  run({ eventName: 'issues', event: issueEvent('nothing'), repo: 'o/r', label: 'needs-format', ...r });
  assert.deepEqual(shape(r), ['label create', 'issue edit', 'api repos/o/r/issues/7/comments', 'api -X DELETE repos/o/r/issues/comments/101', 'issue comment']);
});

test('only bot comments with the marker are found, so a pasted marker is safe', () => {
  const r = recorder();
  run({ eventName: 'issues', event: issueEvent(ISSUE), repo: 'o/r', label: 'needs-format', ...r });
  const filter = r.calls.find((c) => c.args[0] === 'api').args.at(-1);
  assert.match(filter, /\.user\.type == "Bot"/);
  assert.match(filter, /contains\("<!-- github-steward-actions:format -->"\)/);
});

test('an issue that already has the label gets no second comment', () => {
  const r = recorder();
  run({ eventName: 'issues', event: issueEvent('nothing', ['needs-format']), repo: 'o/r', label: 'needs-format', ...r });
  assert.deepEqual(r.calls, []);
});

test('a fixed issue loses the label and every comment of the action\'s', () => {
  const r = recorder([101, 102]);
  run({ eventName: 'issues', event: issueEvent(ISSUE, ['needs-format']), repo: 'o/r', label: 'needs-format', ...r });
  assert.ok(r.calls[0].args.includes('--remove-label'));
  assert.deepEqual(shape(r).slice(1), ['api repos/o/r/issues/7/comments', 'api -X DELETE repos/o/r/issues/comments/101', 'api -X DELETE repos/o/r/issues/comments/102']);
});

test('a fixed issue whose label was removed by hand still loses the old comment', () => {
  const r = recorder([101]);
  run({ eventName: 'issues', event: issueEvent(ISSUE), repo: 'o/r', label: 'needs-format', ...r });
  assert.deepEqual(shape(r), ['api repos/o/r/issues/7/comments', 'api -X DELETE repos/o/r/issues/comments/101']);
});

test('a fine issue with nothing to clean up only looks', () => {
  const r = recorder();
  run({ eventName: 'issues', event: issueEvent(ISSUE), repo: 'o/r', label: 'needs-format', ...r });
  assert.deepEqual(shape(r), ['api repos/o/r/issues/7/comments']);
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
