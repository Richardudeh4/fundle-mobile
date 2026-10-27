import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
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
  ApiError,
  type LoanDetail,
  type RepaymentSummary,
} from '@/RequestHandler/Request';
import { formatDate } from '@/utils/formatDate';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatNaira(kobo: number) {
  return '₦' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Repayment row ─────────────────────────────────────────────────────────────
function RepaymentRow({ item }: { item: RepaymentSummary }) {
  const ok = item.status === 'SUCCESS';
  return (
    <View style={s.repayRow}>
      <View style={[s.repayIcon, ok ? s.iconOk : s.iconFail]}>
        <Ionicons
          name={ok ? 'checkmark' : 'close'}
          size={16}
          color={ok ? Colors.success : Colors.error}
        />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="label">Payment</AppText>
        <AppText variant="caption">
          {formatDate(item.paidAt ?? item.createdAt)}
        </AppText>
        <AppText variant="caption" color={Colors.text.muted}>
          Ref: {item.reference.slice(0, 16)}…
        </AppText>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <AppText variant="label" color={ok ? Colors.success : Colors.error}>
          {formatNaira(item.amountKobo)}
        </AppText>
        <View style={[s.statusPill, { backgroundColor: ok ? Colors.successLight : Colors.errorLight }]}>
          <AppText variant="caption" color={ok ? Colors.success : Colors.error}>
            {item.status}
          </AppText>
        </View>
      </View>
    </View>
  );
}

// ── Confirm modal ─────────────────────────────────────────────────────────────
function ConfirmModal({
  visible,
  amountKobo,
  balanceAfter,
  isPartial,
  onConfirm,
  onCancel,
  loading,
}: {
  visible: boolean;
  amountKobo: number;
  balanceAfter: number;
  isPartial: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={s.overlay} onPress={onCancel}>
        <Pressable style={s.modalCard} onPress={() => {}}>
          <Ionicons name="card" size={36} color={Colors.primary} style={{ alignSelf: 'center' }} />
          <AppText variant="subheading" align="center" style={{ marginTop: Spacing.md }}>
            Confirm {isPartial ? 'Part ' : ''}Payment
          </AppText>
          <AppText style={s.confirmAmt}>{formatNaira(amountKobo)}</AppText>
          <View style={s.modalRow}>
            <AppText variant="bodySmall" color={Colors.text.muted}>Balance after payment</AppText>
            <AppText variant="label" color={Colors.primary}>{formatNaira(Math.max(0, balanceAfter))}</AppText>
          </View>
          {isPartial && (
            <View style={s.partialNote}>
              <AppText variant="caption" color={Colors.warning}>
                This is a part payment. The instalment will stay open until fully paid.
              </AppText>
            </View>
          )}
          <View style={s.modalActions}>
            <AppButton label="Cancel" onPress={onCancel} variant="outline" fullWidth={false} style={{ flex: 1 }} />
            <AppButton label="Pay Now" onPress={onConfirm} loading={loading} fullWidth={false} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function RepaymentDetailScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const insets   = useSafeAreaInsets();

  const [data, setData]             = useState<LoanDetail | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState('');

  // Payment state
  const [amountStr, setAmountStr]   = useState('');
  const [payMode, setPayMode]       = useState<'full' | 'part'>('full');
  const [showConfirm, setShowConfirm] = useState(false);
  const [paying, setPaying]         = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [payError, setPayError]     = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setError('');
    try {
      const detail = await loanApi.detail(id);
      setData(detail);
    } catch {
      setError('Failed to load repayment details.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  // Earliest unpaid instalment
  const currentInst = data?.schedule.find(
    (i) => i.status === 'PENDING' || i.status === 'PARTIAL' || i.status === 'OVERDUE',
  ) ?? null;

  const instalmentDue = currentInst
    ? currentInst.totalDueKobo + currentInst.overdueChargeKobo - currentInst.amountPaidKobo
    : 0;

  const parsedAmount  = parseFloat(amountStr.replace(/,/g, '')) || 0;
  const amountKobo    = payMode === 'full' ? instalmentDue : Math.round(parsedAmount * 100);
  const isPartial     = payMode === 'part' && amountKobo < instalmentDue;
  const loanBalance   = data?.loan.balanceKobo ?? 0;

  const isValid =
    data?.loan.status === 'ACTIVE' &&
    currentInst !== null &&
    amountKobo >= 100 &&
    amountKobo <= loanBalance;

  const handlePay = async () => {
    if (!data || !isValid) return;
    setPaying(true);
    setPayError('');
    setSuccessMsg('');
    try {
      await loanApi.repay(data.loan.id, { amountKobo, reference: uuid() });
      setShowConfirm(false);
      setAmountStr('');
      setPayMode('full');
      setSuccessMsg(`Payment of ${formatNaira(amountKobo)} recorded successfully.`);
      await load();
    } catch (err) {
      setShowConfirm(false);
      setPayError(err instanceof ApiError ? err.message : 'Payment failed. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.container, s.centred, { paddingTop: insets.top }]}>
        <AppText variant="bodySmall" color={Colors.text.muted}>Loading…</AppText>
      </View>
    );
  }
  if (error || !data) {
    return (
      <View style={[s.container, s.centred, { paddingTop: insets.top }]}>
        <AppText style={{ fontSize: 36 }}>⚠️</AppText>
        <AppText variant="bodySmall" color={Colors.error} style={{ marginTop: Spacing.sm, textAlign: 'center' }}>
          {error || 'Loan not found'}
        </AppText>
        <TouchableOpacity onPress={load} style={{ marginTop: Spacing.md }}>
          <AppText variant="label" color={Colors.primary}>Retry</AppText>
        </TouchableOpacity>
      </View>
    );
  }

  const { loan, repayments, stats } = data;
  const totalPaid = repayments
    .filter((r) => r.status === 'SUCCESS')
    .reduce((sum, r) => sum + r.amountKobo, 0);

  // Debug — remove once confirmed working
  console.log('[repay/id] loan.status:', loan.status);
  console.log('[repay/id] schedule length:', data.schedule.length);
  console.log('[repay/id] currentInst:', currentInst?.status, currentInst?.instalmentNumber);

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
            Repayments
          </AppText>
          <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.75)' }}>
            {loan.purpose ?? 'Personal Loan'}
          </AppText>
        </View>
      </View>

      {/* ── Summary banner ── */}
      <View style={s.summaryBanner}>
        <View style={s.summaryCol}>
          <AppText variant="caption" color="rgba(255,255,255,0.7)">Total paid</AppText>
          <AppText style={s.summaryVal}>{formatNaira(totalPaid)}</AppText>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryCol}>
          <AppText variant="caption" color="rgba(255,255,255,0.7)">Remaining</AppText>
          <AppText style={s.summaryVal}>{formatNaira(loan.balanceKobo)}</AppText>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryCol}>
          <AppText variant="caption" color="rgba(255,255,255,0.7)">Instalments</AppText>
          <AppText style={s.summaryVal}>{stats.paidCount}/{stats.totalCount}</AppText>
        </View>
      </View>

      <View style={{ paddingHorizontal: Spacing.lg }}>

        {/* ── Make payment card ── */}
        {/* Debug strip — remove once confirmed */}
        <View style={[s.card, { marginTop: Spacing.lg, backgroundColor: '#FFF9C4', gap: 4 }]}>
          <AppText variant="caption">loan.status: <AppText variant="label">{loan.status}</AppText></AppText>
          <AppText variant="caption">schedule rows: <AppText variant="label">{String(data.schedule.length)}</AppText></AppText>
          <AppText variant="caption">currentInst: <AppText variant="label">{currentInst ? `#${currentInst.instalmentNumber} (${currentInst.status})` : 'null'}</AppText></AppText>
          <AppText variant="caption">instalmentDue: <AppText variant="label">{formatNaira(instalmentDue)}</AppText></AppText>
        </View>

        {loan.status === 'ACTIVE' ? (
          currentInst ? (
          <View style={[s.card, { marginTop: Spacing.lg }]}>
            <AppText variant="subheading" style={{ marginBottom: Spacing.md }}>
              Pay Next Instalment
            </AppText>

            {/* Current bill breakdown */}
            <View style={s.billRow}>
              <AppText variant="bodySmall" color={Colors.text.muted}>
                Instalment #{currentInst.instalmentNumber}
              </AppText>
              <AppText variant="label">{formatDate(currentInst.dueDate)}</AppText>
            </View>
            <View style={s.billRow}>
              <AppText variant="bodySmall" color={Colors.text.muted}>Base amount</AppText>
              <AppText variant="label">{formatNaira(currentInst.totalDueKobo)}</AppText>
            </View>
            {currentInst.overdueChargeKobo > 0 && (
              <View style={s.billRow}>
                <AppText variant="bodySmall" color={Colors.error}>Overdue fee (5%)</AppText>
                <AppText variant="label" color={Colors.error}>
                  +{formatNaira(currentInst.overdueChargeKobo)}
                </AppText>
              </View>
            )}
            {currentInst.amountPaidKobo > 0 && (
              <View style={s.billRow}>
                <AppText variant="bodySmall" color={Colors.success}>Already paid</AppText>
                <AppText variant="label" color={Colors.success}>
                  −{formatNaira(currentInst.amountPaidKobo)}
                </AppText>
              </View>
            )}
            <View style={[s.billRow, { borderBottomWidth: 0, marginTop: 4 }]}>
              <AppText variant="label">Total due</AppText>
              <AppText style={{ fontWeight: FontWeight.extrabold, fontSize: FontSize.lg, color: Colors.primary }}>
                {formatNaira(instalmentDue)}
              </AppText>
            </View>

            {/* Pay mode toggle */}
            <View style={s.modeRow}>
              {(['full', 'part'] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[s.modeChip, payMode === m && s.modeChipActive]}
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

            {/* Amount input for part payment */}
            {payMode === 'part' && (
              <>
                <AppText variant="label" style={{ marginTop: Spacing.md, marginBottom: Spacing.xs }}>
                  Enter amount (₦)
                </AppText>
                <View style={s.amountInput}>
                  <AppText style={s.nairaPrefix}>₦</AppText>
                  <TextInput
                    style={s.amountField}
                    placeholder="0.00"
                    placeholderTextColor={Colors.text.muted}
                    keyboardType="numeric"
                    value={amountStr}
                    onChangeText={(t) => {
                      setAmountStr(t.replace(/[^0-9.]/g, ''));
                      setPayError('');
                    }}
                  />
                </View>
                {amountStr !== '' && amountKobo > loanBalance && (
                  <AppText variant="caption" color={Colors.error} style={{ marginTop: 4 }}>
                    Exceeds outstanding loan balance
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
              <View style={s.successBanner}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                <AppText variant="caption" color={Colors.success} style={{ marginLeft: 6 }}>
                  {successMsg}
                </AppText>
              </View>
            ) : null}
            {payError ? (
              <View style={s.errorBanner}>
                <AppText variant="caption" color={Colors.error}>{payError}</AppText>
              </View>
            ) : null}

            <AppButton
              label={`Pay ${formatNaira(amountKobo)}`}
              onPress={() => setShowConfirm(true)}
              disabled={!isValid}
              style={{ marginTop: Spacing.lg }}
            />
          </View>
          ) : (
            // ACTIVE loan but all instalments are paid — loan balance may still be > 0
            // (e.g. rounding). Show a simple pay-remainder card.
            <View style={[s.card, { marginTop: Spacing.lg }]}>
              <AppText variant="subheading" style={{ marginBottom: Spacing.md }}>
                Pay Remaining Balance
              </AppText>
              <View style={s.billRow}>
                <AppText variant="bodySmall" color={Colors.text.muted}>Outstanding balance</AppText>
                <AppText variant="label" color={Colors.primary}>{formatNaira(loanBalance)}</AppText>
              </View>
              {successMsg ? (
                <View style={s.successBanner}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                  <AppText variant="caption" color={Colors.success} style={{ marginLeft: 6 }}>{successMsg}</AppText>
                </View>
              ) : null}
              {payError ? (
                <View style={s.errorBanner}>
                  <AppText variant="caption" color={Colors.error}>{payError}</AppText>
                </View>
              ) : null}
              <AppButton
                label={`Pay ${formatNaira(loanBalance)}`}
                onPress={async () => {
                  setPaying(true);
                  setPayError('');
                  setSuccessMsg('');
                  try {
                    await loanApi.repay(loan.id, { amountKobo: loanBalance, reference: uuid() });
                    setSuccessMsg('Loan fully paid off!');
                    await load();
                  } catch (err) {
                    setPayError(err instanceof ApiError ? err.message : 'Payment failed.');
                  } finally {
                    setPaying(false);
                  }
                }}
                loading={paying}
                disabled={loanBalance <= 0}
                style={{ marginTop: Spacing.lg }}
              />
            </View>
          )
        ) : loan.status === 'PAID' ? (
          <View style={[s.card, s.centredCard, { marginTop: Spacing.lg }]}>
            <AppText style={{ fontSize: 40 }}>🎉</AppText>
            <AppText variant="subheading" align="center" style={{ marginTop: Spacing.sm }}>
              Fully paid!
            </AppText>
            <AppText variant="bodySmall" align="center" color={Colors.text.muted} style={{ marginTop: Spacing.xs }}>
              This loan has been completely repaid.
            </AppText>
          </View>
        ) : (
          // PENDING or any other status
          <View style={[s.card, { marginTop: Spacing.lg }]}>
            <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md }}>
              <AppText style={{ fontSize: 18 }}>⏳</AppText>
              <AppText variant="bodySmall" color={Colors.warning} style={{ flex: 1 }}>
                Loan is under review. You can still make an early payment below.
              </AppText>
            </View>
            {successMsg ? (
              <View style={s.successBanner}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                <AppText variant="caption" color={Colors.success} style={{ marginLeft: 6 }}>{successMsg}</AppText>
              </View>
            ) : null}
            {payError ? (
              <View style={s.errorBanner}>
                <AppText variant="caption" color={Colors.error}>{payError}</AppText>
              </View>
            ) : null}
            <AppButton
              label={`Pay ${formatNaira(loanBalance)}`}
              onPress={async () => {
                setPaying(true);
                setPayError('');
                setSuccessMsg('');
                try {
                  await loanApi.repay(loan.id, { amountKobo: loanBalance, reference: uuid() });
                  setSuccessMsg('Payment recorded!');
                  await load();
                } catch (err) {
                  setPayError(err instanceof ApiError ? err.message : 'Payment failed.');
                } finally {
                  setPaying(false);
                }
              }}
              loading={paying}
              disabled={loanBalance <= 0}
              style={{ marginTop: Spacing.sm }}
            />
          </View>
        )}

        {/* ── Payment history ── */}
        <View style={{ marginTop: Spacing.xl }}>
          <AppText variant="subheading" style={{ marginBottom: Spacing.md }}>
            Payment History ({repayments.length})
          </AppText>

          {repayments.length === 0 ? (
            <View style={[s.card, s.centredCard]}>
              <AppText style={{ fontSize: 36 }}>💳</AppText>
              <AppText variant="subheading" align="center" style={{ marginTop: Spacing.sm }}>
                No payments yet
              </AppText>
              <AppText
                variant="bodySmall"
                align="center"
                color={Colors.text.muted}
                style={{ marginTop: Spacing.xs }}
              >
                Your repayment history will appear here
              </AppText>
            </View>
          ) : (
            <View style={s.historyList}>
              {repayments.map((r) => (
                <RepaymentRow key={r.id} item={r} />
              ))}
            </View>
          )}
        </View>
      </View>

      <ConfirmModal
        visible={showConfirm}
        amountKobo={amountKobo}
        balanceAfter={loanBalance - amountKobo}
        isPartial={isPartial}
        onConfirm={handlePay}
        onCancel={() => setShowConfirm(false)}
        loading={paying}
      />
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  centred:   { justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },

  // Header
  header: {
    backgroundColor: Colors.primary,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Summary banner
  summaryBanner: {
    backgroundColor: Colors.primaryDark,
    flexDirection: 'row', paddingVertical: Spacing.lg, paddingHorizontal: Spacing.lg,
  },
  summaryCol:     { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  summaryVal: {
    fontSize: FontSize.md, fontWeight: FontWeight.bold,
    color: Colors.text.inverse, marginTop: 2,
  },

  // Card
  card: {
    backgroundColor: Colors.background, borderRadius: Radius.lg, padding: Spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  centredCard: { alignItems: 'center', padding: Spacing.xl },

  // Bill rows
  billRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: Spacing.xs + 2,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },

  // Pay mode toggle
  modeRow:        { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  modeChip:       { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border },
  modeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },

  // Amount input
  amountInput:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.md, height: 52 },
  nairaPrefix:  { fontSize: FontSize.lg, color: Colors.text.muted, marginRight: 4 },
  amountField:  { flex: 1, fontSize: FontSize.lg, color: Colors.text.primary, fontWeight: FontWeight.semibold },

  successBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.successLight, borderRadius: Radius.sm, padding: Spacing.sm, marginTop: Spacing.md },
  errorBanner:   { backgroundColor: Colors.errorLight, borderRadius: Radius.sm, padding: Spacing.sm, marginTop: Spacing.md },

  // History list
  historyList: {
    backgroundColor: Colors.background, borderRadius: Radius.lg, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  repayRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  repayIcon:  { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  iconOk:     { backgroundColor: Colors.successLight },
  iconFail:   { backgroundColor: Colors.errorLight },
  statusPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, marginTop: 2 },

  // Modal
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard:   { backgroundColor: Colors.background, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl, paddingBottom: Spacing.xxl },
  confirmAmt:  { fontSize: 34, fontWeight: FontWeight.extrabold, color: Colors.text.primary, textAlign: 'center', marginVertical: Spacing.md, lineHeight: 42 },
  modalRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  partialNote: { backgroundColor: Colors.warning + '18', borderRadius: Radius.sm, padding: Spacing.sm, marginTop: Spacing.md },
  modalActions:{ flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xl },
});
