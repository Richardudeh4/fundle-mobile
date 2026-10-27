import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Slider } from '@miblanchard/react-native-slider';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import {
  loanApi,
  ApiError,
  type LoanSummary,
  type LoanStatus,
  type InstalmentSummary,
  type LoanCalculationResult,
} from '@/RequestHandler/Request';

const { width } = Dimensions.get('window');

// ── Constants ─────────────────────────────────────────────────────────────────
const TERM_OPTIONS  = [3, 6, 12, 18, 24];
const MIN_AMOUNT    = 10_000;     // ₦10,000
const MAX_AMOUNT    = 5_000_000;  // ₦5,000,000
const AMOUNT_STEP   = 10_000;     // slider snaps in ₦10k increments
const MIN_TERM      = 3;
const MAX_TERM      = 24;
const ANNUAL_RATE   = 0.15;

function calcInstalment(principal: number, termMonths: number): number {
  const r = ANNUAL_RATE / 12;
  const factor = Math.pow(1 + r, termMonths);
  return Math.round((principal * r * factor) / (factor - 1));
}

function formatNaira(kobo: number): string {
  return '₦' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

function formatNairaCompact(naira: number): string {
  if (naira >= 1_000_000) return `₦${(naira / 1_000_000).toFixed(1)}M`;
  if (naira >= 1_000)     return `₦${(naira / 1_000).toFixed(0)}k`;
  return `₦${naira}`;
}

function loanStatusColor(status: LoanStatus): string {
  switch (status) {
    case 'ACTIVE':   return Colors.success;
    case 'PAID':     return Colors.primary;
    case 'PENDING':  return Colors.warning;
    case 'DEFAULTED':return Colors.error;
    default:         return Colors.text.muted;
  }
}

// ── Loan Calculator ───────────────────────────────────────────────────────────
function LoanCalculator({
  onApply,
}: {
  onApply: (amountNaira: number, termMonths: number) => void;
}) {
  const [amount, setAmount]       = useState(100_000);   // naira
  const [term, setTerm]           = useState(12);        // months
  const [result, setResult]       = useState<LoanCalculationResult | null>(null);
  const [loading, setLoading]     = useState(false);
  const debounceRef               = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce API call — fire 400 ms after the user stops dragging
  const fetchCalc = useCallback((amt: number, t: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await loanApi.calculate(amt * 100, t); // convert naira → kobo
        setResult(data);
      } catch {
        // silently ignore — local formula is the fallback
      } finally {
        setLoading(false);
      }
    }, 400);
  }, []);

  // Initial fetch + whenever sliders change
  useEffect(() => { fetchCalc(amount, term); }, [amount, term, fetchCalc]);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // Fallback to local formula while the API is in flight
  const amountKobo        = amount * 100;
  const monthlyKobo       = result?.monthlyInstalmentKobo ?? calcInstalment(amountKobo, term);
  const totalRepayKobo    = result?.totalRepaymentKobo    ?? monthlyKobo * term;
  const totalInterestKobo = result?.totalInterestKobo     ?? (totalRepayKobo - amountKobo);
  const interestPct       = amountKobo > 0 ? ((totalInterestKobo / amountKobo) * 100).toFixed(1) : '0';

  return (
    <View style={calcStyles.card}>
      <AppText variant="subheading" style={{ marginBottom: Spacing.lg }}>Loan Calculator</AppText>

      {/* ── Amount slider ── */}
      <View style={calcStyles.sliderHeader}>
        <AppText variant="label">Loan Amount</AppText>
        <AppText variant="subheading" color={Colors.primary}>
          {formatNairaCompact(amount)}
        </AppText>
      </View>
      <Slider
        value={amount}
        minimumValue={MIN_AMOUNT}
        maximumValue={MAX_AMOUNT}
        step={AMOUNT_STEP}
        onValueChange={(v) => setAmount(Array.isArray(v) ? v[0] : v)}
        minimumTrackTintColor={Colors.primary}
        maximumTrackTintColor={Colors.border}
        thumbTintColor={Colors.primary}
        containerStyle={calcStyles.sliderContainer}
        trackStyle={calcStyles.track}
        thumbStyle={calcStyles.thumb}
      />
      <View style={calcStyles.sliderLabels}>
        <AppText variant="caption" color={Colors.text.muted}>{formatNairaCompact(MIN_AMOUNT)}</AppText>
        <AppText variant="caption" color={Colors.text.muted}>{formatNairaCompact(MAX_AMOUNT)}</AppText>
      </View>

      {/* ── Term slider ── */}
      <View style={[calcStyles.sliderHeader, { marginTop: Spacing.lg }]}>
        <AppText variant="label">Repayment Period</AppText>
        <AppText variant="subheading" color={Colors.primary}>
          {term} {term === 1 ? 'month' : 'months'}
        </AppText>
      </View>
      <Slider
        value={term}
        minimumValue={MIN_TERM}
        maximumValue={MAX_TERM}
        step={1}
        onValueChange={(v) => setTerm(Array.isArray(v) ? v[0] : v)}
        minimumTrackTintColor={Colors.primary}
        maximumTrackTintColor={Colors.border}
        thumbTintColor={Colors.primary}
        containerStyle={calcStyles.sliderContainer}
        trackStyle={calcStyles.track}
        thumbStyle={calcStyles.thumb}
      />
      <View style={calcStyles.sliderLabels}>
        <AppText variant="caption" color={Colors.text.muted}>{MIN_TERM} mo</AppText>
        <AppText variant="caption" color={Colors.text.muted}>{MAX_TERM} mo</AppText>
      </View>

      {/* ── Results card ── */}
      <View style={calcStyles.resultsCard}>
        {/* Hero — monthly payment */}
        <View style={calcStyles.heroRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="caption" color="rgba(255,255,255,0.75)" numberOfLines={1}>Monthly payment</AppText>
            <AppText style={calcStyles.heroAmount} numberOfLines={1}>
              {loading ? '—' : formatNaira(monthlyKobo)}
            </AppText>
          </View>
          <View style={calcStyles.heroDivider} />
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <AppText variant="caption" color="rgba(255,255,255,0.75)">× {term} months</AppText>
            <AppText style={calcStyles.heroAmountSm}>
              {loading ? '—' : formatNaira(totalRepayKobo)}
            </AppText>
          </View>
        </View>

        {/* Breakdown rows */}
        <View style={calcStyles.breakdownRow}>
          <AppText variant="bodySmall" color="rgba(255,255,255,0.7)">Principal</AppText>
          <AppText variant="label" style={{ color: '#fff' }}>{formatNaira(amountKobo)}</AppText>
        </View>
        <View style={calcStyles.breakdownRow}>
          <AppText variant="bodySmall" color="rgba(255,255,255,0.7)">Total interest ({interestPct}%)</AppText>
          <AppText variant="label" style={{ color: '#fff' }}>{formatNaira(totalInterestKobo)}</AppText>
        </View>
        <View style={[calcStyles.breakdownRow, { borderBottomWidth: 0 }]}>
          <AppText variant="bodySmall" color="rgba(255,255,255,0.7)">Annual rate</AppText>
          <AppText variant="label" style={{ color: '#fff' }}>15%</AppText>
        </View>

        {/* Visual ratio bar — principal vs interest */}
        <View style={calcStyles.ratioBar}>
          <View
            style={[
              calcStyles.ratioFillPrincipal,
              { flex: amountKobo },
            ]}
          />
          <View
            style={[
              calcStyles.ratioFillInterest,
              { flex: Math.max(totalInterestKobo, 1) },
            ]}
          />
        </View>
        <View style={calcStyles.ratioLegend}>
          <View style={calcStyles.legendItem}>
            <View style={[calcStyles.legendDot, { backgroundColor: 'rgba(255,255,255,0.9)' }]} />
            <AppText variant="caption" color="rgba(255,255,255,0.75)">Principal</AppText>
          </View>
          <View style={calcStyles.legendItem}>
            <View style={[calcStyles.legendDot, { backgroundColor: 'rgba(255,255,255,0.4)' }]} />
            <AppText variant="caption" color="rgba(255,255,255,0.75)">Interest</AppText>
          </View>
        </View>
      </View>

      <AppButton
        label="Apply with these terms"
        onPress={() => onApply(amount, term)}
        style={{ marginTop: Spacing.lg }}
      />
    </View>
  );
}

const calcStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.background,
    borderRadius: Radius.lg, padding: Spacing.lg,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  sliderHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sliderContainer: { marginTop: Spacing.sm },
  track:           { height: 4, borderRadius: 2 },
  thumb:           { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primary,
                     shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  sliderLabels:    { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },

  // Results
  resultsCard: {
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    padding: Spacing.lg, marginTop: Spacing.lg,
  },
  heroRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  heroAmount:   { fontSize:18, fontWeight: FontWeight.extrabold, color: '#fff', marginTop: 2 },
  heroAmountSm: { fontSize: FontSize.lg,  fontWeight: FontWeight.bold,      color: '#fff', marginTop: 2 },
  heroDivider:  { width: 1, height: 48, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: Spacing.md },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between',
                  paddingVertical: Spacing.xs + 2, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.15)' },

  // Ratio bar
  ratioBar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: Spacing.md },
  ratioFillPrincipal: { backgroundColor: 'rgba(255,255,255,0.9)' },
  ratioFillInterest:  { backgroundColor: 'rgba(255,255,255,0.35)' },
  ratioLegend:  { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:    { width: 8, height: 8, borderRadius: 4 },

});

// ── Apply form ────────────────────────────────────────────────────────────────
function ApplyForm({
  onSuccess,
  prefillAmount,
  prefillTerm,
}: {
  onSuccess: () => void;
  prefillAmount?: number; // naira
  prefillTerm?: number;   // months
}) {
  const [amountStr, setAmountStr] = useState(prefillAmount ? String(prefillAmount) : '');
  const [term, setTerm]           = useState(prefillTerm ?? 12);
  const [purpose, setPurpose]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState(false);

  // Sync if parent pushes new prefill values (user taps "Apply with these terms")
  useEffect(() => {
    if (prefillAmount) setAmountStr(String(prefillAmount));
    if (prefillTerm)   setTerm(prefillTerm);
  }, [prefillAmount, prefillTerm]);

  const amount = parseFloat(amountStr.replace(/,/g, '')) || 0;
  const amountKobo = Math.round(amount * 100);
  const instalment = amount >= MIN_AMOUNT ? calcInstalment(amountKobo, term) : 0;
  const totalOwed = instalment * term;
  const isValid = amount >= MIN_AMOUNT && amount <= MAX_AMOUNT;

  const handleApply = async () => {
    if (!isValid) {
      setError(`Enter an amount between ₦${MIN_AMOUNT.toLocaleString()} and ₦${MAX_AMOUNT.toLocaleString()}`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      await loanApi.apply({
        amountKobo,
        termMonths: term,
        purpose: purpose.trim() || undefined,
      });
      setSuccess(true);
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={styles.successBox}>
        <AppText style={{ fontSize: 48, textAlign: 'center' }}>🎉</AppText>
        <AppText variant="subheading" align="center" style={{ marginTop: Spacing.md }}>
          Application submitted!
        </AppText>
        <AppText variant="bodySmall" align="center" color={Colors.text.muted} style={{ marginTop: Spacing.xs }}>
          Your loan is under review. We'll notify you shortly.
        </AppText>
      </View>
    );
  }

  return (
    <View style={styles.formCard}>
      <AppText variant="subheading" style={{ marginBottom: Spacing.lg }}>Apply for a Loan</AppText>

      {/* Amount */}
      <AppText variant="label" style={styles.fieldLabel}>Loan Amount (₦)</AppText>
      <View style={styles.amountInput}>
        <AppText style={styles.nairaPrefix}>₦</AppText>
        <TextInput
          style={styles.amountField}
          placeholder="0.00"
          placeholderTextColor={Colors.text.muted}
          keyboardType="numeric"
          value={amountStr}
          onChangeText={(t) => {
            setError('');
            setAmountStr(t.replace(/[^0-9.]/g, ''));
          }}
        />
      </View>
      {amountStr !== '' && !isValid && (
        <AppText variant="caption" color={Colors.error} style={{ marginTop: 4 }}>
          Amount must be ₦{MIN_AMOUNT.toLocaleString()} – ₦{MAX_AMOUNT.toLocaleString()}
        </AppText>
      )}

      {/* Term selector */}
      <AppText variant="label" style={[styles.fieldLabel, { marginTop: Spacing.lg }]}>Repayment Term</AppText>
      <View style={styles.termRow}>
        {TERM_OPTIONS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.termChip, term === t && styles.termChipActive]}
            onPress={() => setTerm(t)}
            activeOpacity={0.8}
          >
            <AppText
              variant="caption"
              style={[styles.termChipText, term === t && styles.termChipTextActive]}
            >
              {t}mo
            </AppText>
          </TouchableOpacity>
        ))}
      </View>

      {/* Purpose */}
      <AppText variant="label" style={[styles.fieldLabel, { marginTop: Spacing.lg }]}>Purpose (optional)</AppText>
      <TextInput
        style={styles.purposeInput}
        placeholder="e.g. School fees, Business"
        placeholderTextColor={Colors.text.muted}
        value={purpose}
        onChangeText={setPurpose}
        maxLength={100}
      />

      {/* Summary */}
      {amount >= MIN_AMOUNT && (
        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <AppText variant="bodySmall" color={Colors.text.muted}>Monthly payment</AppText>
            <AppText variant="label">{formatNaira(instalment)}</AppText>
          </View>
          <View style={styles.summaryRow}>
            <AppText variant="bodySmall" color={Colors.text.muted}>Total repayment</AppText>
            <AppText variant="label">{formatNaira(totalOwed)}</AppText>
          </View>
          <View style={styles.summaryRow}>
            <AppText variant="bodySmall" color={Colors.text.muted}>Interest rate (annual)</AppText>
            <AppText variant="label">{(ANNUAL_RATE * 100).toFixed(0)}%</AppText>
          </View>
        </View>
      )}

      {error ? (
        <View style={styles.errorBox}>
          <AppText variant="caption" color={Colors.error}>{error}</AppText>
        </View>
      ) : null}

      <AppButton
        label="Submit Application"
        onPress={handleApply}
        loading={loading}
        disabled={!isValid}
        style={{ marginTop: Spacing.lg }}
      />
    </View>
  );
}

// ── Loan history card ─────────────────────────────────────────────────────────
function LoanHistoryCard({ loan, onPress }: { loan: LoanSummary; onPress: () => void }) {
  const [schedule, setSchedule] = useState<InstalmentSummary[]>([]);

  useEffect(() => {
    loanApi.schedule(loan.id).then(setSchedule).catch(() => {});
  }, [loan.id]);

  const progress = loan.totalOwedKobo > 0 ? 1 - loan.balanceKobo / loan.totalOwedKobo : 1;
  const paidCount = schedule.filter((i) => i.status === 'PAID').length;
  const totalCount = schedule.length;

  return (
    <TouchableOpacity style={styles.historyCard} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.historyHeader}>
        <View style={{ flex: 1 }}>
          <AppText variant="label">{loan.purpose ?? 'Personal Loan'}</AppText>
          <AppText variant="caption">
            {new Date(loan.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
          </AppText>
        </View>
        <View style={[styles.statusPill, { backgroundColor: loanStatusColor(loan.status) + '1A' }]}>
          <AppText variant="caption" style={{ color: loanStatusColor(loan.status), fontWeight: FontWeight.semibold }}>
            {loan.status}
          </AppText>
        </View>
      </View>

      <View style={styles.historyAmounts}>
        <View>
          <AppText variant="caption" color={Colors.text.muted}>Principal</AppText>
          <AppText variant="label">{formatNaira(loan.principalKobo)}</AppText>
        </View>
        <View style={{ alignItems: 'center' }}>
          <AppText variant="caption" color={Colors.text.muted}>Monthly</AppText>
          <AppText variant="label">{formatNaira(loan.monthlyInstalmentKobo)}</AppText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <AppText variant="caption" color={Colors.text.muted}>Balance</AppText>
          <AppText variant="label" color={Colors.primary}>{formatNaira(loan.balanceKobo)}</AppText>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.min(100, Math.round(progress * 100))}%` }]} />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <AppText variant="caption" color={Colors.text.muted}>
          {totalCount > 0 ? `${paidCount} of ${totalCount} instalments paid` : `${Math.min(100, Math.round(progress * 100))}% repaid`}
        </AppText>
        {loan.nextDue && (
          <AppText variant="caption" color={Colors.primary}>
            Next: {new Date(loan.nextDue.dueDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })} · {formatNaira(loan.nextDue.outstandingKobo)}
          </AppText>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function LoanScreen() {
  const insets      = useSafeAreaInsets();
  const router      = useRouter();
  const [tab, setTab]             = useState<'calculator' | 'apply' | 'history'>('calculator');
  const [loans, setLoans]         = useState<LoanSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  // Values passed from calculator → apply form
  const [prefillAmount, setPrefillAmount] = useState<number | undefined>();
  const [prefillTerm,   setPrefillTerm]   = useState<number | undefined>();

  const load = useCallback(async () => {
    try {
      const data = await loanApi.list();
      setLoans(data);
      // If there's an active/pending loan, switch to history tab by default
      if (data.some((l) => l.status === 'ACTIVE' || l.status === 'PENDING')) {
        setTab('history');
      }
    } catch {
      // Silently ignore; stale data is fine
    } finally {
      setInitialLoad(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxl }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* Header */}
      <View style={[styles.screenHeader, { paddingTop: insets.top + Spacing.lg }]}>
        <AppText variant="heading">Loans</AppText>
        <AppText variant="bodySmall" color={Colors.text.muted}>Manage and apply for loans</AppText>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {(['calculator', 'apply', 'history'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabItem, tab === t && styles.tabItemActive]}
            onPress={() => setTab(t)}
            activeOpacity={0.8}
          >
            <AppText variant="label" color={tab === t ? Colors.primary : Colors.text.muted}>
              {t === 'calculator' ? 'Calculate' : t === 'apply' ? 'Apply' : `History (${loans.length})`}
            </AppText>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.lg }}>
        {tab === 'calculator' && (
          <LoanCalculator
            onApply={(amt, tm) => {
              setPrefillAmount(amt);
              setPrefillTerm(tm);
              setTab('apply');
            }}
          />
        )}
        {tab === 'apply' && (
          <ApplyForm
            prefillAmount={prefillAmount}
            prefillTerm={prefillTerm}
            onSuccess={() => { load(); setTab('history'); }}
          />
        )}
        {tab === 'history' && (
          <>
            {!initialLoad && loans.length === 0 ? (
              <View style={styles.emptyState}>
                <AppText style={{ fontSize: 40, textAlign: 'center' }}>📋</AppText>
                <AppText variant="subheading" align="center" style={{ marginTop: Spacing.sm }}>
                  No loan history
                </AppText>
                <AppText variant="bodySmall" align="center" color={Colors.text.muted} style={{ marginTop: Spacing.xs }}>
                  Your past and current loans will appear here
                </AppText>
                <AppButton
                  label="Calculate a Loan"
                  variant="outline"
                  onPress={() => setTab('calculator')}
                  style={{ marginTop: Spacing.lg }}
                />
              </View>
            ) : (
              loans.map((l) => <LoanHistoryCard key={l.id} loan={l} onPress={() => router.push(`/loan/${l.id}` as any)} />)
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  screenHeader: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, backgroundColor: Colors.background },

  tabBar: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.border,
    borderRadius: Radius.md,
    padding: 3,
  },
  tabItem: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: Radius.sm - 2 },
  tabItemActive: { backgroundColor: Colors.background, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },

  // Form card
  formCard: {
    backgroundColor: Colors.background,
    borderRadius: Radius.lg, padding: Spacing.lg,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  fieldLabel: { marginBottom: Spacing.xs },
  amountInput: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, height: 52,
  },
  nairaPrefix: { fontSize: FontSize.lg, color: Colors.text.muted, marginRight: 4 },
  amountField: { flex: 1, fontSize: FontSize.lg, color: Colors.text.primary, fontWeight: FontWeight.semibold },
  termRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  termChip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border,
  },
  termChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  termChipText: { color: Colors.text.secondary },
  termChipTextActive: { color: Colors.text.inverse },
  purposeInput: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, height: 48,
    color: Colors.text.primary, fontSize: FontSize.md,
  },
  summaryBox: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.md, marginTop: Spacing.lg, gap: Spacing.sm,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  errorBox: {
    backgroundColor: Colors.errorLight, borderRadius: Radius.sm,
    padding: Spacing.sm, marginTop: Spacing.md,
  },
  successBox: {
    backgroundColor: Colors.background, borderRadius: Radius.lg,
    padding: Spacing.xl, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },

  // History
  historyCard: {
    backgroundColor: Colors.background, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: Spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  statusPill: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  historyAmounts: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.md },
  progressTrack: {
    height: 6, backgroundColor: Colors.border,
    borderRadius: Radius.full, marginTop: Spacing.md, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: Radius.full },

  emptyState: {
    backgroundColor: Colors.background, borderRadius: Radius.lg,
    padding: Spacing.xl, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
});
