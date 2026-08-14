import { Estedad_400Regular } from '@expo-google-fonts/estedad/400Regular';
import { Estedad_500Medium } from '@expo-google-fonts/estedad/500Medium';
import { Estedad_600SemiBold } from '@expo-google-fonts/estedad/600SemiBold';
import { Estedad_700Bold } from '@expo-google-fonts/estedad/700Bold';
import { Estedad_800ExtraBold } from '@expo-google-fonts/estedad/800ExtraBold';
import { Estedad_900Black } from '@expo-google-fonts/estedad/900Black';
import { useFonts } from '@expo-google-fonts/estedad/useFonts';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as LucideIcons from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextProps,
  View,
} from 'react-native';
import {
  allocateByWeight,
  applySettlementPayments,
  calculateBalances,
  createSettlement,
  type Expense,
  type ExpenseCategory,
  type Member,
  type SettlementPayment,
  type Transfer,
} from './src/settlement';
import { AuthGate } from './src/AuthGate';
import { supabase } from './src/supabase';
import { preloadAccountBanner, preloadExpenseInterstitial, showExpenseInterstitial } from './src/tapsellAds';
import {
  addOnlineGuest,
  completeOnlineStory,
  createOnlineExpense,
  createOnlineStory,
  joinOnlineStory,
  loadOnlineStories,
  recordOnlinePayment,
  subscribeToStoryChanges,
  updateOnlineMember,
  deleteOnlineStory,
} from './src/storyRepository';

// SDK 54 pins react-native-svg 15.12, whose recursive icon prop types can
// overflow TypeScript 5.9 under newer Node runtimes. Runtime props remain the
// same; narrowing the third-party icon namespace here keeps app types stable.
const {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Bell,
  CarFront,
  Check,
  ChevronLeft,
  HandCoins,
  Home,
  MoreHorizontal,
  Pencil,
  PartyPopper,
  Plus,
  Copy,
  ReceiptText,
  LogOut,
  ShoppingBasket,
  Sparkles,
  Utensils,
  Users,
  UserPlus,
  Trash2,
  AlertTriangle,
  WalletCards,
  UserRound,
  X,
} = LucideIcons as Record<string, any>;

const C = {
  canvas: '#FFF8EF',
  paper: '#FFFFFF',
  ink: '#25203A',
  muted: '#777184',
  faint: '#A19BA9',
  line: '#EDE4D9',
  purple: '#6652D9',
  purpleDark: '#4936B6',
  purplePale: '#EEEAFE',
  coral: '#FF7A6B',
  coralPale: '#FFE9E5',
  mint: '#4FC7A4',
  mintDark: '#087A5B',
  mintPale: '#E4F7F0',
  yellow: '#FFC857',
  yellowPale: '#FFF2CE',
  debt: '#C84359',
  debtPale: '#FFE8EC',
};

const F = {
  regular: 'Estedad_400Regular',
  medium: 'Estedad_500Medium',
  semi: 'Estedad_600SemiBold',
  bold: 'Estedad_700Bold',
  extra: 'Estedad_800ExtraBold',
  black: 'Estedad_900Black',
};

const AVATAR_COLORS = ['#6652D9', '#FF7A6B', '#4FC7A4', '#F0A83A', '#4E82D8', '#A95AC2'];
const isLocalWebPreview = Platform.OS === 'web'
  && typeof window !== 'undefined'
  && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const CATEGORIES = [
  { id: 'food' as const, label: 'غذا', Icon: Utensils, color: '#E85F50', bg: C.coralPale },
  { id: 'stay' as const, label: 'اقامت', Icon: BedDouble, color: '#5946C8', bg: C.purplePale },
  { id: 'transport' as const, label: 'رفت‌وآمد', Icon: CarFront, color: '#168568', bg: C.mintPale },
  { id: 'shopping' as const, label: 'خرید', Icon: ShoppingBasket, color: '#B3770E', bg: C.yellowPale },
  { id: 'fun' as const, label: 'تفریح', Icon: PartyPopper, color: '#A84477', bg: '#FBE8F2' },
];

type SplitMode = 'equal' | 'custom' | 'itemized';

type ExpensePerson = {
  id: string;
  memberId: string;
  name: string;
  accountName: string;
};

type AccountNotification = {
  id: string;
  story: Story;
  type: 'debt' | 'credit';
  personName: string;
  amount: number;
};

type Story = {
  id: string;
  name: string;
  template: (typeof STORY_TEMPLATES)[number]['id'];
  members: Member[];
  expenses: Expense[];
  payments: SettlementPayment[];
  status: 'active' | 'completed';
  completedAt?: string;
  ownerId?: string;
  inviteCode?: string;
};

const STORY_TEMPLATES = [
  { id: 'restaurant', label: 'رستوران و کافه', emoji: '🍽️' },
  { id: 'trip', label: 'سفر', emoji: '🧳' },
  { id: 'cooking', label: 'دورهمی و آشپزی', emoji: '🍳' },
  { id: 'shopping', label: 'خرید مشترک', emoji: '🛍️' },
  { id: 'other', label: 'سایر', emoji: '✨' },
] as const;

const faNumber = new Intl.NumberFormat('fa-IR');

function AppText({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.defaultText, style]} />;
}

function formatMoney(amount: number) {
  return `${faNumber.format(Math.round(amount))} تومان`;
}

function initials(name: string) {
  return name.trim().slice(0, 1) || '؟';
}

function normalizeDigits(value: string) {
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  return value
    .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)))
    .replace(/[^0-9]/g, '');
}

function parseHouseholdNames(value: string) {
  return value.split(/[\n,،]+/).map((name) => name.trim()).filter(Boolean).slice(0, 20);
}

function categoryInfo(category?: ExpenseCategory) {
  return CATEGORIES.find((item) => item.id === category) ?? {
    id: 'other' as const,
    label: 'سایر',
    Icon: ReceiptText,
    color: C.purple,
    bg: C.purplePale,
  };
}

function Avatar({ member, size = 42, border = false }: { member?: Member; size?: number; border?: boolean }) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size * 0.36, backgroundColor: member?.color ?? C.purple },
        border && styles.avatarBorder,
      ]}
    >
      <AppText style={[styles.avatarText, { fontSize: size * 0.37 }]}>{initials(member?.name ?? '')}</AppText>
    </View>
  );
}

function CategoryBadge({ category, size = 48 }: { category?: ExpenseCategory; size?: number }) {
  const meta = categoryInfo(category);
  const Icon = meta.Icon;
  return (
    <View style={[styles.categoryBadge, { width: size, height: size, borderRadius: size * 0.34, backgroundColor: meta.bg }]}>
      <Icon size={size * 0.45} color={meta.color} strokeWidth={2.4} />
    </View>
  );
}

function DongoApp() {
  const [fontsLoaded] = useFonts({
    Estedad_400Regular,
    Estedad_500Medium,
    Estedad_600SemiBold,
    Estedad_700Bold,
    Estedad_800ExtraBold,
    Estedad_900Black,
  });
  const [storyName, setStoryName] = useState('');
  const [storyId, setStoryId] = useState('');
  const [stories, setStories] = useState<Story[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(true);
  const [storiesError, setStoriesError] = useState('');
  const [storyTemplate, setStoryTemplate] = useState<(typeof STORY_TEMPLATES)[number]['id']>('restaurant');
  const [newStoryTemplate, setNewStoryTemplate] = useState<(typeof STORY_TEMPLATES)[number]['id']>('restaurant');
  const [storyModal, setStoryModal] = useState(false);
  const [storySwitcher, setStorySwitcher] = useState(false);
  const [finishModal, setFinishModal] = useState(false);
  const [notificationsModal, setNotificationsModal] = useState(false);
  const [expenseDetailsModal, setExpenseDetailsModal] = useState(false);
  const [storiesHome, setStoriesHome] = useState(false);
  const [newStoryName, setNewStoryName] = useState('');
  const [newOwnerUnits, setNewOwnerUnits] = useState('1');
  const [ownerFamilyModal, setOwnerFamilyModal] = useState(false);
  const [ownerFamilyNames, setOwnerFamilyNames] = useState<string[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<SettlementPayment[]>([]);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [expenseFilter, setExpenseFilter] = useState<'all' | 'week' | 'mine'>('all');
  const [tab, setTab] = useState<'home' | 'expenses' | 'settlement' | 'account'>('home');
  const [expenseModal, setExpenseModal] = useState(false);
  const [memberModal, setMemberModal] = useState(false);
  const [editMemberModal, setEditMemberModal] = useState(false);
  const [deleteStoryModal, setDeleteStoryModal] = useState(false);
  const [memberMode, setMemberMode] = useState<'guest' | 'invite'>('guest');
  const [joinModal, setJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinUnits, setJoinUnits] = useState('1');
  const [joinHouseholdNameInputs, setJoinHouseholdNameInputs] = useState<string[]>([]);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [payerId, setPayerId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [shareInputs, setShareInputs] = useState<Record<string, string>>({});
  const [itemLabels, setItemLabels] = useState<Record<string, string>>({});
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberUnits, setNewMemberUnits] = useState('1');
  const [newHouseholdNameInputs, setNewHouseholdNameInputs] = useState<string[]>([]);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editMemberName, setEditMemberName] = useState('');
  const [editMemberUnits, setEditMemberUnits] = useState('1');
  const [editHouseholdNameInputs, setEditHouseholdNameInputs] = useState<string[]>([]);
  const activeStoryIdRef = useRef('');
  const [toast, setToast] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountCardNumber, setAccountCardNumber] = useState('');
  const [accountPhone, setAccountPhone] = useState('');
  const [accountLoading, setAccountLoading] = useState(true);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountError, setAccountError] = useState('');
  const lastBackPressAt = useRef(0);

  const balances = useMemo(() => applySettlementPayments(calculateBalances(members, expenses), payments), [members, expenses, payments]);
  const transfers = useMemo(() => createSettlement(balances), [balances]);
  const exactSettlement = balances.filter((balance) => balance.amount !== 0).length <= 12;
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const currentMember = members.find((member) => member.isMe) ?? members[0];
  const currentBalance = balances.find((balance) => balance.memberId === currentMember?.id)?.amount ?? 0;
  const numericAmount = Number(amount || 0);
  const expensePeople = useMemo<ExpensePerson[]>(() => members.flatMap((member) => {
    const count = Math.max(1, member.shareUnits ?? 1);
    const names = member.householdMembers?.filter(Boolean) ?? [];
    return Array.from({ length: count }, (_, index) => ({
      id: `${member.id}::${index}`,
      memberId: member.id,
      name: names[index] || (count === 1 ? (member.isMe ? 'من' : member.name) : `نفر ${faNumber.format(index + 1)}`),
      accountName: member.isMe ? 'حساب من' : member.name,
    }));
  }), [members]);
  const selectedShareUnits = selectedPersonIds.length;
  const totalShareUnits = members.reduce((sum, member) => sum + Math.max(1, member.shareUnits ?? 1), 0);
  const sharePreview = selectedShareUnits ? Math.ceil(numericAmount / selectedShareUnits) : 0;
  const enteredShareTotal = expensePeople.reduce((sum, person) => sum + Number(shareInputs[person.id] || 0), 0);
  const hasValidShares = splitMode === 'equal'
    ? selectedPersonIds.length > 0
    : enteredShareTotal === numericAmount && enteredShareTotal > 0;
  const isExpenseValid = numericAmount > 0 && Boolean(title.trim()) && Boolean(payerId) && hasValidShares;
  const memberById = (id: string) => members.find((member) => member.id === id);
  const activeStory = stories.find((story) => story.id === storyId);
  const storyCompleted = activeStory?.status === 'completed';
  const canManageGuests = Boolean(activeStory?.ownerId && activeStory.ownerId === currentMember?.userId);
  const notificationItems = useMemo<AccountNotification[]>(() => stories.flatMap((story) => {
    const storyBalances = applySettlementPayments(
      calculateBalances(story.members, story.expenses),
      story.payments ?? [],
    );
    const me = story.members.find((member) => member.isMe);
    if (!me) return [];
    return createSettlement(storyBalances).flatMap<AccountNotification>((transfer, index) => {
      if (transfer.toId === me.id) {
        const debtor = story.members.find((member) => member.id === transfer.fromId);
        return [{ id: `${story.id}-credit-${index}`, story, type: 'credit', personName: debtor?.name ?? 'یک نفر', amount: transfer.amount }];
      }
      if (transfer.fromId === me.id) {
        const creditor = story.members.find((member) => member.id === transfer.toId);
        return [{ id: `${story.id}-debt-${index}`, story, type: 'debt', personName: creditor?.name ?? 'یک نفر', amount: transfer.amount }];
      }
      return [];
    });
  }), [stories]);
  const filteredExpenses = expenses.filter((expense) => (
    expenseFilter === 'mine' ? expense.payerId === currentMember?.id : true
  ));

  function hydrateActiveStory(story: Story) {
    setStoryId(story.id);
    setStoryName(story.name);
    setStoryTemplate(story.template);
    setMembers(story.members);
    setExpenses(story.expenses);
    setPayments(story.payments ?? []);
    const me = story.members.find((member) => member.isMe) ?? story.members[0];
    setPayerId(me?.id ?? '');
    setSelectedIds(story.members.map((member) => member.id));
    const people = story.members.flatMap((member) => Array.from(
      { length: Math.max(1, member.shareUnits ?? 1) },
      (_, index) => `${member.id}::${index}`,
    ));
    setSelectedPersonIds(people);
  }

  async function syncFromCloud(preferredStoryId?: string, openStory = false) {
    setStoriesLoading(true);
    setStoriesError('');
    try {
      const onlineStories = await loadOnlineStories();
      setStories(onlineStories);
      const targetId = preferredStoryId ?? activeStoryIdRef.current;
      const target = onlineStories.find((story) => story.id === targetId);
      if (target) hydrateActiveStory(target);
      if (openStory && target) {
        setStoriesHome(false);
        setTab('home');
      } else if (!target && onlineStories.length > 0) {
        hydrateActiveStory(onlineStories[0]);
        setStoriesHome(true);
      } else if (onlineStories.length === 0) {
        activeStoryIdRef.current = '';
        setStoryId('');
        setStoryName('');
        setMembers([]);
        setExpenses([]);
        setPayments([]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'همگام‌سازی ماجراها ناموفق بود';
      setStoriesError(message);
      showToast(message);
    } finally {
      setStoriesLoading(false);
    }
  }

  async function loadAccount() {
    if (!supabase) return;
    setAccountLoading(true);
    setAccountError('');
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData.user;
    if (userError || !user) {
      setAccountError('دریافت اطلاعات حساب ناموفق بود.');
      setAccountLoading(false);
      return;
    }
    const [{ data: profile, error: profileError }, { data: paymentMethod, error: paymentError }] = await Promise.all([
      supabase.from('profiles').select('full_name, phone').eq('id', user.id).maybeSingle(),
      supabase.from('payment_methods').select('card_number').eq('user_id', user.id).maybeSingle(),
    ]);
    if (profileError || paymentError) {
      setAccountError('دریافت اطلاعات حساب ناموفق بود.');
    } else {
      setAccountName(profile?.full_name ?? '');
      setAccountPhone(profile?.phone ?? user.phone ?? '');
      setAccountCardNumber(paymentMethod?.card_number ?? '');
    }
    setAccountLoading(false);
  }

  async function saveAccount() {
    if (!supabase || accountSaving) return;
    const name = accountName.trim();
    const card = normalizeDigits(accountCardNumber);
    if (name.length < 2) {
      setAccountError('نام و نام خانوادگی اجباری است.');
      return;
    }
    if (card && card.length !== 16) {
      setAccountError('شماره کارت باید ۱۶ رقم باشد یا خالی بماند.');
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    setAccountSaving(true);
    setAccountError('');
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userData.user.id,
      full_name: name,
      phone: accountPhone || userData.user.phone,
      updated_at: new Date().toISOString(),
    });
    if (profileError) {
      setAccountSaving(false);
      setAccountError('ذخیره اطلاعات انجام نشد.');
      return;
    }
    const { error: paymentError } = card
      ? await supabase.from('payment_methods').upsert({ user_id: userData.user.id, card_number: card, updated_at: new Date().toISOString() })
      : await supabase.from('payment_methods').delete().eq('user_id', userData.user.id);
    setAccountSaving(false);
    if (paymentError) {
      setAccountError('ذخیره شماره کارت انجام نشد.');
      return;
    }
    showToast('اطلاعات حساب ذخیره شد');
  }

  async function signOut() {
    if (!supabase || cloudBusy) return;
    setCloudBusy(true);
    const { error } = await supabase.auth.signOut();
    setCloudBusy(false);
    if (error) showToast('خروج از حساب انجام نشد؛ دوباره تلاش کن.');
  }

  useEffect(() => {
    activeStoryIdRef.current = storyId;
  }, [storyId]);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    void syncFromCloud();
    const unsubscribe = subscribeToStoryChanges(() => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { void syncFromCloud(); }, 250);
    });
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribe();
    };
  }, []);

  useEffect(() => { void loadAccount(); }, []);

  useEffect(() => {
    if (Platform.OS === 'android') {
      void preloadExpenseInterstitial();
      void preloadAccountBanner();
    }
  }, []);

  function goBackInApp() {
    if (ownerFamilyModal) { setOwnerFamilyModal(false); setStoryModal(true); return true; }
    if (storyModal) { setStoryModal(false); return true; }
    if (joinModal) { setJoinModal(false); return true; }
    if (storySwitcher) { setStorySwitcher(false); return true; }
    if (finishModal) { setFinishModal(false); return true; }
    if (notificationsModal) { setNotificationsModal(false); return true; }
    if (expenseDetailsModal) { setExpenseDetailsModal(false); return true; }
    if (expenseModal) { setExpenseModal(false); return true; }
    if (memberModal) { setMemberModal(false); return true; }
    if (editMemberModal) { setEditMemberModal(false); return true; }
    if (deleteStoryModal) { setDeleteStoryModal(false); return true; }
    if (tab !== 'home') { setTab('home'); return true; }
    if (!storiesHome) { setStoriesHome(true); return true; }
    return false;
  }

  const canGoBackInApp = ownerFamilyModal || storyModal || joinModal || storySwitcher || finishModal || notificationsModal
    || expenseDetailsModal || expenseModal || memberModal || editMemberModal || deleteStoryModal
    || tab !== 'home' || !storiesHome;

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (goBackInApp()) return true;

      const now = Date.now();
      if (now - lastBackPressAt.current < 2000) return false;
      lastBackPressAt.current = now;
      showToast('برای خروج، یک‌بار دیگر دکمه بازگشت گوشی را بزن.');
      return true;
    });
    return () => subscription.remove();
  }, [ownerFamilyModal, storyModal, joinModal, storySwitcher, finishModal, notificationsModal, expenseDetailsModal, expenseModal, memberModal, editMemberModal, deleteStoryModal, tab, storiesHome]);

  useEffect(() => {
    if (!storyId) return;
    setStories((current) => current.map((story) => story.id === storyId
      ? { ...story, name: storyName, template: storyTemplate, members, expenses, payments }
      : story));
  }, [storyId, storyName, storyTemplate, members, expenses, payments]);

  if (!fontsLoaded) {
    return <View style={styles.loading}><StatusBar style="dark" /></View>;
  }

  function openExpenseModal() {
    if (storyCompleted) {
      showToast('این ماجرا تمام شده و فقط برای مرور در دسترس است');
      return;
    }
    setTitle('غذا');
    setAmount('');
    setCategory('food');
    setPayerId(currentMember?.id ?? members[0]?.id ?? '');
    setSelectedIds(members.map((member) => member.id));
    setSelectedPersonIds(members.map((member) => `${member.id}::0`));
    setSplitMode('equal');
    setShareInputs({});
    setItemLabels({});
    setExpenseModal(true);
  }

  function startStoryCreation() {
    const name = newStoryName.trim();
    if (!name || cloudBusy) return;
    const ownerUnits = Math.min(12, Math.max(1, Number(newOwnerUnits || 1)));
    if (ownerUnits > 1) {
      setOwnerFamilyNames(Array.from({ length: ownerUnits - 1 }, (_, index) => ownerFamilyNames[index] ?? ''));
      setStoryModal(false);
      setOwnerFamilyModal(true);
      return;
    }
    void createStory([]);
  }

  async function createStory(familyNames: string[]) {
    const name = newStoryName.trim();
    if (!name || cloudBusy) return;
    const ownerUnits = Math.min(12, Math.max(1, Number(newOwnerUnits || 1)));
    const cleanFamilyNames = familyNames.map((item) => item.trim());
    if (ownerUnits > 1 && (cleanFamilyNames.length !== ownerUnits - 1 || cleanFamilyNames.some((item) => item.length < 2))) {
      showToast('نام همه اعضای خانواده را وارد کن.');
      return;
    }

    if (isLocalWebPreview) {
      const previewId = `local-story-${Date.now()}`;
      const ownerDisplayName = accountName.trim() || 'من';
      const previewStory: Story = {
        id: previewId,
        name,
        template: newStoryTemplate,
        members: [{ id: `${previewId}-owner`, name: ownerDisplayName, color: AVATAR_COLORS[0], isMe: true, shareUnits: ownerUnits, kind: 'registered', userId: 'local-preview-user', householdMembers: [ownerDisplayName, ...cleanFamilyNames] }],
        expenses: [],
        payments: [],
        status: 'active',
        ownerId: 'local-preview-user',
        inviteCode: 'TESTLOCAL',
      };
      setStories((current) => [previewStory, ...current]);
      hydrateActiveStory(previewStory);
      setStoriesHome(false);
      setTab('home');
      setStoryModal(false);
      setOwnerFamilyModal(false);
      setStorySwitcher(false);
      setNewStoryName('');
      setNewOwnerUnits('1');
      setOwnerFamilyNames([]);
      showToast('ماجرای آزمایشی ساخته شد؛ پیامکی ارسال نمی‌شود.');
      return;
    }

    setCloudBusy(true);
    try {
      const ownerName = accountName.trim() || 'من';
      const nextStoryId = await createOnlineStory(name, newStoryTemplate, ownerUnits, [ownerName, ...cleanFamilyNames]);
      await syncFromCloud(nextStoryId, true);
      setStoryModal(false);
      setOwnerFamilyModal(false);
      setStorySwitcher(false);
      setNewStoryName('');
      setNewOwnerUnits('1');
      setOwnerFamilyNames([]);
      showToast('ماجرای آنلاین جدیدت آماده‌ست');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'ساخت ماجرا ناموفق بود');
    } finally {
      setCloudBusy(false);
    }
  }

  function openNewStory() {
    setNewStoryName('');
    setNewOwnerUnits('1');
    setNewStoryTemplate('restaurant');
    setOwnerFamilyNames([]);
    setOwnerFamilyModal(false);
    setStorySwitcher(false);
    setStoryModal(true);
  }

  function switchStory(story: Story) {
    hydrateActiveStory(story);
    setTab('home');
    setStoriesHome(false);
    setStorySwitcher(false);
    showToast(`وارد «${story.name}» شدی`);
  }

  async function finishStory() {
    if (!storyId || storyCompleted || cloudBusy) return;
    setCloudBusy(true);
    try {
      await completeOnlineStory(storyId);
      await syncFromCloud(storyId);
      setFinishModal(false);
      setStoriesHome(true);
      setTab('home');
      showToast(`ماجرای «${storyName}» با موفقیت تمام شد`);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'اتمام ماجرا ناموفق بود');
    } finally {
      setCloudBusy(false);
    }
  }

  function chooseCategory(nextCategory: ExpenseCategory) {
    setCategory(nextCategory);
    if (!title.trim() || CATEGORIES.some((item) => item.label === title.trim())) {
      setTitle(CATEGORIES.find((item) => item.id === nextCategory)?.label ?? 'هزینه');
    }
    void Haptics.selectionAsync();
  }

  function toggleParticipant(id: string) {
    setSelectedIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
    void Haptics.selectionAsync();
  }

  function toggleExpensePerson(id: string) {
    setSelectedPersonIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
    void Haptics.selectionAsync();
  }

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(''), 2800);
  }

  function openNotification(item: AccountNotification) {
    switchStory(item.story);
    setTab('settlement');
    setStoriesHome(false);
    setNotificationsModal(false);
  }

  async function markTransferPaid(transfer: Transfer) {
    if (!storyId || cloudBusy) return;
    setCloudBusy(true);
    try {
      await recordOnlinePayment(storyId, transfer);
      await syncFromCloud(storyId);
      showToast('پرداخت آنلاین ثبت شد و مانده‌حساب‌ها به‌روز شدند');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'ثبت پرداخت ناموفق بود');
    } finally {
      setCloudBusy(false);
    }
  }

  function openExpenseDetails(expense: Expense) {
    setSelectedExpense(expense);
    setExpenseDetailsModal(true);
  }

  async function addExpense() {
    if (!isExpenseValid || !storyId || cloudBusy) return;
    const allocations = splitMode === 'equal'
      ? (() => {
          const perPerson = allocateByWeight(numericAmount, expensePeople
            .filter((person) => selectedPersonIds.includes(person.id))
            .map((person) => ({ memberId: person.id, weight: 1 })));
          return members.flatMap((member) => {
            const people = perPerson.filter((allocation) => allocation.memberId.startsWith(`${member.id}::`));
            if (!people.length) return [];
            return [{
              memberId: member.id,
              amount: people.reduce((sum, person) => sum + person.amount, 0),
              label: people.map((person) => expensePeople.find((item) => item.id === person.memberId)?.name).filter(Boolean).join('، '),
            }];
          });
        })()
      : members.flatMap((member) => {
          const people = expensePeople
            .filter((person) => person.memberId === member.id)
            .map((person) => ({
              ...person,
              amount: Number(shareInputs[person.id] || 0),
              item: itemLabels[person.id]?.trim(),
            }))
            .filter((person) => person.amount > 0);
          if (!people.length) return [];
          return [{
            memberId: member.id,
            amount: people.reduce((sum, person) => sum + person.amount, 0),
            label: people.map((person) => splitMode === 'itemized' && person.item
              ? `${person.name}: ${person.item}`
              : person.name).join('، '),
          }];
        });
    const nextExpense: Expense = {
      id: '',
      title: title.trim(),
      amount: Math.round(numericAmount),
      payerId,
      allocations,
      createdAt: 'همین حالا',
      category,
      participantPersonCount: splitMode === 'equal'
        ? selectedPersonIds.length
        : expensePeople.filter((person) => Number(shareInputs[person.id] || 0) > 0).length,
    };

    if (isLocalWebPreview) {
      const localExpense = { ...nextExpense, id: `local-expense-${Date.now()}` };
      setExpenses((current) => [localExpense, ...current]);
      setExpenseModal(false);
      setTab('home');
      showToast('هزینه آزمایشی با اعضای انتخاب‌شده ثبت شد.');
      return;
    }
    setCloudBusy(true);
    try {
      await createOnlineExpense(storyId, nextExpense);
      await syncFromCloud(storyId);
      setExpenseModal(false);
      setTab('home');
      showToast('هزینه آنلاین ثبت شد و برای همه اعضا به‌روز شد');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void showExpenseInterstitial();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'ثبت هزینه ناموفق بود');
    } finally {
      setCloudBusy(false);
    }
  }

  async function addMember() {
    const name = newMemberName.trim();
    if (name.length < 2 || !storyId || cloudBusy) return;
    const shareUnits = Math.min(12, Math.max(1, Number(newMemberUnits || 1)));
    const additionalNames = newHouseholdNameInputs.map((item) => item.trim());
    if (additionalNames.length !== Math.max(0, shareUnits - 1) || additionalNames.some((item) => item.length < 2)) {
      showToast('نام همه اعضای خانواده را وارد کن.');
      return;
    }
    const householdMembers = [name, ...additionalNames];
    if (isLocalWebPreview) {
      const localMember: Member = {
        id: `local-member-${Date.now()}`,
        name,
        color: AVATAR_COLORS[members.length % AVATAR_COLORS.length],
        shareUnits,
        kind: 'guest',
        householdMembers,
      };
      setMembers((current) => [...current, localMember]);
      setNewMemberName('');
      setNewMemberUnits('1');
      setNewHouseholdNameInputs([]);
      setMemberModal(false);
      showToast(`${name} با اعضای خانواده اضافه شد`);
      return;
    }
    setCloudBusy(true);
    try {
      await addOnlineGuest(storyId, name, shareUnits, householdMembers);
      await syncFromCloud(storyId);
      setNewMemberName('');
      setNewMemberUnits('1');
      setNewHouseholdNameInputs([]);
      setMemberModal(false);
      showToast(`${name} به‌عنوان عضو بدون اپ اضافه شد`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'افزودن عضو ناموفق بود');
    } finally {
      setCloudBusy(false);
    }
  }

  function changeNewMemberUnits(value: string) {
    const normalized = normalizeDigits(value).replace(/^0+/, '');
    const shareUnits = normalized ? Math.min(12, Math.max(1, Number(normalized))) : 0;
    setNewMemberUnits(shareUnits ? String(shareUnits) : '');
    setNewHouseholdNameInputs((current) => Array.from(
      { length: Math.max(0, shareUnits - 1) },
      (_, index) => current[index] ?? '',
    ));
  }

  function openNewMemberModal() {
    setNewMemberName('');
    setNewMemberUnits('1');
    setNewHouseholdNameInputs([]);
    setMemberMode(canManageGuests ? 'guest' : 'invite');
    setMemberModal(true);
  }

  function openMemberEditor(member: Member) {
    if ((!canManageGuests && !member.isMe) || storyCompleted) return;
    const shareUnits = Math.max(1, member.shareUnits ?? 1);
    const fixedHeadName = member.householdMembers?.[0] || (member.isMe ? accountName.trim() || member.name : member.name);
    const savedAdditionalNames = member.householdMembers?.[0] === fixedHeadName
      ? member.householdMembers.slice(1)
      : (member.householdMembers ?? []);
    setEditingMember(member);
    setEditMemberName(member.name);
    setEditMemberUnits(String(shareUnits));
    setEditHouseholdNameInputs(Array.from({ length: Math.max(0, shareUnits - 1) }, (_, index) => savedAdditionalNames[index] ?? ''));
    setEditMemberModal(true);
  }

  function changeEditMemberUnits(value: string) {
    const normalized = normalizeDigits(value).replace(/^0+/, '');
    const shareUnits = normalized ? Math.min(12, Math.max(1, Number(normalized))) : 0;
    setEditMemberUnits(shareUnits ? String(shareUnits) : '');
    setEditHouseholdNameInputs((current) => Array.from(
      { length: Math.max(0, shareUnits - 1) },
      (_, index) => current[index] ?? '',
    ));
  }

  async function saveMemberEdit() {
    if (!editingMember || !storyId || cloudBusy) return;
    const name = editMemberName.trim();
    if (editingMember.kind === 'guest' && name.length < 2) return;
    const shareUnits = Math.min(12, Math.max(1, Number(editMemberUnits || 1)));
    const editableNames = editHouseholdNameInputs.map((item) => item.trim());
    if (editableNames.length !== Math.max(0, shareUnits - 1) || editableNames.some((item) => item.length < 2)) {
      showToast('نام همه اعضای خانواده را وارد کن.');
      return;
    }
    const fixedHeadName = editingMember.householdMembers?.[0] || accountName.trim() || editingMember.name;
    const householdMembers = [editingMember.kind === 'guest' ? name : fixedHeadName, ...editableNames];
    if (isLocalWebPreview) {
      setMembers((current) => current.map((member) => member.id === editingMember.id
        ? { ...member, name: name || member.name, shareUnits, householdMembers }
        : member));
      setEditMemberModal(false);
      setEditingMember(null);
      showToast('اطلاعات حساب و افراد آن ویرایش شد');
      return;
    }
    setCloudBusy(true);
    try {
      await updateOnlineMember(editingMember.id, name, shareUnits, householdMembers);
      await syncFromCloud(storyId);
      setEditMemberModal(false);
      setEditingMember(null);
      showToast('اطلاعات عضو ویرایش شد');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'ویرایش عضو ناموفق بود');
    } finally {
      setCloudBusy(false);
    }
  }

  async function deleteStory() {
    if (!storyId || !canManageGuests || cloudBusy) return;
    const deletedName = storyName;
    setCloudBusy(true);
    try {
      await deleteOnlineStory(storyId);
      activeStoryIdRef.current = '';
      setStoryId('');
      setStoryName('');
      setMembers([]);
      setExpenses([]);
      setPayments([]);
      setDeleteStoryModal(false);
      await syncFromCloud();
      setStoriesHome(true);
      setTab('home');
      showToast(`ماجرای «${deletedName}» حذف شد`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'حذف ماجرا ناموفق بود');
    } finally {
      setCloudBusy(false);
    }
  }

  async function joinStory() {
    const code = joinCode.trim().toUpperCase();
    const shareUnits = Math.min(12, Math.max(1, Number(joinUnits || 1)));
    const additionalNames = joinHouseholdNameInputs.slice(0, shareUnits - 1).map((name) => name.trim());
    if (!code || cloudBusy || additionalNames.some((name) => name.length < 2)) return;
    setCloudBusy(true);
    try {
      const joinedStoryId = await joinOnlineStory(code, shareUnits, [accountName.trim() || 'من', ...additionalNames]);
      await syncFromCloud(joinedStoryId, true);
      setJoinCode('');
      setJoinUnits('1');
      setJoinHouseholdNameInputs([]);
      setJoinModal(false);
      showToast('با موفقیت به ماجرا پیوستی');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'کد دعوت معتبر نیست');
    } finally {
      setCloudBusy(false);
    }
  }

  async function copyInviteCode() {
    if (!activeStory?.inviteCode) return;
    await Clipboard.setStringAsync(activeStory.inviteCode);
    showToast('کد دعوت کپی شد');
  }

  async function shareInviteCode() {
    if (!activeStory?.inviteCode) return;
    await Share.share({ message: `برای پیوستن به ماجرای «${activeStory.name}» در دنگودونگ، این کد را وارد کن: ${activeStory.inviteCode}` });
  }

  function renderExpense(expense: Expense) {
    const payer = memberById(expense.payerId);
    const participantCount = expense.participantPersonCount ?? expense.allocations?.length ?? expense.participantIds?.length ?? 0;
    return (
      <Pressable
        key={expense.id}
        accessibilityRole="button"
        accessibilityLabel={`${expense.title}، ${formatMoney(expense.amount)}، پرداخت‌کننده ${payer?.name}`}
        onPress={() => openExpenseDetails(expense)}
        style={({ pressed }) => [styles.expenseCard, pressed && styles.pressed]}
      >
        <CategoryBadge category={expense.category} />
        <View style={styles.expenseCopy}>
          <AppText style={styles.expenseTitle}>{expense.title}</AppText>
          <View style={styles.expensePayerRow}>
            <Avatar member={payer} size={20} />
            <AppText style={styles.expenseMeta}>{payer?.name} پرداخت کرد · {expense.createdAt}</AppText>
          </View>
        </View>
        <View style={styles.expenseValueBox}>
          <AppText style={styles.expenseAmount}>{formatMoney(expense.amount)}</AppText>
          <AppText style={styles.expenseSplit}>سهم {faNumber.format(participantCount)} نفر</AppText>
        </View>
        <ChevronLeft size={18} color={C.faint} />
      </Pressable>
    );
  }

  function renderStoryCard(story: Story) {
    const template = STORY_TEMPLATES.find((item) => item.id === story.template) ?? STORY_TEMPLATES[4];
    const storyTotal = story.expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const completed = story.status === 'completed';
    const peopleCount = story.members.reduce((sum, member) => sum + Math.max(1, member.shareUnits ?? 1), 0);
    return (
      <Pressable key={story.id} accessibilityRole="button" onPress={() => switchStory(story)} style={({ pressed }) => [styles.dashboardStoryCard, completed && styles.dashboardStoryCardCompleted, pressed && styles.pressed]}>
        <View style={[styles.dashboardStoryEmoji, completed && styles.dashboardStoryEmojiCompleted]}><AppText style={styles.dashboardStoryEmojiText}>{template.emoji}</AppText></View>
        <View style={styles.dashboardStoryCopy}>
          <View style={styles.dashboardStoryTitleRow}>{completed && <View style={styles.completedBadge}><Check size={11} color={C.mintDark} /><AppText style={styles.completedBadgeText}>تمام‌شده</AppText></View>}<AppText style={styles.dashboardStoryTitle}>{story.name}</AppText></View>
          <AppText style={styles.dashboardStoryMeta}>{faNumber.format(peopleCount)} نفر · {faNumber.format(story.members.length)} نماینده · {faNumber.format(story.expenses.length)} هزینه</AppText>
          <AppText style={styles.dashboardStoryTotal}>{formatMoney(storyTotal)}</AppText>
        </View>
        <ChevronLeft size={20} color={completed ? C.faint : C.purple} />
      </Pressable>
    );
  }

  function renderStoriesDashboard() {
    const ongoing = stories.filter((story) => story.status === 'active');
    const completed = stories.filter((story) => story.status === 'completed');
    return (
      <>
        <View style={styles.dashboardHero}>
          <View style={styles.dashboardHeroIcon}><WalletCards size={27} color={C.purple} /></View>
          <View style={styles.dashboardHeroCopy}><AppText style={styles.dashboardEyebrow}>همه‌چیز یک‌جا</AppText><AppText style={styles.dashboardTitle}>ماجراهای من</AppText><AppText style={styles.dashboardText}>ماجراهای در جریان را ادامه بده یا حساب ماجراهای قبلی را مرور کن.</AppText></View>
        </View>
        <View style={styles.dashboardActions}>
          <Pressable accessibilityRole="button" onPress={openNewStory} style={styles.dashboardNewStory}><Plus size={19} color="#FFFFFF" /><AppText style={styles.dashboardNewStoryText}>ساخت ماجرای جدید</AppText></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setJoinModal(true)} style={styles.dashboardJoinStory}><UserPlus size={18} color={C.purple} /><AppText style={styles.dashboardJoinStoryText}>پیوستن با کد</AppText></Pressable>
        </View>

        <View style={styles.dashboardSectionHead}><View style={styles.ongoingCount}><AppText style={styles.ongoingCountText}>{faNumber.format(ongoing.length)}</AppText></View><AppText style={styles.sectionTitle}>ماجراهای در جریان</AppText></View>
        <View style={styles.dashboardStoryList}>{ongoing.length ? ongoing.map(renderStoryCard) : <View style={styles.inlineEmpty}><AppText style={styles.inlineEmptyTitle}>ماجرای بازی نداری</AppText><AppText style={styles.inlineEmptyText}>یک ماجرای تازه بساز و دنگ‌ها را ثبت کن.</AppText></View>}</View>

        <View style={styles.dashboardSectionHead}><View style={styles.completedCount}><AppText style={styles.completedCountText}>{faNumber.format(completed.length)}</AppText></View><AppText style={styles.sectionTitle}>ماجراهای تمام‌شده</AppText></View>
        <View style={styles.dashboardStoryList}>{completed.length ? completed.map(renderStoryCard) : <View style={styles.inlineEmpty}><AppText style={styles.inlineEmptyTitle}>هنوز ماجرایی تمام نشده</AppText><AppText style={styles.inlineEmptyText}>بعد از تسویه، ماجراهای بسته‌شده اینجا می‌مانند.</AppText></View>}</View>
      </>
    );
  }

  function renderAccount() {
    return (
      <View style={styles.accountPage}>
        <View style={styles.accountHero}>
          <View style={styles.accountHeroIcon}><UserRound size={30} color="#FFFFFF" /></View>
          <View style={styles.accountHeroCopy}><AppText style={styles.accountTitle}>حساب کاربری</AppText><AppText style={styles.accountSubtitle}>اطلاعاتت فقط برای تجربه بهتر و تسویه دنگ‌ها استفاده می‌شود.</AppText></View>
        </View>
        {accountLoading ? <View style={styles.accountCard}><AppText style={styles.accountHint}>اطلاعات حساب در حال بارگذاری است…</AppText></View> : <View style={styles.accountCard}>
          <AppText style={styles.accountSectionTitle}>اطلاعات من</AppText>
          <AppText style={styles.accountLabel}>نام و نام خانوادگی <AppText style={styles.requiredMark}>*</AppText></AppText>
          <TextInput accessibilityLabel="نام و نام خانوادگی حساب کاربری" value={accountName} onChangeText={setAccountName} placeholder="مثلاً امیر رضایی" placeholderTextColor={C.faint} style={styles.accountInput} textAlign="right" />
          <AppText style={styles.accountLabel}>شماره موبایل</AppText>
          <View style={styles.readonlyField}><AppText style={styles.readonlyValue}>{accountPhone || '—'}</AppText><AppText style={styles.readonlyHint}>برای امنیت، تغییر شماره از همین بخش انجام نمی‌شود.</AppText></View>
          <AppText style={styles.accountLabel}>شماره کارت برای دریافت دنگ <AppText style={styles.optionalMark}>اختیاری</AppText></AppText>
          <TextInput accessibilityLabel="شماره کارت دریافت دنگ" value={accountCardNumber} onChangeText={(value) => setAccountCardNumber(normalizeDigits(value).slice(0, 16))} placeholder="۱۶ رقم بدون فاصله" placeholderTextColor={C.faint} keyboardType="number-pad" style={[styles.accountInput, styles.accountCardInput]} textAlign="center" />
          <AppText style={styles.accountHint}>رمز، CVV2 و تاریخ انقضا دریافت یا ذخیره نمی‌شوند.</AppText>
          {accountError ? <AppText style={styles.accountError}>{accountError}</AppText> : null}
          <Pressable accessibilityRole="button" disabled={accountSaving} onPress={() => void saveAccount()} style={({ pressed }) => [styles.accountSaveButton, pressed && styles.pressed, accountSaving && styles.saveButtonDisabled]}><AppText style={styles.accountSaveText}>{accountSaving ? 'در حال ذخیره…' : 'ذخیره تغییرات'}</AppText></Pressable>
        </View>}
        <Pressable accessibilityRole="button" disabled={cloudBusy} onPress={() => void signOut()} style={({ pressed }) => [styles.accountLogoutButton, pressed && styles.pressed, cloudBusy && { opacity: 0.65 }]}><LogOut size={18} color={C.debt} /><AppText style={styles.accountLogoutText}>خروج از حساب کاربری</AppText></Pressable>
      </View>
    );
  }

  function renderHome() {
    const positive = currentBalance >= 0;
    return (
      <>
        <LinearGradient colors={['#7562E7', '#5742C6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroBlobOne} />
          <View style={styles.heroBlobTwo} />
          <View style={styles.heroCopy}>
            <View style={styles.heroTag}>
              <Sparkles size={14} color="#FFE49B" fill="#FFE49B" />
              <AppText style={styles.heroTagText}>وضعیت حساب تو</AppText>
            </View>
            <AppText style={styles.heroLabel}>{positive ? 'در این ماجرا طلب داری' : 'در این ماجرا بدهکاری'}</AppText>
            <AppText style={styles.heroAmount}>{formatMoney(Math.abs(currentBalance))}</AppText>
            <AppText style={styles.heroHint}>{positive ? 'طلب‌هات برای این ماجرا اینجا جمع می‌شن ✨' : 'نگران نباش؛ آخر ماجرا یک‌جا تسویه کن'}</AppText>
          </View>
          <Image source={require('./assets/dong-mascot-optimized.png')} style={styles.heroMascot} resizeMode="contain" />
        </LinearGradient>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: C.yellowPale }]}>
            <View style={[styles.statIcon, { backgroundColor: C.yellow }]}><ReceiptText size={20} color={C.ink} /></View>
            <View style={styles.statCopy}>
              <AppText style={styles.statLabel}>کل هزینه ماجرا</AppText>
              <AppText style={styles.statValue}>{formatMoney(total)}</AppText>
            </View>
          </View>
          <View style={[styles.statCard, { backgroundColor: C.mintPale }]}>
            <View style={[styles.statIcon, { backgroundColor: C.mint }]}><Users size={20} color="#FFFFFF" /></View>
            <View style={styles.statCopy}>
              <AppText style={styles.statLabel}>اعضا</AppText>
              <AppText style={styles.statValue}>{faNumber.format(totalShareUnits)} نفر و {faNumber.format(members.length)} حساب</AppText>
            </View>
          </View>
        </View>

        <View style={styles.sectionHead}>
          {!storyCompleted ? <Pressable accessibilityRole="button" onPress={openNewMemberModal} style={styles.textButton}>
            <Plus size={15} color={C.purple} /><AppText style={styles.textButtonLabel}>افزودن نفر</AppText>
          </Pressable> : <View style={styles.completedBadge}><Check size={11} color={C.mintDark} /><AppText style={styles.completedBadgeText}>تمام‌شده</AppText></View>}
          <View style={styles.sectionTitleWrap}>
            <AppText style={styles.sectionEyebrow}>{storyName}</AppText>
            <AppText style={styles.sectionTitle}>اعضای این ماجرا</AppText>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.membersStrip}>
          {members.map((member) => {
            const balance = balances.find((item) => item.memberId === member.id)?.amount ?? 0;
            return (
              <Pressable key={member.id} accessibilityRole="button" accessibilityLabel={`ویرایش ${member.name}`} accessibilityState={{ disabled: (!canManageGuests && !member.isMe) || storyCompleted }} onPress={() => openMemberEditor(member)} style={({ pressed }) => [styles.memberCard, pressed && (canManageGuests || member.isMe) && !storyCompleted && styles.pressed]}>
                <Avatar member={member} size={48} />
                <View style={styles.memberCardCopy}>
                  <View style={styles.nameRow}>
                    {(canManageGuests || member.isMe) && !storyCompleted && <Pencil size={12} color={C.faint} />}
                    {member.isMe && <View style={styles.meBadge}><AppText style={styles.meText}>من</AppText></View>}
                    <AppText style={styles.memberCardName}>{member.name}</AppText>
                  </View>
                  <AppText style={[styles.memberBalance, { color: balance >= 0 ? C.mintDark : C.debt }]}>
                    {balance >= 0 ? 'طلبکار' : 'بدهکار'} · {faNumber.format(Math.abs(balance))}
                  </AppText>
                  <View style={styles.memberUnitsBadge}><Users size={11} color={C.purple} /><AppText style={styles.memberUnitsText}>{faNumber.format(member.shareUnits ?? 1)} سهم</AppText></View>
                  {(member.shareUnits ?? 1) > 1 && <AppText numberOfLines={2} style={styles.householdNamesPreview}>{member.householdMembers?.length ? member.householdMembers.join('، ') : 'برای ثبت اسم افراد، کارت را بزن'}</AppText>}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.sectionHeadSimple}>
          <Pressable accessibilityRole="button" onPress={() => setTab('expenses')}>
            <AppText style={styles.seeAll}>دیدن همه</AppText>
          </Pressable>
          <AppText style={styles.sectionTitle}>آخرین هزینه‌ها</AppText>
        </View>
        <View style={styles.expenseList}>
          {expenses.length ? expenses.slice(0, 3).map(renderExpense) : (
            <View style={styles.inlineEmpty}>
              <AppText style={styles.inlineEmptyTitle}>هنوز هزینه‌ای ثبت نشده</AppText>
              <AppText style={styles.inlineEmptyText}>{storyCompleted ? 'این ماجرا بدون هزینه ثبت‌شده به پایان رسیده است.' : 'اولین هزینه را ثبت کن تا دنگ‌ها محاسبه شوند.'}</AppText>
              {!storyCompleted && <Pressable accessibilityRole="button" style={styles.inlineEmptyButton} onPress={openExpenseModal}><Plus size={17} color="#FFFFFF" /><AppText style={styles.inlineEmptyButtonText}>ثبت اولین هزینه</AppText></Pressable>}
            </View>
          )}
        </View>
        {storyCompleted ? (
          <View style={styles.finishedNotice}><View style={styles.finishedNoticeIcon}><Check size={20} color={C.mintDark} /></View><View style={styles.finishedNoticeCopy}><AppText style={styles.finishedNoticeTitle}>این ماجرا تمام شده</AppText><AppText style={styles.finishedNoticeText}>اطلاعات برای مرور و تسویه نهایی نگه داشته شده‌اند.</AppText></View></View>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setFinishModal(true)} style={styles.finishStoryButton}><Check size={19} color={C.debt} /><View style={styles.finishStoryCopy}><AppText style={styles.finishStoryTitle}>اتمام ماجرا</AppText><AppText style={styles.finishStoryText}>وقتی همه هزینه‌ها ثبت شد، ماجرا را ببند.</AppText></View></Pressable>
        )}
        {canManageGuests && <Pressable accessibilityRole="button" onPress={() => setDeleteStoryModal(true)} style={styles.deleteStoryButton}><Trash2 size={18} color={C.debt} /><View style={styles.finishStoryCopy}><AppText style={styles.deleteStoryTitle}>حذف ماجرا</AppText><AppText style={styles.finishStoryText}>همه هزینه‌ها، اعضا و تسویه‌های این ماجرا حذف می‌شوند.</AppText></View></Pressable>}
      </>
    );
  }

  function renderExpenses() {
    return (
      <>
        <View style={styles.pageIntro}>
          <View style={styles.pageIcon}><ReceiptText size={26} color={C.purple} /></View>
          <View style={styles.pageIntroCopy}>
            <AppText style={styles.pageTitle}>هزینه‌های ماجرا</AppText>
            <AppText style={styles.pageSubtitle}>{faNumber.format(expenses.length)} هزینه · جمعاً {formatMoney(total)}</AppText>
          </View>
        </View>
        <View style={styles.filterRow}>
          {([
            { id: 'all', label: 'همه' },
            { id: 'week', label: 'این هفته' },
            { id: 'mine', label: 'پرداخت‌های من' },
          ] as const).map((filter) => {
            const active = expenseFilter === filter.id;
            return <Pressable key={filter.id} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setExpenseFilter(filter.id)} style={[styles.filterChip, active && styles.filterChipActive]}><AppText style={active ? styles.filterChipActiveText : styles.filterChipText}>{filter.label}</AppText></Pressable>;
          })}
        </View>
        <View style={styles.dateTitleRow}>
          <View style={styles.dateLine} />
          <AppText style={styles.dateTitle}>فعالیت‌های اخیر</AppText>
          <View style={styles.dateLine} />
        </View>
        <View style={styles.expenseList}>{filteredExpenses.length ? filteredExpenses.map(renderExpense) : (
          <View style={styles.inlineEmpty}><AppText style={styles.inlineEmptyTitle}>هزینه‌ای در این فیلتر نیست</AppText><AppText style={styles.inlineEmptyText}>{expenseFilter === 'mine' ? 'هنوز پرداختی با حساب تو ثبت نشده.' : 'با دکمه «هزینه جدید» شروع کن.'}</AppText></View>
        )}</View>
      </>
    );
  }

  function renderSettlement() {
    return (
      <>
        <View style={styles.settlementHero}>
          <View style={styles.settlementConfettiOne} />
          <View style={styles.settlementConfettiTwo} />
          <View style={styles.settlementHeroIcon}><HandCoins size={30} color={C.purple} /></View>
          <View style={styles.settlementHeroCopy}>
            <AppText style={styles.settlementKicker}>راه ساده‌ی تسویه</AppText>
            <AppText style={styles.settlementHeadline}>فقط با {faNumber.format(transfers.length)} انتقال، حساب‌ها صفر می‌شه</AppText>
            <AppText style={styles.settlementDescription}>{exactSettlement ? 'کمترین تعداد انتقال برای این ماجرا محاسبه شده.' : 'یک مسیر ساده و مستقیم برای تسویه پیشنهاد شده.'}</AppText>
          </View>
        </View>

        <View style={styles.balanceSummary}>
          {balances.map((balance) => {
            const member = memberById(balance.memberId);
            const positive = balance.amount >= 0;
            return (
              <View key={balance.memberId} style={styles.balancePill}>
                <Avatar member={member} size={34} />
                <View style={styles.balancePillCopy}>
                  <AppText style={styles.balancePillName}>{member?.name}</AppText>
                  <AppText style={[styles.balancePillValue, { color: positive ? C.mintDark : C.debt }]}>
                    {positive ? '+' : '−'}{faNumber.format(Math.abs(balance.amount))}
                  </AppText>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.sectionHeadSimple}>
          <View style={styles.optimizedBadge}><Check size={14} color={C.mintDark} /><AppText style={styles.optimizedText}>{exactSettlement ? 'کمینه قطعی' : 'پیشنهادی'}</AppText></View>
          <AppText style={styles.sectionTitle}>چه کسی به چه کسی؟</AppText>
        </View>
        <View style={styles.transferList}>
          {transfers.length === 0 ? (
            <View style={styles.emptyCard}>
              <Image source={require('./assets/dong-mascot-optimized.png')} style={styles.emptyMascot} resizeMode="contain" />
              <AppText style={styles.emptyTitle}>همه‌چی حسابه!</AppText>
              <AppText style={styles.emptyText}>هیچ پرداختی باقی نمونده.</AppText>
            </View>
          ) : transfers.map((transfer, index) => {
            const from = memberById(transfer.fromId);
            const to = memberById(transfer.toId);
            return (
              <View style={styles.transferCard} key={`${transfer.fromId}-${transfer.toId}-${index}`}>
                <View style={styles.stepBadge}><AppText style={styles.stepNumber}>{faNumber.format(index + 1)}</AppText></View>
                <View style={styles.transferPeople}>
                  <View style={styles.transferPerson}><Avatar member={from} size={44} /><AppText style={styles.transferName}>{from?.name}</AppText><AppText style={styles.transferRole}>پرداخت‌کننده</AppText></View>
                  <View style={styles.transferArrow}><ArrowLeft size={23} color={C.purple} strokeWidth={2.5} /></View>
                  <View style={styles.transferPerson}><Avatar member={to} size={44} /><AppText style={styles.transferName}>{to?.name}</AppText><AppText style={styles.transferRole}>دریافت‌کننده</AppText></View>
                </View>
                <View style={styles.transferDivider} />
                <View style={styles.transferFooter}>
                  <Pressable accessibilityRole="button" style={styles.paidButton} onPress={() => markTransferPaid(transfer)}>
                    <Check size={16} color={C.purple} /><AppText style={styles.paidButtonText}>پرداخت کردم</AppText>
                  </Pressable>
                  <View style={styles.transferAmountBox}>
                    <AppText style={styles.transferAmountLabel}>مبلغ انتقال</AppText>
                    <AppText style={styles.transferAmount}>{formatMoney(transfer.amount)}</AppText>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </>
    );
  }

  if (!storyName) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.welcomeBrand}>
          <View style={styles.brandCopy}><AppText style={styles.brandName}>دنگودونگ</AppText><AppText style={styles.brandTagline}>خرج کن، راحت تسویه کن</AppText></View>
          <View style={styles.brandMark}><WalletCards size={23} color="#FFFFFF" /></View>
        </View>
        {storiesLoading ? <View style={styles.storiesLoading}><AppText style={styles.welcomeTitle}>ماجراها در حال بارگذاری‌اند…</AppText><AppText style={styles.welcomeText}>چند لحظه صبر کن تا اطلاعات حسابت دریافت شود.</AppText></View> : storiesError ? <View style={styles.storiesLoading}><View style={styles.deleteDialogIcon}><AlertTriangle size={27} color={C.debt} /></View><AppText style={styles.welcomeTitle}>دریافت ماجراها ناموفق بود</AppText><AppText style={styles.welcomeText}>{storiesError}</AppText><Pressable accessibilityRole="button" style={styles.primaryStoryButton} onPress={() => void syncFromCloud()}><AppText style={styles.primaryStoryButtonText}>تلاش دوباره</AppText></Pressable></View> : <ScrollView contentContainerStyle={styles.welcomeContent} showsVerticalScrollIndicator={false}>
          <View style={styles.welcomeVisual}>
            <View style={styles.welcomeGlow} />
            <Image source={require('./assets/dong-mascot-optimized.png')} style={styles.welcomeMascot} resizeMode="contain" />
          </View>
          <View style={styles.welcomeCopy}>
            <AppText style={styles.welcomeTitle}>هنوز هیچ ماجرایی برای دنگ‌هات نساختی</AppText>
            <AppText style={styles.welcomeText}>از شام دوستانه تا سفر و خرید مشترک، حساب‌ها را اینجا مرتب کن.</AppText>
          </View>
          <Pressable accessibilityRole="button" style={styles.primaryStoryButton} onPress={openNewStory}>
            <Plus size={21} color="#FFFFFF" />
            <AppText style={styles.primaryStoryButtonText}>ساخت ماجرای جدید</AppText>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.secondaryStoryButton} onPress={() => setJoinModal(true)}>
            <UserPlus size={20} color={C.purple} />
            <AppText style={styles.secondaryStoryButtonText}>با کد دعوت به ماجرا بپیوند</AppText>
          </Pressable>
          <View style={styles.templatePreview}>
            {STORY_TEMPLATES.slice(0, 4).map((template) => (
              <View key={template.id} style={styles.templatePreviewItem}><AppText style={styles.templateEmoji}>{template.emoji}</AppText><AppText style={styles.templatePreviewText}>{template.label}</AppText></View>
            ))}
          </View>
        </ScrollView>}

        <Modal visible={storyModal} animationType="slide" transparent onRequestClose={() => setStoryModal(false)}>
          <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.storySheet} accessibilityViewIsModal>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <Pressable accessibilityRole="button" accessibilityLabel="بستن" style={styles.sheetClose} onPress={() => setStoryModal(false)}><X size={21} color={C.ink} /></Pressable>
                <View style={styles.sheetHeaderCopy}><AppText style={styles.sheetTitle}>ماجرای جدید</AppText><AppText style={styles.sheetSubtitle}>موضوع دنگ‌هات را مشخص کن</AppText></View>
                <View style={styles.sheetSpark}><Sparkles size={20} color={C.purple} /></View>
              </View>
              <ScrollView
                style={styles.sheetScroll}
                contentContainerStyle={styles.storyForm}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
              >
                <AppText style={styles.formLabel}>اسم این ماجرا چیه؟</AppText>
                <TextInput style={styles.formInput} value={newStoryName} onChangeText={setNewStoryName} placeholder="مثلاً شام جمعه" placeholderTextColor={C.faint} textAlign="right" autoFocus />
                <View style={styles.ownerUnitsRow}><View style={styles.memberUnitsFieldCopy}><AppText style={styles.formLabelNoMargin}>چند نفر با حساب من هستند؟</AppText><AppText style={styles.formHelper}>خودت عضو اصلی هستی؛ نام بقیه را در مرحله بعد می‌پرسیم.</AppText></View><TextInput accessibilityLabel="تعداد نفرات حساب من" style={styles.memberUnitsInput} value={newOwnerUnits} onChangeText={(value) => setNewOwnerUnits(String(Math.min(12, Number(normalizeDigits(value).replace(/^0+/, '') || 0)) || ''))} placeholder="۱" placeholderTextColor={C.faint} keyboardType="number-pad" textAlign="center" /></View>
                <AppText style={styles.formLabel}>چه جور ماجراییه؟</AppText>
                <View style={styles.storyTemplateGrid}>
                  {STORY_TEMPLATES.map((template) => {
                    const active = newStoryTemplate === template.id;
                    return <Pressable key={template.id} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => setNewStoryTemplate(template.id)} style={[styles.storyTemplate, active && styles.storyTemplateActive]}><AppText style={styles.storyTemplateEmoji}>{template.emoji}</AppText><AppText style={[styles.storyTemplateText, active && styles.storyTemplateTextActive]}>{template.label}</AppText>{active && <View style={styles.storyTemplateCheck}><Check size={11} color="#FFFFFF" /></View>}</Pressable>;
                  })}
                </View>
                <AppText style={styles.storyHelper}>نوع ماجرا فقط برای ظاهر و پیشنهادهای اولیه است؛ محاسبه دنگ‌ها همیشه یکسان انجام می‌شود.</AppText>
                <Pressable accessibilityRole="button" disabled={!newStoryName.trim()} onPress={startStoryCreation} style={[styles.createStoryButton, !newStoryName.trim() && styles.saveButtonDisabled]}><Check size={20} color="#FFFFFF" /><AppText style={styles.saveButtonText}>ساخت ماجرا</AppText></Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
        <Modal visible={ownerFamilyModal} animationType="fade" transparent onRequestClose={() => { setOwnerFamilyModal(false); setStoryModal(true); }}>
          <KeyboardAvoidingView style={styles.centeredBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.familySetupDialog} accessibilityViewIsModal>
              <View style={styles.familySetupHeader}><View style={styles.dialogIcon}><Users size={25} color={C.purple} /></View><View style={styles.familySetupCopy}><AppText style={styles.familyStepLabel}>مرحله ۲ از ۲</AppText><AppText style={styles.dialogTitle}>اعضای حساب تو</AppText><AppText style={styles.dialogTextCompact}>اسم‌ها باعث می‌شوند موقع ثبت خرج دقیقاً افراد حاضر را انتخاب کنی.</AppText></View></View>
              <View style={styles.familyHeadRow}><View style={styles.familyFixedBadge}><Check size={13} color={C.mintDark} /><AppText style={styles.familyFixedText}>ثابت</AppText></View><View style={styles.familyHeadCopy}><AppText style={styles.familyMemberLabel}>عضو ۱ · سرپرست حساب</AppText><AppText style={styles.familyHeadName}>{accountName.trim() || 'من (دارنده حساب)'}</AppText></View></View>
              <ScrollView style={styles.familyInputsScroll} contentContainerStyle={styles.familyInputsContent} keyboardShouldPersistTaps="handled">
                {ownerFamilyNames.map((value, index) => <View key={index} style={styles.familyInputRow}><AppText style={styles.familyInputLabel}>عضو {faNumber.format(index + 2)}</AppText><TextInput autoFocus={index === 0} value={value} onChangeText={(text) => setOwnerFamilyNames((current) => current.map((item, itemIndex) => itemIndex === index ? text : item))} style={styles.familyNameInput} placeholder={`نام عضو ${faNumber.format(index + 2)}`} placeholderTextColor={C.faint} textAlign="right" /></View>)}
              </ScrollView>
              <AppText style={styles.familySetupHint}>بعداً هم می‌توانی نام‌ها را ویرایش کنی؛ تسویه نهایی همیشه با حساب سرپرست انجام می‌شود.</AppText>
              <View style={styles.dialogActions}><Pressable accessibilityRole="button" style={styles.dialogCancel} onPress={() => { setOwnerFamilyModal(false); setStoryModal(true); }}><AppText style={styles.dialogCancelText}>مرحله قبل</AppText></Pressable><Pressable accessibilityRole="button" disabled={ownerFamilyNames.some((name) => name.trim().length < 2) || cloudBusy} style={[styles.dialogAdd, (ownerFamilyNames.some((name) => name.trim().length < 2) || cloudBusy) && styles.saveButtonDisabled]} onPress={() => void createStory(ownerFamilyNames)}><Check size={18} color="#FFFFFF" /><AppText style={styles.dialogAddText}>تأیید و ساخت ماجرا</AppText></Pressable></View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
        <Modal visible={joinModal} animationType="fade" transparent onRequestClose={() => setJoinModal(false)}>
          <KeyboardAvoidingView style={styles.centeredBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.dialog} accessibilityViewIsModal>
              <View style={styles.dialogIcon}><UserPlus size={26} color={C.purple} /></View>
              <AppText style={styles.dialogTitle}>پیوستن به ماجرا</AppText>
              <AppText style={styles.dialogText}>کدی را که سازنده ماجرا برایت فرستاده وارد کن.</AppText>
              <TextInput autoCapitalize="characters" autoCorrect={false} maxLength={8} style={[styles.formInput, styles.joinCodeInput]} value={joinCode} onChangeText={(value) => setJoinCode(value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())} placeholder="کد ۸ کاراکتری" placeholderTextColor={C.faint} textAlign="center" autoFocus />
              <View style={styles.memberUnitsField}><View style={styles.memberUnitsFieldCopy}><AppText style={styles.formLabelNoMargin}>چند نفر با حساب تو هستند؟</AppText><AppText style={styles.formHelper}>شامل خودت؛ حداکثر ۱۲ نفر</AppText></View><TextInput accessibilityLabel="تعداد نفرات حساب" style={styles.memberUnitsInput} value={joinUnits} onChangeText={(value) => { const normalized = normalizeDigits(value).replace(/^0+/, '').slice(0, 2); const count = Math.min(12, Math.max(1, Number(normalized || 1))); setJoinUnits(normalized); setJoinHouseholdNameInputs((current) => Array.from({ length: count - 1 }, (_, index) => current[index] ?? '')); }} placeholder="۱" placeholderTextColor={C.faint} keyboardType="number-pad" textAlign="center" /></View>
              {joinHouseholdNameInputs.map((value, index) => <View key={`join-home-${index}`} style={styles.familyInputRow}><AppText style={styles.familyInputLabel}>عضو {faNumber.format(index + 2)}</AppText><TextInput value={value} onChangeText={(text) => setJoinHouseholdNameInputs((current) => current.map((item, itemIndex) => itemIndex === index ? text : item))} style={styles.familyNameInput} placeholder={`نام عضو ${faNumber.format(index + 2)}`} placeholderTextColor={C.faint} textAlign="right" /></View>)}
              <View style={styles.dialogActions}>
                <Pressable accessibilityRole="button" style={styles.dialogCancel} onPress={() => setJoinModal(false)}><AppText style={styles.dialogCancelText}>انصراف</AppText></Pressable>
                <Pressable accessibilityRole="button" disabled={!joinCode.trim() || joinHouseholdNameInputs.some((name) => name.trim().length < 2) || cloudBusy} style={[styles.dialogAdd, (!joinCode.trim() || joinHouseholdNameInputs.some((name) => name.trim().length < 2) || cloudBusy) && styles.saveButtonDisabled]} onPress={joinStory}><UserPlus size={18} color="#FFFFFF" /><AppText style={styles.dialogAddText}>پیوستن</AppText></Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.topBar}>
        {canGoBackInApp ? (
          <Pressable accessibilityRole="button" accessibilityLabel="بازگشت به صفحه قبل" onPress={goBackInApp} style={styles.iconButton}><ArrowRight size={21} color={C.ink} /></Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={`اعلان‌ها، ${faNumber.format(notificationItems.length)} مورد`} onPress={() => setNotificationsModal(true)} style={styles.iconButton}><Bell size={21} color={C.ink} />{notificationItems.length > 0 && <View style={styles.notificationBadge}><AppText style={styles.notificationBadgeText}>{faNumber.format(notificationItems.length)}</AppText></View>}</Pressable>
        )}
        <View style={styles.brand}>
          <View style={styles.brandCopy}><AppText style={styles.brandName}>دنگودونگ</AppText><AppText style={styles.brandTagline}>خرج کن، راحت تسویه کن</AppText></View>
          <View style={styles.brandMark}><WalletCards size={23} color="#FFFFFF" /></View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="تعویض یا ساخت ماجرا" onPress={() => setStorySwitcher(true)} style={styles.iconButton}><MoreHorizontal size={22} color={C.ink} /></Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {storiesHome ? renderStoriesDashboard() : (
          <>
            {tab === 'home' && renderHome()}
            {tab === 'expenses' && renderExpenses()}
            {tab === 'settlement' && renderSettlement()}
            {tab === 'account' && renderAccount()}
          </>
        )}
        <View style={styles.scrollEnd} />
      </ScrollView>

      {toast ? (
        <View style={styles.toast} accessibilityLiveRegion="polite">
          <View style={styles.toastCheck}><Check size={15} color="#FFFFFF" /></View>
          <AppText style={styles.toastText}>{toast}</AppText>
        </View>
      ) : null}

      <View style={styles.bottomNav}>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: storiesHome }} onPress={() => { setStoriesHome(true); setTab('home'); }} style={styles.navItem}>
          <View style={[styles.navIconWrap, storiesHome && styles.navIconWrapActive]}><Home size={21} color={storiesHome ? C.purple : C.faint} fill={storiesHome ? C.purplePale : 'transparent'} /></View>
          <AppText style={[styles.navLabel, storiesHome && styles.navLabelActive]}>ماجراها</AppText>
        </Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: !storiesHome && tab === 'expenses' }} onPress={() => { setStoriesHome(false); setTab('expenses'); }} style={styles.navItem}>
          <View style={[styles.navIconWrap, tab === 'expenses' && styles.navIconWrapActive]}><ReceiptText size={21} color={tab === 'expenses' ? C.purple : C.faint} /></View>
          <AppText style={[styles.navLabel, tab === 'expenses' && styles.navLabelActive]}>خرج‌ها</AppText>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="ثبت خرج جدید" accessibilityState={{ disabled: storiesHome || storyCompleted }} disabled={storiesHome || storyCompleted} onPress={openExpenseModal} style={({ pressed }) => [styles.addNavItem, (storiesHome || storyCompleted) && styles.addNavDisabled, pressed && styles.addNavPressed]}>
          <View style={styles.addNavCircle}><Plus size={25} color="#FFFFFF" strokeWidth={2.8} /></View>
          <AppText style={styles.addNavLabel}>خرج جدید</AppText>
        </Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: !storiesHome && tab === 'settlement' }} onPress={() => { setStoriesHome(false); setTab('settlement'); }} style={styles.navItem}>
          <View style={[styles.navIconWrap, tab === 'settlement' && styles.navIconWrapActive]}><HandCoins size={22} color={tab === 'settlement' ? C.purple : C.faint} /></View>
          <AppText style={[styles.navLabel, tab === 'settlement' && styles.navLabelActive]}>تسویه</AppText>
        </Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: !storiesHome && tab === 'account' }} onPress={() => { setStoriesHome(false); setTab('account'); void loadAccount(); }} style={styles.navItem}>
          <View style={[styles.navIconWrap, tab === 'account' && styles.navIconWrapActive]}><UserRound size={21} color={tab === 'account' ? C.purple : C.faint} /></View>
          <AppText style={[styles.navLabel, tab === 'account' && styles.navLabelActive]}>حساب من</AppText>
        </Pressable>
      </View>

      <Modal visible={storySwitcher} animationType="fade" transparent onRequestClose={() => setStorySwitcher(false)}>
        <View style={styles.centeredBackdrop}>
          <View style={styles.storySwitcherCard} accessibilityViewIsModal>
            <View style={styles.switcherHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel="بستن" style={styles.sheetClose} onPress={() => setStorySwitcher(false)}><X size={20} color={C.ink} /></Pressable>
              <View style={styles.switcherHeaderCopy}><AppText style={styles.dialogTitle}>ماجراهای من</AppText><AppText style={styles.dialogTextCompact}>برای دیدن حساب‌ها، یک ماجرا را انتخاب کن.</AppText></View>
            </View>
            <ScrollView style={styles.storyList} contentContainerStyle={styles.storyListContent} showsVerticalScrollIndicator={false}>
              {stories.map((story) => {
                const template = STORY_TEMPLATES.find((item) => item.id === story.template) ?? STORY_TEMPLATES[4];
                const active = story.id === storyId;
                const storyTotal = story.expenses.reduce((sum, expense) => sum + expense.amount, 0);
                const peopleCount = story.members.reduce((sum, member) => sum + Math.max(1, member.shareUnits ?? 1), 0);
                return (
                  <Pressable key={story.id} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => switchStory(story)} style={[styles.storyListItem, active && styles.storyListItemActive]}>
                    <View style={styles.storyListEmoji}><AppText style={styles.storyTemplateEmoji}>{template.emoji}</AppText></View>
                    <View style={styles.storyListCopy}><View style={styles.storyListNameRow}>{active && <View style={styles.activeStoryBadge}><AppText style={styles.activeStoryBadgeText}>فعال</AppText></View>}<AppText style={styles.storyListName}>{story.name}</AppText></View><AppText style={styles.storyListMeta}>{faNumber.format(peopleCount)} نفر · {faNumber.format(story.members.length)} نماینده · {faNumber.format(story.expenses.length)} هزینه · {formatMoney(storyTotal)}</AppText></View>
                    <ChevronLeft size={19} color={active ? C.purple : C.faint} />
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable accessibilityRole="button" onPress={openNewStory} style={styles.newStoryFromSwitcher}><Plus size={20} color="#FFFFFF" /><AppText style={styles.newStoryFromSwitcherText}>ساخت ماجرای جدید</AppText></Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={notificationsModal} animationType="fade" transparent onRequestClose={() => setNotificationsModal(false)}>
        <View style={styles.centeredBackdrop}>
          <View style={styles.notificationsCard} accessibilityViewIsModal>
            <View style={styles.switcherHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel="بستن اعلان‌ها" style={styles.sheetClose} onPress={() => setNotificationsModal(false)}><X size={20} color={C.ink} /></Pressable>
              <View style={styles.switcherHeaderCopy}><AppText style={styles.dialogTitle}>اعلان‌های مالی</AppText><AppText style={styles.dialogTextCompact}>طلب‌ها و بدهی‌های تو در همه ماجراها</AppText></View>
              <View style={styles.notificationHeaderIcon}><Bell size={21} color={C.purple} /></View>
            </View>
            <ScrollView style={styles.notificationsList} contentContainerStyle={styles.notificationsListContent} showsVerticalScrollIndicator={false}>
              {notificationItems.length ? notificationItems.map((item) => (
                <Pressable key={item.id} accessibilityRole="button" onPress={() => openNotification(item)} style={styles.notificationItem}>
                  <View style={[styles.notificationTypeIcon, item.type === 'credit' ? styles.notificationCreditIcon : styles.notificationDebtIcon]}><ArrowLeft size={18} color={item.type === 'credit' ? C.mintDark : C.debt} /></View>
                  <View style={styles.notificationItemCopy}>
                    <View style={styles.notificationItemTitleRow}><View style={[styles.notificationTypeBadge, item.type === 'credit' ? styles.notificationCreditBadge : styles.notificationDebtBadge]}><AppText style={[styles.notificationTypeText, { color: item.type === 'credit' ? C.mintDark : C.debt }]}>{item.type === 'credit' ? 'طلب' : 'بدهی'}</AppText></View><AppText style={styles.notificationItemTitle}>{item.type === 'credit' ? `${item.personName} باید به تو پرداخت کند` : `تو باید به ${item.personName} پرداخت کنی`}</AppText></View>
                    <AppText style={styles.notificationItemAmount}>{formatMoney(item.amount)}</AppText>
                    <AppText style={styles.notificationItemStory}>بابت ماجرای «{item.story.name}»</AppText>
                  </View>
                  <ChevronLeft size={18} color={C.faint} />
                </Pressable>
              )) : (
                <View style={styles.notificationsEmpty}><Image source={require('./assets/dong-mascot-optimized.png')} style={styles.notificationsEmptyMascot} resizeMode="contain" /><AppText style={styles.emptyTitle}>اعلان مالی نداری</AppText><AppText style={styles.emptyText}>فعلاً نه بدهکاری و نه طلبی برای تو ثبت شده.</AppText></View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={expenseDetailsModal} animationType="fade" transparent onRequestClose={() => setExpenseDetailsModal(false)}>
        <View style={styles.centeredBackdrop}>
          <View style={styles.expenseDetailsCard} accessibilityViewIsModal>
            <View style={styles.switcherHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel="بستن جزئیات هزینه" style={styles.sheetClose} onPress={() => setExpenseDetailsModal(false)}><X size={20} color={C.ink} /></Pressable>
              <View style={styles.switcherHeaderCopy}><AppText style={styles.dialogTitle}>{selectedExpense?.title ?? 'جزئیات هزینه'}</AppText><AppText style={styles.dialogTextCompact}>{selectedExpense ? `${memberById(selectedExpense.payerId)?.name ?? ''} پرداخت کرد · ${selectedExpense.createdAt}` : ''}</AppText></View>
              <CategoryBadge category={selectedExpense?.category} size={45} />
            </View>
            {selectedExpense && <>
              <View style={styles.expenseDetailsTotal}><AppText style={styles.expenseDetailsTotalLabel}>مبلغ کل</AppText><AppText style={styles.expenseDetailsTotalValue}>{formatMoney(selectedExpense.amount)}</AppText></View>
              <AppText style={styles.expenseDetailsSectionTitle}>سهم حساب‌ها</AppText>
              <ScrollView style={styles.expenseAllocationsList} contentContainerStyle={styles.expenseAllocationsContent}>
                {(selectedExpense.allocations ?? []).map((allocation) => {
                  const member = memberById(allocation.memberId);
                  return <View key={allocation.memberId} style={styles.expenseAllocationRow}><Avatar member={member} size={39} /><View style={styles.expenseAllocationCopy}><AppText style={styles.expenseAllocationName}>{member?.isMe ? 'من' : member?.name}</AppText>{allocation.label && <AppText style={styles.expenseAllocationLabel}>{allocation.label}</AppText>}</View><AppText style={styles.expenseAllocationAmount}>{formatMoney(allocation.amount)}</AppText></View>;
                })}
              </ScrollView>
              <Pressable accessibilityRole="button" style={styles.expenseDetailsCloseButton} onPress={() => setExpenseDetailsModal(false)}><AppText style={styles.expenseDetailsCloseText}>متوجه شدم</AppText></Pressable>
            </>}
          </View>
        </View>
      </Modal>

      <Modal visible={storyModal} animationType="slide" transparent onRequestClose={() => setStoryModal(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.storySheet} accessibilityViewIsModal>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel="بستن" style={styles.sheetClose} onPress={() => setStoryModal(false)}><X size={21} color={C.ink} /></Pressable>
              <View style={styles.sheetHeaderCopy}><AppText style={styles.sheetTitle}>ماجرای جدید</AppText><AppText style={styles.sheetSubtitle}>موضوع دنگ‌هات را مشخص کن</AppText></View>
              <View style={styles.sheetSpark}><Sparkles size={20} color={C.purple} /></View>
            </View>
            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.storyForm}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
            >
              <AppText style={styles.formLabel}>اسم این ماجرا چیه؟</AppText>
              <TextInput style={styles.formInput} value={newStoryName} onChangeText={setNewStoryName} placeholder="مثلاً شام جمعه" placeholderTextColor={C.faint} textAlign="right" autoFocus />
              <View style={styles.ownerUnitsRow}><View style={styles.memberUnitsFieldCopy}><AppText style={styles.formLabelNoMargin}>چند نفر با حساب من هستند؟</AppText><AppText style={styles.formHelper}>خودت عضو اصلی هستی؛ نام بقیه را در مرحله بعد می‌پرسیم.</AppText></View><TextInput accessibilityLabel="تعداد نفرات حساب من" style={styles.memberUnitsInput} value={newOwnerUnits} onChangeText={(value) => setNewOwnerUnits(String(Math.min(12, Number(normalizeDigits(value).replace(/^0+/, '') || 0)) || ''))} placeholder="۱" placeholderTextColor={C.faint} keyboardType="number-pad" textAlign="center" /></View>
              <AppText style={styles.formLabel}>چه جور ماجراییه؟</AppText>
              <View style={styles.storyTemplateGrid}>
                {STORY_TEMPLATES.map((template) => {
                  const active = newStoryTemplate === template.id;
                  return <Pressable key={template.id} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => setNewStoryTemplate(template.id)} style={[styles.storyTemplate, active && styles.storyTemplateActive]}><AppText style={styles.storyTemplateEmoji}>{template.emoji}</AppText><AppText style={[styles.storyTemplateText, active && styles.storyTemplateTextActive]}>{template.label}</AppText>{active && <View style={styles.storyTemplateCheck}><Check size={11} color="#FFFFFF" /></View>}</Pressable>;
                })}
              </View>
              <AppText style={styles.storyHelper}>نوع ماجرا فقط برای ظاهر و پیشنهادهای اولیه است؛ محاسبه دنگ‌ها همیشه یکسان انجام می‌شود.</AppText>
              <Pressable accessibilityRole="button" disabled={!newStoryName.trim()} onPress={startStoryCreation} style={[styles.createStoryButton, !newStoryName.trim() && styles.saveButtonDisabled]}><Check size={20} color="#FFFFFF" /><AppText style={styles.saveButtonText}>ساخت ماجرا</AppText></Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={ownerFamilyModal} animationType="fade" transparent onRequestClose={() => { setOwnerFamilyModal(false); setStoryModal(true); }}>
        <KeyboardAvoidingView style={styles.centeredBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.familySetupDialog} accessibilityViewIsModal>
            <View style={styles.familySetupHeader}><View style={styles.dialogIcon}><Users size={25} color={C.purple} /></View><View style={styles.familySetupCopy}><AppText style={styles.familyStepLabel}>مرحله ۲ از ۲</AppText><AppText style={styles.dialogTitle}>اعضای حساب تو</AppText><AppText style={styles.dialogTextCompact}>اسم‌ها باعث می‌شوند موقع ثبت خرج دقیقاً افراد حاضر را انتخاب کنی.</AppText></View></View>
            <View style={styles.familyHeadRow}><View style={styles.familyFixedBadge}><Check size={13} color={C.mintDark} /><AppText style={styles.familyFixedText}>ثابت</AppText></View><View style={styles.familyHeadCopy}><AppText style={styles.familyMemberLabel}>عضو ۱ · سرپرست حساب</AppText><AppText style={styles.familyHeadName}>{accountName.trim() || 'من (دارنده حساب)'}</AppText></View></View>
            <ScrollView style={styles.familyInputsScroll} contentContainerStyle={styles.familyInputsContent} keyboardShouldPersistTaps="handled">
              {ownerFamilyNames.map((value, index) => <View key={index} style={styles.familyInputRow}><AppText style={styles.familyInputLabel}>عضو {faNumber.format(index + 2)}</AppText><TextInput autoFocus={index === 0} value={value} onChangeText={(text) => setOwnerFamilyNames((current) => current.map((item, itemIndex) => itemIndex === index ? text : item))} style={styles.familyNameInput} placeholder={`نام عضو ${faNumber.format(index + 2)}`} placeholderTextColor={C.faint} textAlign="right" /></View>)}
            </ScrollView>
            <AppText style={styles.familySetupHint}>بعداً هم می‌توانی نام‌ها را ویرایش کنی؛ تسویه نهایی همیشه با حساب سرپرست انجام می‌شود.</AppText>
            <View style={styles.dialogActions}><Pressable accessibilityRole="button" style={styles.dialogCancel} onPress={() => { setOwnerFamilyModal(false); setStoryModal(true); }}><AppText style={styles.dialogCancelText}>مرحله قبل</AppText></Pressable><Pressable accessibilityRole="button" disabled={ownerFamilyNames.some((name) => name.trim().length < 2) || cloudBusy} style={[styles.dialogAdd, (ownerFamilyNames.some((name) => name.trim().length < 2) || cloudBusy) && styles.saveButtonDisabled]} onPress={() => void createStory(ownerFamilyNames)}><Check size={18} color="#FFFFFF" /><AppText style={styles.dialogAddText}>تأیید و ساخت ماجرا</AppText></Pressable></View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={finishModal} animationType="fade" transparent onRequestClose={() => setFinishModal(false)}>
        <View style={styles.centeredBackdrop}>
          <View style={styles.finishDialog} accessibilityViewIsModal>
            <View style={styles.finishDialogIcon}><Check size={29} color={C.mintDark} /></View>
            <AppText style={styles.dialogTitle}>ماجرا تموم شد؟</AppText>
            <AppText style={styles.finishDialogText}>بعد از اتمام، «{storyName}» به بخش ماجراهای تمام‌شده می‌رود و هزینه جدیدی به آن اضافه نمی‌شود.</AppText>
            <View style={styles.finishSummaryRow}>
              <View style={styles.finishSummaryItem}><AppText style={styles.finishSummaryLabel}>کل هزینه</AppText><AppText style={styles.finishSummaryValue}>{formatMoney(total)}</AppText></View>
              <View style={styles.finishSummaryDivider} />
              <View style={styles.finishSummaryItem}><AppText style={styles.finishSummaryLabel}>انتقال باقی‌مانده</AppText><AppText style={styles.finishSummaryValue}>{faNumber.format(transfers.length)} انتقال</AppText></View>
            </View>
            {transfers.length > 0 && <View style={styles.finishWarning}><AppText style={styles.finishWarningText}>تسویه‌ها هنوز باقی مانده‌اند؛ بعداً هم می‌توانی آن‌ها را از صفحه تسویه ببینی.</AppText></View>}
            <View style={styles.dialogActions}>
              <Pressable accessibilityRole="button" style={styles.dialogCancel} onPress={() => setFinishModal(false)}><AppText style={styles.dialogCancelText}>فعلاً نه</AppText></Pressable>
              <Pressable accessibilityRole="button" style={styles.finishConfirmButton} onPress={finishStory}><Check size={18} color="#FFFFFF" /><AppText style={styles.dialogAddText}>بله، تمامش کن</AppText></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={deleteStoryModal} animationType="fade" transparent onRequestClose={() => setDeleteStoryModal(false)}>
        <View style={styles.centeredBackdrop}>
          <View style={styles.finishDialog} accessibilityViewIsModal>
            <View style={styles.deleteDialogIcon}><AlertTriangle size={29} color={C.debt} /></View>
            <AppText style={styles.dialogTitle}>این ماجرا حذف شود؟</AppText>
            <AppText style={styles.finishDialogText}>با حذف «{storyName}»، همه اعضا، هزینه‌ها و تسویه‌های آن برای همیشه پاک می‌شوند و قابل بازیابی نیستند.</AppText>
            <View style={styles.deleteWarning}><AppText style={styles.deleteWarningText}>این عملیات برگشت‌پذیر نیست.</AppText></View>
            <View style={styles.dialogActions}>
              <Pressable accessibilityRole="button" style={styles.dialogCancel} onPress={() => setDeleteStoryModal(false)}><AppText style={styles.dialogCancelText}>انصراف</AppText></Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: cloudBusy }} disabled={cloudBusy} style={[styles.deleteConfirmButton, cloudBusy && styles.saveButtonDisabled]} onPress={deleteStory}><Trash2 size={18} color="#FFFFFF" /><AppText style={styles.dialogAddText}>بله، حذف کن</AppText></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={editMemberModal} animationType="fade" transparent onRequestClose={() => setEditMemberModal(false)}>
        <KeyboardAvoidingView style={styles.centeredBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <View style={styles.dialogIcon}><Pencil size={24} color={C.purple} /></View>
            <AppText style={styles.dialogTitle}>ویرایش عضو</AppText>
            <AppText style={styles.dialogText}>{editingMember?.kind === 'guest' ? 'نام حساب و تعداد نفرات نمایندگی‌شده را تغییر بده.' : 'نام این عضو از پروفایل خودش گرفته می‌شود؛ تعداد نفرات حساب را می‌توانی تغییر بدهی.'}</AppText>
            <TextInput editable={editingMember?.kind === 'guest'} style={[styles.formInput, editingMember?.kind !== 'guest' && styles.readonlyInput]} value={editMemberName} onChangeText={setEditMemberName} placeholder="نام عضو" placeholderTextColor={C.faint} textAlign="right" />
            <View style={styles.memberUnitsField}><View style={styles.memberUnitsFieldCopy}><AppText style={styles.formLabelNoMargin}>تعداد نفرات این حساب</AppText><AppText style={styles.formHelper}>مبنای تقسیم مساوی هزینه‌های بعدی؛ حداکثر ۱۲ نفر</AppText></View><TextInput accessibilityLabel="تعداد نفرات این حساب" style={styles.memberUnitsInput} value={editMemberUnits} onChangeText={changeEditMemberUnits} placeholder="۱" placeholderTextColor={C.faint} keyboardType="number-pad" textAlign="center" /></View>
            {Number(editMemberUnits || 1) > 1 && <View style={styles.editFamilySection}><AppText style={styles.formLabelNoMargin}>اعضای این حساب</AppText><AppText style={styles.formHelper}>عضو ۱ سرپرست ثابت است؛ نام بقیه اعضا را جدا وارد کن.</AppText><View style={styles.editFamilyFixedRow}><View style={styles.familyFixedBadge}><Check size={13} color={C.mintDark} /><AppText style={styles.familyFixedText}>ثابت</AppText></View><View style={styles.editFamilyFixedCopy}><AppText style={styles.familyInputLabel}>عضو ۱ · سرپرست</AppText><AppText style={styles.editFamilyFixedName}>{editingMember?.kind === 'guest' ? editMemberName || 'سرپرست حساب' : editingMember?.householdMembers?.[0] || accountName.trim() || editingMember?.name || 'من'}</AppText></View></View><ScrollView style={styles.editFamilyInputsScroll} contentContainerStyle={styles.editFamilyInputsContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{editHouseholdNameInputs.map((value, index) => <View key={index} style={styles.familyInputRow}><AppText style={styles.familyInputLabel}>عضو {faNumber.format(index + 2)}</AppText><TextInput value={value} onChangeText={(text) => setEditHouseholdNameInputs((current) => current.map((item, itemIndex) => itemIndex === index ? text : item))} style={styles.familyNameInput} placeholder={`نام عضو ${faNumber.format(index + 2)}`} placeholderTextColor={C.faint} textAlign="right" /></View>)}</ScrollView></View>}
            <View style={styles.dialogActions}>
              <Pressable accessibilityRole="button" style={styles.dialogCancel} onPress={() => setEditMemberModal(false)}><AppText style={styles.dialogCancelText}>انصراف</AppText></Pressable>
              <Pressable accessibilityRole="button" disabled={cloudBusy || !editMemberUnits || editHouseholdNameInputs.some((name) => name.trim().length < 2) || (editingMember?.kind === 'guest' && editMemberName.trim().length < 2)} style={[styles.dialogAdd, (cloudBusy || !editMemberUnits || editHouseholdNameInputs.some((name) => name.trim().length < 2) || (editingMember?.kind === 'guest' && editMemberName.trim().length < 2)) && styles.saveButtonDisabled]} onPress={saveMemberEdit}><Check size={18} color="#FFFFFF" /><AppText style={styles.dialogAddText}>ذخیره تغییرات</AppText></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={expenseModal} animationType="slide" transparent onRequestClose={() => setExpenseModal(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel="بستن" style={styles.sheetClose} onPress={() => setExpenseModal(false)}><X size={21} color={C.ink} /></Pressable>
              <View style={styles.sheetHeaderCopy}><AppText style={styles.sheetTitle}>خرج جدید</AppText><AppText style={styles.sheetSubtitle}>اول مبلغ، بعد جزئیات ساده</AppText></View>
              <View style={styles.sheetSpark}><Sparkles size={20} color={C.purple} /></View>
            </View>

            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetScrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
              <View style={styles.amountPanel}>
                <AppText style={styles.amountLabel}>چقدر پرداخت شد؟</AppText>
                <View style={styles.amountInputRow}>
                  <AppText style={styles.amountUnit}>تومان</AppText>
                  <TextInput
                    accessibilityLabel="مبلغ هزینه به تومان"
                    style={styles.amountInput}
                    value={amount ? faNumber.format(Number(amount)) : ''}
                    onChangeText={(value) => setAmount(normalizeDigits(value).replace(/^0+/, ''))}
                    placeholder="۰"
                    placeholderTextColor="#B9B1C1"
                    keyboardType="number-pad"
                    textAlign="right"
                    autoFocus
                  />
                </View>
                {numericAmount > 0 && <AppText style={styles.amountHint}>سهم تقریبی هر نفر: {formatMoney(sharePreview)}</AppText>}
              </View>

              <AppText style={styles.formLabel}>برای چی بود؟</AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryChoices}>
                {CATEGORIES.map((item) => {
                  const Icon = item.Icon;
                  const active = category === item.id;
                  return (
                    <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => chooseCategory(item.id)} style={[styles.categoryChoice, active && styles.categoryChoiceActive]}>
                      <View style={[styles.categoryChoiceIcon, { backgroundColor: item.bg }]}><Icon size={20} color={item.color} /></View>
                      <AppText style={[styles.categoryChoiceLabel, active && styles.categoryChoiceLabelActive]}>{item.label}</AppText>
                      {active && <View style={styles.choiceCheck}><Check size={11} color="#FFFFFF" /></View>}
                    </Pressable>
                  );
                })}
              </ScrollView>

              <AppText style={styles.formLabel}>عنوان هزینه</AppText>
              <TextInput style={styles.formInput} value={title} onChangeText={setTitle} placeholder="مثلاً شام کنار دریا" placeholderTextColor={C.faint} textAlign="right" />

              <AppText style={styles.formLabel}>چه کسی پرداخت کرد؟</AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.personChoices}>
                {members.map((member) => {
                  const active = payerId === member.id;
                  return (
                    <Pressable key={member.id} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => setPayerId(member.id)} style={[styles.personChoice, active && styles.personChoiceActive]}>
                      <Avatar member={member} size={35} />
                      <AppText style={[styles.personChoiceName, active && styles.personChoiceNameActive]}>{member.isMe ? 'من' : member.name}</AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.splitHeader}><View><AppText style={styles.formLabelNoMargin}>چطور تقسیم بشه؟</AppText><AppText style={styles.formHelper}>سهم هر نفر را مشخص کن</AppText></View></View>
              <View style={styles.splitModeRow}>
                {([
                  { id: 'equal', label: 'مساوی' },
                  { id: 'custom', label: 'مبلغ دلخواه' },
                  { id: 'itemized', label: 'ریز اقلام' },
                ] as const).map((mode) => <Pressable key={mode.id} accessibilityRole="radio" accessibilityState={{ selected: splitMode === mode.id }} onPress={() => setSplitMode(mode.id)} style={[styles.splitModeButton, splitMode === mode.id && styles.splitModeButtonActive]}><AppText style={[styles.splitModeText, splitMode === mode.id && styles.splitModeTextActive]}>{mode.label}</AppText></Pressable>)}
              </View>

              {splitMode === 'equal' ? (
                <>
                  <View style={styles.splitHeader}><View style={styles.equalBadge}><AppText style={styles.equalBadgeText}>حدوداً هر نفر: {formatMoney(sharePreview)}</AppText></View><View><AppText style={styles.formLabelNoMargin}>چه کسانی در این هزینه بودند؟</AppText><AppText style={styles.formHelper}>{faNumber.format(selectedShareUnits)} نفر انتخاب شده؛ سرپرست هر حساب از ابتدا فعال است.</AppText></View></View>
                  <View style={styles.householdAccountsList}>
                    {members.map((member) => <View key={member.id} style={styles.householdAccountCard}>
                      <View style={styles.householdAccountHead}><Avatar member={member} size={36} /><View style={styles.householdAccountCopy}><AppText style={styles.householdAccountName}>{member.isMe ? 'حساب من' : member.name}</AppText><AppText style={styles.householdAccountHint}>{faNumber.format(member.shareUnits ?? 1)} نفر در این حساب</AppText></View></View>
                      <View style={styles.personNameChips}>{expensePeople.filter((person) => person.memberId === member.id).map((person) => {
                        const active = selectedPersonIds.includes(person.id);
                        return <Pressable key={person.id} accessibilityRole="checkbox" accessibilityState={{ checked: active }} onPress={() => toggleExpensePerson(person.id)} style={[styles.personNameChip, active && styles.personNameChipActive]}><AppText style={[styles.personNameChipText, active && styles.personNameChipTextActive]}>{person.name}</AppText>{active && <Check size={12} color="#FFFFFF" />}</Pressable>;
                      })}</View>
                    </View>)}
                  </View>
                </>
              ) : (
                <View style={styles.shareList}>
                  {members.map((member) => <View key={member.id} style={styles.householdShareGroup}>
                    <View style={styles.householdAccountHead}><Avatar member={member} size={36} /><View style={styles.householdAccountCopy}><AppText style={styles.householdAccountName}>{member.isMe ? 'حساب من' : member.name}</AppText><AppText style={styles.householdAccountHint}>مبلغ هر فرد را جدا وارد کن</AppText></View></View>
                    {expensePeople.filter((person) => person.memberId === member.id).map((person) => <View key={person.id} style={styles.personShareRow}>
                      <View style={styles.personShareIdentity}><View style={styles.personMiniAvatar}><AppText style={styles.personMiniAvatarText}>{initials(person.name)}</AppText></View><AppText style={styles.personShareName}>{person.name}</AppText></View>
                      <View style={styles.shareFields}>
                        {splitMode === 'itemized' && <TextInput value={itemLabels[person.id] ?? ''} onChangeText={(value) => setItemLabels((current) => ({ ...current, [person.id]: value }))} style={styles.itemLabelInput} placeholder="مثلاً پاستا" placeholderTextColor={C.faint} textAlign="right" />}
                        <View style={styles.shareAmountWrap}><AppText style={styles.shareUnit}>تومان</AppText><TextInput value={shareInputs[person.id] ? faNumber.format(Number(shareInputs[person.id])) : ''} onChangeText={(value) => setShareInputs((current) => ({ ...current, [person.id]: normalizeDigits(value).replace(/^0+/, '') }))} style={styles.shareAmountInput} placeholder="۰" placeholderTextColor={C.faint} keyboardType="number-pad" textAlign="right" /></View>
                      </View>
                    </View>)}
                  </View>)}
                  <View style={[styles.shareTotal, enteredShareTotal === numericAmount && numericAmount > 0 ? styles.shareTotalValid : styles.shareTotalInvalid]}><AppText style={styles.shareTotalLabel}>جمع سهم‌ها</AppText><AppText style={styles.shareTotalValue}>{formatMoney(enteredShareTotal)} از {formatMoney(numericAmount)}</AppText></View>
                </View>
              )}
            </ScrollView>

            <View style={styles.sheetFooter}>
              <View style={styles.footerPreview}><AppText style={styles.footerPreviewLabel}>{splitMode === 'equal' ? 'مجموع سهم' : 'جمع سهم‌ها'}</AppText><AppText style={styles.footerPreviewValue}>{splitMode === 'equal' ? `${faNumber.format(selectedShareUnits)} سهم` : formatMoney(enteredShareTotal)}</AppText></View>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: !isExpenseValid }} disabled={!isExpenseValid} onPress={addExpense} style={({ pressed }) => [styles.saveButton, !isExpenseValid && styles.saveButtonDisabled, pressed && isExpenseValid && styles.pressed]}>
                <Check size={20} color="#FFFFFF" /><AppText style={styles.saveButtonText}>ثبت و محاسبه دنگ</AppText>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={memberModal} animationType="fade" transparent onRequestClose={() => setMemberModal(false)}>
        <KeyboardAvoidingView style={styles.centeredBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <View style={styles.dialogIcon}><Users size={26} color={C.purple} /></View>
            <AppText style={styles.dialogTitle}>عضو جدید</AppText>
            <View style={styles.memberModeTabs}>
              <Pressable disabled={!canManageGuests} onPress={() => setMemberMode('guest')} style={[styles.memberModeTab, memberMode === 'guest' && styles.memberModeTabActive, !canManageGuests && styles.memberModeTabDisabled]}><AppText style={memberMode === 'guest' ? styles.memberModeTabTextActive : styles.memberModeTabText}>عضو بدون اپ</AppText></Pressable>
              <Pressable onPress={() => setMemberMode('invite')} style={[styles.memberModeTab, memberMode === 'invite' && styles.memberModeTabActive]}><AppText style={memberMode === 'invite' ? styles.memberModeTabTextActive : styles.memberModeTabText}>دعوت عضو اپ</AppText></Pressable>
            </View>
            {memberMode === 'guest' ? (
              <>
                <AppText style={styles.dialogText}>برای فرد یا خانواده‌ای که اپ ندارد یک حساب نمایندگی بساز.</AppText>
                <AppText style={styles.familyMemberLabel}>عضو ۱ · سرپرست حساب</AppText>
                <TextInput accessibilityLabel="نام سرپرست حساب جدید" style={styles.formInput} value={newMemberName} onChangeText={setNewMemberName} placeholder="نام سرپرست خانواده" placeholderTextColor={C.faint} textAlign="right" autoFocus />
                <View style={styles.memberUnitsField}><View style={styles.memberUnitsFieldCopy}><AppText style={styles.formLabelNoMargin}>تعداد نفرات این حساب</AppText><AppText style={styles.formHelper}>سرپرست هم جزو تعداد است؛ حداکثر ۱۲ نفر</AppText></View><TextInput accessibilityLabel="تعداد نفرات این حساب" style={styles.memberUnitsInput} value={newMemberUnits} onChangeText={changeNewMemberUnits} placeholder="۱" placeholderTextColor={C.faint} keyboardType="number-pad" textAlign="center" /></View>
                {Number(newMemberUnits || 1) > 1 && <View style={styles.newMemberFamilySection}><AppText style={styles.formLabelNoMargin}>اعضای دیگر خانواده</AppText><AppText style={styles.formHelper}>برای عضو ۲، ۳ و… نام جداگانه وارد کن.</AppText><ScrollView style={styles.newMemberFamilyScroll} contentContainerStyle={styles.editFamilyInputsContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{newHouseholdNameInputs.map((value, index) => <View key={index} style={styles.familyInputRow}><AppText style={styles.familyInputLabel}>عضو {faNumber.format(index + 2)}</AppText><TextInput value={value} onChangeText={(text) => setNewHouseholdNameInputs((current) => current.map((item, itemIndex) => itemIndex === index ? text : item))} style={styles.familyNameInput} placeholder={`نام عضو ${faNumber.format(index + 2)}`} placeholderTextColor={C.faint} textAlign="right" /></View>)}</ScrollView></View>}
                <View style={styles.dialogActions}>
                  <Pressable accessibilityRole="button" style={styles.dialogCancel} onPress={() => setMemberModal(false)}><AppText style={styles.dialogCancelText}>انصراف</AppText></Pressable>
                  <Pressable accessibilityRole="button" accessibilityState={{ disabled: newMemberName.trim().length < 2 || !newMemberUnits || newHouseholdNameInputs.some((name) => name.trim().length < 2) || cloudBusy }} style={[styles.dialogAdd, (newMemberName.trim().length < 2 || !newMemberUnits || newHouseholdNameInputs.some((name) => name.trim().length < 2) || cloudBusy) && styles.saveButtonDisabled]} disabled={newMemberName.trim().length < 2 || !newMemberUnits || newHouseholdNameInputs.some((name) => name.trim().length < 2) || cloudBusy} onPress={addMember}><Plus size={18} color="#FFFFFF" /><AppText style={styles.dialogAddText}>افزودن حساب</AppText></Pressable>
                </View>
              </>
            ) : (
              <>
                <AppText style={styles.dialogText}>این کد را برای کسی بفرست که دنگودونگ را نصب دارد؛ بعد از ورود، خودش به ماجرا اضافه می‌شود.</AppText>
                <View style={styles.inviteCodeCard}><AppText style={styles.inviteCodeLabel}>کد دعوت ماجرا</AppText><AppText selectable style={styles.inviteCodeValue}>{activeStory?.inviteCode ?? '--------'}</AppText></View>
                <View style={styles.inviteActions}>
                  <Pressable accessibilityRole="button" style={styles.inviteSecondaryButton} onPress={copyInviteCode}><Copy size={17} color={C.purple} /><AppText style={styles.inviteSecondaryText}>کپی کد</AppText></Pressable>
                  <Pressable accessibilityRole="button" style={styles.invitePrimaryButton} onPress={shareInviteCode}><UserPlus size={17} color="#FFFFFF" /><AppText style={styles.invitePrimaryText}>ارسال دعوت</AppText></Pressable>
                </View>
                <Pressable accessibilityRole="button" style={styles.inviteCloseButton} onPress={() => setMemberModal(false)}><AppText style={styles.dialogCancelText}>بستن</AppText></Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={joinModal} animationType="fade" transparent onRequestClose={() => setJoinModal(false)}>
        <KeyboardAvoidingView style={styles.centeredBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <View style={styles.dialogIcon}><UserPlus size={26} color={C.purple} /></View>
            <AppText style={styles.dialogTitle}>پیوستن به ماجرا</AppText>
            <AppText style={styles.dialogText}>کدی را که سازنده ماجرا برایت فرستاده وارد کن.</AppText>
            <TextInput autoCapitalize="characters" autoCorrect={false} maxLength={8} style={[styles.formInput, styles.joinCodeInput]} value={joinCode} onChangeText={(value) => setJoinCode(value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())} placeholder="کد ۸ کاراکتری" placeholderTextColor={C.faint} textAlign="center" autoFocus />
            <View style={styles.memberUnitsField}><View style={styles.memberUnitsFieldCopy}><AppText style={styles.formLabelNoMargin}>چند نفر با حساب تو هستند؟</AppText><AppText style={styles.formHelper}>شامل خودت؛ حداکثر ۱۲ نفر</AppText></View><TextInput accessibilityLabel="تعداد نفرات حساب" style={styles.memberUnitsInput} value={joinUnits} onChangeText={(value) => { const normalized = normalizeDigits(value).replace(/^0+/, '').slice(0, 2); const count = Math.min(12, Math.max(1, Number(normalized || 1))); setJoinUnits(normalized); setJoinHouseholdNameInputs((current) => Array.from({ length: count - 1 }, (_, index) => current[index] ?? '')); }} placeholder="۱" placeholderTextColor={C.faint} keyboardType="number-pad" textAlign="center" /></View>
            {joinHouseholdNameInputs.map((value, index) => <View key={`join-story-${index}`} style={styles.familyInputRow}><AppText style={styles.familyInputLabel}>عضو {faNumber.format(index + 2)}</AppText><TextInput value={value} onChangeText={(text) => setJoinHouseholdNameInputs((current) => current.map((item, itemIndex) => itemIndex === index ? text : item))} style={styles.familyNameInput} placeholder={`نام عضو ${faNumber.format(index + 2)}`} placeholderTextColor={C.faint} textAlign="right" /></View>)}
            <View style={styles.dialogActions}>
              <Pressable accessibilityRole="button" style={styles.dialogCancel} onPress={() => setJoinModal(false)}><AppText style={styles.dialogCancelText}>انصراف</AppText></Pressable>
              <Pressable accessibilityRole="button" disabled={!joinCode.trim() || joinHouseholdNameInputs.some((name) => name.trim().length < 2) || cloudBusy} style={[styles.dialogAdd, (!joinCode.trim() || joinHouseholdNameInputs.some((name) => name.trim().length < 2) || cloudBusy) && styles.saveButtonDisabled]} onPress={joinStory}><UserPlus size={18} color="#FFFFFF" /><AppText style={styles.dialogAddText}>پیوستن</AppText></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  defaultText: { fontFamily: F.regular, color: C.ink, writingDirection: 'rtl' },
  loading: { flex: 1, backgroundColor: C.canvas },
  safeArea: { flex: 1, backgroundColor: C.canvas, paddingTop: Platform.OS === 'android' ? 24 : 0 },
  topBar: { height: 72, paddingHorizontal: 18, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.canvas },
  iconButton: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.paper, borderWidth: 1, borderColor: C.line },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandCopy: { alignItems: 'flex-end' },
  brandName: { fontFamily: F.black, fontSize: 19, lineHeight: 28 },
  brandTagline: { fontFamily: F.medium, color: C.muted, fontSize: 10, lineHeight: 16 },
  brandMark: { width: 42, height: 42, borderRadius: 15, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-4deg' }] },
  content: { paddingHorizontal: 18, paddingTop: 8 },
  hero: { height: 226, borderRadius: 30, overflow: 'hidden', padding: 21, position: 'relative', shadowColor: C.purpleDark, shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 9 }, elevation: 7 },
  heroBlobOne: { position: 'absolute', width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(255,255,255,0.09)', left: -55, top: -65 },
  heroBlobTwo: { position: 'absolute', width: 94, height: 94, borderRadius: 47, backgroundColor: 'rgba(255,200,87,0.18)', right: 96, bottom: -50 },
  heroCopy: { alignSelf: 'flex-end', alignItems: 'flex-end', width: '65%', zIndex: 2 },
  heroTag: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(31,20,89,0.28)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 13 },
  heroTagText: { fontFamily: F.semi, color: '#FFFFFF', fontSize: 11 },
  heroLabel: { fontFamily: F.medium, color: '#E8E3FF', fontSize: 13, marginTop: 13 },
  heroAmount: { fontFamily: F.black, color: '#FFFFFF', fontSize: 25, lineHeight: 40, textAlign: 'right' },
  heroHint: { fontFamily: F.medium, color: '#EAE6FF', fontSize: 11, lineHeight: 19, textAlign: 'right', marginTop: 4 },
  heroMascot: { position: 'absolute', left: -24, bottom: -16, width: 178, height: 190 },
  statsRow: { flexDirection: 'row-reverse', gap: 10, marginTop: 18 },
  statCard: { flex: 1, minHeight: 82, borderRadius: 22, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: 'rgba(37,32,58,0.05)' },
  statIcon: { width: 39, height: 39, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statCopy: { flex: 1, alignItems: 'flex-end' },
  statLabel: { fontFamily: F.medium, fontSize: 10, color: C.muted, marginBottom: 3 },
  statValue: { fontFamily: F.bold, fontSize: 12, textAlign: 'right' },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 28, marginBottom: 13 },
  sectionTitleWrap: { alignItems: 'flex-end' },
  sectionEyebrow: { fontFamily: F.medium, color: C.purple, fontSize: 10, marginBottom: 2 },
  sectionTitle: { fontFamily: F.extra, fontSize: 18, lineHeight: 28 },
  textButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10 },
  textButtonLabel: { fontFamily: F.semi, fontSize: 11, color: C.purple },
  membersStrip: { flexDirection: 'row-reverse', gap: 10, paddingBottom: 4 },
  memberCard: { minWidth: 170, backgroundColor: C.paper, borderRadius: 22, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: C.line },
  memberCardCopy: { flex: 1, alignItems: 'flex-end' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberCardName: { fontFamily: F.bold, fontSize: 14 },
  meBadge: { backgroundColor: C.purplePale, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  meText: { fontFamily: F.bold, color: C.purple, fontSize: 8 },
  memberBalance: { fontFamily: F.semi, fontSize: 10, marginTop: 4 },
  memberUnitsBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.purplePale, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, marginTop: 5 },
  memberUnitsText: { fontFamily: F.bold, color: C.purple, fontSize: 7 },
  householdNamesPreview: { maxWidth: 112, fontFamily: F.medium, color: C.muted, fontSize: 7, lineHeight: 13, marginTop: 5, textAlign: 'right' },
  sectionHeadSimple: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 27, marginBottom: 12 },
  seeAll: { fontFamily: F.semi, fontSize: 11, color: C.purple },
  expenseList: { gap: 10 },
  expenseCard: { minHeight: 79, backgroundColor: C.paper, borderRadius: 22, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', borderWidth: 1, borderColor: C.line, gap: 10 },
  categoryBadge: { alignItems: 'center', justifyContent: 'center' },
  expenseCopy: { flex: 1, alignItems: 'flex-end' },
  expenseTitle: { fontFamily: F.bold, fontSize: 13, lineHeight: 22, textAlign: 'right' },
  expensePayerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginTop: 4 },
  expenseMeta: { fontFamily: F.medium, color: C.muted, fontSize: 9 },
  expenseValueBox: { alignItems: 'flex-start', minWidth: 88 },
  expenseAmount: { fontFamily: F.bold, fontSize: 11, writingDirection: 'rtl' },
  expenseSplit: { fontFamily: F.medium, fontSize: 9, color: C.faint, marginTop: 4 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarBorder: { borderWidth: 3, borderColor: C.paper },
  avatarText: { fontFamily: F.extra, color: '#FFFFFF', lineHeight: 30 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
  pageIntro: { backgroundColor: C.purplePale, borderRadius: 25, padding: 17, flexDirection: 'row-reverse', alignItems: 'center', gap: 13, borderWidth: 1, borderColor: '#DDD6FA' },
  pageIcon: { width: 52, height: 52, borderRadius: 19, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center' },
  pageIntroCopy: { flex: 1, alignItems: 'flex-end' },
  pageTitle: { fontFamily: F.extra, fontSize: 20 },
  pageSubtitle: { fontFamily: F.medium, fontSize: 11, color: C.muted, marginTop: 3 },
  filterRow: { flexDirection: 'row-reverse', gap: 8, marginTop: 17 },
  filterChip: { minHeight: 42, paddingHorizontal: 15, borderRadius: 16, justifyContent: 'center', backgroundColor: C.paper, borderWidth: 1, borderColor: C.line },
  filterChipActive: { backgroundColor: C.ink, borderColor: C.ink },
  filterChipText: { fontFamily: F.semi, fontSize: 11, color: C.muted },
  filterChipActiveText: { fontFamily: F.semi, fontSize: 11, color: '#FFFFFF' },
  dateTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 20 },
  dateLine: { flex: 1, height: 1, backgroundColor: C.line },
  dateTitle: { fontFamily: F.semi, color: C.muted, fontSize: 11 },
  settlementHero: { backgroundColor: C.yellowPale, minHeight: 150, borderRadius: 28, padding: 18, flexDirection: 'row-reverse', alignItems: 'center', gap: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#F3DDA2' },
  settlementConfettiOne: { position: 'absolute', width: 12, height: 28, borderRadius: 6, backgroundColor: C.coral, left: 28, top: -4, transform: [{ rotate: '25deg' }] },
  settlementConfettiTwo: { position: 'absolute', width: 13, height: 13, borderRadius: 7, backgroundColor: C.mint, right: 22, bottom: 15 },
  settlementHeroIcon: { width: 66, height: 66, borderRadius: 24, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-4deg' }] },
  settlementHeroCopy: { flex: 1, alignItems: 'flex-end' },
  settlementKicker: { fontFamily: F.semi, color: '#8C6710', fontSize: 10 },
  settlementHeadline: { fontFamily: F.extra, fontSize: 17, lineHeight: 27, textAlign: 'right', marginTop: 3 },
  settlementDescription: { fontFamily: F.medium, color: C.muted, fontSize: 10, textAlign: 'right', marginTop: 5 },
  balanceSummary: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  balancePill: { width: '48.7%', backgroundColor: C.paper, borderRadius: 19, padding: 10, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: C.line },
  balancePillCopy: { flex: 1, alignItems: 'flex-end' },
  balancePillName: { fontFamily: F.bold, fontSize: 11 },
  balancePillValue: { fontFamily: F.semi, fontSize: 9, marginTop: 2 },
  optimizedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.mintPale, borderRadius: 11, paddingHorizontal: 9, paddingVertical: 6 },
  optimizedText: { fontFamily: F.bold, color: C.mintDark, fontSize: 9 },
  transferList: { gap: 11 },
  transferCard: { backgroundColor: C.paper, borderRadius: 25, padding: 15, borderWidth: 1, borderColor: C.line, position: 'relative' },
  stepBadge: { position: 'absolute', top: 11, left: 11, width: 26, height: 26, borderRadius: 10, backgroundColor: C.purplePale, alignItems: 'center', justifyContent: 'center' },
  stepNumber: { fontFamily: F.extra, color: C.purple, fontSize: 11 },
  transferPeople: { flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', gap: 16 },
  transferPerson: { alignItems: 'center', minWidth: 74 },
  transferName: { fontFamily: F.bold, fontSize: 12, marginTop: 5 },
  transferRole: { fontFamily: F.medium, color: C.muted, fontSize: 8, marginTop: 1 },
  transferArrow: { width: 44, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: C.purplePale },
  transferDivider: { height: 1, backgroundColor: C.line, marginVertical: 13 },
  transferFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  paidButton: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.purplePale, paddingHorizontal: 12, borderRadius: 15 },
  paidButtonText: { fontFamily: F.bold, color: C.purple, fontSize: 10 },
  transferAmountBox: { alignItems: 'flex-end' },
  transferAmountLabel: { fontFamily: F.medium, color: C.muted, fontSize: 9 },
  transferAmount: { fontFamily: F.extra, color: C.ink, fontSize: 15, marginTop: 2 },
  emptyCard: { backgroundColor: C.paper, borderRadius: 25, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: C.line },
  emptyMascot: { width: 120, height: 120 },
  emptyTitle: { fontFamily: F.extra, fontSize: 17 },
  emptyText: { fontFamily: F.medium, fontSize: 11, color: C.muted, marginTop: 4 },
  scrollEnd: { height: Platform.OS === 'android' ? 142 : 112 },
  bottomNav: { position: 'absolute', left: 12, right: 12, bottom: Platform.OS === 'android' ? 32 : 10, height: 78, backgroundColor: C.paper, borderRadius: 25, flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 7, borderWidth: 1, borderColor: C.line, shadowColor: C.ink, shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  navItem: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center' },
  navIconWrap: { width: 38, height: 30, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  navIconWrapActive: { backgroundColor: C.purplePale },
  navLabel: { fontFamily: F.medium, color: C.faint, fontSize: 9, marginTop: 2 },
  navLabelActive: { fontFamily: F.bold, color: C.purple },
  addNavItem: { flex: 1.15, minHeight: 74, alignItems: 'center', justifyContent: 'center', marginTop: -22 },
  addNavPressed: { transform: [{ scale: 0.94 }] },
  addNavDisabled: { opacity: 0.35 },
  addNavCircle: { width: 52, height: 52, borderRadius: 19, backgroundColor: C.coral, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: C.paper, shadowColor: C.coral, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5, transform: [{ rotate: '-3deg' }] },
  addNavLabel: { fontFamily: F.bold, color: C.coral, fontSize: 9, marginTop: 1 },
  toast: { position: 'absolute', bottom: 98, left: 22, right: 22, minHeight: 51, borderRadius: 18, backgroundColor: C.ink, paddingHorizontal: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 9, shadowColor: C.ink, shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 },
  toastCheck: { width: 27, height: 27, borderRadius: 10, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' },
  toastText: { flex: 1, fontFamily: F.semi, color: '#FFFFFF', fontSize: 11, textAlign: 'right' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(28,22,48,0.45)', justifyContent: 'flex-end', paddingBottom: Platform.OS === 'android' ? 26 : 0 },
  sheet: { height: '92%', backgroundColor: C.canvas, borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' },
  sheetHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#D8CFDF', alignSelf: 'center', marginTop: 9 },
  sheetHeader: { minHeight: 73, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: C.line },
  sheetClose: { width: 43, height: 43, borderRadius: 15, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
  sheetHeaderCopy: { alignItems: 'center' },
  sheetTitle: { fontFamily: F.extra, fontSize: 18 },
  sheetSubtitle: { fontFamily: F.medium, color: C.muted, fontSize: 9, marginTop: 1 },
  sheetSpark: { width: 43, height: 43, borderRadius: 15, backgroundColor: C.purplePale, alignItems: 'center', justifyContent: 'center' },
  sheetScroll: { flex: 1 },
  sheetScrollContent: { padding: 18, paddingBottom: 24 },
  amountPanel: { backgroundColor: C.purplePale, borderRadius: 25, padding: 17, borderWidth: 1, borderColor: '#DDD6FA' },
  amountLabel: { fontFamily: F.semi, color: C.purple, fontSize: 11, textAlign: 'right' },
  amountInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  amountUnit: { fontFamily: F.bold, color: C.purple, fontSize: 13, backgroundColor: C.paper, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 11 },
  amountInput: { flex: 1, minHeight: 60, fontFamily: F.black, fontSize: 32, color: C.ink, paddingHorizontal: 10, writingDirection: 'rtl' },
  amountHint: { fontFamily: F.medium, color: C.muted, fontSize: 10, textAlign: 'right' },
  formLabel: { fontFamily: F.bold, fontSize: 12, textAlign: 'right', marginTop: 20, marginBottom: 9 },
  formLabelNoMargin: { fontFamily: F.bold, fontSize: 12, textAlign: 'right' },
  formHelper: { fontFamily: F.medium, color: C.muted, fontSize: 9, textAlign: 'right', marginTop: 2 },
  formInput: { minHeight: 53, borderRadius: 17, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, paddingHorizontal: 15, fontFamily: F.medium, fontSize: 13, color: C.ink, writingDirection: 'rtl' },
  categoryChoices: { flexDirection: 'row-reverse', gap: 9, paddingBottom: 2 },
  categoryChoice: { minWidth: 82, height: 91, borderRadius: 20, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  categoryChoiceActive: { borderWidth: 2, borderColor: C.purple, backgroundColor: '#FAF9FF' },
  categoryChoiceIcon: { width: 39, height: 39, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  categoryChoiceLabel: { fontFamily: F.semi, color: C.muted, fontSize: 10, marginTop: 6 },
  categoryChoiceLabelActive: { fontFamily: F.bold, color: C.purple },
  choiceCheck: { position: 'absolute', top: 7, right: 7, width: 18, height: 18, borderRadius: 7, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center' },
  personChoices: { flexDirection: 'row-reverse', gap: 8 },
  personChoice: { minWidth: 78, minHeight: 48, paddingHorizontal: 9, borderRadius: 17, flexDirection: 'row-reverse', alignItems: 'center', gap: 7, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line },
  personChoiceActive: { borderColor: C.purple, backgroundColor: C.purplePale },
  personChoiceName: { fontFamily: F.semi, color: C.muted, fontSize: 10 },
  personChoiceNameActive: { fontFamily: F.bold, color: C.purple },
  splitHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 21, marginBottom: 10 },
  equalBadge: { backgroundColor: C.mintPale, borderRadius: 11, paddingHorizontal: 9, paddingVertical: 6 },
  equalBadgeText: { fontFamily: F.bold, color: C.mintDark, fontSize: 9 },
  participantGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  participant: { width: '48.7%', minHeight: 54, borderRadius: 18, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, paddingHorizontal: 9, flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  participantActive: { borderColor: '#CFC6F5', backgroundColor: '#FAF9FF' },
  participantName: { fontFamily: F.semi, color: C.muted, fontSize: 10, textAlign: 'right' },
  participantCopy: { flex: 1, alignItems: 'flex-end' },
  participantUnits: { fontFamily: F.medium, color: C.faint, fontSize: 7, marginTop: 2 },
  participantNameActive: { fontFamily: F.bold, color: C.ink },
  participantCheck: { width: 20, height: 20, borderRadius: 8, backgroundColor: '#EEE9E3', alignItems: 'center', justifyContent: 'center' },
  participantCheckActive: { backgroundColor: C.purple },
  sheetFooter: { minHeight: 82, backgroundColor: C.paper, borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  footerPreview: { alignItems: 'flex-end', minWidth: 54 },
  footerPreviewLabel: { fontFamily: F.medium, color: C.muted, fontSize: 8 },
  footerPreviewValue: { fontFamily: F.bold, fontSize: 11, marginTop: 2 },
  saveButton: { flex: 1, minHeight: 55, borderRadius: 18, backgroundColor: C.purple, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: C.purpleDark, shadowOpacity: 0.22, shadowRadius: 9, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  saveButtonDisabled: { opacity: 0.38, shadowOpacity: 0 },
  saveButtonText: { fontFamily: F.bold, color: '#FFFFFF', fontSize: 13 },
  centeredBackdrop: { flex: 1, backgroundColor: 'rgba(28,22,48,0.45)', justifyContent: 'center', padding: 22 },
  dialog: { maxHeight: '92%', backgroundColor: C.canvas, borderRadius: 28, padding: 21, alignItems: 'center' },
  dialogIcon: { width: 58, height: 58, borderRadius: 21, backgroundColor: C.purplePale, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  dialogTitle: { fontFamily: F.extra, fontSize: 19 },
  dialogText: { fontFamily: F.medium, color: C.muted, fontSize: 11, lineHeight: 20, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  dialogActions: { flexDirection: 'row', gap: 9, marginTop: 12, width: '100%' },
  dialogCancel: { flex: 1, minHeight: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.paper, borderWidth: 1, borderColor: C.line },
  dialogCancelText: { fontFamily: F.bold, color: C.muted, fontSize: 12 },
  dialogAdd: { flex: 1.4, minHeight: 50, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.purple },
  dialogAddText: { fontFamily: F.bold, color: '#FFFFFF', fontSize: 12 },
  familySetupDialog: { width: '100%', maxHeight: '88%', borderRadius: 28, backgroundColor: C.canvas, padding: 19 },
  familySetupHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 11 },
  familySetupCopy: { flex: 1, alignItems: 'flex-end' },
  familyStepLabel: { fontFamily: F.bold, color: C.purple, fontSize: 8, marginBottom: 2 },
  familyHeadRow: { minHeight: 70, marginTop: 16, borderRadius: 18, backgroundColor: C.mintPale, borderWidth: 1, borderColor: '#BFE6D8', padding: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9 },
  familyHeadCopy: { flex: 1, alignItems: 'flex-end' },
  familyMemberLabel: { fontFamily: F.semi, color: C.mintDark, fontSize: 9 },
  familyHeadName: { fontFamily: F.extra, color: C.ink, fontSize: 13, marginTop: 3 },
  familyFixedBadge: { minHeight: 31, borderRadius: 11, backgroundColor: C.paper, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 4 },
  familyFixedText: { fontFamily: F.bold, color: C.mintDark, fontSize: 8 },
  familyInputsScroll: { maxHeight: 305, marginTop: 11 },
  familyInputsContent: { gap: 8, paddingBottom: 3 },
  familyInputRow: { minHeight: 57, borderRadius: 16, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 7, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  familyInputLabel: { width: 59, fontFamily: F.bold, color: C.purple, fontSize: 9, textAlign: 'right' },
  familyNameInput: { flex: 1, minHeight: 43, borderRadius: 12, backgroundColor: C.canvas, color: C.ink, paddingHorizontal: 11, fontFamily: F.semi, fontSize: 11, writingDirection: 'rtl' },
  familySetupHint: { fontFamily: F.medium, color: C.muted, fontSize: 8, lineHeight: 16, textAlign: 'right', marginTop: 11 },
  editFamilySection: { width: '100%', maxHeight: 300, marginTop: 13, gap: 8, alignItems: 'stretch' },
  editFamilyFixedRow: { minHeight: 58, borderRadius: 16, backgroundColor: C.mintPale, borderWidth: 1, borderColor: '#BFE6D8', padding: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  editFamilyFixedCopy: { flex: 1, alignItems: 'flex-end' },
  editFamilyFixedName: { fontFamily: F.extra, color: C.ink, fontSize: 11, marginTop: 2, textAlign: 'right' },
  editFamilyInputsScroll: { maxHeight: 180 },
  editFamilyInputsContent: { gap: 8, paddingBottom: 2 },
  newMemberFamilySection: { width: '100%', marginTop: 12, gap: 7, alignItems: 'stretch' },
  newMemberFamilyScroll: { maxHeight: 175 },
  memberUnitsField: { width: '100%', minHeight: 68, borderRadius: 17, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, marginTop: 10, padding: 10, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  memberUnitsFieldCopy: { flex: 1, alignItems: 'flex-end' },
  memberUnitsInput: { width: 58, height: 48, borderRadius: 14, backgroundColor: C.purplePale, borderWidth: 1, borderColor: '#D7CEF8', fontFamily: F.extra, color: C.purple, fontSize: 18 },
  ownerUnitsRow: { minHeight: 67, borderRadius: 17, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, marginTop: 10, padding: 10, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  welcomeBrand: { height: 72, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  welcomeContent: { paddingHorizontal: 22, paddingBottom: 34, alignItems: 'center' },
  storiesLoading: { flex: 1, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  welcomeVisual: { width: '100%', height: 260, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  welcomeGlow: { position: 'absolute', width: 240, height: 240, borderRadius: 120, backgroundColor: C.purplePale },
  welcomeMascot: { width: 245, height: 245 },
  welcomeCopy: { alignItems: 'center', maxWidth: 390 },
  welcomeTitle: { fontFamily: F.black, fontSize: 24, lineHeight: 39, textAlign: 'center' },
  welcomeText: { fontFamily: F.medium, fontSize: 13, lineHeight: 24, color: C.muted, textAlign: 'center', marginTop: 8 },
  primaryStoryButton: { width: '100%', minHeight: 59, marginTop: 25, borderRadius: 20, backgroundColor: C.purple, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: C.purpleDark, shadowOpacity: 0.22, shadowRadius: 11, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  primaryStoryButtonText: { fontFamily: F.bold, color: '#FFFFFF', fontSize: 14 },
  secondaryStoryButton: { width: '100%', minHeight: 53, marginTop: 10, borderRadius: 18, backgroundColor: C.paper, borderWidth: 1, borderColor: '#D9D1F5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryStoryButtonText: { fontFamily: F.bold, color: C.purple, fontSize: 11 },
  templatePreview: { width: '100%', flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  templatePreviewItem: { width: '48.7%', minHeight: 48, borderRadius: 16, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, paddingHorizontal: 11, flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  templateEmoji: { fontSize: 20, writingDirection: 'ltr' },
  templatePreviewText: { fontFamily: F.semi, fontSize: 10, color: C.muted },
  storySheet: { minHeight: '64%', maxHeight: '92%', backgroundColor: C.canvas, borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' },
  storyForm: { padding: 20, paddingBottom: 32 },
  storyTemplateGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 9 },
  storyTemplate: { width: '48.6%', minHeight: 64, borderRadius: 18, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, paddingHorizontal: 11, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, position: 'relative' },
  storyTemplateActive: { borderWidth: 2, borderColor: C.purple, backgroundColor: '#FAF9FF' },
  storyTemplateEmoji: { fontSize: 24, writingDirection: 'ltr' },
  storyTemplateText: { flex: 1, fontFamily: F.semi, fontSize: 10, color: C.muted, textAlign: 'right' },
  storyTemplateTextActive: { fontFamily: F.bold, color: C.purple },
  storyTemplateCheck: { position: 'absolute', top: 6, left: 6, width: 18, height: 18, borderRadius: 7, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center' },
  storyHelper: { fontFamily: F.medium, color: C.muted, fontSize: 9, lineHeight: 18, textAlign: 'right', marginTop: 12 },
  createStoryButton: { minHeight: 55, borderRadius: 18, backgroundColor: C.purple, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18 },
  inlineEmpty: { padding: 22, borderRadius: 23, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, alignItems: 'center' },
  inlineEmptyTitle: { fontFamily: F.extra, fontSize: 15 },
  inlineEmptyText: { fontFamily: F.medium, fontSize: 10, color: C.muted, textAlign: 'center', marginTop: 4 },
  inlineEmptyButton: { minHeight: 43, marginTop: 14, borderRadius: 15, backgroundColor: C.coral, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 6 },
  inlineEmptyButtonText: { fontFamily: F.bold, color: '#FFFFFF', fontSize: 10 },
  splitModeRow: { flexDirection: 'row-reverse', gap: 7 },
  splitModeButton: { flex: 1, minHeight: 44, borderRadius: 15, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  splitModeButtonActive: { backgroundColor: C.purplePale, borderColor: C.purple },
  splitModeText: { fontFamily: F.semi, color: C.muted, fontSize: 10 },
  splitModeTextActive: { fontFamily: F.bold, color: C.purple },
  personNameChips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  personNameChip: { minHeight: 38, borderRadius: 14, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  personNameChipActive: { backgroundColor: C.purple, borderColor: C.purple },
  personNameChipText: { fontFamily: F.semi, color: C.muted, fontSize: 9 },
  personNameChipTextActive: { fontFamily: F.bold, color: '#FFFFFF' },
  householdAccountsList: { gap: 9 },
  householdAccountCard: { borderRadius: 19, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 11 },
  householdAccountHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9 },
  householdAccountCopy: { flex: 1, alignItems: 'flex-end' },
  householdAccountName: { fontFamily: F.bold, fontSize: 11, textAlign: 'right' },
  householdAccountHint: { fontFamily: F.medium, color: C.muted, fontSize: 8, marginTop: 2, textAlign: 'right' },
  householdShareGroup: { borderRadius: 20, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 11, gap: 8 },
  personShareRow: { minHeight: 68, borderRadius: 15, backgroundColor: C.canvas, padding: 8, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  personShareIdentity: { width: 86, flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  personMiniAvatar: { width: 31, height: 31, borderRadius: 11, backgroundColor: C.purplePale, alignItems: 'center', justifyContent: 'center' },
  personMiniAvatarText: { fontFamily: F.extra, color: C.purple, fontSize: 11 },
  personShareName: { flex: 1, fontFamily: F.bold, fontSize: 9, textAlign: 'right' },
  householdNamesField: { marginTop: 13, alignItems: 'flex-end' },
  householdNamesInput: { width: '100%', minHeight: 72, paddingTop: 12, marginTop: 8, textAlignVertical: 'top' },
  shareList: { gap: 9, marginTop: 12 },
  shareRow: { minHeight: 70, borderRadius: 19, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 10, flexDirection: 'row-reverse', alignItems: 'center', gap: 9 },
  shareMember: { width: 82, flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  shareMemberName: { flex: 1, fontFamily: F.bold, fontSize: 10, textAlign: 'right' },
  shareFields: { flex: 1, gap: 6 },
  itemLabelInput: { minHeight: 35, borderRadius: 11, backgroundColor: C.canvas, paddingHorizontal: 10, fontFamily: F.medium, fontSize: 9, color: C.ink, writingDirection: 'rtl' },
  shareAmountWrap: { minHeight: 38, borderRadius: 11, backgroundColor: C.canvas, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9 },
  shareUnit: { fontFamily: F.semi, color: C.muted, fontSize: 8 },
  shareAmountInput: { flex: 1, fontFamily: F.bold, fontSize: 12, color: C.ink, paddingHorizontal: 7, writingDirection: 'rtl' },
  shareTotal: { minHeight: 48, borderRadius: 15, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1 },
  shareTotalValid: { backgroundColor: C.mintPale, borderColor: '#A9DEC9' },
  shareTotalInvalid: { backgroundColor: C.debtPale, borderColor: '#F2C4CD' },
  shareTotalLabel: { fontFamily: F.semi, fontSize: 9, color: C.muted },
  shareTotalValue: { fontFamily: F.bold, fontSize: 10 },
  storySwitcherCard: { maxHeight: '78%', backgroundColor: C.canvas, borderRadius: 29, padding: 18, width: '100%' },
  switcherHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switcherHeaderCopy: { flex: 1, alignItems: 'flex-end' },
  dialogTextCompact: { fontFamily: F.medium, color: C.muted, fontSize: 10, textAlign: 'right', marginTop: 2 },
  storyList: { marginTop: 16 },
  storyListContent: { gap: 9, paddingBottom: 4 },
  storyListItem: { minHeight: 77, borderRadius: 20, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 11, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  storyListItemActive: { backgroundColor: '#FAF9FF', borderWidth: 2, borderColor: C.purple },
  storyListEmoji: { width: 48, height: 48, borderRadius: 17, backgroundColor: C.purplePale, alignItems: 'center', justifyContent: 'center' },
  storyListCopy: { flex: 1, alignItems: 'flex-end' },
  storyListNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  storyListName: { fontFamily: F.extra, fontSize: 13 },
  storyListMeta: { fontFamily: F.medium, color: C.muted, fontSize: 8, marginTop: 4, textAlign: 'right' },
  activeStoryBadge: { backgroundColor: C.mintPale, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
  activeStoryBadgeText: { fontFamily: F.bold, color: C.mintDark, fontSize: 7 },
  newStoryFromSwitcher: { minHeight: 55, borderRadius: 18, backgroundColor: C.purple, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 15 },
  newStoryFromSwitcherText: { fontFamily: F.bold, color: '#FFFFFF', fontSize: 12 },
  accountPage: { gap: 14 },
  accountHero: { minHeight: 128, borderRadius: 27, backgroundColor: C.purple, padding: 19, flexDirection: 'row-reverse', alignItems: 'center', gap: 13 },
  accountHeroIcon: { width: 64, height: 64, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  accountHeroCopy: { flex: 1, alignItems: 'flex-end' },
  accountTitle: { fontFamily: F.black, fontSize: 23, color: '#FFFFFF' },
  accountSubtitle: { fontFamily: F.medium, color: '#E9E5FF', fontSize: 9, textAlign: 'right', lineHeight: 18, marginTop: 4 },
  accountCard: { borderRadius: 24, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 17 },
  accountSectionTitle: { fontFamily: F.extra, fontSize: 15, textAlign: 'right', marginBottom: 16 },
  accountLabel: { fontFamily: F.bold, color: C.ink, fontSize: 10, textAlign: 'right', marginBottom: 7 },
  requiredMark: { color: C.debt },
  optionalMark: { color: C.muted, fontFamily: F.medium, fontSize: 8 },
  accountInput: { minHeight: 54, borderRadius: 16, backgroundColor: C.canvas, borderWidth: 1, borderColor: C.line, color: C.ink, fontFamily: F.semi, fontSize: 12, paddingHorizontal: 14, marginBottom: 15, writingDirection: 'rtl' },
  accountCardInput: { letterSpacing: 1.5, writingDirection: 'ltr' },
  readonlyField: { minHeight: 58, borderRadius: 16, backgroundColor: '#F8F6F3', paddingHorizontal: 14, paddingVertical: 9, alignItems: 'flex-end', marginBottom: 15 },
  readonlyValue: { fontFamily: F.bold, fontSize: 12, color: C.ink, writingDirection: 'ltr' },
  readonlyHint: { fontFamily: F.medium, color: C.faint, fontSize: 8, marginTop: 4, textAlign: 'right' },
  accountHint: { fontFamily: F.medium, color: C.muted, fontSize: 8, textAlign: 'right', lineHeight: 16, marginTop: -7, marginBottom: 14 },
  accountError: { fontFamily: F.semi, color: C.debt, backgroundColor: C.debtPale, padding: 10, borderRadius: 13, fontSize: 9, textAlign: 'right', marginBottom: 11 },
  accountSaveButton: { minHeight: 53, borderRadius: 17, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center' },
  accountSaveText: { fontFamily: F.bold, color: '#FFFFFF', fontSize: 12 },
  accountLogoutButton: { minHeight: 54, borderRadius: 18, borderWidth: 1, borderColor: '#F1C7CE', backgroundColor: '#FFF8F8', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  accountLogoutText: { fontFamily: F.bold, color: C.debt, fontSize: 11 },
  dashboardHero: { minHeight: 142, borderRadius: 27, backgroundColor: C.purplePale, borderWidth: 1, borderColor: '#DCD4FA', padding: 18, flexDirection: 'row-reverse', alignItems: 'center', gap: 13 },
  dashboardHeroIcon: { width: 62, height: 62, borderRadius: 22, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-4deg' }] },
  dashboardHeroCopy: { flex: 1, alignItems: 'flex-end' },
  dashboardEyebrow: { fontFamily: F.semi, color: C.purple, fontSize: 9 },
  dashboardTitle: { fontFamily: F.black, fontSize: 23, marginTop: 2 },
  dashboardText: { fontFamily: F.medium, color: C.muted, fontSize: 9, lineHeight: 18, textAlign: 'right', marginTop: 3 },
  dashboardNewStory: { minHeight: 54, borderRadius: 18, backgroundColor: C.purple, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 13 },
  dashboardNewStoryText: { fontFamily: F.bold, color: '#FFFFFF', fontSize: 12 },
  dashboardActions: { gap: 8, marginBottom: 4 },
  dashboardJoinStory: { minHeight: 48, borderRadius: 17, backgroundColor: C.paper, borderWidth: 1, borderColor: '#D9D1F5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  dashboardJoinStoryText: { fontFamily: F.bold, color: C.purple, fontSize: 11 },
  dashboardSectionHead: { marginTop: 26, marginBottom: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ongoingCount: { minWidth: 29, height: 29, paddingHorizontal: 7, borderRadius: 11, backgroundColor: C.purplePale, alignItems: 'center', justifyContent: 'center' },
  ongoingCountText: { fontFamily: F.extra, color: C.purple, fontSize: 10 },
  completedCount: { minWidth: 29, height: 29, paddingHorizontal: 7, borderRadius: 11, backgroundColor: C.mintPale, alignItems: 'center', justifyContent: 'center' },
  completedCountText: { fontFamily: F.extra, color: C.mintDark, fontSize: 10 },
  dashboardStoryList: { gap: 9 },
  dashboardStoryCard: { minHeight: 91, borderRadius: 22, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  dashboardStoryCardCompleted: { backgroundColor: '#FBFCFB' },
  dashboardStoryEmoji: { width: 55, height: 55, borderRadius: 19, backgroundColor: C.purplePale, alignItems: 'center', justifyContent: 'center' },
  dashboardStoryEmojiCompleted: { backgroundColor: C.mintPale },
  dashboardStoryEmojiText: { fontSize: 27, writingDirection: 'ltr' },
  dashboardStoryCopy: { flex: 1, alignItems: 'flex-end' },
  dashboardStoryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dashboardStoryTitle: { fontFamily: F.extra, fontSize: 14 },
  dashboardStoryMeta: { fontFamily: F.medium, color: C.muted, fontSize: 8, marginTop: 3 },
  dashboardStoryTotal: { fontFamily: F.bold, fontSize: 10, marginTop: 5 },
  completedBadge: { minHeight: 25, borderRadius: 9, paddingHorizontal: 7, backgroundColor: C.mintPale, flexDirection: 'row', alignItems: 'center', gap: 3 },
  completedBadgeText: { fontFamily: F.bold, color: C.mintDark, fontSize: 7 },
  finishStoryButton: { minHeight: 72, borderRadius: 20, borderWidth: 1, borderColor: '#F2C4CD', backgroundColor: C.debtPale, marginTop: 20, padding: 13, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  deleteStoryButton: { minHeight: 66, borderRadius: 20, borderWidth: 1, borderColor: '#F2C4CD', backgroundColor: C.paper, marginTop: 10, padding: 13, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  deleteStoryTitle: { fontFamily: F.extra, color: C.debt, fontSize: 12 },
  finishStoryCopy: { flex: 1, alignItems: 'flex-end' },
  finishStoryTitle: { fontFamily: F.extra, color: C.debt, fontSize: 13 },
  finishStoryText: { fontFamily: F.medium, color: C.muted, fontSize: 8, marginTop: 3 },
  finishedNotice: { minHeight: 72, borderRadius: 20, borderWidth: 1, borderColor: '#BDE5D7', backgroundColor: C.mintPale, marginTop: 20, padding: 13, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  finishedNoticeIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center' },
  finishedNoticeCopy: { flex: 1, alignItems: 'flex-end' },
  finishedNoticeTitle: { fontFamily: F.extra, color: C.mintDark, fontSize: 13 },
  finishedNoticeText: { fontFamily: F.medium, color: C.muted, fontSize: 8, marginTop: 3, textAlign: 'right' },
  finishDialog: { backgroundColor: C.canvas, borderRadius: 29, padding: 21, alignItems: 'center', width: '100%' },
  finishDialogIcon: { width: 64, height: 64, borderRadius: 23, backgroundColor: C.mintPale, alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  finishDialogText: { fontFamily: F.medium, color: C.muted, fontSize: 10, lineHeight: 20, textAlign: 'center', marginTop: 6 },
  finishSummaryRow: { width: '100%', minHeight: 69, borderRadius: 18, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, flexDirection: 'row-reverse', alignItems: 'center', marginTop: 15 },
  finishSummaryItem: { flex: 1, alignItems: 'center' },
  finishSummaryLabel: { fontFamily: F.medium, color: C.muted, fontSize: 8 },
  finishSummaryValue: { fontFamily: F.extra, fontSize: 11, marginTop: 4 },
  finishSummaryDivider: { width: 1, height: 36, backgroundColor: C.line },
  finishWarning: { width: '100%', borderRadius: 14, backgroundColor: C.yellowPale, padding: 10, marginTop: 10 },
  finishWarningText: { fontFamily: F.medium, color: '#806018', fontSize: 8, lineHeight: 16, textAlign: 'center' },
  finishConfirmButton: { flex: 1.55, minHeight: 50, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.debt },
  deleteConfirmButton: { flex: 1.55, minHeight: 50, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.debt },
  deleteDialogIcon: { width: 64, height: 64, borderRadius: 23, backgroundColor: C.debtPale, alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  deleteWarning: { width: '100%', borderRadius: 14, backgroundColor: C.debtPale, padding: 10, marginTop: 12 },
  deleteWarningText: { fontFamily: F.bold, color: C.debt, fontSize: 9, textAlign: 'center' },
  readonlyInput: { backgroundColor: '#F1ECE6', color: C.muted },
  notificationBadge: { position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 8, paddingHorizontal: 4, backgroundColor: C.coral, borderWidth: 2, borderColor: C.canvas, alignItems: 'center', justifyContent: 'center' },
  notificationBadgeText: { fontFamily: F.extra, color: '#FFFFFF', fontSize: 7, writingDirection: 'ltr' },
  notificationsCard: { maxHeight: '82%', minHeight: 360, backgroundColor: C.canvas, borderRadius: 29, padding: 18, width: '100%' },
  notificationHeaderIcon: { width: 43, height: 43, borderRadius: 15, backgroundColor: C.purplePale, alignItems: 'center', justifyContent: 'center' },
  notificationsList: { marginTop: 16 },
  notificationsListContent: { gap: 9, paddingBottom: 4 },
  notificationItem: { minHeight: 103, borderRadius: 21, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 11, flexDirection: 'row-reverse', alignItems: 'center', gap: 9 },
  notificationTypeIcon: { width: 45, height: 45, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  notificationCreditIcon: { backgroundColor: C.mintPale },
  notificationDebtIcon: { backgroundColor: C.debtPale, transform: [{ rotate: '180deg' }] },
  notificationItemCopy: { flex: 1, alignItems: 'flex-end' },
  notificationItemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  notificationItemTitle: { flex: 1, fontFamily: F.bold, fontSize: 10, textAlign: 'right' },
  notificationTypeBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
  notificationCreditBadge: { backgroundColor: C.mintPale },
  notificationDebtBadge: { backgroundColor: C.debtPale },
  notificationTypeText: { fontFamily: F.bold, fontSize: 7 },
  notificationItemAmount: { fontFamily: F.extra, fontSize: 13, marginTop: 5 },
  notificationItemStory: { fontFamily: F.medium, color: C.muted, fontSize: 8, marginTop: 3 },
  notificationsEmpty: { alignItems: 'center', paddingVertical: 22 },
  notificationsEmptyMascot: { width: 130, height: 130 },
  expenseDetailsCard: { maxHeight: '82%', minHeight: 360, backgroundColor: C.canvas, borderRadius: 29, padding: 18, width: '100%' },
  expenseDetailsTotal: { minHeight: 76, borderRadius: 20, backgroundColor: C.purplePale, borderWidth: 1, borderColor: '#DCD4FA', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  expenseDetailsTotalLabel: { fontFamily: F.medium, color: C.purple, fontSize: 9 },
  expenseDetailsTotalValue: { fontFamily: F.black, fontSize: 21, marginTop: 3 },
  expenseDetailsSectionTitle: { fontFamily: F.extra, fontSize: 13, textAlign: 'right', marginTop: 17, marginBottom: 9 },
  expenseAllocationsList: { maxHeight: 285 },
  expenseAllocationsContent: { gap: 8 },
  expenseAllocationRow: { minHeight: 59, borderRadius: 17, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 9, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  expenseAllocationCopy: { flex: 1, alignItems: 'flex-end' },
  expenseAllocationName: { fontFamily: F.bold, fontSize: 10 },
  expenseAllocationLabel: { fontFamily: F.medium, color: C.muted, fontSize: 8, marginTop: 2 },
  expenseAllocationAmount: { fontFamily: F.extra, fontSize: 10 },
  expenseDetailsCloseButton: { minHeight: 50, borderRadius: 16, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', marginTop: 15 },
  expenseDetailsCloseText: { fontFamily: F.bold, color: '#FFFFFF', fontSize: 11 },
  memberModeTabs: { width: '100%', flexDirection: 'row-reverse', backgroundColor: C.purplePale, borderRadius: 15, padding: 4, marginVertical: 12 },
  memberModeTab: { flex: 1, minHeight: 39, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  memberModeTabActive: { backgroundColor: C.paper, shadowColor: C.purpleDark, shadowOpacity: 0.12, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  memberModeTabDisabled: { opacity: 0.42 },
  memberModeTabText: { fontFamily: F.semi, color: C.muted, fontSize: 9 },
  memberModeTabTextActive: { fontFamily: F.bold, color: C.purple, fontSize: 9 },
  inviteCodeCard: { width: '100%', borderRadius: 18, backgroundColor: C.purplePale, borderWidth: 1, borderColor: '#D9D1F5', padding: 16, alignItems: 'center', marginVertical: 8 },
  inviteCodeLabel: { fontFamily: F.medium, color: C.muted, fontSize: 9 },
  inviteCodeValue: { fontFamily: F.black, color: C.purpleDark, fontSize: 25, letterSpacing: 5, writingDirection: 'ltr', marginTop: 5 },
  inviteActions: { width: '100%', flexDirection: 'row', gap: 8, marginTop: 8 },
  inviteSecondaryButton: { flex: 1, minHeight: 49, borderRadius: 15, borderWidth: 1, borderColor: '#D9D1F5', backgroundColor: C.paper, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  inviteSecondaryText: { fontFamily: F.bold, color: C.purple, fontSize: 9 },
  invitePrimaryButton: { flex: 1.2, minHeight: 49, borderRadius: 15, backgroundColor: C.purple, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  invitePrimaryText: { fontFamily: F.bold, color: '#FFFFFF', fontSize: 9 },
  inviteCloseButton: { width: '100%', minHeight: 45, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  joinCodeInput: { fontFamily: F.black, fontSize: 19, letterSpacing: 4, writingDirection: 'ltr' },
});

export default function App() {
  return (
    <AuthGate>
      <DongoApp />
    </AuthGate>
  );
}
