import assert from 'node:assert/strict';
import { test } from 'node:test';
import { displayablePhone, isPlaceholderPhone, toIranPhone, toLatinDigits } from '../src/phone.ts';

test('toLatinDigits folds Persian and Arabic digits', () => {
  assert.equal(toLatinDigits('۰۹۱۲۱۲۳۴۵۶۷'), '09121234567');
  assert.equal(toLatinDigits('٠٩١٢١٢٣٤٥٦٧'), '09121234567');
  assert.equal(toLatinDigits('0912 123 4567'), '09121234567');
});

test('toIranPhone accepts the forms people actually type', () => {
  assert.equal(toIranPhone('09121234567'), '+989121234567');
  assert.equal(toIranPhone('۰۹۱۲۱۲۳۴۵۶۷'), '+989121234567');
  assert.equal(toIranPhone('989121234567'), '+989121234567');
  assert.equal(toIranPhone('+98 912 123 4567'), '+989121234567');
  assert.equal(toIranPhone('9121234567'), '+989121234567');
});

test('toIranPhone rejects anything that is not an Iranian mobile', () => {
  for (const bad of ['', '0912123456', '091212345678', '02112345678', 'abcd', '08121234567']) {
    assert.equal(toIranPhone(bad), '', `expected ${bad} to be rejected`);
  }
});

test('placeholder phones are recognised and never displayed', () => {
  assert.equal(isPlaceholderPhone('anonymous:abc-123'), true);
  assert.equal(isPlaceholderPhone('+989121234567'), false);
  assert.equal(isPlaceholderPhone(null), false);
  assert.equal(displayablePhone('anonymous:abc-123'), '');
  assert.equal(displayablePhone('+989121234567'), '+989121234567');
  assert.equal(displayablePhone(undefined), '');
});
