import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAuthStore } from '@/store/auth';
import { loanApi, repaymentApi, type LoanSummary, type RepaymentSummary, type InstalmentSummary } from '@/RequestHandler/Request';
import { SvgXml } from 'react-native-svg';
import { Svg } from '@/config/svg';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

function formatNaira(kobo: number): string {
  return '₦' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function loanStatusColor(status: LoanSummary['status']): string {
  switch (status) {
    case 'ACTIVE': return Colors.success;
    case 'PAID': return Colors.primary;
    case 'PENDING': return Colors.warning;
    case 'DEFAULTED': return Colors.error;
    default: return Colors.text.muted;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={[styles.statCard, accent && styles.statCardAccent]}>
      <AppText variant="caption" color={accent ? 'rgba(255,255,255,0.75)' : Colors.text.muted}>
        {label}
      </AppText>
      <AppText
        variant="subheading"
        style={[styles.statValue, accent && { color: Colors.text.inverse }]}
      >
        {value}
      </AppText>
    </View>
  );
}

function LoanCard({ loan, onPress }: { loan: LoanSummary; onPress: () => void }) {
  const progress = loan.totalOwedKobo > 0
    ? 1 - loan.balanceKobo / loan.totalOwedKobo
    : 1;

  return (
    <TouchableOpacity style={styles.loanCard} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.loanCardHeader}>
        <View>
          <AppText variant="label">{loan.purpose ?? 'Personal Loan'}</AppText>
          <AppText variant="caption">{new Date(loan.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</AppText>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: loanStatusColor(loan.status) + '20' }]}>
          <AppText variant="caption" color={loanStatusColor(loan.status)} style={{ fontWeight: FontWeight.semibold }}>
            {loan.status}
          </AppText>
        </View>
      </View>

      <View style={styles.loanAmounts}>
        <View>
          <AppText variant="caption" color={Colors.text.muted}>Principal</AppText>
          <AppText variant="body" style={styles.amountText}>{formatNaira(loan.principalKobo)}</AppText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <AppText variant="caption" color={Colors.text.muted}>Balance</AppText>
          <AppText variant="body" style={[styles.amountText, { color: Colors.primary }]}>
            {formatNaira(loan.balanceKobo)}
          </AppText>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      <AppText variant="caption" color={Colors.text.muted} style={{ marginTop: 4 }}>
        {Math.round(progress * 100)}% repaid
      </AppText>
    </TouchableOpacity>
  );
}

function TransactionRow({ item }: { item: RepaymentSummary }) {
  return (
    <View style={styles.txRow}>
      <View style={styles.txIcon}>
     
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="label">Repayment</AppText>
        <AppText variant="caption">
          {item.paidAt ? new Date(item.paidAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : '—'}
        </AppText>
      </View>
      <AppText variant="label" color={Colors.error}>
        −{formatNaira(item.amountKobo)}
      </AppText>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [loans, setLoans] = useState<LoanSummary[]>([]);
  const [recentRepayments, setRecentRepayments] = useState<RepaymentSummary[]>([]);
  const [activeSchedule, setActiveSchedule] = useState<InstalmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [loansData, repData] = await Promise.all([
        loanApi.list(),
        repaymentApi.listAll(),
      ]);
      setLoans(loansData);
      setRecentRepayments(repData.slice(0, 5));
      // Load schedule for the active loan so we can show the dot grid
      const active = loansData.find((l) => l.status === 'ACTIVE');
      if (active) {
        const sched = await loanApi.schedule(active.id);
        setActiveSchedule(sched);
      } else {
        setActiveSchedule([]);
      }
    } catch {
      // Silently fail on refresh — stale data is better than a crash
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const activeLoan = loans.find((l) => l.status === 'ACTIVE');
  const totalBalance = loans
    .filter((l) => l.status === 'ACTIVE')
    .reduce((s, l) => s + l.balanceKobo, 0);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`
    : user?.phone ?? 'there';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxl }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* ── Hero card ── */}
      <View style={[styles.hero, { paddingTop: insets.top + Spacing.lg }]}>
        <View style={styles.heroTop}>
          <View>
            <AppText variant="bodySmall" color="rgba(255,255,255,0.75)">{greeting},</AppText>
            <AppText variant="heading" style={{ color: Colors.text.inverse }}>{displayName}</AppText>
          </View>
          <TouchableOpacity
            style={styles.notifBtn}
            onPress={() => {}}
            activeOpacity={0.7}
          >
           <Ionicons name="notifications-outline" size={24} color="white"/>        
            </TouchableOpacity>
        </View>

        <AppText variant="caption" color="rgba(255,255,255,0.65)" style={{ marginTop: Spacing.sm }}>
          Outstanding balance
        </AppText>
        <AppText style={styles.heroBalance}>
          {loading ? '—' : formatNaira(totalBalance)}
        </AppText>

        <View style={styles.heroStats}>
          <StatCard label="Active loans" value={loading ? '—' : String(loans.filter((l) => l.status === 'ACTIVE').length)} accent />
          <StatCard label="Paid loans" value={loading ? '—' : String(loans.filter((l) => l.status === 'PAID').length)} accent />
          <StatCard label="Monthly due" value={loading || !activeLoan ? '—' : formatNaira(activeLoan.monthlyInstalmentKobo)} accent />
        </View>
      </View>

      {/* ── Quick actions ── */}
      <View style={styles.section}>
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.qaItem} onPress={() => router.push('/(tabs)/Loan')} activeOpacity={0.8}>
            <View style={[styles.qaIcon, { backgroundColor: Colors.primaryLight }]}>
            <Ionicons name="card" size={24}/>
            </View>
            <AppText variant="caption" align="center">Apply for Loan</AppText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.qaItem} onPress={() => router.push('/(tabs)/Repay')} activeOpacity={0.8}>
            <View style={[styles.qaIcon, { backgroundColor: Colors.successLight }]}>
                <Ionicons name="swap-horizontal" size={24}/>
            </View>
            <AppText variant="caption" align="center">Make Payment</AppText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.qaItem} onPress={() => router.push('/(tabs)/Settings')} activeOpacity={0.8}>
            <View style={[styles.qaIcon, { backgroundColor: Colors.surface }]}>
             <Ionicons name="person" size={24}/>
            </View>
            <AppText variant="caption" align="center">Profile</AppText>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Active loan card ── */}
      {activeLoan && (
        <View style={styles.section}>
          <AppText variant="subheading" style={styles.sectionTitle}>Active Loan</AppText>
          <LoanCard loan={activeLoan} onPress={() => router.push('/(tabs)/Loan')} />

          {/* Instalment dot grid */}
          {activeSchedule.length > 0 && (
            <View style={styles.dotGridCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm }}>
                <AppText variant="label">
                  {activeSchedule.filter((i) => i.status === 'PAID').length} of {activeSchedule.length} paid
                </AppText>
                {activeLoan.nextDue && (
                  <AppText variant="caption" color={Colors.primary}>
                    Next: {new Date(activeLoan.nextDue.dueDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                  </AppText>
                )}
              </View>
              <View style={styles.dotGrid}>
                {activeSchedule.slice(0, 24).map((inst) => {
                  const color =
                    inst.status === 'PAID'        ? Colors.success :
                    inst.status === 'PARTIAL'     ? Colors.warning :
                    inst.status === 'OVERDUE'     ? Colors.error   :
                    inst.status === 'ROLLED_OVER' ? '#8B5CF6'      :
                    Colors.border;
                  return <View key={inst.id} style={[styles.dot, { backgroundColor: color }]} />;
                })}
              </View>
              {activeLoan.nextDue && (
                <View style={styles.nextDueRow}>
                  <AppText variant="bodySmall" color={Colors.text.muted}>Next payment due</AppText>
                  <AppText variant="label" color={Colors.primary}>
                    {formatNaira(activeLoan.nextDue.outstandingKobo)}
                  </AppText>
                </View>
              )}
              <AppButton
                label="Pay Now"
                onPress={() => router.push('/(tabs)/Repay')}
                size="sm"
                style={{ marginTop: Spacing.md }}
              />
            </View>
          )}
        </View>
      )}

      {/* ── No loan CTA ── */}
      {!loading && loans.length === 0 && (
        <View style={styles.section}>
          <View style={styles.emptyCard}>
            <AppText style={{ fontSize: 40, textAlign: 'center' }}>💰</AppText>
            <AppText variant="subheading" align="center" style={{ marginTop: Spacing.sm }}>
              No loans yet
            </AppText>
            <AppText variant="bodySmall" align="center" color={Colors.text.muted} style={{ marginTop: Spacing.xs }}>
              Apply for a loan and get funds in minutes
            </AppText>
            <AppButton
              label="Apply Now"
              onPress={() => router.push('/(tabs)/Loan')}
              style={{ marginTop: Spacing.lg }}
            />
          </View>
        </View>
      )}

     
      {recentRepayments.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <AppText variant="subheading" style={styles.sectionTitle}>Recent Payments</AppText>
            <TouchableOpacity onPress={() => router.push('/(tabs)/Repay')} activeOpacity={0.7}>
              <AppText variant="caption" color={Colors.primary}>See all</AppText>
            </TouchableOpacity>
          </View>
          <View style={styles.txList}>
            {recentRepayments.map((r) => (
              <TransactionRow key={r.id} item={r} />
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  // Hero
  hero: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    borderBottomLeftRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  notifBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroBalance: {
    fontSize: 36, fontWeight: FontWeight.extrabold,
    color: Colors.text.inverse, marginTop: 12,
    letterSpacing: -1,
    lineHeight: 40
  },
  heroStats: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  statCard: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.md, padding: Spacing.sm,
  },
  statCardAccent: {},
  statValue: { marginTop: 2 },

  // Sections
  section: { marginTop: Spacing.xl, paddingHorizontal: Spacing.lg },
  sectionTitle: { marginBottom: Spacing.md },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },

  // Quick actions
  quickActions: { flexDirection: 'row', justifyContent: 'space-around' },
  qaItem: { alignItems: 'center', gap: Spacing.xs, width: 72 },
  qaIcon: {
    width: 56, height: 56, borderRadius: Radius.lg,
    alignItems: 'center', justifyContent: 'center',
  },

  // Loan card
  loanCard: {
    backgroundColor: Colors.background,
    borderRadius: Radius.lg, padding: Spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  loanCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  loanAmounts: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.md },
  amountText: { fontWeight: FontWeight.semibold, color: Colors.text.primary, fontSize: FontSize.md },
  progressTrack: {
    height: 6, backgroundColor: Colors.border,
    borderRadius: Radius.full, marginTop: Spacing.md, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', backgroundColor: Colors.primary, borderRadius: Radius.full,
  },

  // Empty state
  emptyCard: {
    backgroundColor: Colors.background, borderRadius: Radius.lg,
    padding: Spacing.xl, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },

  // Dot grid
  dotGridCard: {
    backgroundColor: Colors.background, borderRadius: Radius.lg,
    padding: Spacing.md, marginTop: Spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  dotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dot:     { width: 10, height: 10, borderRadius: 5 },
  nextDueRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: Colors.primaryLight, borderRadius: Radius.sm,
    padding: Spacing.sm, marginTop: Spacing.md,
  },

  // Transactions
  txList: {
    backgroundColor: Colors.background, borderRadius: Radius.lg,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    overflow: 'hidden',
  },
  txRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  txIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.errorLight, alignItems: 'center', justifyContent: 'center',
  },
});
