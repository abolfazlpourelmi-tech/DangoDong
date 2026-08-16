export type Member = {
  id: string;
  name: string;
  color: string;
  isMe?: boolean;
  shareUnits?: number;
  kind?: 'registered' | 'guest';
  userId?: string;
  householdMembers?: string[];
};

export type ExpenseCategory = 'stay' | 'food' | 'transport' | 'shopping' | 'fun' | 'other';

export type Expense = {
  id: string;
  title: string;
  amount: number;
  payerId: string;
  participantIds?: string[];
  allocations?: ExpenseAllocation[];
  createdAt: string;
  /** Raw ISO timestamp from the server; used for time-based filters. */
  createdAtISO?: string;
  /** auth user id of whoever recorded it; only they may edit or delete it. */
  createdById?: string;
  category?: ExpenseCategory;
  participantPersonCount?: number;
};

export type ExpenseAllocation = {
  memberId: string;
  amount: number;
  label?: string;
};

export type Balance = {
  memberId: string;
  amount: number;
};

export type Transfer = {
  fromId: string;
  toId: string;
  amount: number;
};

export type SettlementPayment = Transfer & {
  id: string;
  createdAt: string;
};

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Expenses only carry a human-readable `createdAt` label, so time filters have
 * to read the raw server timestamp. Rows without one (optimistic local entries)
 * are treated as brand new so they never disappear from the list.
 */
export function isFromLastWeek(expense: Expense, now: number = Date.now()): boolean {
  if (!expense.createdAtISO) return true;
  const createdAt = new Date(expense.createdAtISO).getTime();
  if (Number.isNaN(createdAt)) return true;
  return now - createdAt <= WEEK_IN_MS;
}

/**
 * Allocations are stored per account, with the participating person names kept
 * in the label ("سارا، مهدی" or "سارا: پاستا"). Editing an expense has to turn
 * that label back into the people it came from. If the label carries nothing
 * usable, every person on the account is assumed to have taken part.
 */
export function matchAllocationParticipants<T extends { id: string; name: string }>(
  label: string | undefined,
  people: T[],
): Array<{ person: T; item?: string }> {
  const parts = (label ?? '').split('،').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return people.map((person) => ({ person }));

  const matched = people.flatMap((person) => {
    const itemPart = parts.find((part) => part.startsWith(`${person.name}: `));
    if (itemPart) return [{ person, item: itemPart.slice(person.name.length + 2) }];
    return parts.includes(person.name) ? [{ person }] : [];
  });

  return matched.length ? matched : people.map((person) => ({ person }));
}

export function allocateByWeight(
  amount: number,
  participants: Array<{ memberId: string; weight: number }>,
): ExpenseAllocation[] {
  const validParticipants = participants.filter((participant) => participant.weight > 0);
  const totalWeight = validParticipants.reduce((sum, participant) => sum + participant.weight, 0);
  if (amount <= 0 || totalWeight <= 0) return [];

  const basePerUnit = Math.floor(amount / totalWeight);
  let remainder = amount - basePerUnit * totalWeight;

  return validParticipants.map((participant) => {
    const extra = Math.min(remainder, participant.weight);
    remainder -= extra;
    return {
      memberId: participant.memberId,
      amount: basePerUnit * participant.weight + extra,
    };
  });
}

export function applySettlementPayments(
  balances: Balance[],
  payments: SettlementPayment[],
): Balance[] {
  const adjusted = new Map(balances.map((balance) => [balance.memberId, balance.amount]));
  for (const payment of payments) {
    if (payment.amount <= 0 || !adjusted.has(payment.fromId) || !adjusted.has(payment.toId)) continue;
    adjusted.set(payment.fromId, (adjusted.get(payment.fromId) ?? 0) + payment.amount);
    adjusted.set(payment.toId, (adjusted.get(payment.toId) ?? 0) - payment.amount);
  }
  return balances.map((balance) => ({
    memberId: balance.memberId,
    amount: adjusted.get(balance.memberId) ?? balance.amount,
  }));
}

export function calculateBalances(members: Member[], expenses: Expense[]): Balance[] {
  const balances = new Map(members.map((member) => [member.id, 0]));

  for (const expense of expenses) {
    if (!balances.has(expense.payerId)) continue;

    const validAllocations = expense.allocations?.filter((allocation) => (
      balances.has(allocation.memberId) && allocation.amount >= 0
    ));

    if (validAllocations?.length) {
      const allocatedTotal = validAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
      if (allocatedTotal !== expense.amount) continue;

      balances.set(expense.payerId, (balances.get(expense.payerId) ?? 0) + expense.amount);
      for (const allocation of validAllocations) {
        balances.set(
          allocation.memberId,
          (balances.get(allocation.memberId) ?? 0) - allocation.amount,
        );
      }
      continue;
    }

    const participants = (expense.participantIds ?? []).filter((id) => balances.has(id));
    if (!participants.length) continue;

    balances.set(expense.payerId, (balances.get(expense.payerId) ?? 0) + expense.amount);

    const baseShare = Math.floor(expense.amount / participants.length);
    let remainder = expense.amount - baseShare * participants.length;

    for (const participantId of participants) {
      const share = baseShare + (remainder > 0 ? 1 : 0);
      remainder = Math.max(0, remainder - 1);
      balances.set(participantId, (balances.get(participantId) ?? 0) - share);
    }
  }

  return members.map((member) => ({
    memberId: member.id,
    amount: balances.get(member.id) ?? 0,
  }));
}

export function createSettlement(balances: Balance[]): Transfer[] {
  const nonZero = balances.filter((item) => item.amount !== 0);

  // Exact debt minimization grows exponentially. Typical travel groups are small,
  // so solve those exactly and keep a deterministic direct-payment fallback for
  // unusually large groups.
  if (nonZero.length <= 12) {
    const exact = createMinimumSettlement(nonZero);
    const direct = createGreedySettlement(nonZero);
    // Prefer intuitive debtor-to-creditor payments whenever they achieve the
    // same minimum count. Use intermediary payments only when they truly remove
    // a transaction.
    return direct.length === exact.length ? direct : exact;
  }

  return createGreedySettlement(nonZero);
}

function createMinimumSettlement(balances: Balance[]): Transfer[] {
  const memberIds = balances.map((item) => item.memberId);
  const initial = balances.map((item) => item.amount);
  const original = new Map(balances.map((item) => [item.memberId, item.amount]));
  const memo = new Map<string, Transfer[]>();

  function quality(transfers: Transfer[]) {
    const indirectCount = transfers.filter((transfer) => (
      (original.get(transfer.fromId) ?? 0) >= 0 || (original.get(transfer.toId) ?? 0) <= 0
    )).length;
    const volume = transfers.reduce((sum, transfer) => sum + transfer.amount, 0);
    return { indirectCount, volume };
  }

  function isBetter(candidate: Transfer[], current?: Transfer[]) {
    if (!current) return true;
    if (candidate.length !== current.length) return candidate.length < current.length;
    const candidateQuality = quality(candidate);
    const currentQuality = quality(current);
    if (candidateQuality.indirectCount !== currentQuality.indirectCount) {
      return candidateQuality.indirectCount < currentQuality.indirectCount;
    }
    return candidateQuality.volume < currentQuality.volume;
  }

  function solve(state: number[]): Transfer[] {
    const first = state.findIndex((amount) => amount !== 0);
    if (first === -1) return [];

    const key = state.join(',');
    const cached = memo.get(key);
    if (cached) return cached;

    let best: Transfer[] | undefined;
    const pairedAmounts = new Set<number>();

    for (let index = first + 1; index < state.length; index += 1) {
      if (state[first] * state[index] >= 0 || pairedAmounts.has(state[index])) continue;
      pairedAmounts.add(state[index]);

      const next = [...state];
      const settlingAmount = Math.abs(next[first]);
      const step: Transfer = next[first] < 0
        ? { fromId: memberIds[first], toId: memberIds[index], amount: settlingAmount }
        : { fromId: memberIds[index], toId: memberIds[first], amount: settlingAmount };

      next[index] += next[first];
      next[first] = 0;
      const candidate = [step, ...solve(next)];

      if (isBetter(candidate, best)) best = candidate;
      if (next[index] === 0) break;
    }

    const result = best ?? [];
    memo.set(key, result);
    return result;
  }

  return solve(initial);
}

function createGreedySettlement(balances: Balance[]): Transfer[] {
  const debtors = balances
    .filter((item) => item.amount < 0)
    .map((item) => ({ ...item, amount: Math.abs(item.amount) }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = balances
    .filter((item) => item.amount > 0)
    .map((item) => ({ ...item }))
    .sort((a, b) => b.amount - a.amount);

  const transfers: Transfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);

    if (amount > 0) {
      transfers.push({ fromId: debtor.memberId, toId: creditor.memberId, amount });
      debtor.amount -= amount;
      creditor.amount -= amount;
    }

    if (debtor.amount === 0) debtorIndex += 1;
    if (creditor.amount === 0) creditorIndex += 1;
  }

  return transfers;
}
