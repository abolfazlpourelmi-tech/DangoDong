import assert from 'node:assert/strict';
import { test } from 'node:test';
import { friendlyError } from '../src/errors.ts';

const FALLBACK = 'ثبت خرج ناموفق بود';

// The point of the helper is that nothing English ever reaches a toast, so the
// assertions here are mostly "the raw text did not survive".
function assertNoLatin(message) {
  assert.ok(!/[A-Za-z]/.test(message), `leaked latin text: ${message}`);
}

test('an offline fetch becomes an instruction, not a stack trace', () => {
  const message = friendlyError(new TypeError('Network request failed'), FALLBACK);
  assert.match(message, /اینترنت/);
  assertNoLatin(message);
});

test('a row-level security refusal explains who may do it', () => {
  const message = friendlyError(
    { message: 'new row violates row-level security policy for table "expenses"' },
    FALLBACK,
  );
  assert.match(message, /اجازه/);
  assertNoLatin(message);
});

test('an expired session tells the reader what to do about it', () => {
  const message = friendlyError(new Error('JWT expired'), FALLBACK);
  assert.match(message, /ورودت/);
  assertNoLatin(message);
});

test('a unique-constraint violation is stated as already recorded', () => {
  const message = friendlyError(
    new Error('duplicate key value violates unique constraint "story_members_pkey"'),
    FALLBACK,
  );
  assert.match(message, /از قبل/);
  assertNoLatin(message);
});

test('an unrecognised English error falls back rather than leaking', () => {
  const message = friendlyError(new Error('PGRST301: something went sideways'), FALLBACK);
  assert.equal(message, FALLBACK);
});

test('a message already written in Persian is passed through', () => {
  const written = 'کد دعوت معتبر نیست';
  assert.equal(friendlyError(new Error(written), FALLBACK), written);
});

test('an empty or missing error still produces the caller\'s fallback', () => {
  assert.equal(friendlyError(undefined, FALLBACK), FALLBACK);
  assert.equal(friendlyError(new Error(''), FALLBACK), FALLBACK);
});
