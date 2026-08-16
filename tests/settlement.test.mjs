import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  allocateByWeight,
  applySettlementPayments,
  calculateBalances,
  createSettlement,
  isFromLastWeek,
} from '../src/settlement.ts';

const member = (id) => ({ id, name: id, color: '#000000' });

test('allocateByWeight distributes the full amount and spreads the remainder', () => {
  const allocations = allocateByWeight(100, [
    { memberId: 'a', weight: 1 },
    { memberId: 'b', weight: 1 },
    { memberId: 'c', weight: 1 },
  ]);
  assert.equal(allocations.reduce((sum, item) => sum + item.amount, 0), 100);
  assert.deepEqual(allocations.map((item) => item.amount), [34, 33, 33]);
});

test('allocateByWeight respects household weights', () => {
  const allocations = allocateByWeight(90, [
    { memberId: 'family', weight: 2 },
    { memberId: 'solo', weight: 1 },
  ]);
  assert.deepEqual(allocations, [
    { memberId: 'family', amount: 60 },
    { memberId: 'solo', amount: 30 },
  ]);
});

test('allocateByWeight ignores zero-weight participants and non-positive amounts', () => {
  assert.deepEqual(allocateByWeight(50, [{ memberId: 'a', weight: 0 }]), []);
  assert.deepEqual(allocateByWeight(0, [{ memberId: 'a', weight: 1 }]), []);
});

test('calculateBalances credits the payer and debits each allocation', () => {
  const members = [member('a'), member('b')];
  const expenses = [{
    id: 'e1',
    title: 'شام',
    amount: 100,
    payerId: 'a',
    createdAt: 'امروز',
    allocations: [
      { memberId: 'a', amount: 40 },
      { memberId: 'b', amount: 60 },
    ],
  }];
  assert.deepEqual(calculateBalances(members, expenses), [
    { memberId: 'a', amount: 60 },
    { memberId: 'b', amount: -60 },
  ]);
});

test('calculateBalances skips expenses whose allocations do not sum to the total', () => {
  const members = [member('a'), member('b')];
  const expenses = [{
    id: 'e1',
    title: 'ناقص',
    amount: 100,
    payerId: 'a',
    createdAt: 'امروز',
    allocations: [{ memberId: 'b', amount: 60 }],
  }];
  assert.deepEqual(calculateBalances(members, expenses), [
    { memberId: 'a', amount: 0 },
    { memberId: 'b', amount: 0 },
  ]);
});

test('applySettlementPayments moves a paid amount from debtor to creditor', () => {
  const balances = [
    { memberId: 'a', amount: 60 },
    { memberId: 'b', amount: -60 },
  ];
  const payments = [{ id: 'p1', fromId: 'b', toId: 'a', amount: 60, createdAt: 'امروز' }];
  assert.deepEqual(applySettlementPayments(balances, payments), [
    { memberId: 'a', amount: 0 },
    { memberId: 'b', amount: 0 },
  ]);
});

test('applySettlementPayments ignores payments referencing unknown members', () => {
  const balances = [{ memberId: 'a', amount: 60 }];
  const payments = [{ id: 'p1', fromId: 'ghost', toId: 'a', amount: 60, createdAt: 'امروز' }];
  assert.deepEqual(applySettlementPayments(balances, payments), balances);
});

test('createSettlement clears every balance with direct debtor-to-creditor payments', () => {
  const balances = [
    { memberId: 'a', amount: 100 },
    { memberId: 'b', amount: -40 },
    { memberId: 'c', amount: -60 },
  ];
  const transfers = createSettlement(balances);
  assert.equal(transfers.length, 2);

  const settled = new Map(balances.map((item) => [item.memberId, item.amount]));
  for (const transfer of transfers) {
    settled.set(transfer.fromId, settled.get(transfer.fromId) + transfer.amount);
    settled.set(transfer.toId, settled.get(transfer.toId) - transfer.amount);
  }
  assert.deepEqual([...settled.values()], [0, 0, 0]);
});

test('createSettlement returns nothing when everyone is square', () => {
  assert.deepEqual(createSettlement([{ memberId: 'a', amount: 0 }]), []);
});

test('isFromLastWeek keeps recent expenses and drops older ones', () => {
  const now = Date.UTC(2026, 0, 20, 12, 0, 0);
  const at = (iso) => ({ id: 'e', title: 't', amount: 1, payerId: 'a', createdAt: 'x', createdAtISO: iso });

  assert.equal(isFromLastWeek(at('2026-01-20T09:00:00.000Z'), now), true);
  assert.equal(isFromLastWeek(at('2026-01-14T12:00:00.000Z'), now), true);
  assert.equal(isFromLastWeek(at('2026-01-10T12:00:00.000Z'), now), false);
});

test('isFromLastWeek keeps rows without a usable timestamp', () => {
  const now = Date.UTC(2026, 0, 20, 12, 0, 0);
  const base = { id: 'e', title: 't', amount: 1, payerId: 'a', createdAt: 'همین حالا' };
  assert.equal(isFromLastWeek(base, now), true);
  assert.equal(isFromLastWeek({ ...base, createdAtISO: 'not-a-date' }, now), true);
});
