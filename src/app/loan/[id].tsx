import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import {
  loanApi,
  type LoanDetail,
  type InstalmentSummary,
  type InstalmentStatus,
  type RepaymentSummary,
} from '@/RequestHandler/Request';
import { formatDate } from '@/utils/formatDate';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatNaira(kobo: number) {
  return '₦' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 });
}
// All date formatting uses formatDate from @/utils/formatDate
// Output example: "18 Oct 2026, 14:32:07 pm"

// ── Status helpers ────────────────────────────────────────────────────────────
function loanStatusColor(s: string) {
  switch (s) {
    case 'ACTIVE':   return Colors.success;
    case 'PAID':     return Colors.primary;
    case 'PENDING':  return Colors.warning;
    case 'DEFAULTED':return Colors.error;
    default:         return Colors.text.muted;
  }
}
function instStatusColor(s: InstalmentStatus) {
  switch (s) {
    case 'PAID':        return Colors.success;
    case 'PARTIAL':     return Colors.warning;
    case 'OVERDUE':     return Colors.error;
    case 'ROLLED_OVER': return '#8B5CF6';
    default:            return Colors.text.muted;
  }
}
function instStatusIcon(s: InstalmentStatus): React.ComponentProps<typeof Ionicons>['name'] {
  switch (s) {
    case 'PAID':        return 'checkmark-circle';
    case 'PARTIAL':     return 'ellipse';
    case 'OVERDUE':     return 'alert-circle';
    case 'ROLLED_OVER': return 'reload-circle';
    default:            return 'ellipse-outline';
  }
}

// ── Instalment row ────────────────────────────────────────────────────────────
function InstalmentRow({ inst, total, isLast }: { inst: InstalmentSummary; total: number; isLast: boolean }) {
  const color = instStatusColor(inst.status);
  const outstanding = inst.totalDueKobo + inst.overdueChargeKobo - inst.amountPaidKobo;
  const progressPct = inst.totalDueKobo + inst.overdueChargeKobo > 0
    ? Math.min(100, Math.round((inst.amountPaidKobo / (inst.totalDueKobo + inst.overdueChargeKobo)) * 100))
    : 0;

  return (
    <View style={s.tlRow}>
      {/* Timeline spine */}
      <View style={s.tlLeft}>
        {!isLast && <View style={s.tlLine} />}
        <View style={[s.tlDot, { borderColor: color, backgroundColor: inst.status === 'PENDING' ? Colors.background : color }]}>
          <Ionicons name={instStatusIcon(inst.status)} size={10}
            color={inst.status === 'PENDING' ? color : Colors.text.inverse} />
        </View>
      </View>

      {/* Card */}
      <View style={s.tlCard}>
        <View style={s.tlCardHeader}>
          <AppText variant="label">
            #{inst.instalmentNumber} of {total}
          </AppText>
          <View style={[s.badge, { backgroundColor: color + '20' }]}>
            <AppText variant="caption" color={color} style={{ fontWeight: FontWeight.semibold }}>
              {inst.status}
            </AppText>
          </View>
        </View>
        <AppText variant="caption" color={Colors.text.muted}>{formatDate(inst.dueDate)}</AppText>

        <View style={s.tlAmounts}>
          <View>
            <AppText variant="caption" color={Colors.text.muted}>Base</AppText>
            <AppText variant="bodySmall" style={{ fontWeight: FontWeight.medium }}>{formatNaira(inst.totalDueKobo)}</AppText>
          </View>
          {inst.overdueChargeKobo > 0 && (
            <View>
              <AppText variant="caption" color={Colors.error}>Overdue fee</AppText>
              <AppText variant="bodySmall" color={Colors.error} style={{ fontWeight: FontWeight.medium }}>
                +{formatNaira(inst.overdueChargeKobo)}
              </AppText>
            </View>
          )}
          <View style={{ alignItems: 'flex-end' }}>
            <AppText variant="caption" color={Colors.text.muted}>{inst.status === 'PAID' ? 'Paid' : 'Due'}</AppText>
            <AppText variant="bodySmall" color={inst.status === 'PAID' ? Colors.success : Colors.primary}
              style={{ fontWeight: FontWeight.bold }}>
              {inst.status === 'PAID' ? formatNaira(inst.amountPaidKobo) : formatNaira(outstanding)}
            </AppText>
          </View>
        </View>

        {inst.status === 'PAID' && inst.paidAt && (
          <AppText variant="caption" color={Colors.success} style={{ marginTop: 2 }}>
            ✓ Paid on {formatDate(inst.paidAt)}
          </AppText>
        )}
        {inst.status === 'PARTIAL' && (
          <View style={{ marginTop: Spacing.xs }}>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${progressPct}%`, backgroundColor: Colors.warning }]} />
            </View>
            <AppText variant="caption" color={Colors.warning} style={{ marginTop: 2 }}>
              {formatNaira(inst.amountPaidKobo)} paid · {formatNaira(outstanding)} remaining
            </AppText>
          </View>
        )}
        {inst.status === 'ROLLED_OVER' && (
          <AppText variant="caption" color="#8B5CF6" style={{ marginTop: 2 }}>
            Missed — penalty rolled into next instalment
          </AppText>
        )}
      </View>
    </View>
  );
}

// ── Repayment row ─────────────────────────────────────────────────────────────
function RepaymentRow({ item }: { item: RepaymentSummary }) {
  const ok = item.status === 'SUCCESS';
  return (
    <View style={s.repayRow}>
      <View style={[s.repayIcon, ok ? s.repayIconOk : s.repayIconFail]}>
        <Ionicons name={ok ? 'checkmark' : 'close'} size={16}
          color={ok ? Colors.success : Colors.error} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="label">Payment</AppText>
        <AppText variant="caption">{item.paidAt ? formatDate(item.paidAt) : formatDate(item.createdAt)}</AppText>
      </View>
      <AppText variant="label" color={ok ? Colors.success : Colors.error}>
        {formatNaira(item.amountKobo)}
      </AppText>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function LoanDetailScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const [tab, setTab]               = useState<'overview' | 'schedule' | 'payments'>('overview');
  const [data, setData]             = useState<LoanDetail | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError('');
    try {
      const detail = await loanApi.detail(id);
      setData(detail);
    } catch {
      setError('Failed to load loan details. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center', paddingTop: insets.top }]}>
        <AppText variant="bodySmall" color={Colors.text.muted}>Loading…</AppText>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center', paddingTop: insets.top }]}>
        <AppText style={{ fontSize: 36 }}>⚠️</AppText>
        <AppText variant="bodySmall" color={Colors.error} style={{ marginTop: Spacing.sm, textAlign: 'center', paddingHorizontal: Spacing.lg }}>
          {error || 'Loan not found'}
        </AppText>
        <TouchableOpacity onPress={load} style={{ marginTop: Spacing.md }}>
          <AppText variant="label" color={Colors.primary}>Retry</AppText>
        </TouchableOpacity>
      </View>
    );
  }

  const { loan, schedule, repayments, stats } = data;
  const statusColor = loanStatusColor(loan.status);

  console.log("loan details", JSON.stringify(loan, null, 2))
  console.log("loan stats", JSON.stringify(stats, null, 2))

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxl }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + Spacing.md }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={Colors.text.inverse} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: Spacing.sm }}>
          <AppText variant="heading" style={{ color: Colors.text.inverse }}>
            {loan.purpose ?? 'Personal Loan'}
          </AppText>
          <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.75)' }}>
            Created {formatDate(loan.createdAt)}
          </AppText>
        </View>
        <View style={[s.statusBadge, { backgroundColor: statusColor + '30' }]}>
          <AppText variant="caption" color={statusColor} style={{ fontWeight: FontWeight.bold }}>
            {loan.status}
          </AppText>
        </View>
      </View>

      {/* ── Hero balance strip ── */}
      <View style={s.heroStrip}>
        <View style={s.heroCol}>
          <AppText variant="caption" color="rgba(255,255,255,0.7)">Principal</AppText>
          <AppText style={s.heroAmt}>{formatNaira(loan.principalKobo)}</AppText>
        </View>
        <View style={s.heroDivider} />
        <View style={s.heroCol}>
          <AppText variant="caption" color="rgba(255,255,255,0.7)">Remaining</AppText>
          <AppText style={s.heroAmt}>{formatNaira(loan.balanceKobo)}</AppText>
        </View>
        <View style={s.heroDivider} />
        <View style={s.heroCol}>
          <AppText variant="caption" color="rgba(255,255,255,0.7)">Monthly</AppText>
          <AppText style={s.heroAmt}>{formatNaira(loan.monthlyInstalmentKobo)}</AppText>
        </View>
      </View>

      {/* ── Overall progress bar ── */}
      <View style={[s.card, { marginHorizontal: Spacing.lg, marginTop: Spacing.lg }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm }}>
          <AppText variant="label">{stats.paidCount} of {stats.totalCount} instalments paid</AppText>
          <AppText variant="label" color={Colors.primary}>{stats.progressPct}%</AppText>
        </View>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${stats.progressPct}%` }]} />
        </View>
        {stats.overdueCount > 0 && (
          <AppText variant="caption" color={Colors.error} style={{ marginTop: Spacing.xs }}>
            ⚠ {stats.overdueCount} overdue instalment{stats.overdueCount > 1 ? 's' : ''}
          </AppText>
        )}
        {stats.nextDue && (
          <View style={s.nextDueRow}>
            <AppText variant="bodySmall" color={Colors.text.muted}>Next payment due</AppText>
            <View style={{ alignItems: 'flex-end' }}>
              <AppText variant="label" color={Colors.primary}>{formatNaira(stats.nextDue.outstandingKobo)}</AppText>
              <AppText variant="caption" color={Colors.text.muted}>{formatDate(stats.nextDue.dueDate)}</AppText>
            </View>
          </View>
        )}
      </View>

      {/* ── Tab bar ── */}
      <View style={[s.tabBar, { marginHorizontal: Spacing.lg }]}>
        {(['overview', 'schedule', 'payments'] as const).map((t) => (
          <TouchableOpacity key={t} style={[s.tabItem, tab === t && s.tabItemActive]}
            onPress={() => setTab(t)} activeOpacity={0.8}>
            <AppText variant="label" color={tab === t ? Colors.primary : Colors.text.muted}>
              {t === 'overview' ? 'Overview' : t === 'schedule' ? `Schedule (${stats.totalCount})` : `Payments (${repayments.length})`}
            </AppText>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Overview tab ── */}
      {tab === 'overview' && (
        <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.lg, gap: Spacing.sm }}>
          <View style={s.card}>
            <AppText variant="subheading" style={{ marginBottom: Spacing.md }}>Loan Details</AppText>
            {[
              { label: 'Loan ID',        value: loan.id.slice(0, 8).toUpperCase() + '…' },
              { label: 'Principal',      value: formatNaira(loan.principalKobo) },
              { label: 'Interest rate',  value: `${loan.interestRate}% p.a.` },
              { label: 'Term',           value: `${loan.termMonths} months` },
              { label: 'Monthly payment',value: formatNaira(loan.monthlyInstalmentKobo) },
              { label: 'Total owed',     value: formatNaira(loan.totalOwedKobo) },
              { label: 'Total interest', value: formatNaira(loan.totalOwedKobo - loan.principalKobo) },
              { label: 'Disbursed',      value: loan.disbursedAt ? formatDate(loan.disbursedAt) : '—' },
              { label: 'Final due',      value: loan.dueAt ? formatDate(loan.dueAt) : '—' },
            ].map(({ label, value }) => (
              <View key={label} style={s.detailRow}>
                <AppText variant="bodySmall" color={Colors.text.muted}>{label}</AppText>
                <AppText variant="label">{value}</AppText>
              </View>
            ))}
          </View>

          <View style={s.card}>
            <AppText variant="subheading" style={{ marginBottom: Spacing.md }}>Repayment Summary</AppText>
            {[
              { label: 'Total paid',      value: formatNaira(stats.totalPaidKobo), color: Colors.success },
              { label: 'Remaining',       value: formatNaira(loan.balanceKobo),    color: Colors.primary },
              { label: 'Instalments paid',value: `${stats.paidCount} / ${stats.totalCount}` },
              { label: 'Overdue',         value: stats.overdueCount > 0 ? `${stats.overdueCount}` : 'None',
                                          color: stats.overdueCount > 0 ? Colors.error : Colors.success },
            ].map(({ label, value, color }) => (
              <View key={label} style={s.detailRow}>
                <AppText variant="bodySmall" color={Colors.text.muted}>{label}</AppText>
                <AppText variant="label" color={color}>{value}</AppText>
              </View>
            ))}
          </View>

          {loan.status === 'ACTIVE' && (
            <AppButton
              label="Make a Payment"
              onPress={() => router.push(`/repay/${loan.id}`)}
              style={{ marginTop: Spacing.sm }}
            />
          )}
        </View>
      )}

      {/* ── Schedule tab ── */}
      {tab === 'schedule' && (
        <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.lg }}>
          {schedule.length === 0 ? (
            <View style={s.emptyState}>
              <AppText variant="bodySmall" align="center" color={Colors.text.muted}>No schedule found</AppText>
            </View>
          ) : (
            schedule.map((inst, idx) => (
              <InstalmentRow key={inst.id} inst={inst} total={schedule.length} isLast={idx === schedule.length - 1} />
            ))
          )}
        </View>
      )}

      {/* ── Payments tab ── */}
      {tab === 'payments' && (
        <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.lg }}>
          {repayments.length === 0 ? (
            <View style={s.emptyState}>
              <AppText style={{ fontSize: 36, textAlign: 'center' }}>💳</AppText>
              <AppText variant="subheading" align="center" style={{ marginTop: Spacing.sm }}>No payments yet</AppText>
              <AppText variant="bodySmall" align="center" color={Colors.text.muted} style={{ marginTop: Spacing.xs }}>
                Your repayment history will appear here
              </AppText>
            </View>
          ) : (
            <View style={s.repayList}>
              {repayments.map((r) => <RepaymentRow key={r.id} item={r} />)}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  // Header
  header: {
    backgroundColor: Colors.primary, flexDirection: 'row',
    alignItems: 'center', paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full,
  },

  // Hero strip
  heroStrip: {
    backgroundColor: Colors.primaryDark, flexDirection: 'row',
    paddingVertical: Spacing.lg, paddingHorizontal: Spacing.lg,
  },
  heroCol:     { flex: 1, alignItems: 'center' },
  heroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  heroAmt: {
    fontSize: FontSize.md, fontWeight: FontWeight.bold,
    color: Colors.text.inverse, marginTop: 2,
  },

  // Card
  card: {
    backgroundColor: Colors.background, borderRadius: Radius.lg, padding: Spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },

  // Progress
  progressTrack: { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  progressFill:  { height: '100%', backgroundColor: Colors.primary, borderRadius: 3 },

  nextDueRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.primaryLight, borderRadius: Radius.sm,
    padding: Spacing.sm, marginTop: Spacing.md,
  },

  // Tab bar
  tabBar:        { flexDirection: 'row', backgroundColor: Colors.border, borderRadius: Radius.md, padding: 3, marginTop: Spacing.lg },
  tabItem:       { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: Radius.sm - 2 },
  tabItemActive: { backgroundColor: Colors.background, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },

  // Detail rows
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.xs + 2, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },

  // Timeline
  tlRow:  { flexDirection: 'row', paddingBottom: Spacing.md },
  tlLeft: { width: 28, alignItems: 'center', paddingTop: 2 },
  tlLine: { position: 'absolute', top: 20, bottom: 0, width: 2, backgroundColor: Colors.border },
  tlDot:  { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  tlCard: {
    flex: 1, marginLeft: Spacing.sm, backgroundColor: Colors.background,
    borderRadius: Radius.md, padding: Spacing.md, marginBottom: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  tlCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  badge:        { paddingHorizontal: Spacing.xs + 2, paddingVertical: 2, borderRadius: Radius.full },
  tlAmounts:    { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },

  // Repayments
  repayList:    { backgroundColor: Colors.background, borderRadius: Radius.lg, overflow: 'hidden',
                  shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  repayRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
                  paddingVertical: Spacing.md, paddingHorizontal: Spacing.md,
                  borderBottomWidth: 1, borderBottomColor: Colors.border },
  repayIcon:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  repayIconOk:  { backgroundColor: Colors.successLight },
  repayIconFail:{ backgroundColor: Colors.errorLight },

  emptyState: {
    backgroundColor: Colors.background, borderRadius: Radius.lg,
    padding: Spacing.xl, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
});
