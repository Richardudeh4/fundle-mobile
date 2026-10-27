import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Pressable,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import {
  loanApi,
  repaymentApi,
  ApiError,
  type LoanSummary,
  type InstalmentSummary,
  type InstalmentStatus,
  type RepaymentSummary,
} from '@/RequestHandler/Request';
import { Ionicons } from '@expo/vector-icons';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatNaira(kobo: number): string {
  return '₦' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Instalment status config ───────────────────────────────────────────────────
type StatusCfg = { color: string; label: string; icon: string };
function statusCfg(s: InstalmentStatus): StatusCfg {
  switch (s) {
    case 'PAID':        return { color: Colors.success,      label: 'Paid',        icon: 'checkmark-circle' };
    case 'PARTIAL':     return { color: Colors.warning,      label: 'Partial',     icon: 'ellipse' };
    case 'OVERDUE':     return { color: Colors.error,        label: 'Overdue',     icon: 'alert-circle' };
    case 'ROLLED_OVER': return { color: '#8B5CF6',           label: 'Rolled over', icon: 'reload-circle' };
    default:            return { color: Colors.text.muted,   label: 'Pending',     icon: 'ellipse-outline' };
  }
}

// ── Instalment dot grid (up to 24) ─────────────────────────────────────────────
function DotGrid({ instalments }: { instalments: InstalmentSummary[] }) {
  return (
    <View style={dotStyles.grid}>
      {instalments.slice(0, 24).map((inst) => {
        const { color } = statusCfg(inst.status);
        return <View key={inst.id} style={[dotStyles.dot, { backgroundColor: color }]} />;
      })}
    </View>
  );
}
const dotStyles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.sm },
  dot:  { width: 10, height: 10, borderRadius: 5 },
});

// ── Single instalment timeline row ────────────────────────────────────────────
function InstalmentRow({
  inst,
  total,
  isLast,
}: {
  inst: InstalmentSummary;
  total: number;
  isLast: boolean;
}) {
  const cfg = statusCfg(inst.status);
  const progressPct =
    inst.totalDueKobo + inst.overdueChargeKobo > 0
      ? Math.min(100, Math.round((inst.amountPaidKobo / (inst.totalDueKobo + inst.overdueChargeKobo)) * 100))
      : 0;

  return (
    <View style={tlStyles.row}>
      {/* Left — connector + dot */}
      <View style={tlStyles.connector}>
        {!isLast && <View style={tlStyles.line} />}
        <View style={[tlStyles.dot, { borderColor: cfg.color, backgroundColor: inst.status === 'PENDING' ? Colors.background : cfg.color }]}>
          <Ionicons
            name={cfg.icon as any}
            size={inst.status === 'PENDING' ? 8 : 10}
            color={inst.status === 'PENDING' ? cfg.color : Colors.text.inverse}
          />
        </View>
      </View>

      {/* Centre — instalment info */}
      <View style={tlStyles.body}>
        <View style={tlStyles.bodyHeader}>
          <AppText variant="label">
            Instalment {inst.instalmentNumber} of {total}
          </AppText>
          <View style={[tlStyles.badge, { backgroundColor: cfg.color + '20' }]}>
            <AppText variant="caption" color={cfg.color} style={{ fontWeight: FontWeight.semibold }}>
              {cfg.label}
            </AppText>
          </View>
        </View>

        <AppText variant="caption" color={Colors.text.muted}>{fmtDate(inst.dueDate)}</AppText>

        {/* Amounts breakdown */}
        <View style={tlStyles.amounts}>
          <View style={tlStyles.amountCol}>
            <AppText variant="caption" color={Colors.text.muted}>Base</AppText>
            <AppText variant="bodySmall" style={{ fontWeight: FontWeight.medium }}>
              {formatNaira(inst.totalDueKobo)}
            </AppText>
          </View>
          {inst.overdueChargeKobo > 0 && (
            <View style={tlStyles.amountCol}>
              <AppText variant="caption" color={Colors.error}>Overdue fee</AppText>
              <AppText variant="bodySmall" color={Colors.error} style={{ fontWeight: FontWeight.medium }}>
                +{formatNaira(inst.overdueChargeKobo)}
              </AppText>
            </View>
          )}
          <View style={[tlStyles.amountCol, { alignItems: 'flex-end' }]}>
            <AppText variant="caption" color={Colors.text.muted}>
              {inst.status === 'PAID' ? 'Paid' : 'Due'}
            </AppText>
            <AppText
              variant="bodySmall"
              color={inst.status === 'PAID' ? Colors.success : Colors.primary}
              style={{ fontWeight: FontWeight.bold }}
            >
              {inst.status === 'PAID'
                ? formatNaira(inst.amountPaidKobo)
                : formatNaira(inst.outstandingKobo)}
            </AppText>
          </View>
        </View>

        {/* Paid timestamp */}
        {inst.status === 'PAID' && inst.paidAt && (
          <AppText variant="caption" color={Colors.success} style={{ marginTop: 2 }}>
            ✓ Paid on {fmtDate(inst.paidAt)}
          </AppText>
        )}

        {/* Partial progress bar */}
        {inst.status === 'PARTIAL' && (
          <View style={tlStyles.partialWrap}>
            <View style={tlStyles.partialTrack}>
              <View style={[tlStyles.partialFill, { width: `${progressPct}%` }]} />
            </View>
            <AppText variant="caption" color={Colors.warning} style={{ marginTop: 2 }}>
              {formatNaira(inst.amountPaidKobo)} paid · {formatNaira(inst.outstandingKobo)} remaining
            </AppText>
          </View>
        )}

        {/* Rolled-over note */}
        {inst.status === 'ROLLED_OVER' && (
          <AppText variant="caption" color="#8B5CF6" style={{ marginTop: 2 }}>
            Missed — rolled into next instalment
          </AppText>
        )}
      </View>
    </View>
  );
}

const tlStyles = StyleSheet.create({
  row:        { flexDirection: 'row', paddingBottom: Spacing.md },
  connector:  { width: 28, alignItems: 'center', paddingTop: 2 },
  line:       { position: 'absolute', top: 20, bottom: 0, width: 2, backgroundColor: Colors.border },
  dot:        { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  body:       { flex: 1, marginLeft: Spacing.sm, backgroundColor: Colors.background, borderRadius: Radius.md, padding: Spacing.md, marginBottom: 2,
                shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  bodyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  badge:      { paddingHorizontal: Spacing.xs + 2, paddingVertical: 2, borderRadius: Radius.full },
  amounts:    { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  amountCol:  { gap: 1 },
  partialWrap:{ marginTop: Spacing.xs },
  partialTrack:{ height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  partialFill: { height: '100%', backgroundColor: Colors.warning, borderRadius: 2 },
});

// ── Confirm pay modal ─────────────────────────────────────────────────────────
function ConfirmModal({
  visible, inst, amountKobo, isPartial, loanBalance,
  onConfirm, onCancel, loading,
}: {
  visible: boolean;
  inst: InstalmentSummary | null;
  amountKobo: number;
  isPartial: boolean;
  loanBalance: number;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  if (!inst) return null;
  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={modalStyles.overlay} onPress={onCancel}>
        <Pressable style={modalStyles.card} onPress={() => {}}>
          <Ionicons name="card" size={36} color={Colors.primary} style={{ alignSelf: 'center' }} />
          <AppText variant="subheading" align="center" style={{ marginTop: Spacing.md }}>
            Confirm {isPartial ? 'Part ' : ''}Payment
          </AppText>
          <AppText style={modalStyles.amount}>{formatNaira(amountKobo)}</AppText>

          <View style={modalStyles.row}>
            <AppText variant="bodySmall" color={Colors.text.muted}>Instalment</AppText>
            <AppText variant="label">#{inst.instalmentNumber} · due {fmtDate(inst.dueDate)}</AppText>
          </View>
          {inst.overdueChargeKobo > 0 && (
            <View style={modalStyles.row}>
              <AppText variant="bodySmall" color={Colors.error}>Overdue fee included</AppText>
              <AppText variant="label" color={Colors.error}>+{formatNaira(inst.overdueChargeKobo)}</AppText>
            </View>
          )}
          <View style={modalStyles.row}>
            <AppText variant="bodySmall" color={Colors.text.muted}>Loan balance after</AppText>
            <AppText variant="label" color={Colors.primary}>{formatNaira(Math.max(0, loanBalance - amountKobo))}</AppText>
          </View>
          {isPartial && (
            <View style={[modalStyles.partialNote]}>
              <AppText variant="caption" color={Colors.warning}>
                This is a part payment. Instalment will be marked as partial until fully paid.
              </AppText>
            </View>
          )}
          <View style={modalStyles.actions}>
            <AppButton label="Cancel" onPress={onCancel} variant="outline" fullWidth={false} style={{ flex: 1 }} />
            <AppButton label="Pay Now" onPress={onConfirm} loading={loading} fullWidth={false} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
const modalStyles = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  card:        { backgroundColor: Colors.background, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl, paddingBottom: Spacing.xxl },
  amount:      { fontSize: 34, fontWeight: FontWeight.extrabold, color: Colors.text.primary, textAlign: 'center', marginVertical: Spacing.md, lineHeight: 42 },
  row:         { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  partialNote: { backgroundColor: Colors.warning + '18', borderRadius: Radius.sm, padding: Spacing.sm, marginTop: Spacing.md },
  actions:     { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xl },
});

// ── Screen ────────────────────────────────────────────────────────────────────
export default function RepayScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'schedule' | 'pay' | 'history'>('schedule');

  const [loans, setLoans]               = useState<LoanSummary[]>([]);
  const [selectedLoan, setSelectedLoan] = useState<LoanSummary | null>(null);
  const [schedule, setSchedule]         = useState<InstalmentSummary[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError]     = useState('');
  const [repayments, setRepayments]     = useState<RepaymentSummary[]>([]);
  const [refreshing, setRefreshing]     = useState(false);

  const [amountStr, setAmountStr]       = useState('');
  const [payMode, setPayMode]           = useState<'full' | 'part'>('full');
  const [showConfirm, setShowConfirm]   = useState(false);
  const [paying, setPaying]             = useState(false);
  const [successMsg, setSuccessMsg]     = useState('');
  const [errorMsg, setErrorMsg]         = useState('');

  const loadSchedule = async (loanId: string) => {
    setScheduleLoading(true);
    setScheduleError('');
    try {
      const sched = await loanApi.schedule(loanId);
      setSchedule(sched);
    } catch {
      setScheduleError('Failed to load schedule. Pull down to retry.');
      setSchedule([]);
    } finally {
      setScheduleLoading(false);
    }
  };

  const load = useCallback(async (loanId?: string) => {
    try {
      const [loansData, repData] = await Promise.all([
        loanApi.list(),
        repaymentApi.listAll(),
      ]);
      const active = loansData.filter((l) => l.status === 'ACTIVE' || l.status === 'PENDING');
      setLoans(active);
      setRepayments(repData);

      const pick = loanId
        ? active.find((l) => l.id === loanId)
        : active.find((l) => l.status === 'ACTIVE') ?? active[0];

      if (pick) {
        setSelectedLoan(pick);
        await loadSchedule(pick.id);
      } else {
        setSchedule([]);
      }
    } catch {
      // ignore on refresh
    } finally {
      setRefreshing(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When user switches loan chip, load that loan's schedule
  const switchLoan = async (loan: LoanSummary) => {
    setSelectedLoan(loan);
    await loadSchedule(loan.id);
  };

  const onRefresh = useCallback(() => { setRefreshing(true); load(selectedLoan?.id); }, [load, selectedLoan]);

  // Earliest unpaid instalment is the current bill
  const currentInst = schedule.find(
    (i) => i.status === 'PENDING' || i.status === 'PARTIAL' || i.status === 'OVERDUE',
  ) ?? null;

  const instalmentDue = currentInst
    ? currentInst.totalDueKobo + currentInst.overdueChargeKobo - currentInst.amountPaidKobo
    : 0;

  // Amount derived from input or full instalment
  const amount    = parseFloat(amountStr.replace(/,/g, '')) || 0;
  const amountKobo = payMode === 'full' ? instalmentDue : Math.round(amount * 100);
  const isPartial  = payMode === 'part' && amountKobo < instalmentDue;

  const isValid =
    selectedLoan?.status === 'ACTIVE' &&
    currentInst !== null &&
    amountKobo >= 100 &&
    amountKobo <= (selectedLoan?.balanceKobo ?? 0);

  const handlePay = async () => {
    if (!selectedLoan || !isValid) return;
    setPaying(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await loanApi.repay(selectedLoan.id, { amountKobo, reference: uuid() });
      setShowConfirm(false);
      setAmountStr('');
      setPayMode('full');
      setSuccessMsg('Payment successful! Schedule updated.');
      await load(selectedLoan.id);
      setTab('schedule');
    } catch (err) {
      setShowConfirm(false);
      setErrorMsg(err instanceof ApiError ? err.message : 'Payment failed. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  // Stats
  const paidCount  = schedule.filter((i) => i.status === 'PAID').length;
  const totalCount = schedule.length;
  const totalPaid  = repayments.filter((r) => r.status === 'SUCCESS').reduce((s, r) => s + r.amountKobo, 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxl }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* Header */}
      <View style={[styles.screenHeader, { paddingTop: insets.top + Spacing.lg }]}>
        <AppText variant="heading">Repayments</AppText>
        <AppText variant="bodySmall" color={Colors.text.muted}>Your instalment schedule</AppText>
      </View>

      <View style={{ paddingHorizontal: Spacing.lg }}>
        {/* Summary banner */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryCol}>
            <AppText variant="caption" color="rgba(255,255,255,0.7)">Total paid</AppText>
            <AppText style={styles.summaryValue}>{formatNaira(totalPaid)}</AppText>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryCol}>
            <AppText variant="caption" color="rgba(255,255,255,0.7)">Instalments</AppText>
            <AppText style={styles.summaryValue}>{paidCount} of {totalCount}</AppText>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryCol}>
            <AppText variant="caption" color="rgba(255,255,255,0.7)">Next due</AppText>
            <AppText style={styles.summaryValue}>
              {currentInst ? fmtDate(currentInst.dueDate) : '—'}
            </AppText>
          </View>
        </View>

        {/* Dot grid progress */}
        {schedule.length > 0 && <DotGrid instalments={schedule} />}

        {/* Loan chip selector */}
        {loans.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: Spacing.lg }}>
            {loans.map((l) => (
              <TouchableOpacity
                key={l.id}
                style={[styles.loanChip, selectedLoan?.id === l.id && styles.loanChipActive]}
                onPress={() => switchLoan(l)}
                activeOpacity={0.8}
              >
                <AppText
                  variant="caption"
                  color={selectedLoan?.id === l.id ? Colors.text.inverse : Colors.text.secondary}
                >
                  {l.purpose ?? 'Personal'} · {formatNaira(l.balanceKobo)}
                </AppText>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Tab bar */}
        <View style={styles.tabBar}>
          {(['schedule', 'pay', 'history'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tabItem, tab === t && styles.tabItemActive]}
              onPress={() => setTab(t)}
              activeOpacity={0.8}
            >
              <AppText variant="label" color={tab === t ? Colors.primary : Colors.text.muted}>
                {t === 'schedule' ? 'Schedule' : t === 'pay' ? 'Pay' : 'History'}
              </AppText>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Schedule tab ── */}
        {tab === 'schedule' && (
          <View style={{ marginTop: Spacing.lg }}>
            {scheduleLoading ? (
              <AppText variant="bodySmall" align="center" color={Colors.text.muted}>
                Loading schedule…
              </AppText>
            ) : scheduleError ? (
              <View style={styles.emptyState}>
                <AppText style={{ fontSize: 36, textAlign: 'center' }}>⚠️</AppText>
                <AppText variant="bodySmall" align="center" color={Colors.error} style={{ marginTop: Spacing.sm }}>
                  {scheduleError}
                </AppText>
              </View>
            ) : loans.length === 0 ? (
              <View style={styles.emptyState}>
                <AppText style={{ fontSize: 40, textAlign: 'center' }}>✅</AppText>
                <AppText variant="subheading" align="center" style={{ marginTop: Spacing.sm }}>
                  No active loans
                </AppText>
                <AppText variant="bodySmall" align="center" color={Colors.text.muted} style={{ marginTop: Spacing.xs }}>
                  Apply for a loan to see your repayment schedule here
                </AppText>
              </View>
            ) : schedule.length === 0 ? (
              <View style={styles.emptyState}>
                <Image 
                style={{width: 75, height: 75}} 
                source={require("../../../assets/images/deadline.png")} 
              resizeMode='cover'   accessibilityLabel="Pending loans"/>
                <AppText variant="subheading" align="center" style={{ marginTop: Spacing.sm }}>
                  No schedule yet
                </AppText>
                <AppText variant="bodySmall" align="center" color={Colors.text.muted} style={{ marginTop: Spacing.xs }}>
                  Your instalment schedule will appear here once the loan is active
                </AppText>
              </View>
            ) : (
              schedule.map((inst, idx) => (
                <InstalmentRow
                  key={inst.id}
                  inst={inst}
                  total={schedule.length}
                  isLast={idx === schedule.length - 1}
                />
              ))
            )}
          </View>
        )}

        {/* ── Pay tab ── */}
        {tab === 'pay' && (
          <View style={{ marginTop: Spacing.lg }}>
            {selectedLoan?.status === 'PENDING' ? (
              <View style={styles.pendingBanner}>
                <Image 
                style={{width: 80, height: 80}} 
                source={require("../../../assets/images/deadline.png")} 
              resizeMode='cover'   accessibilityLabel="Pending loans"/>
                <AppText variant="bodySmall" color={Colors.warning} style={{ flex: 1, marginLeft: Spacing.sm }}>
                  Loan is under review. Payments enabled once approved.
                </AppText>
              </View>
            ) : !currentInst ? (
              <View style={styles.emptyState}>
               <Image
  source={require("../../../assets/images/bill.png")}
  style={{ width: 80, height: 80 }}
  resizeMode="contain"
  accessibilityLabel="Paid up loans"
/>
                <AppText variant="subheading" align="center" style={{ marginTop: Spacing.sm }}>All paid up!</AppText>
              </View>
            ) : (
              <View style={styles.payCard}>
                {/* Current bill summary */}
                <AppText variant="subheading" style={{ marginBottom: Spacing.md }}>Current Bill</AppText>
                <View style={styles.billRow}>
                  <AppText variant="bodySmall" color={Colors.text.muted}>Instalment #{currentInst.instalmentNumber}</AppText>
                  <AppText variant="label">{fmtDate(currentInst.dueDate)}</AppText>
                </View>
                <View style={styles.billRow}>
                  <AppText variant="bodySmall" color={Colors.text.muted}>Base amount</AppText>
                  <AppText variant="label">{formatNaira(currentInst.totalDueKobo)}</AppText>
                </View>
                {currentInst.overdueChargeKobo > 0 && (
                  <View style={styles.billRow}>
                    <AppText variant="bodySmall" color={Colors.error}>Overdue fee (5%)</AppText>
                    <AppText variant="label" color={Colors.error}>+{formatNaira(currentInst.overdueChargeKobo)}</AppText>
                  </View>
                )}
                {currentInst.amountPaidKobo > 0 && (
                  <View style={styles.billRow}>
                    <AppText variant="bodySmall" color={Colors.success}>Already paid</AppText>
                    <AppText variant="label" color={Colors.success}>−{formatNaira(currentInst.amountPaidKobo)}</AppText>
                  </View>
                )}
                <View style={[styles.billRow, { borderBottomWidth: 0, marginTop: 4 }]}>
                  <AppText variant="label">Total due</AppText>
                  <AppText style={{ fontWeight: FontWeight.extrabold, fontSize: FontSize.lg, color: Colors.primary }}>
                    {formatNaira(instalmentDue)}
                  </AppText>
                </View>

                {/* Pay mode toggle */}
                <View style={styles.modeRow}>
                  {(['full', 'part'] as const).map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.modeChip, payMode === m && styles.modeChipActive]}
                      onPress={() => { setPayMode(m); setAmountStr(''); }}
                      activeOpacity={0.8}
                    >
                      <AppText
                        variant="caption"
                        color={payMode === m ? Colors.text.inverse : Colors.text.secondary}
                        style={{ fontWeight: FontWeight.semibold }}
                      >
                        {m === 'full' ? 'Pay in full' : 'Part payment'}
                      </AppText>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Amount input — only for part payment mode */}
                {payMode === 'part' && (
                  <>
                    <AppText variant="label" style={{ marginBottom: Spacing.xs, marginTop: Spacing.md }}>
                      Enter amount (₦)
                    </AppText>
                    <View style={styles.amountInput}>
                      <AppText style={styles.nairaPrefix}>₦</AppText>
                      <TextInput
                        style={styles.amountField}
                        placeholder="0.00"
                        placeholderTextColor={Colors.text.muted}
                        keyboardType="numeric"
                        value={amountStr}
                        onChangeText={(t) => {
                          setAmountStr(t.replace(/[^0-9.]/g, ''));
                          setErrorMsg('');
                        }}
                      />
                    </View>
                    {amountStr !== '' && amountKobo > (selectedLoan?.balanceKobo ?? 0) && (
                      <AppText variant="caption" color={Colors.error} style={{ marginTop: 4 }}>
                        Exceeds outstanding balance
                      </AppText>
                    )}
                    {amountStr !== '' && amountKobo >= instalmentDue && (
                      <AppText variant="caption" color={Colors.success} style={{ marginTop: 4 }}>
                        This covers the full instalment
                      </AppText>
                    )}
                  </>
                )}

                {successMsg ? (
                  <View style={styles.successBanner}><AppText variant="caption" color={Colors.success}>{successMsg}</AppText></View>
                ) : null}
                {errorMsg ? (
                  <View style={styles.errorBanner}><AppText variant="caption" color={Colors.error}>{errorMsg}</AppText></View>
                ) : null}

                <AppButton
                  label={`Pay ${formatNaira(amountKobo)}`}
                  onPress={() => setShowConfirm(true)}
                  disabled={!isValid}
                  style={{ marginTop: Spacing.lg }}
                />
              </View>
            )}
          </View>
        )}

        {/* ── History tab ── */}
        {tab === 'history' && (
          <View style={{ marginTop: Spacing.lg }}>
            {repayments.length === 0 ? (
              <View style={styles.emptyState}>
                <AppText variant="bodySmall" align="center" color={Colors.text.muted}>No payments yet</AppText>
              </View>
            ) : (
              <View style={styles.historyList}>
                {repayments.map((r) => (
                  <View key={r.id} style={styles.historyRow}>
                    <View style={[styles.historyIcon, r.status === 'SUCCESS' ? styles.iconSuccess : styles.iconFail]}>
                      <Ionicons
                        name={r.status === 'SUCCESS' ? 'checkmark' : 'close'}
                        size={16}
                        color={r.status === 'SUCCESS' ? Colors.success : Colors.error}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="label">Repayment</AppText>
                      <AppText variant="caption">
                        {r.paidAt ? fmtDate(r.paidAt) : fmtDate(r.createdAt)}
                      </AppText>
                    </View>
                    <AppText variant="label" color={r.status === 'SUCCESS' ? Colors.success : Colors.error}>
                      {formatNaira(r.amountKobo)}
                    </AppText>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      <ConfirmModal
        visible={showConfirm}
        inst={currentInst}
        amountKobo={amountKobo}
        isPartial={isPartial}
        loanBalance={selectedLoan?.balanceKobo ?? 0}
        onConfirm={handlePay}
        onCancel={() => setShowConfirm(false)}
        loading={paying}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.surface },
  screenHeader: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, backgroundColor: Colors.background },

  // Summary card
  summaryCard:    { backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing.lg, flexDirection: 'row', marginTop: Spacing.lg,
                    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  summaryCol:     { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  summaryValue:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.text.inverse, marginTop: 2 },

  // Loan chip selector
  loanChip:       { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border, marginRight: Spacing.sm },
  loanChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },

  // Tab bar
  tabBar:         { flexDirection: 'row', backgroundColor: Colors.border, borderRadius: Radius.md, padding: 3, marginTop: Spacing.lg },
  tabItem:        { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: Radius.sm - 2 },
  tabItemActive:  { backgroundColor: Colors.background, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },

  // Pay card
  payCard:        { backgroundColor: Colors.background, borderRadius: Radius.lg, padding: Spacing.lg,
                    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  billRow:        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.xs + 2, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modeRow:        { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  modeChip:       { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border },
  modeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  amountInput:    { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.md, height: 52 },
  nairaPrefix:    { fontSize: FontSize.lg, color: Colors.text.muted, marginRight: 4 },
  amountField:    { flex: 1, fontSize: FontSize.lg, color: Colors.text.primary, fontWeight: FontWeight.semibold },
  successBanner:  { backgroundColor: Colors.successLight, borderRadius: Radius.sm, padding: Spacing.sm, marginTop: Spacing.md },
  errorBanner:    { backgroundColor: Colors.errorLight, borderRadius: Radius.sm, padding: Spacing.sm, marginTop: Spacing.md },
  pendingBanner:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.warning + '1A', borderRadius: Radius.md, padding: Spacing.md },

  // History
  historyList:    { backgroundColor: Colors.background, borderRadius: Radius.lg, overflow: 'hidden',
                    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  historyRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  historyIcon:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  iconSuccess:    { backgroundColor: Colors.successLight },
  iconFail:       { backgroundColor: Colors.errorLight },

  emptyState:     { backgroundColor: Colors.background, borderRadius: Radius.lg, padding: Spacing.xl, alignItems: 'center',
                    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
});
