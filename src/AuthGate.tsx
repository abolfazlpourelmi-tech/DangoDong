import type { Session } from '@supabase/supabase-js';
import { type ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { isSupabaseConfigured, supabase } from './supabase';

type Stage = 'phone' | 'otp' | 'profile' | 'ready';

function digits(value: string) {
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  return value
    .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)))
    .replace(/\D/g, '');
}

function iranPhone(value: string) {
  const normalized = digits(value);
  if (/^09\d{9}$/.test(normalized)) return `+98${normalized.slice(1)}`;
  if (/^989\d{9}$/.test(normalized)) return `+${normalized}`;
  return '';
}

function friendlyError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes('unsupported phone provider') || lower.includes('sms')) {
    return 'ارسال پیامک هنوز فعال نشده است. برای تست باید Test OTP در Supabase تنظیم شود و برای نسخه واقعی ملی‌پیامک متصل شود.';
  }
  if (lower.includes('token') || lower.includes('otp')) return 'کد واردشده صحیح نیست یا منقضی شده است.';
  if (lower.includes('rate')) return 'تعداد درخواست‌ها زیاد شده؛ کمی بعد دوباره تلاش کنید.';
  return message;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<Stage>('phone');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [phone, setPhone] = useState('');
  const [submittedPhone, setSubmittedPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [fullName, setFullName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [error, setError] = useState('');

  async function resolveAccount(nextSession: Session | null) {
    setSession(nextSession);
    if (!nextSession || !supabase) {
      setStage('phone');
      setLoading(false);
      return;
    }

    const [{ data: profile, error: profileError }, { data: paymentMethod, error: paymentError }] = await Promise.all([
      supabase.from('profiles').select('full_name, phone').eq('id', nextSession.user.id).maybeSingle(),
      supabase.from('payment_methods').select('card_number').eq('user_id', nextSession.user.id).maybeSingle(),
    ]);

    if (profileError || paymentError) {
      setError(friendlyError((profileError ?? paymentError)?.message ?? 'خطا در دریافت حساب'));
      setStage('profile');
    } else if (profile && paymentMethod) {
      setStage('ready');
    } else {
      setFullName(profile?.full_name ?? '');
      setCardNumber(paymentMethod?.card_number ?? '');
      setStage('profile');
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => resolveAccount(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void resolveAccount(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function requestOtp() {
    if (!supabase) return;
    const formatted = iranPhone(phone);
    if (!formatted) {
      setError('شماره موبایل را به شکل ۰۹۱۲۱۲۳۴۵۶۷ وارد کنید.');
      return;
    }
    setSubmitting(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithOtp({ phone: formatted });
    setSubmitting(false);
    if (authError) {
      setError(friendlyError(authError.message));
      return;
    }
    setSubmittedPhone(formatted);
    setStage('otp');
  }

  async function verifyOtp() {
    if (!supabase) return;
    const token = digits(otp);
    if (token.length !== 6) {
      setError('کد شش‌رقمی را کامل وارد کنید.');
      return;
    }
    setSubmitting(true);
    setError('');
    const { data, error: authError } = await supabase.auth.verifyOtp({ phone: submittedPhone, token, type: 'sms' });
    setSubmitting(false);
    if (authError) {
      setError(friendlyError(authError.message));
      return;
    }
    await resolveAccount(data.session);
  }

  async function saveProfile() {
    if (!supabase || !session) return;
    const name = fullName.trim();
    const card = digits(cardNumber);
    if (name.length < 2) {
      setError('نام و نام خانوادگی را کامل وارد کنید.');
      return;
    }
    if (card.length !== 16) {
      setError('شماره کارت باید دقیقاً ۱۶ رقم باشد.');
      return;
    }
    setSubmitting(true);
    setError('');
    const normalizedPhone = session.user.phone ?? submittedPhone;
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: session.user.id,
      full_name: name,
      phone: normalizedPhone,
      updated_at: new Date().toISOString(),
    });
    if (profileError) {
      setSubmitting(false);
      setError(friendlyError(profileError.message));
      return;
    }
    const { error: paymentError } = await supabase.from('payment_methods').upsert({
      user_id: session.user.id,
      card_number: card,
      updated_at: new Date().toISOString(),
    });
    setSubmitting(false);
    if (paymentError) {
      setError(friendlyError(paymentError.message));
      return;
    }
    setStage('ready');
  }

  if (!isSupabaseConfigured) return <>{children}</>;
  if (loading) return <SafeAreaView style={styles.page}><ActivityIndicator size="large" color="#6652D9" /></SafeAreaView>;
  if (stage === 'ready') return <>{children}</>;

  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.brand}><Text style={styles.brandLetter}>د</Text></View>
        <Text style={styles.title}>{stage === 'profile' ? 'حساب دنگودونگ تو' : 'ورود به دنگودونگ'}</Text>
        <Text style={styles.subtitle}>
          {stage === 'phone' && 'شماره موبایلت را وارد کن تا کد ورود برایت ارسال شود.'}
          {stage === 'otp' && 'کد شش‌رقمی ارسال‌شده را وارد کن.'}
          {stage === 'profile' && 'این اطلاعات برای نمایش نام و تسویه دنگ‌ها استفاده می‌شود.'}
        </Text>

        {stage === 'phone' && (
          <TextInput
            accessibilityLabel="شماره موبایل"
            autoFocus
            keyboardType="phone-pad"
            maxLength={11}
            onChangeText={(value) => setPhone(digits(value).slice(0, 11))}
            placeholder="۰۹۱۲۱۲۳۴۵۶۷"
            placeholderTextColor="#A19BA9"
            style={styles.input}
            textAlign="center"
            value={phone}
          />
        )}
        {stage === 'otp' && (
          <>
            <TextInput
              accessibilityLabel="کد ورود"
              autoFocus
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={(value) => setOtp(digits(value).slice(0, 6))}
              placeholder="ــــــ"
              placeholderTextColor="#A19BA9"
              style={[styles.input, styles.otpInput]}
              textAlign="center"
              value={otp}
            />
            <Pressable onPress={() => { setStage('phone'); setOtp(''); setError(''); }}><Text style={styles.link}>اصلاح شماره موبایل</Text></Pressable>
          </>
        )}
        {stage === 'profile' && (
          <View style={styles.fields}>
            <Text style={styles.label}>نام و نام خانوادگی</Text>
            <TextInput accessibilityLabel="نام و نام خانوادگی" onChangeText={setFullName} placeholder="مثلاً امیر رضایی" placeholderTextColor="#A19BA9" style={styles.input} textAlign="right" value={fullName} />
            <Text style={styles.label}>شماره کارت برای دریافت دنگ</Text>
            <TextInput accessibilityLabel="شماره کارت" keyboardType="number-pad" maxLength={16} onChangeText={(value) => setCardNumber(digits(value).slice(0, 16))} placeholder="۱۶ رقم بدون فاصله" placeholderTextColor="#A19BA9" style={styles.input} textAlign="center" value={cardNumber} />
            <Text style={styles.hint}>رمز، CVV2 و تاریخ انقضا دریافت یا ذخیره نمی‌شوند.</Text>
          </View>
        )}

        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={submitting}
          onPress={stage === 'phone' ? requestOtp : stage === 'otp' ? verifyOtp : saveProfile}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, submitting && styles.buttonDisabled]}
        >
          {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{stage === 'phone' ? 'دریافت کد ورود' : stage === 'otp' ? 'تأیید و ورود' : 'ذخیره و شروع'}</Text>}
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFF8EF', alignItems: 'center', justifyContent: 'center' },
  center: { width: '100%', maxWidth: 440, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  brand: { width: 68, height: 68, borderRadius: 24, backgroundColor: '#6652D9', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  brandLetter: { color: '#FFFFFF', fontSize: 36, fontWeight: '900' },
  title: { color: '#25203A', fontSize: 26, fontWeight: '800', writingDirection: 'rtl', marginBottom: 8 },
  subtitle: { color: '#777184', fontSize: 15, lineHeight: 25, textAlign: 'center', writingDirection: 'rtl', marginBottom: 24 },
  fields: { width: '100%' },
  label: { color: '#25203A', fontSize: 14, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl', marginBottom: 7 },
  input: { width: '100%', minHeight: 56, borderWidth: 1, borderColor: '#E5DCD2', borderRadius: 18, backgroundColor: '#FFFFFF', color: '#25203A', paddingHorizontal: 16, fontSize: 16, marginBottom: 16 },
  otpInput: { fontSize: 25, letterSpacing: 10 },
  hint: { color: '#777184', fontSize: 12, textAlign: 'right', writingDirection: 'rtl', marginTop: -6, marginBottom: 10 },
  error: { width: '100%', color: '#C84359', backgroundColor: '#FFE8EC', borderRadius: 14, padding: 12, textAlign: 'right', writingDirection: 'rtl', lineHeight: 21, marginBottom: 14 },
  button: { width: '100%', minHeight: 56, borderRadius: 18, backgroundColor: '#6652D9', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonPressed: { backgroundColor: '#4936B6', transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', writingDirection: 'rtl' },
  link: { color: '#6652D9', fontSize: 14, fontWeight: '700', marginBottom: 14, writingDirection: 'rtl' },
});
