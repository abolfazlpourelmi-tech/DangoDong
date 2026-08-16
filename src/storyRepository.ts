import type { Expense, Member, SettlementPayment } from './settlement';
import { supabase } from './supabase';

export type OnlineStory = {
  id: string;
  name: string;
  template: 'restaurant' | 'trip' | 'cooking' | 'shopping' | 'other';
  ownerId: string;
  inviteCode: string;
  members: Member[];
  expenses: Expense[];
  payments: SettlementPayment[];
  status: 'active' | 'completed';
  completedAt?: string;
};

const COLORS = ['#6652D9', '#FF7A6B', '#4FC7A4', '#F0A83A', '#4E82D8', '#A95AC2'];

function relativeTime(value?: string | null) {
  if (!value) return 'همین حالا';
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString() ? 'امروز' : date.toLocaleDateString('fa-IR');
}

export async function loadOnlineStories(): Promise<OnlineStory[]> {
  if (!supabase) return [];
  const { data: authData } = await supabase.auth.getSession();
  const currentUserId = authData.session?.user.id;
  if (!currentUserId) return [];

  const { data: storyRows, error: storyError } = await supabase
    .from('stories')
    .select('id, owner_id, name, template, status, invite_code, completed_at, created_at')
    .order('created_at', { ascending: false });
  if (storyError) throw storyError;
  if (!storyRows?.length) return [];

  const storyIds = storyRows.map((row) => row.id);
  const [{ data: memberRows, error: memberError }, { data: expenseRows, error: expenseError }, { data: settlementRows, error: settlementError }] = await Promise.all([
    supabase.from('story_members').select('id, story_id, user_id, share_units, member_kind, display_name, household_members, joined_at').in('story_id', storyIds),
    supabase.from('expenses').select('id, story_id, title, amount, category, paid_by, participant_person_count, created_at, created_by').in('story_id', storyIds).order('created_at', { ascending: false }),
    supabase.from('settlements').select('id, story_id, from_member_id, to_member_id, amount, status, paid_at, created_at').in('story_id', storyIds),
  ]);
  if (memberError) throw memberError;
  if (expenseError) throw expenseError;
  if (settlementError) throw settlementError;

  const profileIds = [...new Set((memberRows ?? []).map((row) => row.user_id).filter(Boolean))] as string[];
  const { data: profileRows, error: profileError } = profileIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', profileIds)
    : { data: [], error: null };
  if (profileError) throw profileError;
  const profileNames = new Map((profileRows ?? []).map((profile) => [profile.id, profile.full_name]));

  const expenseIds = (expenseRows ?? []).map((row) => row.id);
  const { data: shareRows, error: shareError } = expenseIds.length
    ? await supabase.from('expense_shares').select('expense_id, member_id, amount, item_label').in('expense_id', expenseIds)
    : { data: [], error: null };
  if (shareError) throw shareError;

  return storyRows.map((story) => {
    const storyMembers: Member[] = (memberRows ?? [])
      .filter((row) => row.story_id === story.id)
      .map((row, index) => {
        const displayName = row.member_kind === 'guest' ? row.display_name : (profileNames.get(row.user_id) ?? 'عضو دنگودونگ');
        const count = Math.max(1, Number(row.share_units ?? 1));
        const savedNames = Array.isArray(row.household_members)
          ? row.household_members.map((name: unknown) => String(name).trim()).filter(Boolean).slice(0, count)
          : [];
        const householdMembers = Array.from({ length: count }, (_, personIndex) => (
          (personIndex === 0 && row.member_kind !== 'guest')
            ? displayName
            : (savedNames[personIndex] || (personIndex === 0 ? displayName : `نفر ${personIndex + 1}`))
        ));
        return {
          id: row.id,
          name: displayName,
          color: COLORS[index % COLORS.length],
          isMe: row.user_id === currentUserId,
          shareUnits: count,
          kind: row.member_kind,
          userId: row.user_id ?? undefined,
          householdMembers,
        };
      });
    const storyExpenses: Expense[] = (expenseRows ?? [])
      .filter((row) => row.story_id === story.id)
      .map((row) => ({
        id: row.id,
        title: row.title,
        amount: Number(row.amount),
        payerId: row.paid_by,
        category: row.category,
        createdAt: relativeTime(row.created_at),
        createdAtISO: row.created_at ?? undefined,
        createdById: row.created_by ?? undefined,
        participantPersonCount: Math.max(1, Number(row.participant_person_count ?? 1)),
        allocations: (shareRows ?? []).filter((share) => share.expense_id === row.id).map((share) => ({
          memberId: share.member_id,
          amount: Number(share.amount),
          label: share.item_label ?? undefined,
        })),
      }));
    const payments: SettlementPayment[] = (settlementRows ?? [])
      .filter((row) => row.story_id === story.id && row.status === 'paid')
      .map((row) => ({
        id: row.id,
        fromId: row.from_member_id,
        toId: row.to_member_id,
        amount: Number(row.amount),
        createdAt: relativeTime(row.paid_at ?? row.created_at),
      }));
    return {
      id: story.id,
      name: story.name,
      template: story.template,
      ownerId: story.owner_id,
      inviteCode: story.invite_code,
      members: storyMembers,
      expenses: storyExpenses,
      payments,
      status: story.status,
      completedAt: story.completed_at ? relativeTime(story.completed_at) : undefined,
    };
  });
}

export async function createOnlineStory(name: string, template: OnlineStory['template'], shareUnits: number, householdMembers: string[]) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.rpc('create_story', {
    story_name: name,
    story_template: template,
    owner_share_units: shareUnits,
  });
  if (error) throw error;
  const { error: householdError } = await supabase.rpc('set_current_household_members', {
    target_story_id: data,
    member_names: householdMembers,
  });
  if (householdError) throw householdError;
  return data as string;
}

export async function addOnlineGuest(storyId: string, name: string, shareUnits: number, householdMembers: string[]) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.rpc('add_guest_member', {
    target_story_id: storyId,
    guest_name: name,
    guest_share_units: shareUnits,
  });
  if (error) throw error;
  const { error: householdError } = await supabase.rpc('set_household_members', {
    target_member_id: data,
    member_names: householdMembers,
  });
  if (householdError) throw householdError;
  return data as string;
}

export async function updateOnlineMember(memberId: string, name: string, shareUnits: number, householdMembers: string[]) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase.rpc('update_story_member', {
    target_member_id: memberId,
    member_display_name: name.trim(),
    member_share_units: shareUnits,
  });
  if (error) throw error;
  const { error: householdError } = await supabase.rpc('set_household_members', {
    target_member_id: memberId,
    member_names: householdMembers,
  });
  if (householdError) throw householdError;
}

export async function deleteOnlineStory(storyId: string) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase.rpc('delete_story', { target_story_id: storyId });
  if (error) throw error;
}

export async function joinOnlineStory(inviteCode: string, shareUnits: number, householdMembers: string[]) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.rpc('join_story_by_code', {
    join_code: inviteCode.trim().toUpperCase(),
    member_share_units: shareUnits,
  });
  if (error) throw error;
  const { error: householdError } = await supabase.rpc('set_current_household_members', {
    target_story_id: data,
    member_names: householdMembers,
  });
  if (householdError) throw householdError;
  return data as string;
}

export async function createOnlineExpense(storyId: string, expense: Expense) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.rpc('create_story_expense', {
    target_story_id: storyId,
    expense_title: expense.title,
    expense_amount: expense.amount,
    expense_category: expense.category ?? 'other',
    payer_member_id: expense.payerId,
    allocations: (expense.allocations ?? []).map((allocation) => ({
      member_id: allocation.memberId,
      amount: allocation.amount,
      label: allocation.label ?? null,
    })),
  });
  if (error) throw error;
  const { error: participantCountError } = await supabase.rpc('set_expense_participant_person_count', {
    target_expense_id: data,
    person_count: Math.max(1, Math.round(expense.participantPersonCount ?? expense.allocations?.length ?? 1)),
  });
  if (participantCountError) throw participantCountError;
  return data as string;
}

export async function updateOnlineExpense(expenseId: string, expense: Expense) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase.rpc('update_story_expense', {
    target_expense_id: expenseId,
    expense_title: expense.title,
    expense_amount: expense.amount,
    expense_category: expense.category ?? 'other',
    payer_member_id: expense.payerId,
    allocations: (expense.allocations ?? []).map((allocation) => ({
      member_id: allocation.memberId,
      amount: allocation.amount,
      label: allocation.label ?? null,
    })),
    person_count: Math.max(1, Math.round(expense.participantPersonCount ?? expense.allocations?.length ?? 1)),
  });
  if (error) throw error;
}

export async function deleteOnlineExpense(expenseId: string) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase.rpc('delete_story_expense', { target_expense_id: expenseId });
  if (error) throw error;
}

export async function completeOnlineStory(storyId: string) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase.rpc('complete_story', { target_story_id: storyId });
  if (error) throw error;
}

export async function recordOnlinePayment(storyId: string, transfer: { fromId: string; toId: string; amount: number }) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.rpc('record_story_payment', {
    target_story_id: storyId,
    debtor_member_id: transfer.fromId,
    creditor_member_id: transfer.toId,
    payment_amount: transfer.amount,
  });
  if (error) throw error;
  return data as string;
}

export function subscribeToStoryChanges(onChange: () => void) {
  if (!supabase) return () => undefined;
  const client = supabase;
  const channel = client
    .channel('dongo-story-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'story_members' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_shares' }, onChange)
    // Settlements drive balances and notifications too; without this channel a
    // payment recorded by one member never reaches the other devices.
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements' }, onChange)
    .subscribe();
  return () => { void client.removeChannel(channel); };
}
