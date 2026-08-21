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
  Keyboard,
  Modal,
  Platform,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextProps,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  allocateByWeight,
  applySettlementPayments,
  calculateBalances,
  createSettlement,
  isFromLastWeek,
  matchAllocationParticipants,
  type Expense,
  type ExpenseCategory,
  type Member,
  type SettlementPayment,
  type Transfer,
} from './src/settlement';
import { AuthGate } from './src/AuthGate';
import { friendlyError } from './src/errors';
import { displayablePhone, toIranPhone, toLatinDigits } from './src/phone';
import { supabase } from './src/supabase';
import {
  type AdDiagnostics,
  type NativeAdContent,
  clearHomeNativeAd,
  getAdDiagnostics,
  loadHomeNativeAd,
  preloadExpenseInterstitial,
  reportNativeAdClick,
  retryAds,
  setNativeAdListener,
  showExpenseInterstitial,
} from './src/tapsellAds';
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
  deleteOnlineGuest,
  updateOnlineExpense,
  deleteOnlineExpense,
  loadStoryMemberCards,
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
  muted: '#716D7C',
  faint: '#86818F',
  line: '#EDE4D9',
  purple: '#6652D9',
  purpleDark: '#4936B6',
  purplePale: '#EEEAFE',
  coral: '#FF7A6B',
  coralInk: '#B4564B',   // the coral hue, dark enough to read as text
  coralPale: '#FFE9E5',
  mint: '#4FC7A4',
  mintDark: '#087A5B',
  mintPale: '#E4F7F0',
  yellow: '#FFC857',
  yellowPale: '#FFF2CE',
  debt: '#C84359',
  debtInk: '#BC3F53',    // dark enough to read on debtPale
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
// Prevents Number() overflow and unreadable layouts from pasted digit strings.
const MAX_AMOUNT_DIGITS = 12;
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

/**
 * The app runs edge-to-edge, and Android ignores `adjustResize` for edge-to-edge
 * windows (API 30+, enforced on Android 15). The window therefore never shrinks
 * when the keyboard opens, which made `KeyboardAvoidingView` subtract a keyboard
 * height that the layout had not actually lost — it collapsed sheets to nothing
 * and left a transparent modal swallowing every touch.
 *
 * Instead we read the keyboard height from the keyboard events themselves and
 * apply it as padding. If a device *does* still resize its window (older
 * Android without edge-to-edge), that height is already gone from the layout,
 * so we subtract whatever the window shrank by and never compensate twice.
 */
function useKeyboardInset() {
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const unobstructedHeight = useRef(windowHeight);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (keyboardHeight === 0) unobstructedHeight.current = windowHeight;
  }, [keyboardHeight, windowHeight]);

  const windowShrankBy = Math.max(0, unobstructedHeight.current - windowHeight);
  return {
    keyboardVisible: keyboardHeight > 0,
    keyboardInset: Math.max(0, Math.round(keyboardHeight - windowShrankBy)),
    windowHeight,
  };
}

function formatMoney(amount: number) {
  return `${faNumber.format(Math.round(amount))} تومان`;
}

/** Card numbers are read aloud in groups of four, so display them that way. */
function formatCardNumber(card: string) {
  return card.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
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
  const insets = useSafeAreaInsets();
  const { keyboardVisible, keyboardInset, windowHeight } = useKeyboardInset();
  const [homeAd, setHomeAd] = useState<NativeAdContent | null>(null);

  // Edge-to-edge means the system navigation bar sits on top of the app, so the
  // bottom inset has to be reserved by hand or content hides underneath it.
  // When the keyboard is up it already covers that area, so take the larger of
  // the two rather than stacking them.
  const bottomInset = Math.max(keyboardInset, insets.bottom);
  // Sheets are anchored to the bottom, so they have to give the keyboard its
  // space explicitly; a fixed height keeps the internal ScrollView scrollable
  // instead of letting percentage heights re-resolve on every keyboard frame.
  const sheetHeight = Math.round(Math.min(windowHeight * 0.92, windowHeight - bottomInset));
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
  const [familyInfoModal, setFamilyInfoModal] = useState(false);
  // Creating a story used to produce a story of one, and the only way to add
  // the other people was a small text button on the home screen afterwards.
  // Testers read "ماجرای جدید" as "set up this outing" and expected to list
  // everyone right there; landing on a story with just themselves in it read as
  // "everybody has to install this first", which is exactly what it is not.
  // So the sheet is a two-step wizard now and step two is the guest list.
  const [storyStep, setStoryStep] = useState<1 | 2>(1);
  // Two ways an outing splits, asked once at the top of step two instead of
  // per person afterwards: everyone pays for themselves, or one person per
  // family pays for the people under them.
  const [splitByFamily, setSplitByFamily] = useState(false);
  const [newCompanions, setNewCompanions] = useState<{ name: string; subs: string[] }[]>([]);
  const [ownerSubNames, setOwnerSubNames] = useState<string[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<SettlementPayment[]>([]);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deleteExpenseTarget, setDeleteExpenseTarget] = useState<Expense | null>(null);
  const [expenseFilter, setExpenseFilter] = useState<'all' | 'week' | 'mine'>('all');
  const [tab, setTab] = useState<'home' | 'expenses' | 'settlement' | 'account'>('home');
  const [expenseModal, setExpenseModal] = useState(false);
  const [memberModal, setMemberModal] = useState(false);
  const [editMemberModal, setEditMemberModal] = useState(false);
  const [deleteStoryModal, setDeleteStoryModal] = useState(false);
  const [signOutModal, setSignOutModal] = useState(false);
  const [deleteMemberTarget, setDeleteMemberTarget] = useState<Member | null>(null);
  const [memberMode, setMemberMode] = useState<'guest' | 'invite'>('guest');
  const [joinModal, setJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinUnits, setJoinUnits] = useState('1');
  const [joinHouseholdNameInputs, setJoinHouseholdNameInputs] = useState<string[]>([]);
  const [joinFamilyOpen, setJoinFamilyOpen] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [payerId, setPayerId] = useState('');
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  // Almost every real expense is split equally, but the three split modes were
  // always on screen, so every user had to read and rule out two of them before
  // reaching the part they needed. They live behind a question now.
  const [splitOptionsOpen, setSplitOptionsOpen] = useState(false);
  const [shareInputs, setShareInputs] = useState<Record<string, string>>({});
  const [itemLabels, setItemLabels] = useState<Record<string, string>>({});
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberUnits, setNewMemberUnits] = useState('1');
  const [newHouseholdNameInputs, setNewHouseholdNameInputs] = useState<string[]>([]);
  // Adding one person is the common case; the household fields used to be part
  // of the form whether or not anybody had a household.
  const [newMemberFamilyOpen, setNewMemberFamilyOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editMemberName, setEditMemberName] = useState('');
  const [editMemberUnits, setEditMemberUnits] = useState('1');
  const [editHouseholdNameInputs, setEditHouseholdNameInputs] = useState<string[]>([]);
  const activeStoryIdRef = useRef('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingTransfer, setPendingTransfer] = useState<Transfer | null>(null);
  const [accountName, setAccountName] = useState('');
  const [accountCardNumber, setAccountCardNumber] = useState('');
  // What the server has, as opposed to what is currently in the input. The
  // settlement prompt keys off this: keying it off the input made the whole
  // prompt vanish on the first keystroke, before it could be saved.
  const [savedCardNumber, setSavedCardNumber] = useState('');
  const [accountPhone, setAccountPhone] = useState('');
  // Linking a phone to an account that started anonymously, so the data can be
  // recovered on another device. Optional — the app works fine without it.
  const [phoneStage, setPhoneStage] = useState<'idle' | 'code'>('idle');
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phonePending, setPhonePending] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [phoneOtpExpiresAt, setPhoneOtpExpiresAt] = useState<number | null>(null);
  const [phoneSecondsLeft, setPhoneSecondsLeft] = useState(0);
  const [accountLoading, setAccountLoading] = useState(true);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [memberCards, setMemberCards] = useState<Record<string, string>>({});
  // Hidden behind a long-press on the account header. Google's Android
  // downloads are blocked from Iran, so adb logcat is not reachable for the
  // people who need to know why an ad slot is empty.
  const [adPanelOpen, setAdPanelOpen] = useState(false);
  const [adInfo, setAdInfo] = useState<AdDiagnostics | null>(null);
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
  const filteredExpenses = expenses.filter((expense) => {
    if (expenseFilter === 'mine') return expense.payerId === currentMember?.id;
    if (expenseFilter === 'week') return isFromLastWeek(expense);
    return true;
  });
  const filteredTotal = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  function hydrateActiveStory(story: Story) {
    setStoryId(story.id);
    setStoryName(story.name);
    setStoryTemplate(story.template);
    setMembers(story.members);
    setExpenses(story.expenses);
    setPayments(story.payments ?? []);
    const me = story.members.find((member) => member.isMe) ?? story.members[0];
    setPayerId(me?.id ?? '');
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
      const message = friendlyError(error, 'همگام‌سازی ماجراها ناموفق بود');
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
      setAccountPhone(displayablePhone(profile?.phone ?? user.phone ?? ''));
      setAccountCardNumber(paymentMethod?.card_number ?? '');
      setSavedCardNumber(paymentMethod?.card_number ?? '');
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
      phone: accountPhone || userData.user.phone || `anonymous:${userData.user.id}`,
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
    setSavedCardNumber(card);
    showToast(card ? 'شماره کارتت ذخیره شد' : 'اطلاعات حساب ذخیره شد');
    // Member names in every story come from the profile row, so refresh them
    // instead of leaving the old name on screen until the next unrelated sync.
    void syncFromCloud();
    void refreshMemberCards();
  }

  function phoneFailure(message: string) {
    const lower = message.toLowerCase();
    if (lower.includes('already') && (lower.includes('registered') || lower.includes('exists') || lower.includes('taken'))) {
      return 'این شماره قبلاً به حساب دیگری وصل شده. برای بازیابی آن حساب، از اپ خارج شو و با همین شماره وارد شو.';
    }
    if (lower.includes('unsupported phone provider') || lower.includes('sms')) {
      return 'ارسال پیامک روی سرور فعال نیست؛ فعلاً نمی‌شود شماره ثبت کرد.';
    }
    if (lower.includes('token') || lower.includes('otp') || lower.includes('expired')) {
      return 'کد واردشده درست نیست یا منقضی شده.';
    }
    if (lower.includes('rate')) return 'تعداد درخواست‌ها زیاد شد؛ کمی بعد دوباره تلاش کن.';
    if (lower.includes('duplicate') || lower.includes('unique')) {
      return 'این شماره قبلاً برای حساب دیگری ثبت شده است.';
    }
    return message;
  }

  async function startPhoneLink() {
    if (!supabase || phoneBusy) return;
    const formatted = toIranPhone(phoneInput);
    if (!formatted) {
      setPhoneError('شماره موبایل را به شکل ۰۹۱۲۱۲۳۴۵۶۷ وارد کن.');
      return;
    }
    setPhoneBusy(true);
    setPhoneError('');
    const { error } = await supabase.auth.updateUser({ phone: formatted });
    setPhoneBusy(false);
    if (error) {
      setPhoneError(phoneFailure(error.message));
      return;
    }
    setPhonePending(formatted);
    setPhoneOtp('');
    setPhoneOtpExpiresAt(Date.now() + 60_000);
    setPhoneSecondsLeft(60);
    setPhoneStage('code');
  }

  async function confirmPhoneLink() {
    if (!supabase || phoneBusy) return;
    const token = toLatinDigits(phoneOtp);
    if (token.length !== 6) {
      setPhoneError('کد شش‌رقمی را کامل وارد کن.');
      return;
    }
    setPhoneBusy(true);
    setPhoneError('');
    // 'phone_change' is the flow for attaching a number to an existing account,
    // including one that started out anonymous.
    const { error } = await supabase.auth.verifyOtp({ phone: phonePending, token, type: 'phone_change' });
    if (error) {
      setPhoneBusy(false);
      setPhoneError(phoneFailure(error.message));
      return;
    }
    // The profile row still carries the synthetic anonymous phone, so move it
    // over too — that is what other members' devices read.
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: userData.user.id,
        full_name: accountName.trim() || 'من',
        phone: phonePending,
        updated_at: new Date().toISOString(),
      });
      if (profileError) {
        setPhoneBusy(false);
        setPhoneError(phoneFailure(profileError.message));
        return;
      }
    }
    setPhoneBusy(false);
    setAccountPhone(phonePending);
    setPhoneStage('idle');
    setPhoneInput('');
    setPhoneOtp('');
    setPhonePending('');
    setPhoneOtpExpiresAt(null);
    showToast('شماره موبایلت ثبت شد؛ حالا اطلاعاتت قابل بازیابی است');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function cancelPhoneLink() {
    setPhoneStage('idle');
    setPhoneOtp('');
    setPhonePending('');
    setPhoneError('');
    setPhoneOtpExpiresAt(null);
    setPhoneSecondsLeft(0);
  }

  async function signOut() {
    if (!supabase || cloudBusy) return;
    setCloudBusy(true);
    const { error } = await supabase.auth.signOut();
    setCloudBusy(false);
    setSignOutModal(false);
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

  async function refreshMemberCards(targetStoryId = storyId) {
    if (isLocalWebPreview) {
      setMemberCards(Object.fromEntries(members.map((member) => [member.id, '6219861012345678'])));
      return;
    }
    if (!targetStoryId) return;
    try {
      setMemberCards(await loadStoryMemberCards(targetStoryId));
    } catch {
      // Card numbers are a convenience; settling still works without them.
      setMemberCards({});
    }
  }

  // Only fetched when the settlement screen is actually in view, so other
  // members' card numbers are not pulled down during ordinary browsing.
  useEffect(() => {
    if (tab !== 'settlement' || storiesHome) return;
    setAccountError('');
    void refreshMemberCards();
  }, [tab, storiesHome, storyId, payments.length]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    if (!adPanelOpen) return;
    const read = () => setAdInfo(getAdDiagnostics());
    read();
    const timer = setInterval(read, 2000);
    return () => clearInterval(timer);
  }, [adPanelOpen]);

  useEffect(() => {
    if (!phoneOtpExpiresAt) return;
    const tick = () => setPhoneSecondsLeft(Math.max(0, Math.ceil((phoneOtpExpiresAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [phoneOtpExpiresAt]);

  // Subscribing is platform-agnostic; only the fetching is Android-only.
  useEffect(() => {
    setNativeAdListener(setHomeAd);
    return () => {
      setNativeAdListener(null);
      clearHomeNativeAd();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void preloadExpenseInterstitial();
  }, []);

  // The ad card belongs under the balance card on a story's home screen.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (tab === 'home' && !storiesHome) void loadHomeNativeAd();
    else clearHomeNativeAd();
  }, [tab, storiesHome]);

  function goBackInApp() {
    if (storyModal && storyStep === 2) { setStoryStep(1); return true; }
    if (storyModal) { setStoryModal(false); return true; }
    if (joinModal) { setJoinModal(false); return true; }
    if (storySwitcher) { setStorySwitcher(false); return true; }
    if (finishModal) { setFinishModal(false); return true; }
    if (notificationsModal) { setNotificationsModal(false); return true; }
    if (expenseDetailsModal) { setExpenseDetailsModal(false); return true; }
    if (expenseModal) { setExpenseModal(false); setEditingExpense(null); return true; }
    if (memberModal) { setMemberModal(false); return true; }
    if (editMemberModal) { setEditMemberModal(false); return true; }
    if (deleteStoryModal) { setDeleteStoryModal(false); return true; }
    if (signOutModal) { setSignOutModal(false); return true; }
    if (deleteMemberTarget) { setDeleteMemberTarget(null); return true; }
    if (familyInfoModal) { setFamilyInfoModal(false); return true; }
    if (deleteExpenseTarget) { setDeleteExpenseTarget(null); return true; }
    if (pendingTransfer) { setPendingTransfer(null); return true; }
    if (tab !== 'home') { setTab('home'); return true; }
    if (!storiesHome) { setStoriesHome(true); return true; }
    return false;
  }

  const canGoBackInApp = storyModal || joinModal || storySwitcher || finishModal || notificationsModal
    || expenseDetailsModal || expenseModal || memberModal || editMemberModal || deleteStoryModal || signOutModal || Boolean(deleteMemberTarget)
    || Boolean(pendingTransfer) || Boolean(deleteExpenseTarget) || familyInfoModal || tab !== 'home' || !storiesHome;

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
  }, [storyModal, storyStep, joinModal, storySwitcher, finishModal, notificationsModal, expenseDetailsModal, expenseModal, memberModal, editMemberModal, deleteStoryModal, signOutModal, deleteMemberTarget, pendingTransfer, deleteExpenseTarget, familyInfoModal, tab, storiesHome]);

  useEffect(() => {
    if (!storyId) return;
    setStories((current) => current.map((story) => story.id === storyId
      ? { ...story, name: storyName, template: storyTemplate, members, expenses, payments }
      : story));
  }, [storyId, storyName, storyTemplate, members, expenses, payments]);

  if (!fontsLoaded) {
    return <View style={styles.loading}><StatusBar style="dark" /></View>;
  }

  /** The auth user behind the member card marked "me" in this story. */
  const currentUserId = currentMember?.userId;

  function expenseAuthorName(expense: Expense) {
    if (!expense.createdById) return '';
    const author = members.find((member) => member.userId === expense.createdById);
    if (!author) return 'یکی از اعضا';
    return author.isMe ? 'تو' : author.name;
  }

  function canEditExpense(expense: Expense) {
    return Boolean(expense.createdById && currentUserId && expense.createdById === currentUserId) && !storyCompleted;
  }

  /**
   * Rebuilds the sheet state from a stored expense. Allocations are saved per
   * account with the participating person names in the label, so the people are
   * recoverable; a member's total is then spread over its own people.
   */
  function openExpenseEditor(expense: Expense) {
    if (!canEditExpense(expense)) return;
    const chosenIds: string[] = [];
    const nextShares: Record<string, string> = {};
    const nextItems: Record<string, string> = {};

    for (const allocation of expense.allocations ?? []) {
      const people = expensePeople.filter((person) => person.memberId === allocation.memberId);
      if (!people.length) continue;
      const participants = matchAllocationParticipants(allocation.label, people);
      const perPerson = allocateByWeight(allocation.amount, participants.map(({ person }) => ({ memberId: person.id, weight: 1 })));
      for (const { person, item } of participants) {
        chosenIds.push(person.id);
        nextShares[person.id] = String(perPerson.find((entry) => entry.memberId === person.id)?.amount ?? 0);
        if (item) nextItems[person.id] = item;
      }
    }

    const amounts = chosenIds.map((id) => Number(nextShares[id] ?? 0));
    // An equal split only ever differs by the rounding remainder.
    const looksEqual = amounts.length > 0 && Math.max(...amounts) - Math.min(...amounts) <= 1;

    setEditingExpense(expense);
    setTitle(expense.title);
    setAmount(String(Math.round(expense.amount)));
    setCategory(expense.category ?? 'food');
    setPayerId(expense.payerId);
    setSelectedPersonIds(chosenIds);
    setShareInputs(nextShares);
    setItemLabels(nextItems);
    setSplitMode(Object.keys(nextItems).length ? 'itemized' : looksEqual ? 'equal' : 'custom');
    setSplitOptionsOpen(false);
    setExpenseDetailsModal(false);
    setExpenseModal(true);
  }

  async function deleteExpense(expense: Expense) {
    if (!storyId || cloudBusy) return;
    if (isLocalWebPreview) {
      setExpenses((current) => current.filter((item) => item.id !== expense.id));
      setDeleteExpenseTarget(null);
      setExpenseDetailsModal(false);
      showToast('خرج آزمایشی حذف شد.');
      return;
    }
    setCloudBusy(true);
    try {
      await deleteOnlineExpense(expense.id);
      await syncFromCloud(storyId);
      setDeleteExpenseTarget(null);
      setExpenseDetailsModal(false);
      showToast('خرج حذف شد و دنگ‌ها دوباره محاسبه شدند');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      showToast(friendlyError(error, 'حذف خرج ناموفق بود'));
    } finally {
      setCloudBusy(false);
    }
  }

  function openExpenseModal() {
    if (storyCompleted) {
      showToast('این ماجرا تمام شده؛ فقط می‌توانی مرورش کنی.');
      return;
    }
    setEditingExpense(null);
    setTitle('غذا');
    setAmount('');
    setCategory('food');
    setPayerId(currentMember?.id ?? members[0]?.id ?? '');
    setSelectedPersonIds(members.flatMap((member) => Array.from(
      { length: Math.max(1, member.shareUnits ?? 1) },
      (_, index) => `${member.id}::${index}`,
    )));
    setSplitMode('equal');
    setSplitOptionsOpen(false);
    setShareInputs({});
    setItemLabels({});
    setExpenseModal(true);
  }

  /** Step one asks what the outing is; step two asks who is on it. */
  function goToPeopleStep() {
    if (!newStoryName.trim() || cloudBusy) return;
    // One field already waiting, so the next move is to type rather than to
    // find a button first.
    setNewCompanions((current) => (current.length ? current : [{ name: '', subs: [] }]));
    setStoryStep(2);
  }

  function changeCompanionName(index: number, value: string) {
    setNewCompanions((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, name: value } : item)));
  }

  function removeCompanionField(index: number) {
    setNewCompanions((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function addCompanionSub(index: number) {
    setNewCompanions((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, subs: [...item.subs, ''] } : item)));
  }

  function changeCompanionSub(index: number, subIndex: number, value: string) {
    setNewCompanions((current) => current.map((item, itemIndex) => (itemIndex === index
      ? { ...item, subs: item.subs.map((sub, i) => (i === subIndex ? value : sub)) }
      : item)));
  }

  function removeCompanionSub(index: number, subIndex: number) {
    setNewCompanions((current) => current.map((item, itemIndex) => (itemIndex === index
      ? { ...item, subs: item.subs.filter((_, i) => i !== subIndex) }
      : item)));
  }

  function resetStoryDraft() {
    setNewStoryName('');
    setNewCompanions([]);
    setOwnerSubNames([]);
    setSplitByFamily(false);
    setStoryStep(1);
  }

  async function createStory() {
    const name = newStoryName.trim();
    if (!name || cloudBusy) return;
    // In per-person mode every row is one person. In per-family mode a row is
    // whoever pays, and the names under it are the people they pay for.
    const cleanFamilyNames = splitByFamily ? ownerSubNames.map((item) => item.trim()).filter(Boolean) : [];
    const ownerUnits = 1 + cleanFamilyNames.length;
    // A blank row is a field the user opened and left alone, not an error.
    const companions = newCompanions
      .map((item) => ({
        name: item.name.trim(),
        subs: (splitByFamily ? item.subs : []).map((sub) => sub.trim()).filter(Boolean),
      }))
      .filter((item) => item.name);
    if (companions.some((item) => item.name.length < 2)) {
      showToast('نام هر نفر باید دست‌کم دو حرف باشد.');
      return;
    }
    if (cleanFamilyNames.some((item) => item.length < 2) || companions.some((item) => item.subs.some((sub) => sub.length < 2))) {
      showToast('نام هر عضو خانواده باید دست‌کم دو حرف باشد.');
      return;
    }

    if (isLocalWebPreview) {
      const previewId = `local-story-${Date.now()}`;
      const ownerDisplayName = accountName.trim() || 'من';
      const previewStory: Story = {
        id: previewId,
        name,
        template: newStoryTemplate,
        members: [
          { id: `${previewId}-owner`, name: ownerDisplayName, color: AVATAR_COLORS[0], isMe: true, shareUnits: ownerUnits, kind: 'registered', userId: 'local-preview-user', householdMembers: [ownerDisplayName, ...cleanFamilyNames] },
          ...companions.map((companion, index) => ({
            id: `${previewId}-guest-${index}`,
            name: companion.name,
            color: AVATAR_COLORS[(index + 1) % AVATAR_COLORS.length],
            shareUnits: 1 + companion.subs.length,
            kind: 'guest' as const,
            householdMembers: [companion.name, ...companion.subs],
          })),
        ],
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
      setStorySwitcher(false);
      resetStoryDraft();
      showToast('ماجرای آزمایشی ساخته شد؛ پیامکی ارسال نمی‌شود.');
      return;
    }

    setCloudBusy(true);
    try {
      const ownerName = accountName.trim() || 'من';
      const nextStoryId = await createOnlineStory(name, newStoryTemplate, ownerUnits, [ownerName, ...cleanFamilyNames]);
      // The story exists from here on, so a companion that fails to save is
      // reported by name instead of throwing the whole creation away.
      const failed: string[] = [];
      for (const companion of companions) {
        try {
          await addOnlineGuest(nextStoryId, companion.name, 1 + companion.subs.length, [companion.name, ...companion.subs]);
        } catch {
          failed.push(companion.name);
        }
      }
      await syncFromCloud(nextStoryId, true);
      setStoryModal(false);
      setStorySwitcher(false);
      resetStoryDraft();
      showToast(failed.length
        ? `ماجرا ساخته شد، ولی ${failed.join('، ')} اضافه نشد؛ از «افزودن نفر» دوباره امتحان کن.`
        : 'ماجرای آنلاین جدیدت آماده‌ست');
    } catch (error) {
      showToast(friendlyError(error, 'ساخت ماجرا ناموفق بود'));
    } finally {
      setCloudBusy(false);
    }
  }

  function openNewStory() {
    resetStoryDraft();
    setNewStoryTemplate('restaurant');
    setStorySwitcher(false);
    setStoryModal(true);
  }

  function switchStory(story: Story) {
    hydrateActiveStory(story);
    // A filter left over from the previous story silently hides expenses here.
    setExpenseFilter('all');
    setTab('home');
    setStoriesHome(false);
    setStorySwitcher(false);
    showToast(`وارد «${story.name}» شدی`);
  }

  async function finishStory() {
    if (!storyId || storyCompleted || cloudBusy) return;
    if (isLocalWebPreview) {
      setStories((current) => current.map((story) => (story.id === storyId ? { ...story, status: 'completed' as const } : story)));
      setFinishModal(false);
      setStoriesHome(true);
      setTab('home');
      showToast(`ماجرای «${storyName}» با موفقیت تمام شد`);
      return;
    }
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
      showToast(friendlyError(error, 'اتمام ماجرا ناموفق بود'));
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

  function toggleExpensePerson(id: string) {
    setSelectedPersonIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
    void Haptics.selectionAsync();
  }

  function showToast(message: string) {
    // Without clearing the previous timer, a second toast inherits the first
    // one's countdown and can vanish almost immediately.
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => {
      toastTimer.current = null;
      setToast('');
    }, 2800);
  }

  function openNotification(item: AccountNotification) {
    switchStory(item.story);
    setTab('settlement');
    setStoriesHome(false);
    setNotificationsModal(false);
  }

  async function markTransferPaid(transfer: Transfer) {
    if (!storyId || cloudBusy) return;
    if (isLocalWebPreview) {
      const payment: SettlementPayment = { id: `local-payment-${Date.now()}`, createdAt: new Date().toISOString(), fromId: transfer.fromId, toId: transfer.toId, amount: transfer.amount };
      setPayments((current) => [...current, payment]);
      setStories((current) => current.map((story) => (story.id === storyId
        ? { ...story, payments: [...(story.payments ?? []), payment] }
        : story)));
      setPendingTransfer(null);
      showToast('پرداخت آزمایشی ثبت شد.');
      return;
    }
    setCloudBusy(true);
    try {
      await recordOnlinePayment(storyId, transfer);
      await syncFromCloud(storyId);
      setPendingTransfer(null);
      showToast('پرداخت آنلاین ثبت شد و مانده‌حساب‌ها به‌روز شدند');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      showToast(friendlyError(error, 'ثبت پرداخت ناموفق بود'));
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
      // Mirrors the server trigger so the ownership controls are exercisable here.
      const localExpense = { ...nextExpense, id: editingExpense?.id ?? `local-expense-${Date.now()}`, createdById: currentUserId };
      setExpenses((current) => (editingExpense
        ? current.map((item) => (item.id === editingExpense.id ? localExpense : item))
        : [localExpense, ...current]));
      setEditingExpense(null);
      setExpenseModal(false);
      setTab('home');
      showToast(editingExpense ? 'خرج آزمایشی ویرایش شد.' : 'خرج آزمایشی با افراد انتخاب‌شده ثبت شد.');
      return;
    }
    setCloudBusy(true);
    try {
      if (editingExpense) {
        await updateOnlineExpense(editingExpense.id, nextExpense);
        await syncFromCloud(storyId);
        setEditingExpense(null);
        setExpenseModal(false);
        setTab('home');
        showToast('خرج ویرایش شد و دنگ‌ها دوباره محاسبه شدند');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }
      await createOnlineExpense(storyId, nextExpense);
      await syncFromCloud(storyId);
      setExpenseModal(false);
      setTab('home');
      showToast('هزینه آنلاین ثبت شد و برای همه اعضا به‌روز شد');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void showExpenseInterstitial();
    } catch (error) {
      showToast(friendlyError(error, 'ثبت خرج ناموفق بود'));
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
      showToast(friendlyError(error, 'افزودن عضو ناموفق بود'));
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
    setNewMemberFamilyOpen(false);
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
      showToast(friendlyError(error, 'ویرایش عضو ناموفق بود'));
    } finally {
      setCloudBusy(false);
    }
  }

  async function removeGuestMember(member: Member) {
    if (!storyId || cloudBusy) return;
    if (isLocalWebPreview) {
      setMembers((current) => current.filter((item) => item.id !== member.id));
      setDeleteMemberTarget(null);
      setEditMemberModal(false);
      showToast(`${member.name} حذف شد`);
      return;
    }
    setCloudBusy(true);
    try {
      await deleteOnlineGuest(member.id);
      await syncFromCloud(storyId);
      setDeleteMemberTarget(null);
      setEditMemberModal(false);
      showToast(`${member.name} از این ماجرا حذف شد`);
    } catch (error) {
      setDeleteMemberTarget(null);
      showToast(friendlyError(error, 'حذف این نفر ناموفق بود'));
    } finally {
      setCloudBusy(false);
    }
  }

  async function deleteStory() {
    if (!storyId || !canManageGuests || cloudBusy) return;
    const deletedName = storyName;
    if (isLocalWebPreview) {
      setStories((current) => current.filter((story) => story.id !== storyId));
      setDeleteStoryModal(false);
      setStoriesHome(true);
      setTab('home');
      setStoryId('');
      setStoryName('');
      setMembers([]);
      setExpenses([]);
      setPayments([]);
      showToast(`ماجرای «${deletedName}» حذف شد`);
      return;
    }
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
      showToast(friendlyError(error, 'حذف ماجرا ناموفق بود'));
    } finally {
      setCloudBusy(false);
    }
  }

  function openJoinModal() {
    setJoinCode('');
    setJoinUnits('1');
    setJoinHouseholdNameInputs([]);
    setJoinFamilyOpen(false);
    setJoinModal(true);
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
      setJoinFamilyOpen(false);
      setJoinModal(false);
      showToast('با موفقیت به ماجرا پیوستی');
    } catch (error) {
      showToast(friendlyError(error, 'کد دعوت معتبر نیست'));
    } finally {
      setCloudBusy(false);
    }
  }

  async function copyCardNumber(card: string, ownerName: string) {
    await Clipboard.setStringAsync(card);
    showToast(`شماره کارت ${ownerName} کپی شد`);
    void Haptics.selectionAsync();
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
        {canEditExpense(expense) && <Pencil size={13} color={C.faint} />}
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
          {/* "۱ نماینده" was the data model talking. The account count only says
              anything once it differs from the head count. */}
          <AppText style={styles.dashboardStoryMeta}>{peopleCount === story.members.length
            ? `${faNumber.format(peopleCount)} نفر · ${faNumber.format(story.expenses.length)} خرج`
            : `${faNumber.format(peopleCount)} نفر در ${faNumber.format(story.members.length)} حساب · ${faNumber.format(story.expenses.length)} خرج`}</AppText>
          <AppText style={styles.dashboardStoryTotal}>{formatMoney(storyTotal)}</AppText>
        </View>
        <ChevronLeft size={20} color={completed ? C.faint : C.purple} />
      </Pressable>
    );
  }

  function renderFamilyInfoModal() {
    return (
      <Modal visible={familyInfoModal} animationType="fade" transparent onRequestClose={() => setFamilyInfoModal(false)}>
        <View style={[styles.centeredBackdrop, { paddingBottom: 22 + bottomInset }]}>
          <View style={styles.finishDialog} accessibilityViewIsModal>
            <View style={styles.dialogIcon}><Users size={26} color={C.purple} /></View>
            <AppText style={styles.dialogTitle}>وقتی خانواده را ثبت می‌کنی چه می‌شود؟</AppText>

            <View style={styles.familyInfoRow}>
              <View style={[styles.familyInfoBullet, { backgroundColor: C.mintPale }]}><Check size={12} color={C.mintDark} /></View>
              <AppText style={styles.familyInfoText}>در هر خرج، هر عضو خانواده یک سهم جداگانه حساب می‌شود؛ انگار همه سر میز بوده‌اند.</AppText>
            </View>
            <View style={styles.familyInfoRow}>
              <View style={[styles.familyInfoBullet, { backgroundColor: C.mintPale }]}><Check size={12} color={C.mintDark} /></View>
              <AppText style={styles.familyInfoText}>ولی تسویه یک‌جاست: دنگ همه‌شان روی حساب تو جمع می‌شود و تو یک‌بار پرداخت یا دریافت می‌کنی.</AppText>
            </View>
            <View style={styles.familyInfoRow}>
              <View style={[styles.familyInfoBullet, { backgroundColor: C.debtPale }]}><X size={12} color={C.debt} /></View>
              <AppText style={styles.familyInfoText}>اینجا جای دوستان نیست. هر کسی که خودش جدا تسویه می‌کند باید عضو جدا باشد.</AppText>
            </View>

            <AppText style={styles.familyInfoExample}>
              مثال: شام ۴۰۰ هزار تومان بین ۴ نفر. اگر تو و همسرت با یک حساب باشید، سهم شما ۲۰۰ هزار تومان می‌شود و همان یک مبلغ با تو تسویه می‌شود.
            </AppText>

            <Pressable accessibilityRole="button" onPress={() => setFamilyInfoModal(false)} style={[styles.expenseDetailsCloseButton, styles.familyInfoButton]}>
              <AppText style={styles.expenseDetailsCloseText}>متوجه شدم</AppText>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  function renderStorySheetBody() {
    if (storyStep === 1) {
      return (
        <>
          <AppText style={styles.formLabel}>اسم این ماجرا چیه؟</AppText>
          <AppText style={styles.storyNameHelper}>اسم همان شام، سفر یا خریدی که می‌خواهی خرجش را با بقیه حساب کنی.</AppText>
          <TextInput style={styles.formInput} value={newStoryName} onChangeText={setNewStoryName} placeholder="مثلاً شام جمعه" placeholderTextColor={C.faint} textAlign="right" autoFocus />

          <AppText style={styles.formLabel}>چه جور ماجراییه؟</AppText>
          <View style={styles.storyTemplateGrid}>
            {STORY_TEMPLATES.map((template) => {
              const active = newStoryTemplate === template.id;
              return <Pressable key={template.id} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => setNewStoryTemplate(template.id)} style={[styles.storyTemplate, active && styles.storyTemplateActive]}><AppText style={styles.storyTemplateEmoji}>{template.emoji}</AppText><AppText style={[styles.storyTemplateText, active && styles.storyTemplateTextActive]}>{template.label}</AppText>{active && <View style={styles.storyTemplateCheck}><Check size={11} color="#FFFFFF" /></View>}</Pressable>;
            })}
          </View>
          <AppText style={styles.storyHelper}>این فقط برای ظاهرش است؛ توی حساب‌وکتاب هیچ فرقی نمی‌کند.</AppText>

          <Pressable accessibilityRole="button" disabled={!newStoryName.trim()} onPress={goToPeopleStep} style={[styles.createStoryButton, !newStoryName.trim() && styles.saveButtonDisabled]}>
            <ArrowLeft size={20} color="#FFFFFF" />
            <AppText style={styles.saveButtonText}>بعدی: چه کسانی هستند؟</AppText>
          </Pressable>
        </>
      );
    }

    const namedCompanions = newCompanions.filter((item) => item.name.trim());
    const headcount = splitByFamily
      ? 1 + ownerSubNames.filter((item) => item.trim()).length
        + namedCompanions.reduce((sum, item) => sum + 1 + item.subs.filter((sub) => sub.trim()).length, 0)
      : 1 + namedCompanions.length;

    // A filled circle with the first letter is the clearest "this one is
    // written down" signal there is; an empty outline reads as a blank waiting
    // to be filled. Testers could not tell the two apart from the box colours.
    function renderInitial(name: string, color: string, size = 34) {
      const trimmed = name.trim();
      return (
        <View style={[
          styles.peopleInitial,
          { width: size, height: size, borderRadius: size * 0.36 },
          trimmed ? { backgroundColor: color } : styles.peopleInitialEmpty,
        ]}>
          {trimmed ? <AppText style={styles.peopleInitialText}>{trimmed.slice(0, 1)}</AppText> : null}
        </View>
      );
    }

    function renderSubNames(headName: string, color: string, subs: string[], onChange: (index: number, value: string) => void, onRemove: (index: number) => void, onAdd: () => void) {
      const owner = headName.trim();
      return (
        <View style={styles.subList}>
          {subs.map((value, subIndex) => (
            <View key={subIndex} style={styles.subRow}>
              {renderInitial(value, color, 28)}
              <TextInput
                value={value}
                onChangeText={(text) => onChange(subIndex, text)}
                style={styles.subNameInput}
                placeholder={owner ? `یکی از خانوادهٔ ${owner}` : 'اسم عضو خانواده'}
                placeholderTextColor={C.faint}
                textAlign="right"
              />
              <Pressable accessibilityRole="button" accessibilityLabel="حذف این عضو" onPress={() => onRemove(subIndex)} style={styles.subRemove}>
                <X size={13} color={C.debt} />
              </Pressable>
            </View>
          ))}
          <Pressable accessibilityRole="button" onPress={onAdd} style={styles.addSubButton}>
            <Plus size={14} color={C.purple} />
            <AppText style={styles.addSubText}>{owner ? `افزودن عضو خانوادهٔ ${owner}` : 'افزودن عضو خانواده'}</AppText>
          </Pressable>
        </View>
      );
    }

    const myName = accountName.trim();

    return (
      <>
        <View style={styles.shareModeTabs}>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: !splitByFamily }}
            onPress={() => setSplitByFamily(false)}
            style={[styles.shareModeTab, !splitByFamily && styles.shareModeTabActive]}
          >
            <AppText style={[styles.shareModeTabTitle, !splitByFamily && styles.shareModeTabTitleActive]}>هر کس جدا</AppText>
            <AppText style={styles.shareModeTabHint}>هر نفر دنگ خودش را می‌دهد</AppText>
          </Pressable>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: splitByFamily }}
            onPress={() => setSplitByFamily(true)}
            style={[styles.shareModeTab, splitByFamily && styles.shareModeTabActive]}
          >
            <AppText style={[styles.shareModeTabTitle, splitByFamily && styles.shareModeTabTitleActive]}>خانوادگی</AppText>
            <AppText style={styles.shareModeTabHint}>دنگ خانواده یک‌جا داده می‌شود</AppText>
          </Pressable>
        </View>

        <AppText style={styles.peopleIntroText}>{splitByFamily
          ? 'برای هر خانواده، اسم سرپرست را بنویس — کسی که آخرش تسویه می‌کند — و زیرش بقیهٔ خانواده را. سهم هر نفر جدا حساب می‌شود، ولی یک مبلغ با سرپرست تسویه می‌شود.'
          : 'اسم همه را بنویس. بعد از ساخت ماجرا می‌توانی با کد دعوت، هر کدام را که اپ دارد هم به ماجرا بیاوری.'}</AppText>

        <View style={styles.peopleList}>
          <View style={[styles.peopleCard, styles.peopleCardSelf]}>
            <View style={styles.peopleCardHead}>
              {renderInitial(myName || 'ت', AVATAR_COLORS[0])}
              <AppText style={styles.selfRowName}>{myName || 'خودت'}</AppText>
              <View style={styles.meBadge}><AppText style={styles.meText}>تو</AppText></View>
            </View>
            {splitByFamily && renderSubNames(
              myName,
              AVATAR_COLORS[0],
              ownerSubNames,
              (index, value) => setOwnerSubNames((current) => current.map((item, i) => (i === index ? value : item))),
              (index) => setOwnerSubNames((current) => current.filter((_, i) => i !== index)),
              () => setOwnerSubNames((current) => [...current, '']),
            )}
          </View>

          {newCompanions.map((companion, index) => {
            const color = AVATAR_COLORS[(index + 1) % AVATAR_COLORS.length];
            return (
              <View key={index} style={styles.peopleCard}>
                <View style={styles.peopleCardHead}>
                  {renderInitial(companion.name, color)}
                  <TextInput
                    autoFocus={index === newCompanions.length - 1 && !companion.name}
                    value={companion.name}
                    onChangeText={(text) => changeCompanionName(index, text)}
                    style={styles.headNameInput}
                    placeholder={splitByFamily ? 'سرپرست خانواده' : `اسم نفر ${faNumber.format(index + 2)}`}
                    placeholderTextColor={C.faint}
                    textAlign="right"
                  />
                  <Pressable accessibilityRole="button" accessibilityLabel={`حذف نفر ${faNumber.format(index + 2)}`} onPress={() => removeCompanionField(index)} style={styles.companionRemove}>
                    <X size={15} color={C.debt} />
                  </Pressable>
                </View>
                {splitByFamily && renderSubNames(
                  companion.name,
                  color,
                  companion.subs,
                  (subIndex, value) => changeCompanionSub(index, subIndex, value),
                  (subIndex) => removeCompanionSub(index, subIndex),
                  () => addCompanionSub(index),
                )}
              </View>
            );
          })}
        </View>

        <Pressable accessibilityRole="button" onPress={() => setNewCompanions((current) => [...current, { name: '', subs: [] }])} style={styles.addCompanionButton}>
          <UserPlus size={17} color={C.purple} />
          <AppText style={styles.addCompanionText}>{splitByFamily ? 'افزودن خانواده' : 'افزودن نفر'}</AppText>
        </Pressable>

        <View style={styles.storyStepActions}>
          <Pressable accessibilityRole="button" onPress={() => setStoryStep(1)} style={styles.storyBackButton}>
            <ArrowRight size={18} color={C.purple} />
            <AppText style={styles.storyBackText}>مرحله قبل</AppText>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={cloudBusy} onPress={() => void createStory()} style={[styles.createStoryButtonGrow, cloudBusy && styles.saveButtonDisabled]}>
            <Check size={20} color="#FFFFFF" />
            <AppText style={styles.saveButtonText}>{headcount === 1
              ? 'فعلاً فقط خودم'
              : `ساخت ماجرا برای ${faNumber.format(headcount)} نفر`}</AppText>
          </Pressable>
        </View>
      </>
    );
  }

  function renderStoriesDashboard() {
    const ongoing = stories.filter((story) => story.status === 'active');
    const completed = stories.filter((story) => story.status === 'completed');
    return (
      <>
        <View style={styles.dashboardHero}>
          <View style={styles.dashboardHeroIcon}><WalletCards size={27} color={C.purple} /></View>
          <View style={styles.dashboardHeroCopy}><AppText style={styles.dashboardEyebrow}>ماجراهای من</AppText><AppText style={styles.dashboardTitle}>{ongoing.length
              ? `${faNumber.format(ongoing.length)} ماجرای در جریان`
              : completed.length ? 'همه ماجراهایت تمام شده' : 'هنوز ماجرایی نداری'}</AppText><AppText style={styles.dashboardText}>{ongoing.length
              ? 'یکی را باز کن تا خرج‌ها و حسابش را ببینی.'
              : 'هر وقت خرج مشترک تازه‌ای داشتی، یک ماجرای جدید بساز.'}</AppText></View>
        </View>
        <View style={styles.dashboardActions}>
          <Pressable accessibilityRole="button" onPress={openNewStory} style={styles.dashboardNewStory}><Plus size={19} color="#FFFFFF" /><AppText style={styles.dashboardNewStoryText}>ساخت ماجرای جدید</AppText></Pressable>
          <Pressable accessibilityRole="button" onPress={openJoinModal} style={styles.dashboardJoinStory}><UserPlus size={18} color={C.purple} /><AppText style={styles.dashboardJoinStoryText}>پیوستن با کد</AppText></Pressable>
        </View>

        <View style={styles.dashboardSectionHead}><View style={styles.ongoingCount}><AppText style={styles.ongoingCountText}>{faNumber.format(ongoing.length)}</AppText></View><AppText style={styles.sectionTitle}>ماجراهای در جریان</AppText></View>
        <View style={styles.dashboardStoryList}>{ongoing.length ? ongoing.map(renderStoryCard) : <View style={styles.inlineEmpty}><AppText style={styles.inlineEmptyTitle}>ماجرای در جریانی نداری</AppText><AppText style={styles.inlineEmptyText}>یک ماجرای تازه بساز و خرج‌ها را ثبت کن.</AppText></View>}</View>

        {completed.length > 0 && (
          <>
            <View style={styles.dashboardSectionHead}><View style={styles.completedCount}><AppText style={styles.completedCountText}>{faNumber.format(completed.length)}</AppText></View><AppText style={styles.sectionTitle}>ماجراهای تمام‌شده</AppText></View>
            <View style={styles.dashboardStoryList}>{completed.map(renderStoryCard)}</View>
          </>
        )}
      </>
    );
  }

  function renderAccount() {
    return (
      <View style={styles.accountPage}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="حساب کاربری"
          accessibilityHint="نگه‌داشتن طولانی، وضعیت فنی تبلیغ‌ها را نشان می‌دهد"
          delayLongPress={800}
          onLongPress={() => { setAdPanelOpen((open) => !open); void Haptics.selectionAsync(); }}
          style={styles.accountHero}
        >
          <View style={styles.accountHeroIcon}><UserRound size={30} color="#FFFFFF" /></View>
          <View style={styles.accountHeroCopy}><AppText style={styles.accountTitle}>حساب من</AppText><AppText style={styles.accountSubtitle}>این‌ها را فقط برای این می‌پرسیم که بقیه بدانند دنگت را کجا بریزند.</AppText></View>
        </Pressable>
        {adPanelOpen && (
          <View style={styles.adPanel}>
            <View style={styles.adPanelHead}>
              <Pressable accessibilityRole="button" accessibilityLabel="بستن" onPress={() => setAdPanelOpen(false)}><X size={17} color={C.muted} /></Pressable>
              <AppText style={styles.adPanelTitle}>وضعیت تبلیغ‌ها</AppText>
            </View>
            {adInfo ? (
              <>
                <AppText style={styles.adPanelRow}>ماژول تپسل: {adInfo.moduleLinked ? 'متصل ✓' : 'متصل نیست ✗'}</AppText>
                <AppText style={styles.adPanelRow}>
                  اینترستیشیال: {adInfo.interstitial.ready ? 'آماده ✓' : adInfo.interstitial.requesting ? 'در حال درخواست…' : 'خالی'}
                </AppText>
                {adInfo.interstitial.lastError ? <AppText style={styles.adPanelError} selectable>{adInfo.interstitial.lastError}</AppText> : null}
                <AppText style={styles.adPanelRow}>
                  کارت همسان: {adInfo.nativeAd.loaded ? 'روی صفحه ✓' : adInfo.nativeAd.requesting ? 'در حال درخواست…' : 'نیامده'}
                </AppText>
                {adInfo.nativeAd.lastError ? <AppText style={styles.adPanelError} selectable>{adInfo.nativeAd.lastError}</AppText> : null}
                {!adInfo.interstitial.lastError && !adInfo.nativeAd.lastError && (
                  <AppText style={styles.adPanelHint}>تا این لحظه خطایی ثبت نشده.</AppText>
                )}
              </>
            ) : <AppText style={styles.adPanelHint}>در حال خواندن…</AppText>}
            <Pressable accessibilityRole="button" onPress={() => { retryAds(); showToast('درخواست تبلیغ دوباره فرستاده شد'); }} style={styles.adPanelButton}>
              <AppText style={styles.adPanelButtonText}>تلاش دوباره</AppText>
            </Pressable>
            <AppText style={styles.adPanelHint}>این پنل فقط برای عیب‌یابی است. اگر خطایی اینجا بود، همان متن را برای پشتیبانی بفرست.</AppText>
          </View>
        )}
        {accountLoading ? <View style={styles.accountCard}><AppText style={styles.accountHint}>اطلاعات حساب در حال بارگذاری است…</AppText></View> : <View style={styles.accountCard}>
          <AppText style={styles.accountSectionTitle}>اطلاعات من</AppText>
          <AppText style={styles.accountLabel}>اسم تو <AppText style={styles.requiredMark}>*</AppText></AppText>
          <TextInput accessibilityLabel="اسم تو" value={accountName} onChangeText={setAccountName} placeholder="مثلاً امیر" placeholderTextColor={C.faint} style={styles.accountInput} textAlign="right" />
          <AppText style={styles.accountLabel}>شماره موبایل</AppText>
          {accountPhone ? (
            <View style={styles.readonlyField}>
              <AppText style={styles.readonlyValue}>{accountPhone}</AppText>
              <AppText style={styles.readonlyHint}>حسابت به این شماره وصل است. روی گوشی جدید با همین شماره وارد شو تا همه‌چیز برگردد.</AppText>
            </View>
          ) : phoneStage === 'idle' ? (
            <View style={styles.phoneLinkBox}>
              <AppText style={styles.phoneLinkTitle}>هنوز شماره‌ای ثبت نکرده‌ای</AppText>
              <AppText style={styles.phoneLinkText}>شماره دادن اجباری نیست، ولی اگر ندهی و گوشی‌ات عوض شود یا اپ را پاک کنی، همه‌چیز از دست می‌رود.</AppText>
              <TextInput
                accessibilityLabel="شماره موبایل برای ثبت"
                value={phoneInput}
                onChangeText={(value) => { setPhoneInput(toLatinDigits(value).slice(0, 11)); setPhoneError(''); }}
                placeholder="۰۹۱۲۱۲۳۴۵۶۷"
                placeholderTextColor={C.faint}
                keyboardType="phone-pad"
                maxLength={11}
                style={styles.phoneLinkInput}
                textAlign="center"
              />
              {phoneError ? <AppText style={styles.accountError}>{phoneError}</AppText> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: phoneBusy || !toIranPhone(phoneInput) }}
                disabled={phoneBusy || !toIranPhone(phoneInput)}
                onPress={() => void startPhoneLink()}
                style={({ pressed }) => [styles.phoneLinkButton, pressed && styles.pressed, (phoneBusy || !toIranPhone(phoneInput)) && styles.saveButtonDisabled]}
              >
                <AppText style={styles.phoneLinkButtonText}>{phoneBusy ? 'در حال ارسال…' : 'ارسال کد تأیید'}</AppText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.phoneLinkBox}>
              <AppText style={styles.phoneLinkTitle}>کد پیامک‌شده را وارد کن</AppText>
              <AppText style={styles.phoneLinkText}>کد شش‌رقمی به {phonePending} فرستاده شد.</AppText>
              <TextInput
                accessibilityLabel="کد تأیید شماره موبایل"
                value={phoneOtp}
                onChangeText={(value) => { setPhoneOtp(toLatinDigits(value).slice(0, 6)); setPhoneError(''); }}
                placeholder="ــــــ"
                placeholderTextColor={C.faint}
                keyboardType="number-pad"
                maxLength={6}
                style={[styles.phoneLinkInput, styles.phoneOtpInput]}
                textAlign="center"
                autoFocus
              />
              <AppText style={styles.phoneLinkTimer}>{phoneSecondsLeft > 0
                ? `اعتبار کد: ${faNumber.format(phoneSecondsLeft)} ثانیه`
                : 'اعتبار کد تمام شد؛ دوباره کد بگیر.'}</AppText>
              {phoneError ? <AppText style={styles.accountError}>{phoneError}</AppText> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: phoneBusy || toLatinDigits(phoneOtp).length !== 6 }}
                disabled={phoneBusy || toLatinDigits(phoneOtp).length !== 6}
                onPress={() => void confirmPhoneLink()}
                style={({ pressed }) => [styles.phoneLinkButton, pressed && styles.pressed, (phoneBusy || toLatinDigits(phoneOtp).length !== 6) && styles.saveButtonDisabled]}
              >
                <AppText style={styles.phoneLinkButtonText}>{phoneBusy ? 'در حال بررسی…' : 'تأیید و ثبت شماره'}</AppText>
              </Pressable>
              <View style={styles.phoneLinkActions}>
                <Pressable accessibilityRole="button" onPress={cancelPhoneLink}><AppText style={styles.phoneLinkSecondary}>انصراف</AppText></Pressable>
                {phoneSecondsLeft === 0 && <Pressable accessibilityRole="button" disabled={phoneBusy} onPress={() => void startPhoneLink()}><AppText style={styles.phoneLinkSecondary}>ارسال دوباره کد</AppText></Pressable>}
              </View>
            </View>
          )}
          <AppText style={styles.accountLabel}>شماره کارت برای دریافت دنگ <AppText style={styles.optionalMark}>اختیاری</AppText></AppText>
          <TextInput accessibilityLabel="شماره کارت دریافت دنگ" value={accountCardNumber} onChangeText={(value) => setAccountCardNumber(normalizeDigits(value).slice(0, 16))} placeholder="۱۶ رقم بدون فاصله" placeholderTextColor={C.faint} keyboardType="number-pad" style={[styles.accountInput, styles.accountCardInput]} textAlign="center" />
          <AppText style={styles.accountHint}>رمز، CVV2 و تاریخ انقضا دریافت یا ذخیره نمی‌شوند.</AppText>
          {accountError ? <AppText style={styles.accountError}>{accountError}</AppText> : null}
          <Pressable accessibilityRole="button" disabled={accountSaving} onPress={() => void saveAccount()} style={({ pressed }) => [styles.accountSaveButton, pressed && styles.pressed, accountSaving && styles.saveButtonDisabled]}><AppText style={styles.accountSaveText}>{accountSaving ? 'در حال ذخیره…' : 'ذخیره تغییرات'}</AppText></Pressable>
        </View>}
        <Pressable accessibilityRole="button" disabled={cloudBusy} onPress={() => setSignOutModal(true)} style={({ pressed }) => [styles.accountLogoutButton, pressed && styles.pressed, cloudBusy && { opacity: 0.65 }]}><LogOut size={18} color={C.debt} /><AppText style={styles.accountLogoutText}>خروج از حساب</AppText></Pressable>
        {/* The ad diagnostics panel is support tooling, not a feature. It stays
            reachable by long-pressing the header above, so nobody has to read
            "وضعیت فنی تبلیغ‌ها" and wonder whether it is something they broke. */}
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
            {/* A balance of zero used to read "طلب داری ۰ تومان". */}
            <AppText style={styles.heroLabel}>{currentBalance === 0 ? 'حسابت با بقیه صاف است' : positive ? 'بقیه به تو بدهکارند' : 'تو بدهکاری'}</AppText>
            {currentBalance !== 0 && <AppText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55} style={styles.heroAmount}>{formatMoney(Math.abs(currentBalance))}</AppText>}
            <AppText style={styles.heroHint}>{currentBalance === 0
              ? 'نه از کسی طلب داری، نه به کسی بدهکاری.'
              : 'برای اینکه ببینی چه کسی به چه کسی بدهد، پایین «تسویه» را بزن.'}</AppText>
          </View>
          <Image source={require('./assets/dong-mascot-optimized.png')} style={styles.heroMascot} resizeMode="contain" />
        </LinearGradient>

        {homeAd && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`تبلیغ: ${homeAd.title ?? ''}`}
            onPress={() => reportNativeAdClick(homeAd.responseId)}
            style={({ pressed }) => [styles.adCard, pressed && styles.pressed]}
          >
            {homeAd.iconUrl || homeAd.imageUrl
              ? <Image source={{ uri: homeAd.iconUrl ?? homeAd.imageUrl }} style={styles.adCardImage} resizeMode="cover" />
              : null}
            <View style={styles.adCardCopy}>
              <View style={styles.adCardTitleRow}>
                <View style={styles.adCardTag}><AppText style={styles.adCardTagText}>تبلیغ</AppText></View>
                <AppText numberOfLines={1} style={styles.adCardTitle}>{homeAd.title ?? 'پیشنهاد ویژه'}</AppText>
              </View>
              {homeAd.description ? <AppText numberOfLines={2} style={styles.adCardText}>{homeAd.description}</AppText> : null}
            </View>
            {homeAd.callToAction
              ? <View style={styles.adCardCta}><AppText style={styles.adCardCtaText}>{homeAd.callToAction}</AppText></View>
              : <ChevronLeft size={18} color={C.purple} />}
          </Pressable>
        )}

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: C.yellowPale }]}>
            <View style={[styles.statIcon, { backgroundColor: C.yellow }]}><ReceiptText size={20} color={C.ink} /></View>
            <View style={styles.statCopy}>
              <AppText style={styles.statLabel}>کل خرج ماجرا</AppText>
              <AppText style={styles.statValue}>{formatMoney(total)}</AppText>
            </View>
          </View>
          <View style={[styles.statCard, { backgroundColor: C.mintPale }]}>
            <View style={[styles.statIcon, { backgroundColor: C.mint }]}><Users size={20} color="#FFFFFF" /></View>
            <View style={styles.statCopy}>
              <AppText style={styles.statLabel}>اعضا</AppText>
              {/* "۴ نفر و ۴ حساب" reads like a glitch when the two match, and the
                  distinction only earns its place once somebody has a household. */}
              <AppText style={styles.statValue}>{totalShareUnits === members.length
                ? `${faNumber.format(members.length)} نفر`
                : `${faNumber.format(totalShareUnits)} نفر در ${faNumber.format(members.length)} حساب`}</AppText>
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

        <View style={styles.membersStrip}>
          {members.map((member) => {
            const balance = balances.find((item) => item.memberId === member.id)?.amount ?? 0;
            return (
              <Pressable key={member.id} accessibilityRole="button" accessibilityLabel={`ویرایش ${member.name}`} accessibilityState={{ disabled: (!canManageGuests && !member.isMe) || storyCompleted }} onPress={() => openMemberEditor(member)} style={({ pressed }) => [styles.memberCard, pressed && (canManageGuests || member.isMe) && !storyCompleted && styles.pressed]}>
                <Avatar member={member} size={48} />
                <View style={styles.memberCardCopy}>
                  <View style={styles.nameRow}>
                    {(canManageGuests || member.isMe) && !storyCompleted && <Pencil size={12} color={C.faint} />}
                    {member.isMe && member.name.trim() !== 'من' && <View style={styles.meBadge}><AppText style={styles.meText}>من</AppText></View>}
                    <AppText style={styles.memberCardName}>{member.name}</AppText>
                  </View>
                  <AppText style={[styles.memberBalance, { color: balance === 0 ? C.muted : balance > 0 ? C.mintDark : C.debt }]}>
                    {balance === 0 ? (member.isMe ? 'حسابت صاف است' : 'حسابش صاف است') : `${balance > 0 ? 'طلبکار' : 'بدهکار'} · ${faNumber.format(Math.abs(balance))}`}
                  </AppText>
                  {/* "۱ سهم" on a one-person account is accounting vocabulary with
                      nothing to say. It only means something above one. */}
                  {(member.shareUnits ?? 1) > 1 && <View style={styles.memberUnitsBadge}><Users size={11} color={C.purple} /><AppText style={styles.memberUnitsText}>دنگ {faNumber.format(member.shareUnits ?? 1)} نفر</AppText></View>}
                  {(member.shareUnits ?? 1) > 1 && <AppText numberOfLines={2} style={styles.householdNamesPreview}>{member.householdMembers?.length ? member.householdMembers.join('، ') : 'برای ثبت اسم افراد، کارت را بزن'}</AppText>}
                </View>
              </Pressable>
            );
          })}
        </View>

        {members.length === 1 && !storyCompleted && (
          <View style={styles.loneMemberNotice}>
            <AppText style={styles.loneMemberTitle}>فعلاً فقط خودت توی این ماجرایی</AppText>
            <AppText style={styles.loneMemberText}>بقیه را دعوت کن به این ماجرا تا دنگ بین همه تقسیم شود. هر کس اپ ندارد، خودت اسمش را ثبت کن.</AppText>
            <View style={styles.loneMemberActions}>
              <Pressable accessibilityRole="button" onPress={() => { openNewMemberModal(); setMemberMode('invite'); }} style={styles.loneMemberButton}>
                <UserPlus size={17} color="#FFFFFF" />
                <AppText style={styles.loneMemberButtonText}>دعوت با کد</AppText>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={openNewMemberModal} style={styles.loneMemberSecondary}>
                <Plus size={16} color={C.purple} />
                <AppText style={styles.loneMemberSecondaryText}>خودم ثبت می‌کنم</AppText>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.sectionHeadSimple}>
          <Pressable accessibilityRole="button" onPress={() => setTab('expenses')}>
            <AppText style={styles.seeAll}>دیدن همه</AppText>
          </Pressable>
          <AppText style={styles.sectionTitle}>آخرین خرج‌ها</AppText>
        </View>
        <View style={styles.expenseList}>
          {expenses.length ? expenses.slice(0, 3).map(renderExpense) : (
            <View style={styles.inlineEmpty}>
              <AppText style={styles.inlineEmptyTitle}>هنوز خرجی ثبت نشده</AppText>
              <AppText style={styles.inlineEmptyText}>{storyCompleted ? 'این ماجرا بدون هیچ خرجی به پایان رسیده است.' : 'اولین خرج را ثبت کن تا دنگ‌ها محاسبه شوند.'}</AppText>
              {!storyCompleted && <Pressable accessibilityRole="button" style={styles.inlineEmptyButton} onPress={openExpenseModal}><Plus size={17} color="#FFFFFF" /><AppText style={styles.inlineEmptyButtonText}>ثبت اولین خرج</AppText></Pressable>}
            </View>
          )}
        </View>
        {storyCompleted ? (
          <View style={styles.finishedNotice}><View style={styles.finishedNoticeIcon}><Check size={20} color={C.mintDark} /></View><View style={styles.finishedNoticeCopy}><AppText style={styles.finishedNoticeTitle}>این ماجرا تمام شده</AppText><AppText style={styles.finishedNoticeText}>همه‌چیزش می‌ماند تا هر وقت خواستی ببینی، ولی دیگر نمی‌شود خرج تازه اضافه کرد.</AppText></View></View>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setFinishModal(true)} style={styles.finishStoryButton}><Check size={19} color={C.mintDark} /><View style={styles.finishStoryCopy}><AppText style={styles.finishStoryTitle}>اتمام ماجرا</AppText><AppText style={styles.finishStoryText}>وقتی همه خرج‌ها ثبت شد و همه تسویه کردند، ماجرا را ببند.</AppText></View></Pressable>
        )}
        {canManageGuests && <Pressable accessibilityRole="button" onPress={() => setDeleteStoryModal(true)} style={styles.deleteStoryButton}><Trash2 size={18} color={C.debt} /><View style={styles.finishStoryCopy}><AppText style={styles.deleteStoryTitle}>حذف ماجرا</AppText><AppText style={styles.finishStoryText}>همه خرج‌ها، اعضا و تسویه‌های این ماجرا حذف می‌شوند.</AppText></View></Pressable>}
      </>
    );
  }

  function renderExpenses() {
    return (
      <>
        <View style={styles.pageIntro}>
          <View style={styles.pageIcon}><ReceiptText size={26} color={C.purple} /></View>
          <View style={styles.pageIntroCopy}>
            <AppText style={styles.pageTitle}>خرج‌های این ماجرا</AppText>
            <AppText style={styles.pageSubtitle}>{expenseFilter === 'all'
              ? `${faNumber.format(expenses.length)} خرج · جمعاً ${formatMoney(total)}`
              : `${faNumber.format(filteredExpenses.length)} از ${faNumber.format(expenses.length)} خرج · ${formatMoney(filteredTotal)}`}</AppText>
          </View>
        </View>
        {/* Filters over a list you can take in at a glance are three controls
            that do nothing yet, and they arrive before the list itself. */}
        {expenses.length > 4 && (
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
        )}
        <View style={styles.expenseList}>{filteredExpenses.length ? filteredExpenses.map(renderExpense) : (
          <View style={styles.inlineEmpty}><AppText style={styles.inlineEmptyTitle}>{expenseFilter === 'all' ? 'هنوز خرجی ثبت نشده' : 'اینجا چیزی نیست'}</AppText><AppText style={styles.inlineEmptyText}>{expenseFilter === 'mine'
            ? 'هنوز پرداختی با حساب تو ثبت نشده.'
            : expenseFilter === 'week'
              ? 'در هفت روز گذشته خرجی ثبت نشده؛ فیلتر «همه» را ببین.'
              : 'با دکمه «خرج جدید» شروع کن.'}</AppText></View>
        )}</View>
      </>
    );
  }

  function renderSettlement() {
    // Nobody can transfer money to someone whose card they cannot see, so ask
    // for it right where the need shows up rather than hiding it in settings.
    const needsOwnCard = !accountLoading && !savedCardNumber.trim() && Boolean(currentUserId);
    const typedCardDigits = normalizeDigits(accountCardNumber).length;
    // Saving a partial number just bounces off the 16-digit rule, so keep the
    // button off until it can actually succeed.
    const cardPromptReady = typedCardDigits === 16 && !accountSaving;
    return (
      <>
        {needsOwnCard && (
          <View style={styles.cardPrompt}>
            <View style={styles.cardPromptHead}>
              <View style={styles.cardPromptIcon}><WalletCards size={22} color={C.purple} /></View>
              <View style={styles.cardPromptCopy}>
                <AppText style={styles.cardPromptTitle}>شماره کارتت را ثبت کن</AppText>
                <AppText style={styles.cardPromptText}>تا وقتی ثبت نکنی، بقیه نمی‌دانند دنگت را به کدام کارت بریزند.</AppText>
              </View>
            </View>
            <TextInput
              accessibilityLabel="شماره کارت برای دریافت دنگ"
              value={accountCardNumber}
              onChangeText={(value) => { setAccountCardNumber(normalizeDigits(value).slice(0, 16)); setAccountError(''); }}
              placeholder="۱۶ رقم بدون فاصله"
              placeholderTextColor={C.faint}
              keyboardType="number-pad"
              style={styles.cardPromptInput}
              textAlign="center"
            />
            {accountError ? <AppText style={styles.accountError}>{accountError}</AppText> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !cardPromptReady }}
              disabled={!cardPromptReady}
              onPress={() => {
                if (!accountName.trim()) {
                  setTab('account');
                  showToast('اول نامت را در حساب کاربری کامل کن.');
                  return;
                }
                void saveAccount();
              }}
              style={({ pressed }) => [styles.cardPromptButton, pressed && styles.pressed, !cardPromptReady && styles.saveButtonDisabled]}
            >
              <Check size={18} color="#FFFFFF" />
              <AppText style={styles.cardPromptButtonText}>{accountSaving ? 'در حال ذخیره…' : 'ثبت شماره کارت'}</AppText>
            </Pressable>
            <AppText style={styles.cardPromptHint}>{typedCardDigits > 0 && typedCardDigits < 16
              ? `${faNumber.format(typedCardDigits)} از ۱۶ رقم وارد شده.`
              : 'فقط شماره کارت. رمز و CVV2 و تاریخ انقضا را نه می‌پرسیم نه ذخیره می‌کنیم.'}</AppText>
          </View>
        )}
        <View style={styles.settlementHero}>
          <View style={styles.settlementConfettiOne} />
          <View style={styles.settlementConfettiTwo} />
          <View style={styles.settlementHeroIcon}><HandCoins size={30} color={C.purple} /></View>
          <View style={styles.settlementHeroCopy}>
            <AppText style={styles.settlementKicker}>تسویه حساب</AppText>
            <AppText style={styles.settlementHeadline}>{transfers.length
              ? `${faNumber.format(transfers.length)} پرداخت مانده تا حساب همه صاف شود`
              : 'حساب همه صاف است'}</AppText>
            <AppText style={styles.settlementDescription}>{transfers.length
              ? 'پایین نوشته چه کسی به چه کسی چقدر بدهد. هر پرداختی که انجام شد، همان‌جا ثبتش کن.'
              : 'حساب همه با هم صاف است. تا خرج تازه‌ای ثبت نشود، اینجا کاری نداری.'}</AppText>
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
                  {/* A leading + or − is a maths convention, not a Persian one.
                      The words say the same thing without needing to be taught. */}
                  <AppText style={[styles.balancePillValue, { color: positive ? C.mintDark : C.debt }]}>
                    {balance.amount === 0
                      ? (member?.isMe ? 'حسابت صاف است' : 'حسابش صاف است')
                      : `${faNumber.format(Math.abs(balance.amount))} ${positive ? 'طلبکار' : 'بدهکار'}`}
                  </AppText>
                </View>
              </View>
            );
          })}
        </View>

        {/* "کمینه قطعی" was the algorithm describing itself. Whether the plan is
            provably minimal or merely direct changes nothing the user has to do. */}
        {transfers.length > 0 && (
          <View style={styles.sectionHeadSimple}>
            <AppText style={styles.sectionTitle}>چه کسی به چه کسی پول بدهد</AppText>
          </View>
        )}
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
            const toCard = memberCards[transfer.toId];
            return (
              <View style={styles.transferCard} key={`${transfer.fromId}-${transfer.toId}-${index}`}>
                <View style={styles.stepBadge}><AppText style={styles.stepNumber}>{faNumber.format(index + 1)}</AppText></View>
                <View style={styles.transferPeople}>
                  <View style={styles.transferPerson}><Avatar member={from} size={44} /><AppText style={styles.transferName}>{from?.isMe ? 'من' : from?.name}</AppText><AppText style={styles.transferRole}>می‌دهد به</AppText></View>
                  <View style={styles.transferArrow}><ArrowLeft size={23} color={C.purple} strokeWidth={2.5} /></View>
                  <View style={styles.transferPerson}><Avatar member={to} size={44} /><AppText style={styles.transferName}>{to?.isMe ? 'من' : to?.name}</AppText><AppText style={styles.transferRole}>می‌گیرد</AppText></View>
                </View>
                <View style={styles.transferDivider} />
                {toCard ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`کپی شماره کارت ${to?.name}`}
                    onPress={() => void copyCardNumber(toCard, to?.name ?? '')}
                    style={({ pressed }) => [styles.transferCardRow, pressed && styles.pressed]}
                  >
                    <View style={styles.transferCardCopyIcon}><Copy size={15} color={C.purple} /></View>
                    <View style={styles.transferCardCopy}>
                      <AppText style={styles.transferCardLabel}>کارت {to?.name}</AppText>
                      <AppText selectable style={styles.transferCardNumber}>{formatCardNumber(toCard)}</AppText>
                    </View>
                  </Pressable>
                ) : (
                  <View style={styles.transferCardMissing}>
                    <AppText style={styles.transferCardMissingText}>{to?.isMe
                      ? 'هنوز شماره کارتت را نداده‌ای. از بالای همین صفحه واردش کن تا بقیه بتوانند دنگت را بریزند.'
                      : to?.kind === 'guest'
                        ? `${to?.name} در اپ نیست؛ شماره کارتش را باید خودت بپرسی.`
                        : `${to?.name} هنوز شماره کارتی ثبت نکرده.`}</AppText>
                  </View>
                )}
                <View style={styles.transferFooter}>
                  {/* The same button used to say "پرداخت کردم" on every row, even
                      the rows where the reader is the one being paid. */}
                  <Pressable accessibilityRole="button" accessibilityLabel={`ثبت پرداخت ${formatMoney(transfer.amount)} از ${from?.name} به ${to?.name}`} accessibilityState={{ disabled: cloudBusy }} disabled={cloudBusy} style={[styles.paidButton, cloudBusy && styles.saveButtonDisabled]} onPress={() => setPendingTransfer(transfer)}>
                    <Check size={16} color={C.purple} /><AppText style={styles.paidButtonText}>{from?.isMe ? 'پرداخت کردم' : to?.isMe ? 'دریافت کردم' : 'پرداخت شد'}</AppText>
                  </Pressable>
                  <View style={styles.transferAmountBox}>
                    <AppText style={styles.transferAmountLabel}>مبلغ</AppText>
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
      <View style={[styles.safeArea, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <View style={styles.welcomeBrand}>
          <View style={styles.brandCopy}><AppText style={styles.brandName}>دنگودونگ</AppText><AppText style={styles.brandTagline}>خرج کن، راحت تسویه کن</AppText></View>
          <View style={styles.brandMark}><WalletCards size={23} color="#FFFFFF" /></View>
        </View>
        {storiesLoading ? <View style={styles.storiesLoading}><AppText style={styles.welcomeTitle}>ماجراها در حال بارگذاری‌اند…</AppText><AppText style={styles.welcomeText}>چند لحظه صبر کن تا اطلاعات حسابت دریافت شود.</AppText></View> : storiesError ? <View style={styles.storiesLoading}><View style={styles.deleteDialogIcon}><AlertTriangle size={27} color={C.debt} /></View><AppText style={styles.welcomeTitle}>اطلاعاتت دریافت نشد</AppText><AppText style={styles.welcomeText}>{storiesError}</AppText><Pressable accessibilityRole="button" style={styles.primaryStoryButton} onPress={() => void syncFromCloud()}><AppText style={styles.primaryStoryButtonText}>تلاش دوباره</AppText></Pressable></View> : <ScrollView contentContainerStyle={styles.welcomeContent} showsVerticalScrollIndicator={false}>
          <View style={styles.welcomeVisual}>
            <View style={styles.welcomeGlow} />
            <Image source={require('./assets/dong-mascot-optimized.png')} style={styles.welcomeMascot} resizeMode="contain" />
          </View>
          <View style={styles.welcomeCopy}>
            <AppText style={styles.welcomeTitle}>هنوز هیچ ماجرایی نساختی</AppText>
            <AppText style={styles.welcomeText}>هر شام و سفر و خرید مشترکی که خرجش را با هم حساب می‌کنید، اینجا یک «ماجرا» است.</AppText>
            <AppText style={styles.welcomeText}>یک ماجرا بساز و بقیه را دعوت کن. هر کس هم اپ ندارد، خودت اسمش را ثبت کن.</AppText>
          </View>
          <Pressable accessibilityRole="button" style={styles.primaryStoryButton} onPress={openNewStory}>
            <Plus size={21} color="#FFFFFF" />
            <AppText style={styles.primaryStoryButtonText}>ساخت ماجرای جدید</AppText>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.secondaryStoryButton} onPress={openJoinModal}>
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
          <View style={[styles.modalBackdrop, { paddingBottom: bottomInset }]}>
              <View style={[styles.storySheet, { height: sheetHeight }]} accessibilityViewIsModal>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <Pressable accessibilityRole="button" accessibilityLabel="بستن" style={styles.sheetClose} onPress={() => setStoryModal(false)}><X size={21} color={C.ink} /></Pressable>
                <View style={styles.sheetHeaderCopy}><AppText style={styles.sheetTitle}>ماجرای جدید</AppText><AppText style={styles.sheetSubtitle}>{storyStep === 1 ? 'مرحله ۱ از ۲ · موضوع دنگ‌هات' : 'مرحله ۲ از ۲ · چه کسانی هستند'}</AppText></View>
                <View style={styles.sheetSpark}><Sparkles size={20} color={C.purple} /></View>
              </View>
              <ScrollView
                style={styles.sheetScroll}
                contentContainerStyle={styles.storyForm}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {renderStorySheetBody()}
              </ScrollView>
            </View>
          </View>
        </Modal>
        {renderFamilyInfoModal()}
        <Modal visible={joinModal} animationType="fade" transparent onRequestClose={() => setJoinModal(false)}>
          <ScrollView style={styles.centeredScroll} contentContainerStyle={[styles.centeredBackdropContent, { paddingBottom: 22 + bottomInset }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.dialog} accessibilityViewIsModal>
              <View style={styles.dialogIcon}><UserPlus size={26} color={C.purple} /></View>
              <AppText style={styles.dialogTitle}>پیوستن به ماجرا</AppText>
              <AppText style={styles.dialogText}>کدی را که سازنده ماجرا برایت فرستاده وارد کن.</AppText>
              <TextInput autoCapitalize="characters" autoCorrect={false} maxLength={8} style={[styles.formInput, styles.joinCodeInput]} value={joinCode} onChangeText={(value) => setJoinCode(value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())} placeholder="کد ۸ کاراکتری" placeholderTextColor={C.faint} textAlign="center" autoFocus />
              {joinFamilyOpen || joinHouseholdNameInputs.length > 0 ? (
                <>
                  <View style={styles.memberUnitsField}><View style={styles.memberUnitsFieldCopy}><AppText style={styles.formLabelNoMargin}>روی هم چند نفرید؟</AppText><AppText style={styles.formHelper}>شامل خودت؛ حداکثر ۱۲ نفر</AppText></View><TextInput accessibilityLabel="تعداد نفرات حساب" style={styles.memberUnitsInput} value={joinUnits ? faNumber.format(Number(joinUnits)) : ''} onChangeText={(value) => { const normalized = normalizeDigits(value).replace(/^0+/, '').slice(0, 2); const count = Math.min(12, Math.max(1, Number(normalized || 1))); setJoinUnits(normalized); setJoinHouseholdNameInputs((current) => Array.from({ length: count - 1 }, (_, index) => current[index] ?? '')); }} placeholder="۲" placeholderTextColor={C.faint} keyboardType="number-pad" textAlign="center" /></View>
                  {joinHouseholdNameInputs.map((value, index) => <View key={`join-home-${index}`} style={styles.familyInputRow}><AppText style={styles.familyInputLabel}>نفر {faNumber.format(index + 2)}</AppText><TextInput value={value} onChangeText={(text) => setJoinHouseholdNameInputs((current) => current.map((item, itemIndex) => itemIndex === index ? text : item))} style={styles.familyNameInput} placeholder={`اسم نفر ${faNumber.format(index + 2)}`} placeholderTextColor={C.faint} textAlign="right" /></View>)}
                </>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => { setJoinFamilyOpen(true); setJoinUnits('2'); setJoinHouseholdNameInputs(['']); setFamilyInfoModal(true); }} style={styles.splitDisclosure}>
                  <AppText style={styles.splitDisclosureText}>با خانواده‌ات می‌آیی؟</AppText>
                </Pressable>
              )}
              <View style={styles.dialogActions}>
                <Pressable accessibilityRole="button" style={styles.dialogCancel} onPress={() => setJoinModal(false)}><AppText style={styles.dialogCancelText}>انصراف</AppText></Pressable>
                <Pressable accessibilityRole="button" disabled={!joinCode.trim() || joinHouseholdNameInputs.some((name) => name.trim().length < 2) || cloudBusy} style={[styles.dialogAdd, (!joinCode.trim() || joinHouseholdNameInputs.some((name) => name.trim().length < 2) || cloudBusy) && styles.saveButtonDisabled]} onPress={joinStory}><UserPlus size={18} color="#FFFFFF" /><AppText style={styles.dialogAddText}>پیوستن</AppText></Pressable>
              </View>
            </View>
          </ScrollView>
        </Modal>
      </View>
    );
  }

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      {/* The back arrow and the bell used to share one slot, so the only way
          into notifications disappeared on most screens. The bell has its own
          corner now, and the empty view keeps the title centred without it. */}
      <View style={styles.topBar}>
        {canGoBackInApp ? (
          <Pressable accessibilityRole="button" accessibilityLabel="بازگشت به صفحه قبل" onPress={goBackInApp} style={styles.iconButton}><ArrowRight size={21} color={C.ink} /></Pressable>
        ) : <View style={styles.iconButtonPlaceholder} />}
        {storiesHome ? (
          <View style={styles.brand}>
            <View style={styles.brandCopy}><AppText style={styles.brandName}>دنگودونگ</AppText><AppText style={styles.brandTagline}>خرج کن، راحت تسویه کن</AppText></View>
            <View style={styles.brandMark}><WalletCards size={23} color="#FFFFFF" /></View>
          </View>
        ) : (
          /* The brand tagline sat here on every screen. The name of the outing
             you are looking at is more use, and doubles as the switcher that
             used to hide behind an unlabelled "..." icon. */
          <Pressable accessibilityRole="button" accessibilityLabel="تعویض ماجرا" onPress={() => setStorySwitcher(true)} style={({ pressed }) => [styles.brand, pressed && styles.pressed]}>
            <View style={styles.brandCopy}>
              <AppText numberOfLines={1} style={styles.headerStoryName}>{storyName}</AppText>
              <AppText style={styles.brandTagline}>تعویض ماجرا</AppText>
            </View>
            <View style={styles.brandMark}><WalletCards size={23} color="#FFFFFF" /></View>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel={`اعلان‌ها، ${faNumber.format(notificationItems.length)} مورد`} onPress={() => setNotificationsModal(true)} style={styles.iconButton}><Bell size={21} color={C.ink} />{notificationItems.length > 0 && <View style={styles.notificationBadge}><AppText style={styles.notificationBadgeText}>{faNumber.format(notificationItems.length)}</AppText></View>}</Pressable>
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
        {/* Extra room so account fields stay scrollable above the keyboard. */}
        <View style={{ height: (keyboardVisible ? keyboardInset : insets.bottom) + 118 }} />
      </ScrollView>

      {toast ? (
        <View style={styles.toast} accessibilityLiveRegion="polite">
          <View style={styles.toastCheck}><Check size={15} color="#FFFFFF" /></View>
          <AppText style={styles.toastText}>{toast}</AppText>
        </View>
      ) : null}

      {/* The nav floats above the content, so with the keyboard up it would
          otherwise hover over the keyboard and cover the field being typed in. */}
      {!keyboardVisible && <View style={[styles.bottomNav, { bottom: insets.bottom + 10 }]}>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: !storiesHome && tab === 'home' }} onPress={() => { setStoriesHome(false); setTab('home'); }} style={styles.navItem}>
          <View style={[styles.navIconWrap, !storiesHome && tab === 'home' && styles.navIconWrapActive]}><Home size={21} color={!storiesHome && tab === 'home' ? C.purple : C.faint} fill={!storiesHome && tab === 'home' ? C.purplePale : 'transparent'} /></View>
          <AppText style={[styles.navLabel, !storiesHome && tab === 'home' && styles.navLabelActive]}>خانه</AppText>
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
      </View>}

      <Modal visible={storySwitcher} animationType="fade" transparent onRequestClose={() => setStorySwitcher(false)}>
        <View style={[styles.centeredBackdrop, { paddingBottom: 22 + bottomInset }]}>
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
                    <View style={styles.storyListCopy}><View style={styles.storyListNameRow}>{active && <View style={styles.activeStoryBadge}><AppText style={styles.activeStoryBadgeText}>فعال</AppText></View>}<AppText style={styles.storyListName}>{story.name}</AppText></View><AppText style={styles.storyListMeta}>{faNumber.format(peopleCount)} نفر · {faNumber.format(story.expenses.length)} خرج · {formatMoney(storyTotal)}</AppText></View>
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
        <View style={[styles.centeredBackdrop, { paddingBottom: 22 + bottomInset }]}>
          <View style={styles.notificationsCard} accessibilityViewIsModal>
            <View style={styles.switcherHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel="بستن اعلان‌ها" style={styles.sheetClose} onPress={() => setNotificationsModal(false)}><X size={20} color={C.ink} /></Pressable>
              <View style={styles.switcherHeaderCopy}><AppText style={styles.dialogTitle}>طلب‌ها و بدهی‌ها</AppText><AppText style={styles.dialogTextCompact}>در همهٔ ماجراهای تو</AppText></View>
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
                <View style={styles.notificationsEmpty}><Image source={require('./assets/dong-mascot-optimized.png')} style={styles.notificationsEmptyMascot} resizeMode="contain" /><AppText style={styles.emptyTitle}>حسابت با همه صاف است</AppText><AppText style={styles.emptyText}>نه به کسی بدهکاری، نه از کسی طلب داری.</AppText></View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={expenseDetailsModal} animationType="fade" transparent onRequestClose={() => setExpenseDetailsModal(false)}>
        <View style={[styles.centeredBackdrop, { paddingBottom: 22 + bottomInset }]}>
          <View style={styles.expenseDetailsCard} accessibilityViewIsModal>
            <View style={styles.switcherHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel="بستن جزئیات خرج" style={styles.sheetClose} onPress={() => setExpenseDetailsModal(false)}><X size={20} color={C.ink} /></Pressable>
              <View style={styles.switcherHeaderCopy}><AppText style={styles.dialogTitle}>{selectedExpense?.title ?? 'جزئیات خرج'}</AppText><AppText style={styles.dialogTextCompact}>{selectedExpense ? `${memberById(selectedExpense.payerId)?.name ?? ''} پرداخت کرد · ${selectedExpense.createdAt}` : ''}</AppText></View>
              <CategoryBadge category={selectedExpense?.category} size={45} />
            </View>
            {selectedExpense && <>
              <View style={styles.expenseDetailsTotal}><AppText style={styles.expenseDetailsTotalLabel}>کل این خرج</AppText><AppText style={styles.expenseDetailsTotalValue}>{formatMoney(selectedExpense.amount)}</AppText></View>
              <AppText style={styles.expenseDetailsSectionTitle}>سهم هر نفر</AppText>
              <ScrollView style={styles.expenseAllocationsList} contentContainerStyle={styles.expenseAllocationsContent}>
                {(selectedExpense.allocations ?? []).map((allocation) => {
                  const member = memberById(allocation.memberId);
                  return <View key={allocation.memberId} style={styles.expenseAllocationRow}><Avatar member={member} size={39} /><View style={styles.expenseAllocationCopy}><AppText style={styles.expenseAllocationName}>{member?.isMe ? 'من' : member?.name}</AppText>{allocation.label && <AppText style={styles.expenseAllocationLabel}>{allocation.label}</AppText>}</View><AppText style={styles.expenseAllocationAmount}>{formatMoney(allocation.amount)}</AppText></View>;
                })}
              </ScrollView>
              <View style={styles.expenseAuthorRow}>
                <View style={styles.expenseAuthorIcon}><UserRound size={15} color={C.purple} /></View>
                <AppText style={styles.expenseAuthorText}>{selectedExpense.createdById
                  ? `ثبت‌شده توسط ${expenseAuthorName(selectedExpense)}`
                  : 'معلوم نیست این خرج را چه کسی ثبت کرده'}</AppText>
              </View>
              {canEditExpense(selectedExpense) ? (
                <View style={styles.expenseOwnerActions}>
                  <Pressable accessibilityRole="button" disabled={cloudBusy} style={[styles.expenseDeleteButton, cloudBusy && styles.saveButtonDisabled]} onPress={() => setDeleteExpenseTarget(selectedExpense)}><Trash2 size={17} color={C.debt} /><AppText style={styles.expenseDeleteText}>حذف</AppText></Pressable>
                  <Pressable accessibilityRole="button" disabled={cloudBusy} style={[styles.expenseEditButton, cloudBusy && styles.saveButtonDisabled]} onPress={() => openExpenseEditor(selectedExpense)}><Pencil size={17} color="#FFFFFF" /><AppText style={styles.expenseEditText}>ویرایش</AppText></Pressable>
                </View>
              ) : selectedExpense.createdById ? (
                <AppText style={styles.expenseOwnerHint}>فقط {expenseAuthorName(selectedExpense)} می‌تواند این خرج را ویرایش یا حذف کند.</AppText>
              ) : null}
              <Pressable accessibilityRole="button" style={styles.expenseDetailsCloseButton} onPress={() => setExpenseDetailsModal(false)}><AppText style={styles.expenseDetailsCloseText}>بستن</AppText></Pressable>
            </>}
          </View>
        </View>
      </Modal>

      <Modal visible={storyModal} animationType="slide" transparent onRequestClose={() => setStoryModal(false)}>
        <View style={[styles.modalBackdrop, { paddingBottom: bottomInset }]}>
          <View style={[styles.storySheet, { height: sheetHeight }]} accessibilityViewIsModal>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel="بستن" style={styles.sheetClose} onPress={() => setStoryModal(false)}><X size={21} color={C.ink} /></Pressable>
              <View style={styles.sheetHeaderCopy}><AppText style={styles.sheetTitle}>ماجرای جدید</AppText><AppText style={styles.sheetSubtitle}>{storyStep === 1 ? 'مرحله ۱ از ۲ · موضوع دنگ‌هات' : 'مرحله ۲ از ۲ · چه کسانی هستند'}</AppText></View>
              <View style={styles.sheetSpark}><Sparkles size={20} color={C.purple} /></View>
            </View>
            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.storyForm}
              keyboardShouldPersistTaps="handled"
             
              showsVerticalScrollIndicator={false}
            >
              {renderStorySheetBody()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {renderFamilyInfoModal()}

      <Modal visible={finishModal} animationType="fade" transparent onRequestClose={() => setFinishModal(false)}>
        <View style={[styles.centeredBackdrop, { paddingBottom: 22 + bottomInset }]}>
          <View style={styles.finishDialog} accessibilityViewIsModal>
            <View style={styles.finishDialogIcon}><Check size={29} color={C.mintDark} /></View>
            <AppText style={styles.dialogTitle}>ماجرا تموم شد؟</AppText>
            <AppText style={styles.finishDialogText}>بعد از اتمام، «{storyName}» به بخش ماجراهای تمام‌شده می‌رود و خرج جدیدی به آن اضافه نمی‌شود.</AppText>
            <View style={styles.finishSummaryRow}>
              <View style={styles.finishSummaryItem}><AppText style={styles.finishSummaryLabel}>کل خرج</AppText><AppText style={styles.finishSummaryValue}>{formatMoney(total)}</AppText></View>
              <View style={styles.finishSummaryDivider} />
              <View style={styles.finishSummaryItem}><AppText style={styles.finishSummaryLabel}>پرداخت مانده</AppText><AppText style={styles.finishSummaryValue}>{faNumber.format(transfers.length)} پرداخت</AppText></View>
            </View>
            {transfers.length > 0 && <View style={styles.finishWarning}><AppText style={styles.finishWarningText}>هنوز چند تا پرداخت مانده. نگران نباش، بعداً هم از صفحه تسویه می‌بینی‌شان.</AppText></View>}
            <View style={styles.dialogActions}>
              <Pressable accessibilityRole="button" style={styles.dialogCancel} onPress={() => setFinishModal(false)}><AppText style={styles.dialogCancelText}>فعلاً نه</AppText></Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: cloudBusy }} disabled={cloudBusy} style={[styles.finishConfirmButton, cloudBusy && styles.saveButtonDisabled]} onPress={finishStory}><Check size={18} color="#FFFFFF" /><AppText style={styles.dialogAddText}>{cloudBusy ? 'در حال بستن…' : 'بله، تمامش کن'}</AppText></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={deleteStoryModal} animationType="fade" transparent onRequestClose={() => setDeleteStoryModal(false)}>
        <View style={[styles.centeredBackdrop, { paddingBottom: 22 + bottomInset }]}>
          <View style={styles.finishDialog} accessibilityViewIsModal>
            <View style={styles.deleteDialogIcon}><AlertTriangle size={29} color={C.debt} /></View>
            <AppText style={styles.dialogTitle}>این ماجرا حذف شود؟</AppText>
            <AppText style={styles.finishDialogText}>با حذف «{storyName}»، همه اعضا، خرج‌ها و تسویه‌های آن برای همیشه پاک می‌شوند و قابل بازیابی نیستند.</AppText>
            <View style={styles.deleteWarning}><AppText style={styles.deleteWarningText}>این عملیات برگشت‌پذیر نیست.</AppText></View>
            <View style={styles.dialogActions}>
              <Pressable accessibilityRole="button" style={styles.dialogCancel} onPress={() => setDeleteStoryModal(false)}><AppText style={styles.dialogCancelText}>انصراف</AppText></Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: cloudBusy }} disabled={cloudBusy} style={[styles.deleteConfirmButton, cloudBusy && styles.saveButtonDisabled]} onPress={deleteStory}><Trash2 size={18} color="#FFFFFF" /><AppText style={styles.dialogAddText}>بله، حذف کن</AppText></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(deleteExpenseTarget)} animationType="fade" transparent onRequestClose={() => setDeleteExpenseTarget(null)}>
        <View style={[styles.centeredBackdrop, { paddingBottom: 22 + bottomInset }]}>
          <View style={styles.finishDialog} accessibilityViewIsModal>
            <View style={styles.deleteDialogIcon}><AlertTriangle size={29} color={C.debt} /></View>
            <AppText style={styles.dialogTitle}>این خرج حذف شود؟</AppText>
            <AppText style={styles.finishDialogText}>
              {deleteExpenseTarget
                ? `«${deleteExpenseTarget.title}» به مبلغ ${formatMoney(deleteExpenseTarget.amount)} حذف می‌شود و دنگ همه اعضا دوباره محاسبه خواهد شد.`
                : ''}
            </AppText>
            <View style={styles.deleteWarning}><AppText style={styles.deleteWarningText}>این عملیات برگشت‌پذیر نیست.</AppText></View>
            <View style={styles.dialogActions}>
              <Pressable accessibilityRole="button" style={styles.dialogCancel} onPress={() => setDeleteExpenseTarget(null)}><AppText style={styles.dialogCancelText}>انصراف</AppText></Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: cloudBusy }} disabled={cloudBusy} style={[styles.deleteConfirmButton, cloudBusy && styles.saveButtonDisabled]} onPress={() => { if (deleteExpenseTarget) void deleteExpense(deleteExpenseTarget); }}><Trash2 size={18} color="#FFFFFF" /><AppText style={styles.dialogAddText}>{cloudBusy ? 'در حال حذف…' : 'بله، حذف کن'}</AppText></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(deleteMemberTarget)} animationType="fade" transparent onRequestClose={() => setDeleteMemberTarget(null)}>
        <View style={[styles.centeredBackdrop, { paddingBottom: 22 + bottomInset }]}>
          <View style={styles.finishDialog} accessibilityViewIsModal>
            <View style={styles.deleteDialogIcon}><Trash2 size={27} color={C.debt} /></View>
            <AppText style={styles.dialogTitle}>«{deleteMemberTarget?.name}» حذف شود؟</AppText>
            <AppText style={styles.finishDialogText}>از ماجرا بیرون می‌رود و توی خرج‌های بعدی حساب نمی‌شود. اگر توی خرجی باشد، اپ اجازه نمی‌دهد حذفش کنی.</AppText>
            <View style={styles.dialogActions}>
              <Pressable accessibilityRole="button" style={styles.dialogCancel} onPress={() => setDeleteMemberTarget(null)}><AppText style={styles.dialogCancelText}>انصراف</AppText></Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: cloudBusy }} disabled={cloudBusy} style={[styles.deleteConfirmButton, cloudBusy && styles.saveButtonDisabled]} onPress={() => { if (deleteMemberTarget) void removeGuestMember(deleteMemberTarget); }}><Trash2 size={18} color="#FFFFFF" /><AppText style={styles.dialogAddText}>{cloudBusy ? 'در حال حذف…' : 'بله، حذف کن'}</AppText></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={signOutModal} animationType="fade" transparent onRequestClose={() => setSignOutModal(false)}>
        <View style={[styles.centeredBackdrop, { paddingBottom: 22 + bottomInset }]}>
          <View style={styles.finishDialog} accessibilityViewIsModal>
            <View style={styles.deleteDialogIcon}><AlertTriangle size={29} color={C.debt} /></View>
            <AppText style={styles.dialogTitle}>از حساب خارج شوی؟</AppText>
            <AppText style={styles.finishDialogText}>{accountPhone
              ? `بعداً با شماره ${accountPhone} دوباره وارد شو تا همه ماجراها و خرج‌هایت برگردند.`
              : 'چون شماره موبایل نداده‌ای، دیگر هیچ راهی برای برگشتن به این حساب نیست.'}</AppText>
            {!accountPhone && <View style={styles.deleteWarning}><AppText style={styles.deleteWarningText}>همه ماجراها، خرج‌ها و تسویه‌هایت پاک می‌شوند و دیگر برنمی‌گردند.</AppText></View>}
            <View style={styles.dialogActions}>
              <Pressable accessibilityRole="button" style={styles.dialogCancel} onPress={() => setSignOutModal(false)}><AppText style={styles.dialogCancelText}>{accountPhone ? 'انصراف' : 'می‌مانم'}</AppText></Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: cloudBusy }} disabled={cloudBusy} style={[styles.deleteConfirmButton, cloudBusy && styles.saveButtonDisabled]} onPress={() => void signOut()}><LogOut size={18} color="#FFFFFF" /><AppText style={styles.dialogAddText}>{cloudBusy ? 'در حال خروج…' : 'بله، خارج شو'}</AppText></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(pendingTransfer)} animationType="fade" transparent onRequestClose={() => setPendingTransfer(null)}>
        <View style={[styles.centeredBackdrop, { paddingBottom: 22 + bottomInset }]}>
          <View style={styles.finishDialog} accessibilityViewIsModal>
            <View style={styles.finishDialogIcon}><HandCoins size={28} color={C.mintDark} /></View>
            <AppText style={styles.dialogTitle}>این پرداخت انجام شد؟</AppText>
            <AppText style={styles.finishDialogText}>
              {pendingTransfer
                ? `ثبت می‌شود که «${memberById(pendingTransfer.fromId)?.name ?? ''}» مبلغ ${formatMoney(pendingTransfer.amount)} را به «${memberById(pendingTransfer.toId)?.name ?? ''}» پرداخت کرده و مانده‌حساب همه اعضا به‌روز می‌شود.`
                : ''}
            </AppText>
            <View style={styles.deleteWarning}><AppText style={styles.deleteWarningText}>بقیه هم این را می‌بینند و بعدش نمی‌شود پسش گرفت.</AppText></View>
            <View style={styles.dialogActions}>
              <Pressable accessibilityRole="button" style={styles.dialogCancel} onPress={() => setPendingTransfer(null)}><AppText style={styles.dialogCancelText}>انصراف</AppText></Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: cloudBusy }} disabled={cloudBusy} style={[styles.finishConfirmButton, cloudBusy && styles.saveButtonDisabled]} onPress={() => { if (pendingTransfer) void markTransferPaid(pendingTransfer); }}><Check size={18} color="#FFFFFF" /><AppText style={styles.dialogAddText}>{cloudBusy ? 'در حال ثبت…' : 'بله، ثبت کن'}</AppText></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={editMemberModal} animationType="fade" transparent onRequestClose={() => setEditMemberModal(false)}>
        <ScrollView style={styles.centeredScroll} contentContainerStyle={[styles.centeredBackdropContent, { paddingBottom: 22 + bottomInset }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <View style={styles.dialogIcon}><Pencil size={24} color={C.purple} /></View>
            <AppText style={styles.dialogTitle}>ویرایش این نفر</AppText>
            <AppText style={styles.dialogText}>{editingMember?.kind === 'guest' ? 'اسم و تعداد نفراتش را می‌توانی عوض کنی.' : 'اسمش را خودش توی حسابش گذاشته و تو نمی‌توانی عوضش کنی.'}</AppText>
            <TextInput editable={editingMember?.kind === 'guest'} style={[styles.formInput, editingMember?.kind !== 'guest' && styles.readonlyInput]} value={editMemberName} onChangeText={setEditMemberName} placeholder="اسم این نفر" placeholderTextColor={C.faint} textAlign="right" />
            {/* Same shape as step two of creating a story: names, not a count.
                A card with nobody under it simply has an empty list. */}
            <View style={styles.editFamilySection}>
              <AppText style={styles.formLabelNoMargin}>چه کسانی دنگشان را {editingMember?.isMe ? 'تو می‌دهی' : 'او می‌دهد'}؟</AppText>
              <AppText style={styles.formHelper}>اگر کسی با او حساب نمی‌کند، اینجا را خالی بگذار.</AppText>
              <View style={styles.subList}>
                {editHouseholdNameInputs.map((value, index) => (
                  <View key={index} style={styles.subRow}>
                    <TextInput
                      value={value}
                      onChangeText={(text) => setEditHouseholdNameInputs((current) => current.map((item, itemIndex) => (itemIndex === index ? text : item)))}
                      style={styles.subNameInput}
                      placeholder="اسم عضو خانواده"
                      placeholderTextColor={C.faint}
                      textAlign="right"
                    />
                    <Pressable accessibilityRole="button" accessibilityLabel="حذف عضو خانواده" onPress={() => { setEditHouseholdNameInputs((current) => current.filter((_, itemIndex) => itemIndex !== index)); setEditMemberUnits((current) => String(Math.max(1, Number(current || 1) - 1))); }} style={styles.subRemove}>
                      <X size={13} color={C.debt} />
                    </Pressable>
                  </View>
                ))}
                <Pressable accessibilityRole="button" onPress={() => { setEditHouseholdNameInputs((current) => [...current, '']); setEditMemberUnits((current) => String(Math.min(12, Number(current || 1) + 1))); }} style={styles.addSubButton}>
                  <Plus size={14} color={C.purple} />
                  <AppText style={styles.addSubText}>افزودن عضو خانواده</AppText>
                </Pressable>
              </View>
            </View>
            {editingMember?.kind === 'guest' && canManageGuests && (
              <Pressable accessibilityRole="button" onPress={() => { if (editingMember) setDeleteMemberTarget(editingMember); }} style={styles.removeMemberButton}>
                <Trash2 size={16} color={C.debt} />
                <AppText style={styles.removeMemberText}>حذف این نفر از ماجرا</AppText>
              </Pressable>
            )}
            <View style={styles.dialogActions}>
              <Pressable accessibilityRole="button" style={styles.dialogCancel} onPress={() => setEditMemberModal(false)}><AppText style={styles.dialogCancelText}>انصراف</AppText></Pressable>
              <Pressable accessibilityRole="button" disabled={cloudBusy || !editMemberUnits || editHouseholdNameInputs.some((name) => name.trim().length < 2) || (editingMember?.kind === 'guest' && editMemberName.trim().length < 2)} style={[styles.dialogAdd, (cloudBusy || !editMemberUnits || editHouseholdNameInputs.some((name) => name.trim().length < 2) || (editingMember?.kind === 'guest' && editMemberName.trim().length < 2)) && styles.saveButtonDisabled]} onPress={saveMemberEdit}><Check size={18} color="#FFFFFF" /><AppText style={styles.dialogAddText}>ذخیره تغییرات</AppText></Pressable>
            </View>
          </View>
        </ScrollView>
      </Modal>

      <Modal visible={expenseModal} animationType="slide" transparent onRequestClose={() => { setExpenseModal(false); setEditingExpense(null); }}>
        <View style={[styles.modalBackdrop, { paddingBottom: bottomInset }]}>
          <View style={[styles.sheet, { height: sheetHeight }]} accessibilityViewIsModal>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel="بستن" style={styles.sheetClose} onPress={() => { setExpenseModal(false); setEditingExpense(null); }}><X size={21} color={C.ink} /></Pressable>
              <View style={styles.sheetHeaderCopy}><AppText style={styles.sheetTitle}>{editingExpense ? 'ویرایش خرج' : 'خرج جدید'}</AppText><AppText style={styles.sheetSubtitle}>{editingExpense ? 'تغییرات روی دنگ همه اثر می‌گذارد' : 'مبلغی که پرداخت شد را وارد کن'}</AppText></View>
              <View style={styles.sheetSpark}><Sparkles size={20} color={C.purple} /></View>
            </View>

            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.amountPanel}>
                <AppText style={styles.amountLabel}>چقدر پرداخت شد؟</AppText>
                <View style={styles.amountInputRow}>
                  <AppText style={styles.amountUnit}>تومان</AppText>
                  <TextInput
                    accessibilityLabel="مبلغ خرج به تومان"
                    style={styles.amountInput}
                    value={amount ? faNumber.format(Number(amount)) : ''}
                    onChangeText={(value) => setAmount(normalizeDigits(value).replace(/^0+/, '').slice(0, MAX_AMOUNT_DIGITS))}
                    placeholder="۰"
                    placeholderTextColor="#B9B1C1"
                    keyboardType="number-pad"
                    textAlign="right"
                    autoFocus
                  />
                </View>
                {numericAmount > 0 && <AppText style={styles.amountHint}>سهم هر نفر حدوداً {formatMoney(sharePreview)}</AppText>}
              </View>

              <AppText style={styles.formLabel}>خرجِ چی بود؟</AppText>
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

              <AppText style={styles.formLabel}>اسم این خرج (دلخواه)</AppText>
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


              {splitMode === 'equal' ? (
                <>
                  <View style={styles.splitHeader}><View style={styles.equalBadge}><AppText style={styles.equalBadgeText}>سهم هر نفر حدوداً {formatMoney(sharePreview)}</AppText></View><View style={styles.splitHeaderCopy}><AppText style={styles.formLabelNoMargin}>چه کسانی در این خرج بودند؟</AppText><AppText style={styles.formHelper}>همه از اول تیک خورده‌اند. هر کس نبوده، اسمش را بزن تا برداشته شود.</AppText></View></View>
                  {/* Unticking people is easy to overshoot, so there is a way back. */}
                  {selectedPersonIds.length < expensePeople.length && (
                    <Pressable accessibilityRole="button" onPress={() => setSelectedPersonIds(expensePeople.map((person) => person.id))} style={styles.selectAllButton}>
                      <Check size={14} color={C.purple} />
                      <AppText style={styles.selectAllText}>انتخاب همه ({faNumber.format(expensePeople.length)} نفر)</AppText>
                    </Pressable>
                  )}
                  {/* With no households in the story every account is one person,
                      and wrapping each single name in its own titled card just
                      makes a short list look like a form. */}
                  {members.some((member) => (member.shareUnits ?? 1) > 1) ? (
                    <View style={styles.householdAccountsList}>
                      {members.map((member) => <View key={member.id} style={styles.householdAccountCard}>
                        <View style={styles.householdAccountHead}><Avatar member={member} size={36} /><View style={styles.householdAccountCopy}><AppText style={styles.householdAccountName}>{member.isMe ? (accountName.trim() || 'من') : member.name}</AppText><AppText style={styles.householdAccountHint}>{(member.shareUnits ?? 1) > 1 ? `${faNumber.format(member.shareUnits ?? 1)} نفر در این حساب` : 'یک نفر'}</AppText></View></View>
                        <View style={styles.personNameChips}>{expensePeople.filter((person) => person.memberId === member.id).map((person) => {
                          const active = selectedPersonIds.includes(person.id);
                          return <Pressable key={person.id} accessibilityRole="checkbox" accessibilityState={{ checked: active }} onPress={() => toggleExpensePerson(person.id)} style={[styles.personNameChip, active && styles.personNameChipActive]}><AppText style={[styles.personNameChipText, active && styles.personNameChipTextActive]}>{person.name}</AppText>{active && <Check size={12} color="#FFFFFF" />}</Pressable>;
                        })}</View>
                      </View>)}
                    </View>
                  ) : (
                    <View style={styles.personNameChips}>{expensePeople.map((person) => {
                      const active = selectedPersonIds.includes(person.id);
                      const member = memberById(person.memberId);
                      return <Pressable key={person.id} accessibilityRole="checkbox" accessibilityState={{ checked: active }} onPress={() => toggleExpensePerson(person.id)} style={[styles.personNameChip, active && styles.personNameChipActive]}><AppText style={[styles.personNameChipText, active && styles.personNameChipTextActive]}>{member?.isMe ? 'من' : person.name}</AppText>{active && <Check size={12} color="#FFFFFF" />}</Pressable>;
                    })}</View>
                  )}
                </>
              ) : (
                <View style={styles.shareList}>
                  {members.map((member) => <View key={member.id} style={styles.householdShareGroup}>
                    <View style={styles.householdAccountHead}><Avatar member={member} size={36} /><View style={styles.householdAccountCopy}><AppText style={styles.householdAccountName}>{member.isMe ? (accountName.trim() || 'من') : member.name}</AppText><AppText style={styles.householdAccountHint}>مبلغ هر فرد را جدا وارد کن</AppText></View></View>
                    {expensePeople.filter((person) => person.memberId === member.id).map((person) => <View key={person.id} style={styles.personShareRow}>
                      <View style={styles.personShareIdentity}><View style={styles.personMiniAvatar}><AppText style={styles.personMiniAvatarText}>{initials(person.name)}</AppText></View><AppText style={styles.personShareName}>{person.name}</AppText></View>
                      <View style={styles.shareFields}>
                        {splitMode === 'itemized' && <TextInput value={itemLabels[person.id] ?? ''} onChangeText={(value) => setItemLabels((current) => ({ ...current, [person.id]: value }))} style={styles.itemLabelInput} placeholder="مثلاً پاستا" placeholderTextColor={C.faint} textAlign="right" />}
                        <View style={styles.shareAmountWrap}><AppText style={styles.shareUnit}>تومان</AppText><TextInput value={shareInputs[person.id] ? faNumber.format(Number(shareInputs[person.id])) : ''} onChangeText={(value) => setShareInputs((current) => ({ ...current, [person.id]: normalizeDigits(value).replace(/^0+/, '').slice(0, MAX_AMOUNT_DIGITS) }))} style={styles.shareAmountInput} placeholder="۰" placeholderTextColor={C.faint} keyboardType="number-pad" textAlign="right" /></View>
                      </View>
                    </View>)}
                  </View>)}
                  <View style={[styles.shareTotal, enteredShareTotal === numericAmount && numericAmount > 0 ? styles.shareTotalValid : styles.shareTotalInvalid]}><AppText style={styles.shareTotalLabel}>جمع سهم‌ها</AppText><AppText style={styles.shareTotalValue}>{formatMoney(enteredShareTotal)} از {formatMoney(numericAmount)}</AppText></View>
                </View>
              )}
              {splitOptionsOpen || splitMode !== 'equal' ? (
                <>
                  <View style={styles.splitHeader}><View><AppText style={styles.formLabelNoMargin}>چطور تقسیم بشه؟</AppText></View></View>
                  <View style={styles.splitModeRow}>
                    {([
                      { id: 'equal', label: 'مساوی' },
                      { id: 'custom', label: 'مبلغ هر نفر جدا' },
                      { id: 'itemized', label: 'سفارش هر نفر' },
                    ] as const).map((mode) => <Pressable key={mode.id} accessibilityRole="radio" accessibilityState={{ selected: splitMode === mode.id }} onPress={() => setSplitMode(mode.id)} style={[styles.splitModeButton, splitMode === mode.id && styles.splitModeButtonActive]}><AppText style={[styles.splitModeText, splitMode === mode.id && styles.splitModeTextActive]}>{mode.label}</AppText></Pressable>)}
                  </View>
                </>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => setSplitOptionsOpen(true)} style={styles.splitDisclosure}>
                  <AppText style={styles.splitDisclosureText}>سهم همه مساوی نیست؟</AppText>
                </Pressable>
              )}
            </ScrollView>

            <View style={styles.sheetFooter}>
              <View style={styles.footerPreview}><AppText style={styles.footerPreviewLabel}>{splitMode === 'equal' ? 'تقسیم بین' : 'جمع سهم‌ها'}</AppText><AppText style={styles.footerPreviewValue}>{splitMode === 'equal' ? `${faNumber.format(selectedShareUnits)} نفر` : formatMoney(enteredShareTotal)}</AppText></View>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: !isExpenseValid }} disabled={!isExpenseValid} onPress={addExpense} style={({ pressed }) => [styles.saveButton, !isExpenseValid && styles.saveButtonDisabled, pressed && isExpenseValid && styles.pressed]}>
                <Check size={20} color="#FFFFFF" /><AppText style={styles.saveButtonText}>{editingExpense ? 'ذخیره تغییرات' : 'ثبت خرج'}</AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={memberModal} animationType="fade" transparent onRequestClose={() => setMemberModal(false)}>
        <ScrollView style={styles.centeredScroll} contentContainerStyle={[styles.centeredBackdropContent, { paddingBottom: 22 + bottomInset }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <View style={styles.dialogIcon}><Users size={26} color={C.purple} /></View>
            <AppText style={styles.dialogTitle}>یک نفر دیگر</AppText>
            <View style={styles.memberModeTabs}>
              <Pressable disabled={!canManageGuests} onPress={() => setMemberMode('guest')} style={[styles.memberModeTab, memberMode === 'guest' && styles.memberModeTabActive, !canManageGuests && styles.memberModeTabDisabled]}><AppText style={memberMode === 'guest' ? styles.memberModeTabTextActive : styles.memberModeTabText}>خودم ثبتش می‌کنم</AppText></Pressable>
              <Pressable onPress={() => setMemberMode('invite')} style={[styles.memberModeTab, memberMode === 'invite' && styles.memberModeTabActive]}><AppText style={memberMode === 'invite' ? styles.memberModeTabTextActive : styles.memberModeTabText}>دعوتش می‌کنم</AppText></Pressable>
            </View>
            {memberMode === 'guest' ? (
              <>
                <AppText style={styles.dialogText}>اگر اپ ندارد، خودت اسمش را ثبت کن. هر وقت خواست، با کد دعوت خودش وارد می‌شود.</AppText>
                <TextInput accessibilityLabel="اسم عضو جدید" style={styles.formInput} value={newMemberName} onChangeText={setNewMemberName} placeholder="مثلاً رضا" placeholderTextColor={C.faint} textAlign="right" autoFocus />
                {newMemberFamilyOpen || Number(newMemberUnits || 1) > 1 ? (
                  <>
                    <View style={styles.memberUnitsField}><View style={styles.memberUnitsFieldCopy}><AppText style={styles.formLabelNoMargin}>روی هم چند نفرند؟</AppText><AppText style={styles.formHelper}>خودش هم جزو تعداد است؛ حداکثر ۱۲ نفر</AppText></View><TextInput accessibilityLabel="تعداد نفرات این حساب" style={styles.memberUnitsInput} value={newMemberUnits ? faNumber.format(Number(newMemberUnits)) : ''} onChangeText={changeNewMemberUnits} placeholder="۲" placeholderTextColor={C.faint} keyboardType="number-pad" textAlign="center" /></View>
                    {Number(newMemberUnits || 1) > 1 && <View style={styles.newMemberFamilySection}><AppText style={styles.formLabelNoMargin}>اسم بقیه</AppText><View style={styles.editFamilyInputsContent}>{newHouseholdNameInputs.map((value, index) => <View key={index} style={styles.familyInputRow}><AppText style={styles.familyInputLabel}>نفر {faNumber.format(index + 2)}</AppText><TextInput value={value} onChangeText={(text) => setNewHouseholdNameInputs((current) => current.map((item, itemIndex) => itemIndex === index ? text : item))} style={styles.familyNameInput} placeholder={`اسم نفر ${faNumber.format(index + 2)}`} placeholderTextColor={C.faint} textAlign="right" /></View>)}</View></View>}
                  </>
                ) : (
                  <Pressable accessibilityRole="button" onPress={() => { setNewMemberFamilyOpen(true); changeNewMemberUnits('2'); setFamilyInfoModal(true); }} style={styles.splitDisclosure}>
                    <AppText style={styles.splitDisclosureText}>با خانواده‌اش می‌آید؟</AppText>
                  </Pressable>
                )}
                <View style={styles.dialogActions}>
                  <Pressable accessibilityRole="button" style={styles.dialogCancel} onPress={() => setMemberModal(false)}><AppText style={styles.dialogCancelText}>انصراف</AppText></Pressable>
                  <Pressable accessibilityRole="button" accessibilityState={{ disabled: newMemberName.trim().length < 2 || !newMemberUnits || newHouseholdNameInputs.some((name) => name.trim().length < 2) || cloudBusy }} style={[styles.dialogAdd, (newMemberName.trim().length < 2 || !newMemberUnits || newHouseholdNameInputs.some((name) => name.trim().length < 2) || cloudBusy) && styles.saveButtonDisabled]} disabled={newMemberName.trim().length < 2 || !newMemberUnits || newHouseholdNameInputs.some((name) => name.trim().length < 2) || cloudBusy} onPress={addMember}><Plus size={18} color="#FFFFFF" /><AppText style={styles.dialogAddText}>اضافه کن</AppText></Pressable>
                </View>
              </>
            ) : (
              <>
                <AppText style={styles.dialogText}>این کد را بفرست برای کسی که دنگودونگ دارد. وارد که شد، خودش می‌آید توی ماجرا.</AppText>
                <View style={styles.inviteCodeCard}><AppText style={styles.inviteCodeLabel}>کد دعوت ماجرا</AppText><AppText selectable style={styles.inviteCodeValue}>{activeStory?.inviteCode ?? '--------'}</AppText></View>
                <View style={styles.inviteActions}>
                  <Pressable accessibilityRole="button" style={styles.inviteSecondaryButton} onPress={copyInviteCode}><Copy size={17} color={C.purple} /><AppText style={styles.inviteSecondaryText}>کپی کد</AppText></Pressable>
                  <Pressable accessibilityRole="button" style={styles.invitePrimaryButton} onPress={shareInviteCode}><UserPlus size={17} color="#FFFFFF" /><AppText style={styles.invitePrimaryText}>ارسال دعوت</AppText></Pressable>
                </View>
                <Pressable accessibilityRole="button" style={styles.inviteCloseButton} onPress={() => setMemberModal(false)}><AppText style={styles.dialogCancelText}>بستن</AppText></Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </Modal>

      <Modal visible={joinModal} animationType="fade" transparent onRequestClose={() => setJoinModal(false)}>
        <ScrollView style={styles.centeredScroll} contentContainerStyle={[styles.centeredBackdropContent, { paddingBottom: 22 + bottomInset }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <View style={styles.dialogIcon}><UserPlus size={26} color={C.purple} /></View>
            <AppText style={styles.dialogTitle}>پیوستن به ماجرا</AppText>
            <AppText style={styles.dialogText}>کدی را که سازنده ماجرا برایت فرستاده وارد کن.</AppText>
            <TextInput autoCapitalize="characters" autoCorrect={false} maxLength={8} style={[styles.formInput, styles.joinCodeInput]} value={joinCode} onChangeText={(value) => setJoinCode(value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())} placeholder="کد ۸ کاراکتری" placeholderTextColor={C.faint} textAlign="center" autoFocus />
            {joinFamilyOpen || joinHouseholdNameInputs.length > 0 ? (
              <>
                <View style={styles.memberUnitsField}><View style={styles.memberUnitsFieldCopy}><AppText style={styles.formLabelNoMargin}>روی هم چند نفرید؟</AppText><AppText style={styles.formHelper}>شامل خودت؛ حداکثر ۱۲ نفر</AppText></View><TextInput accessibilityLabel="تعداد نفرات حساب" style={styles.memberUnitsInput} value={joinUnits ? faNumber.format(Number(joinUnits)) : ''} onChangeText={(value) => { const normalized = normalizeDigits(value).replace(/^0+/, '').slice(0, 2); const count = Math.min(12, Math.max(1, Number(normalized || 1))); setJoinUnits(normalized); setJoinHouseholdNameInputs((current) => Array.from({ length: count - 1 }, (_, index) => current[index] ?? '')); }} placeholder="۲" placeholderTextColor={C.faint} keyboardType="number-pad" textAlign="center" /></View>
                {joinHouseholdNameInputs.map((value, index) => <View key={`join-story-${index}`} style={styles.familyInputRow}><AppText style={styles.familyInputLabel}>نفر {faNumber.format(index + 2)}</AppText><TextInput value={value} onChangeText={(text) => setJoinHouseholdNameInputs((current) => current.map((item, itemIndex) => itemIndex === index ? text : item))} style={styles.familyNameInput} placeholder={`اسم نفر ${faNumber.format(index + 2)}`} placeholderTextColor={C.faint} textAlign="right" /></View>)}
              </>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => { setJoinFamilyOpen(true); setJoinUnits('2'); setJoinHouseholdNameInputs(['']); setFamilyInfoModal(true); }} style={styles.splitDisclosure}>
                <AppText style={styles.splitDisclosureText}>با خانواده‌ات می‌آیی؟</AppText>
              </Pressable>
            )}
            <View style={styles.dialogActions}>
              <Pressable accessibilityRole="button" style={styles.dialogCancel} onPress={() => setJoinModal(false)}><AppText style={styles.dialogCancelText}>انصراف</AppText></Pressable>
              <Pressable accessibilityRole="button" disabled={!joinCode.trim() || joinHouseholdNameInputs.some((name) => name.trim().length < 2) || cloudBusy} style={[styles.dialogAdd, (!joinCode.trim() || joinHouseholdNameInputs.some((name) => name.trim().length < 2) || cloudBusy) && styles.saveButtonDisabled]} onPress={joinStory}><UserPlus size={18} color="#FFFFFF" /><AppText style={styles.dialogAddText}>پیوستن</AppText></Pressable>
            </View>
          </View>
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  defaultText: { fontFamily: F.regular, color: C.ink, writingDirection: 'rtl' },
  loading: { flex: 1, backgroundColor: C.canvas },
  safeArea: { flex: 1, backgroundColor: C.canvas },
  topBar: { height: 72, paddingHorizontal: 18, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.canvas },
  iconButtonPlaceholder: { width: 44, height: 44 },
  headerStoryName: { fontFamily: F.black, fontSize: 17, lineHeight: 26, maxWidth: 168, textAlign: 'right' },
  iconButton: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.paper, borderWidth: 1, borderColor: C.line },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandCopy: { alignItems: 'flex-end' },
  brandName: { fontFamily: F.black, fontSize: 19, lineHeight: 28 },
  brandTagline: { fontFamily: F.medium, color: C.muted, fontSize: 10, lineHeight: 16 },
  brandMark: { width: 42, height: 42, borderRadius: 15, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-4deg' }] },
  content: { paddingHorizontal: 18, paddingTop: 8 },
  // The mascot used to be absolutely positioned and overlapped the balance copy
  // on narrower phones. Laying them out in a row lets the text keep whatever
  // width is left instead of being covered.
  hero: { height: 226, borderRadius: 30, overflow: 'hidden', padding: 21, flexDirection: 'row-reverse', alignItems: 'flex-end', shadowColor: C.purpleDark, shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 9 }, elevation: 7 },
  heroBlobOne: { position: 'absolute', width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(255,255,255,0.09)', left: -55, top: -65 },
  heroBlobTwo: { position: 'absolute', width: 94, height: 94, borderRadius: 47, backgroundColor: 'rgba(255,200,87,0.18)', right: 96, bottom: -50 },
  heroCopy: { flex: 1, alignItems: 'flex-end', zIndex: 2 },
  heroTag: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(31,20,89,0.28)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 13 },
  heroTagText: { fontFamily: F.semi, color: '#FFFFFF', fontSize: 11 },
  heroLabel: { fontFamily: F.medium, color: '#E8E3FF', fontSize: 13, marginTop: 13 },
  heroAmount: { fontFamily: F.black, color: '#FFFFFF', fontSize: 25, lineHeight: 40, textAlign: 'right' },
  heroHint: { fontFamily: F.medium, color: '#EAE6FF', fontSize: 11, lineHeight: 19, textAlign: 'right', marginTop: 4 },
  heroMascot: { width: 152, height: 184, marginLeft: -32, marginBottom: -21 },
  adCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 11, backgroundColor: C.paper, borderRadius: 22, borderWidth: 1, borderColor: C.line, padding: 12, marginTop: 12 },
  adCardImage: { width: 52, height: 52, borderRadius: 16, backgroundColor: C.canvas },
  adCardCopy: { flex: 1, alignItems: 'flex-end' },
  adCardTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  adCardTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 7, backgroundColor: C.yellowPale },
  adCardTagText: { fontFamily: F.bold, fontSize: 8, color: '#8A6410' },
  adCardTitle: { flex: 1, fontFamily: F.bold, fontSize: 12, textAlign: 'right' },
  adCardText: { fontFamily: F.medium, fontSize: 10, color: C.muted, lineHeight: 17, textAlign: 'right', marginTop: 3 },
  adCardCta: { paddingHorizontal: 11, minHeight: 33, borderRadius: 12, backgroundColor: C.purplePale, alignItems: 'center', justifyContent: 'center' },
  adCardCtaText: { fontFamily: F.bold, fontSize: 10, color: C.purpleDark },
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
  textButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10 },
  textButtonLabel: { fontFamily: F.semi, fontSize: 11, color: C.purple },
  membersStrip: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10, paddingBottom: 4 },
  memberCard: { flexGrow: 1, flexBasis: '46%', minWidth: 150, backgroundColor: C.paper, borderRadius: 22, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: C.line },
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
  expenseSplit: { fontFamily: F.medium, fontSize: 9, color: C.muted, marginTop: 4 },
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
  filterChip: { minHeight: 44, paddingHorizontal: 15, borderRadius: 16, justifyContent: 'center', backgroundColor: C.paper, borderWidth: 1, borderColor: C.line },
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
  paidButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.purplePale, paddingHorizontal: 12, borderRadius: 15 },
  paidButtonText: { fontFamily: F.bold, color: C.purple, fontSize: 10 },
  transferAmountBox: { alignItems: 'flex-end' },
  transferAmountLabel: { fontFamily: F.medium, color: C.muted, fontSize: 9 },
  transferAmount: { fontFamily: F.extra, color: C.ink, fontSize: 15, marginTop: 2 },
  emptyCard: { backgroundColor: C.paper, borderRadius: 25, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: C.line },
  emptyMascot: { width: 120, height: 120 },
  emptyTitle: { fontFamily: F.extra, fontSize: 17 },
  emptyText: { fontFamily: F.medium, fontSize: 11, color: C.muted, marginTop: 4 },
  bottomNav: { position: 'absolute', left: 12, right: 12, height: 78, backgroundColor: C.paper, borderRadius: 25, flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 7, borderWidth: 1, borderColor: C.line, shadowColor: C.ink, shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  navItem: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center' },
  navIconWrap: { width: 38, height: 30, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  navIconWrapActive: { backgroundColor: C.purplePale },
  navLabel: { fontFamily: F.medium, color: C.muted, fontSize: 9, marginTop: 2 },
  navLabelActive: { fontFamily: F.bold, color: C.purple },
  addNavItem: { flex: 1.15, minHeight: 74, alignItems: 'center', justifyContent: 'center', marginTop: -22 },
  addNavPressed: { transform: [{ scale: 0.94 }] },
  addNavDisabled: { opacity: 0.35 },
  addNavCircle: { width: 52, height: 52, borderRadius: 19, backgroundColor: C.coral, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: C.paper, shadowColor: C.coral, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5, transform: [{ rotate: '-3deg' }] },
  addNavLabel: { fontFamily: F.bold, color: C.coralInk, fontSize: 9, marginTop: 1 },
  toast: { position: 'absolute', bottom: 98, left: 22, right: 22, minHeight: 51, borderRadius: 18, backgroundColor: C.ink, paddingHorizontal: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 9, shadowColor: C.ink, shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 },
  toastCheck: { width: 27, height: 27, borderRadius: 10, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' },
  toastText: { flex: 1, fontFamily: F.semi, color: '#FFFFFF', fontSize: 11, textAlign: 'right' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(28,22,48,0.45)', justifyContent: 'flex-end' },
  // Height is supplied at render time from the keyboard inset.
  sheet: { backgroundColor: C.canvas, borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' },
  sheetHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#D8CFDF', alignSelf: 'center', marginTop: 9 },
  sheetHeader: { minHeight: 73, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: C.line },
  sheetClose: { width: 44, height: 44, borderRadius: 15, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
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
  participantUnits: { fontFamily: F.medium, color: C.muted, fontSize: 7, marginTop: 2 },
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
  // Dialogs that hold form fields sit inside a ScrollView instead, so a tall
  // form stays reachable with the keyboard open rather than being clipped.
  centeredScroll: { flex: 1, backgroundColor: 'rgba(28,22,48,0.45)' },
  centeredBackdropContent: { flexGrow: 1, justifyContent: 'center', padding: 22 },
  dialog: { backgroundColor: C.canvas, borderRadius: 28, padding: 21, alignItems: 'center' },
  dialogIcon: { width: 58, height: 58, borderRadius: 21, backgroundColor: C.purplePale, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  dialogTitle: { fontFamily: F.extra, fontSize: 19 },
  dialogText: { fontFamily: F.medium, color: C.muted, fontSize: 11, lineHeight: 20, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  dialogActions: { flexDirection: 'row', gap: 9, marginTop: 12, width: '100%' },
  dialogCancel: { flex: 1, minHeight: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.paper, borderWidth: 1, borderColor: C.line },
  dialogCancelText: { fontFamily: F.bold, color: C.muted, fontSize: 12 },
  dialogAdd: { flex: 1.4, minHeight: 50, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.purple },
  dialogAddText: { fontFamily: F.bold, color: '#FFFFFF', fontSize: 12 },
  familyMemberLabel: { fontFamily: F.semi, color: C.mintDark, fontSize: 9 },
  familyFixedBadge: { minHeight: 31, borderRadius: 11, backgroundColor: C.paper, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 4 },
  familyFixedText: { fontFamily: F.bold, color: C.mintDark, fontSize: 8 },
  familyInputsContent: { gap: 8, paddingBottom: 3 },
  familyInputRow: { minHeight: 57, borderRadius: 16, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 7, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  familyInputLabel: { width: 59, fontFamily: F.bold, color: C.purple, fontSize: 9, textAlign: 'right' },
  familyNameInput: { flex: 1, minHeight: 43, borderRadius: 12, backgroundColor: C.canvas, color: C.ink, paddingHorizontal: 11, fontFamily: F.semi, fontSize: 11, writingDirection: 'rtl' },
  editFamilySection: { width: '100%', maxHeight: 300, marginTop: 13, gap: 8, alignItems: 'stretch' },
  editFamilyFixedRow: { minHeight: 58, borderRadius: 16, backgroundColor: C.mintPale, borderWidth: 1, borderColor: '#BFE6D8', padding: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  editFamilyFixedCopy: { flex: 1, alignItems: 'flex-end' },
  editFamilyFixedName: { fontFamily: F.extra, color: C.ink, fontSize: 11, marginTop: 2, textAlign: 'right' },
  editFamilyInputsContent: { gap: 8, paddingBottom: 2 },
  newMemberFamilySection: { width: '100%', marginTop: 12, gap: 7, alignItems: 'stretch' },
  memberUnitsField: { width: '100%', minHeight: 68, borderRadius: 17, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, marginTop: 10, padding: 10, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  memberUnitsFieldCopy: { flex: 1, alignItems: 'flex-end' },
  memberUnitsInput: { width: 58, height: 48, borderRadius: 14, backgroundColor: C.purplePale, borderWidth: 1, borderColor: '#D7CEF8', fontFamily: F.extra, color: C.purple, fontSize: 18 },
  familyInfoRow: { flexDirection: 'row-reverse', gap: 9, alignItems: 'flex-start', marginTop: 10 },
  familyInfoBullet: { width: 21, height: 21, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  familyInfoText: { flex: 1, fontFamily: F.medium, fontSize: 11, color: C.ink, lineHeight: 20, textAlign: 'right' },
  familyInfoButton: { alignSelf: 'stretch' },
  familyInfoExample: { fontFamily: F.medium, fontSize: 10, color: C.muted, lineHeight: 19, textAlign: 'right', backgroundColor: C.canvas, borderRadius: 12, padding: 11, marginTop: 12 },
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
  storySheet: { backgroundColor: C.canvas, borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' },
  storyForm: { padding: 20, paddingBottom: 32 },
  storyTemplateGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 9 },
  storyTemplate: { width: '48.6%', minHeight: 64, borderRadius: 18, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, paddingHorizontal: 11, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, position: 'relative' },
  storyTemplateActive: { borderWidth: 2, borderColor: C.purple, backgroundColor: '#FAF9FF' },
  storyTemplateEmoji: { fontSize: 24, writingDirection: 'ltr' },
  storyTemplateText: { flex: 1, fontFamily: F.semi, fontSize: 10, color: C.muted, textAlign: 'right' },
  storyTemplateTextActive: { fontFamily: F.bold, color: C.purple },
  storyTemplateCheck: { position: 'absolute', top: 6, left: 6, width: 18, height: 18, borderRadius: 7, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center' },
  storyNameHelper: { fontFamily: F.medium, color: C.muted, fontSize: 10, lineHeight: 18, textAlign: 'right', marginTop: -4, marginBottom: 9 },
  storyHelper: { fontFamily: F.medium, color: C.muted, fontSize: 9, lineHeight: 18, textAlign: 'right', marginTop: 12 },
  createStoryButton: { minHeight: 55, borderRadius: 18, backgroundColor: C.purple, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18 },
  createStoryButtonGrow: { flex: 1, minHeight: 55, borderRadius: 18, backgroundColor: C.purple, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10 },
  splitHeaderCopy: { flex: 1 },
  selectAllButton: { alignSelf: 'flex-end', minHeight: 44, borderRadius: 13, backgroundColor: C.purplePale, paddingHorizontal: 13, flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 9 },
  selectAllText: { fontFamily: F.bold, fontSize: 11, color: C.purple },
  shareModeTabs: { flexDirection: 'row-reverse', gap: 8, marginTop: 4 },
  shareModeTab: { flex: 1, minHeight: 72, borderRadius: 17, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.paper, paddingHorizontal: 11, paddingVertical: 10, justifyContent: 'center', gap: 3 },
  shareModeTabActive: { borderColor: C.purple, backgroundColor: C.purplePale },
  shareModeTabTitle: { fontFamily: F.bold, fontSize: 12, color: C.ink, textAlign: 'right' },
  shareModeTabTitleActive: { color: C.purple },
  shareModeTabHint: { fontFamily: F.medium, fontSize: 9, color: C.muted, lineHeight: 15, textAlign: 'right' },
  peopleCard: { borderRadius: 18, backgroundColor: C.paper, borderWidth: 1.5, borderColor: C.line, padding: 10, gap: 8 },
  peopleCardSelf: { backgroundColor: C.purplePale, borderColor: '#CFC4F4' },
  peopleCardHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9 },
  peopleInitial: { alignItems: 'center', justifyContent: 'center' },
  peopleInitialEmpty: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#D6CFE4', borderStyle: 'dashed' },
  peopleInitialText: { fontFamily: F.black, color: '#FFFFFF', fontSize: 14 },
  headNameInput: { flex: 1, minHeight: 44, borderRadius: 13, backgroundColor: C.canvas, color: C.ink, paddingHorizontal: 12, fontFamily: F.bold, fontSize: 13, writingDirection: 'rtl' },
  selfRow: { flex: 1 },
  subList: { gap: 7, paddingRight: 12, marginRight: 16, borderRightWidth: 2, borderRightColor: '#E3DCF6' },
  subRow: { minHeight: 50, borderRadius: 13, backgroundColor: C.canvas, borderWidth: 1, borderColor: C.line, paddingHorizontal: 8, flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  subNameInput: { flex: 1, minHeight: 38, color: C.ink, paddingHorizontal: 4, fontFamily: F.semi, fontSize: 12, writingDirection: 'rtl' },
  subRemove: { width: 36, height: 36, borderRadius: 11, backgroundColor: C.debtPale, alignItems: 'center', justifyContent: 'center' },
  addSubButton: { minHeight: 44, borderRadius: 13, backgroundColor: C.purplePale, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
  addSubText: { fontFamily: F.bold, fontSize: 11, color: C.purple },
  peopleList: { gap: 8, marginTop: 14 },
  selfRowName: { fontFamily: F.bold, fontSize: 12, color: C.ink, textAlign: 'right' },
  peopleIntro: { flexDirection: 'row-reverse', gap: 10, borderRadius: 18, backgroundColor: C.purplePale, padding: 14, marginTop: 4 },
  peopleIntroIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center' },
  peopleIntroCopy: { flex: 1, gap: 4 },
  peopleIntroTitle: { fontFamily: F.bold, fontSize: 12, color: C.ink, textAlign: 'right' },
  peopleIntroText: { fontFamily: F.medium, fontSize: 10, color: C.muted, lineHeight: 19, textAlign: 'right' },
  companionRemove: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.debtPale, alignItems: 'center', justifyContent: 'center' },
  addCompanionButton: { minHeight: 48, borderRadius: 16, borderWidth: 1.5, borderColor: '#D7CEF8', backgroundColor: C.purplePale, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 10 },
  addCompanionText: { fontFamily: F.bold, fontSize: 12, color: C.purple },
  storyStepActions: { flexDirection: 'row-reverse', alignItems: 'stretch', gap: 9, marginTop: 18 },
  storyBackButton: { minHeight: 55, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 13 },
  storyBackText: { fontFamily: F.bold, fontSize: 11, color: C.purple },
  removeMemberButton: { width: '100%', minHeight: 44, borderRadius: 14, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 12, backgroundColor: C.debtPale },
  removeMemberText: { fontFamily: F.bold, fontSize: 11, color: C.debt },
  loneMemberNotice: { borderRadius: 20, backgroundColor: C.purplePale, padding: 16, gap: 7, marginTop: 13 },
  loneMemberTitle: { fontFamily: F.bold, fontSize: 12, color: C.ink, textAlign: 'right' },
  loneMemberText: { fontFamily: F.medium, fontSize: 10, color: C.muted, lineHeight: 19, textAlign: 'right' },
  loneMemberActions: { flexDirection: 'row-reverse', gap: 8, marginTop: 4 },
  loneMemberButton: { flex: 1, minHeight: 48, borderRadius: 16, backgroundColor: C.purple, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7 },
  loneMemberSecondary: { flex: 1, minHeight: 48, borderRadius: 16, backgroundColor: C.paper, borderWidth: 1.5, borderColor: '#D7CEF8', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6 },
  loneMemberSecondaryText: { fontFamily: F.bold, fontSize: 11, color: C.purple },
  loneMemberButtonText: { fontFamily: F.bold, fontSize: 12, color: '#FFFFFF' },
  inlineEmpty: { padding: 22, borderRadius: 23, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, alignItems: 'center' },
  inlineEmptyTitle: { fontFamily: F.extra, fontSize: 15 },
  inlineEmptyText: { fontFamily: F.medium, fontSize: 10, color: C.muted, textAlign: 'center', marginTop: 4 },
  inlineEmptyButton: { minHeight: 44, marginTop: 14, borderRadius: 15, backgroundColor: C.coral, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 6 },
  inlineEmptyButtonText: { fontFamily: F.bold, color: '#FFFFFF', fontSize: 10 },
  splitDisclosure: { minHeight: 44, alignItems: 'flex-end', justifyContent: 'center', marginTop: 14 },
  splitDisclosureText: { fontFamily: F.bold, fontSize: 11, color: C.purple, textDecorationLine: 'underline' },
  splitModeRow: { flexDirection: 'row-reverse', gap: 7 },
  splitModeButton: { flex: 1, minHeight: 44, borderRadius: 15, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  splitModeButtonActive: { backgroundColor: C.purplePale, borderColor: C.purple },
  splitModeText: { fontFamily: F.semi, color: C.muted, fontSize: 10 },
  splitModeTextActive: { fontFamily: F.bold, color: C.purple },
  personNameChips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  personNameChip: { minHeight: 44, borderRadius: 14, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
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
  adPanel: { marginTop: 12, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper, padding: 14 },
  adPanelHead: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  adPanelTitle: { fontFamily: F.extra, fontSize: 12 },
  adPanelRow: { fontFamily: F.medium, fontSize: 11, color: C.ink, textAlign: 'right', lineHeight: 20 },
  adPanelError: { fontFamily: F.regular, fontSize: 10, color: C.debt, textAlign: 'left', writingDirection: 'ltr', lineHeight: 17, backgroundColor: C.debtPale, borderRadius: 10, padding: 8, marginTop: 4, marginBottom: 4 },
  adPanelHint: { fontFamily: F.medium, fontSize: 9, color: C.muted, textAlign: 'right', lineHeight: 16, marginTop: 6 },
  adPanelButton: { minHeight: 40, borderRadius: 12, backgroundColor: C.purplePale, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  adPanelButtonText: { fontFamily: F.bold, fontSize: 11, color: C.purpleDark },
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
  phoneLinkBox: { borderRadius: 18, borderWidth: 1, borderColor: '#E0D6F5', backgroundColor: C.purplePale, padding: 14, marginBottom: 15 },
  phoneLinkTitle: { fontFamily: F.extra, fontSize: 12, textAlign: 'right' },
  phoneLinkText: { fontFamily: F.medium, fontSize: 10, color: C.muted, lineHeight: 18, textAlign: 'right', marginTop: 3 },
  phoneLinkInput: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper, fontFamily: F.bold, fontSize: 16, color: C.ink, writingDirection: 'ltr', marginTop: 11 },
  phoneOtpInput: { fontSize: 21, letterSpacing: 8 },
  phoneLinkTimer: { fontFamily: F.semi, fontSize: 10, color: C.muted, textAlign: 'center', marginTop: 8 },
  phoneLinkButton: { minHeight: 46, borderRadius: 14, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  phoneLinkButtonText: { fontFamily: F.bold, color: '#FFFFFF', fontSize: 12 },
  phoneLinkActions: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 11 },
  phoneLinkSecondary: { fontFamily: F.bold, fontSize: 11, color: C.purple },
  readonlyValue: { fontFamily: F.bold, fontSize: 12, color: C.ink, writingDirection: 'ltr' },
  readonlyHint: { fontFamily: F.medium, color: C.muted, fontSize: 8, marginTop: 4, textAlign: 'right' },
  accountHint: { fontFamily: F.medium, color: C.muted, fontSize: 8, textAlign: 'right', lineHeight: 16, marginTop: -7, marginBottom: 14 },
  accountError: { fontFamily: F.semi, color: C.debtInk, backgroundColor: C.debtPale, padding: 10, borderRadius: 13, fontSize: 9, textAlign: 'right', marginBottom: 11 },
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
  finishStoryButton: { minHeight: 72, borderRadius: 20, borderWidth: 1, borderColor: '#BFE9DA', backgroundColor: C.mintPale, marginTop: 20, padding: 13, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  deleteStoryButton: { minHeight: 66, borderRadius: 20, borderWidth: 1, borderColor: '#F2C4CD', backgroundColor: C.paper, marginTop: 10, padding: 13, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  deleteStoryTitle: { fontFamily: F.extra, color: C.debt, fontSize: 12 },
  finishStoryCopy: { flex: 1, alignItems: 'flex-end' },
  finishStoryTitle: { fontFamily: F.extra, color: C.mintDark, fontSize: 13 },
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
  cardPrompt: { backgroundColor: C.paper, borderRadius: 24, borderWidth: 1, borderColor: '#E0D6F5', padding: 17, marginBottom: 16 },
  cardPromptHead: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 11 },
  cardPromptIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: C.purplePale, alignItems: 'center', justifyContent: 'center' },
  cardPromptCopy: { flex: 1, alignItems: 'flex-end' },
  cardPromptTitle: { fontFamily: F.extra, fontSize: 14, textAlign: 'right' },
  cardPromptText: { fontFamily: F.medium, fontSize: 11, color: C.muted, lineHeight: 19, textAlign: 'right', marginTop: 3 },
  cardPromptInput: { minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.canvas, fontFamily: F.bold, fontSize: 17, letterSpacing: 2, color: C.ink, writingDirection: 'ltr', marginTop: 13 },
  cardPromptButton: { minHeight: 50, borderRadius: 16, backgroundColor: C.purple, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 10 },
  cardPromptButtonText: { fontFamily: F.bold, color: '#FFFFFF', fontSize: 13 },
  cardPromptHint: { fontFamily: F.medium, fontSize: 9, color: C.muted, textAlign: 'right', lineHeight: 16, marginTop: 9 },
  transferCardRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: C.purplePale, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 11 },
  transferCardCopyIcon: { width: 32, height: 32, borderRadius: 12, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center' },
  transferCardCopy: { flex: 1, alignItems: 'flex-end' },
  transferCardLabel: { fontFamily: F.semi, fontSize: 9, color: C.muted },
  transferCardNumber: { fontFamily: F.bold, fontSize: 15, color: C.purpleDark, writingDirection: 'ltr', letterSpacing: 1, marginTop: 2 },
  transferCardMissing: { backgroundColor: C.canvas, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 11 },
  transferCardMissingText: { fontFamily: F.medium, fontSize: 10, color: C.muted, textAlign: 'right', lineHeight: 17 },
  expenseAuthorRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 13, borderTopWidth: 1, borderTopColor: C.line },
  expenseAuthorIcon: { width: 28, height: 28, borderRadius: 10, backgroundColor: C.purplePale, alignItems: 'center', justifyContent: 'center' },
  expenseAuthorText: { flex: 1, fontFamily: F.semi, fontSize: 11, color: C.muted, textAlign: 'right' },
  expenseOwnerActions: { flexDirection: 'row', gap: 9, marginTop: 12 },
  expenseEditButton: { flex: 1.4, minHeight: 48, borderRadius: 16, backgroundColor: C.purple, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7 },
  expenseEditText: { fontFamily: F.bold, color: '#FFFFFF', fontSize: 12 },
  expenseDeleteButton: { flex: 1, minHeight: 48, borderRadius: 16, backgroundColor: C.debtPale, borderWidth: 1, borderColor: '#F3C9D2', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6 },
  expenseDeleteText: { fontFamily: F.bold, color: C.debt, fontSize: 12 },
  expenseOwnerHint: { fontFamily: F.medium, fontSize: 10, color: C.muted, textAlign: 'right', marginTop: 9, lineHeight: 18 },
  expenseDetailsCloseButton: { minHeight: 50, borderRadius: 16, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', marginTop: 15 },
  expenseDetailsCloseText: { fontFamily: F.bold, color: '#FFFFFF', fontSize: 11 },
  memberModeTabs: { width: '100%', flexDirection: 'row-reverse', backgroundColor: C.purplePale, borderRadius: 15, padding: 4, marginVertical: 12 },
  memberModeTab: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
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
    <SafeAreaProvider>
      <AuthGate>
        <DongoApp />
      </AuthGate>
    </SafeAreaProvider>
  );
}
