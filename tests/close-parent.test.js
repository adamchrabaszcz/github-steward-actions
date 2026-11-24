// The close-parent action: when a parent closes, and walking up the chain.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, run } from '../close-parent/close-parent.mjs';

const parent = (number, completed, total, state = 'OPEN') => ({ number, state, subIssuesSummary: { completed, total } });

test('the parent closes when its last sub-issue is done', () => {
  assert.deepEqual(decide(parent(1, 3, 3)), { close: true });
});

test('the parent stays open while sub-issues remain', () => {
  assert.deepEqual(decide(parent(1, 2, 3)), { close: false, why: 'parent #1: 2 of 3 sub-issues done' });
});

test('an already closed parent, or no parent, is left alone', () => {
  assert.equal(decide(parent(1, 3, 3, 'CLOSED')).close, false);
  assert.deepEqual(decide(null), { close: false, why: 'no parent' });
});

// A fake repository: issue number -> its parent (as the GraphQL query returns it).
function repoWith(parents) {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    if (args[1] === 'graphql') {
      const n = Number(args.find((a) => a.startsWith('n=')).slice(2));
      return JSON.stringify(parents[n] ?? null);
    }
    if (args[0] === 'issue' && args[1] === 'close') {
      for (const x of Object.values(parents)) if (x && x.number === Number(args[2])) x.state = 'CLOSED';
    }
    return '';
  };
  return { calls, gh, closes: () => calls.filter((a) => a[1] === 'close').map((a) => Number(a[2])) };
}

test('the last sub-issue closes its parent, with a comment naming it', () => {
  const r = repoWith({ 12: parent(10, 3, 3) });
  assert.deepEqual(run({ issueNumber: 12, repo: 'o/r', gh: r.gh, log: () => {} }), [10]);
  const close = r.calls.find((a) => a[1] === 'close');
  assert.ok(close.includes('--reason') && close.includes('completed'));
  assert.match(close.at(-1), /the last one was #12/);
});

test('a finished parent that is itself a sub-issue closes its own parent too', () => {
  // #12 is the last step of #10, and #10 the last step of #5.
  const r = repoWith({ 12: parent(10, 3, 3), 10: parent(5, 2, 2) });
  assert.deepEqual(run({ issueNumber: 12, repo: 'o/r', gh: r.gh, log: () => {} }), [10, 5]);
  assert.match(r.calls.filter((a) => a[1] === 'close')[1].at(-1), /the last one was #10/);
});

test('the walk stops where sub-issues remain', () => {
  const r = repoWith({ 12: parent(10, 3, 3), 10: parent(5, 1, 2) });
  assert.deepEqual(run({ issueNumber: 12, repo: 'o/r', gh: r.gh, log: () => {} }), [10]);
});

test('nothing closes while sub-issues remain, or without a parent', () => {
  for (const parents of [{ 12: parent(10, 2, 3) }, {}, { 12: parent(10, 3, 3, 'CLOSED') }]) {
    const r = repoWith(parents);
    assert.deepEqual(run({ issueNumber: 12, repo: 'o/r', gh: r.gh, log: () => {} }), []);
    assert.deepEqual(r.closes(), []);
  }
});

test('a cycle can\'t loop forever', () => {
  // Not possible on GitHub, but a bad answer mustn't hang the job.
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    return args[1] === 'graphql' ? JSON.stringify(parent(7, 1, 1)) : '';
  };
  const closed = run({ issueNumber: 7, repo: 'o/r', gh, log: () => {} });
  assert.equal(closed.length, 10, 'stops at the level limit');
});
