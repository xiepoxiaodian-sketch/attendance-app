import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useEmployeeAuth } from "@/lib/employee-auth";
import { trpc } from "@/lib/trpc";

// Get today's date string in Taiwan timezone (UTC+8)
function getTWDateStr(offsetDays = 0): string {
  const tw = new Date(Date.now() + 8 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
  return tw.toISOString().split("T")[0];
}

function formatTime(date: Date | string | null | undefined): string {
  if (!date) return "--:--";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit", weekday: "short" });
}

function formatDateFull(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function calcWorkHours(clockIn: any, clockOut: any): string {
  if (!clockIn || !clockOut) return "-";
  const diff = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 1000 / 60;
  return `${Math.floor(diff / 60)}h ${Math.round(diff % 60)}m`;
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    normal: { label: "正常", bg: "#DCFCE7", text: "#16A34A" },
    late: { label: "遲到", bg: "#FEF3C7", text: "#D97706" },
    early_leave: { label: "早退", bg: "#FEF3C7", text: "#D97706" },
    absent: { label: "缺勤", bg: "#FEE2E2", text: "#DC2626" },
  };
  const s = map[status ?? "normal"] ?? map.normal;
  return (
    <View style={{ backgroundColor: s.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
      <Text style={{ color: s.text, fontSize: 11, fontWeight: "600" }}>{s.label}</Text>
    </View>
  );
}

function CorrectionStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    pending:  { label: "審核中", bg: "#FEF3C7", text: "#D97706" },
    approved: { label: "已核准", bg: "#DCFCE7", text: "#16A34A" },
    rejected: { label: "已拒絕", bg: "#FEE2E2", text: "#DC2626" },
  };
  const s = map[status] ?? map.pending;
  return (
    <View style={{ backgroundColor: s.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
      <Text style={{ color: s.text, fontSize: 11, fontWeight: "600" }}>{s.label}</Text>
    </View>
  );
}

// Simple time picker using scroll-style hour/minute selectors
function TimePicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [h, m] = value.split(":").map(Number);
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const minutes = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ fontSize: 11, fontWeight: "600", color: "#475569", marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {/* Hour */}
        <View style={{ backgroundColor: "#F1F5F9", borderRadius: 8, overflow: "hidden" }}>
          <ScrollView style={{ height: 120, width: 52 }} showsVerticalScrollIndicator={false}
            contentOffset={{ x: 0, y: h * 40 }}
          >
            {hours.map((hh) => (
              <TouchableOpacity key={hh} onPress={() => onChange(`${hh}:${String(m).padStart(2, "0")}`)}
                style={{ height: 40, alignItems: "center", justifyContent: "center",
                  backgroundColor: parseInt(hh) === h ? "#2563EB" : "transparent" }}>
                <Text style={{ fontSize: 18, fontWeight: "700",
                  color: parseInt(hh) === h ? "white" : "#475569" }}>{hh}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <Text style={{ fontSize: 20, fontWeight: "700", color: "#475569" }}>:</Text>
        {/* Minute */}
        <View style={{ backgroundColor: "#F1F5F9", borderRadius: 8, overflow: "hidden" }}>
          <ScrollView style={{ height: 120, width: 52 }} showsVerticalScrollIndicator={false}
            contentOffset={{ x: 0, y: minutes.indexOf(String(m).padStart(2, "0")) * 40 }}
          >
            {minutes.map((mm) => (
              <TouchableOpacity key={mm} onPress={() => onChange(`${String(h).padStart(2, "0")}:${mm}`)}
                style={{ height: 40, alignItems: "center", justifyContent: "center",
                  backgroundColor: mm === String(m).padStart(2, "0") ? "#2563EB" : "transparent" }}>
                <Text style={{ fontSize: 18, fontWeight: "700",
                  color: mm === String(m).padStart(2, "0") ? "white" : "#475569" }}>{mm}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

function PunchCorrectionModal({ visible, onClose, employeeId, onSuccess }: {
  visible: boolean;
  onClose: () => void;
  employeeId: number;
  onSuccess: () => void;
}) {
  const [date, setDate] = useState(getTWDateStr());
  const [type, setType] = useState<"clock_in" | "clock_out" | "both">("clock_in");
  const [clockIn, setClockIn] = useState("09:00");
  const [clockOut, setClockOut] = useState("18:00");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const createMutation = trpc.punchCorrection.create.useMutation();

  const handleSubmit = async () => {
    if (!reason.trim()) { setError("請填寫原因"); return; }
    setError("");
    setSubmitting(true);
    try {
      await createMutation.mutateAsync({
        employeeId,
        date,
        type,
        requestedClockIn: (type === "clock_in" || type === "both") ? clockIn : undefined,
        requestedClockOut: (type === "clock_out" || type === "both") ? clockOut : undefined,
        reason: reason.trim(),
      });
      setReason(""); setClockIn("09:00"); setClockOut("18:00");
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message ?? "提交失敗");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        {/* Header */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
          <TouchableOpacity onPress={onClose}><Text style={{ color: "#64748B", fontSize: 15 }}>取消</Text></TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#1E293B" }}>補打卡申請</Text>
          <TouchableOpacity onPress={handleSubmit} disabled={submitting}>
            <Text style={{ color: submitting ? "#94A3B8" : "#2563EB", fontSize: 15, fontWeight: "600" }}>{submitting ? "提交中..." : "提交"}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {/* Date */}
          <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569", marginBottom: 8 }}>補打日期</Text>
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              style={{ fontSize: 15, color: "#1E293B", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, padding: 10 }}
              returnKeyType="done"
            />
          </View>
          {/* Type */}
          <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569", marginBottom: 8 }}>補打類型</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {([{ value: "clock_in", label: "補上班" }, { value: "clock_out", label: "補下班" }, { value: "both", label: "上下班都補" }] as const).map(t => (
                <TouchableOpacity key={t.value} onPress={() => setType(t.value)}
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: type === t.value ? "#EFF6FF" : "#F8FAFC", borderWidth: 1.5, borderColor: type === t.value ? "#2563EB" : "#E2E8F0", alignItems: "center" }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: type === t.value ? "#2563EB" : "#94A3B8" }}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {/* Time Pickers */}
          <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569", marginBottom: 12 }}>補打時間</Text>
            <View style={{ flexDirection: "row", justifyContent: type === "both" ? "space-around" : "center", gap: 16 }}>
              {(type === "clock_in" || type === "both") && (
                <TimePicker label="上班時間" value={clockIn} onChange={setClockIn} />
              )}
              {(type === "clock_out" || type === "both") && (
                <TimePicker label="下班時間" value={clockOut} onChange={setClockOut} />
              )}
            </View>
            {/* Selected time display */}
            <View style={{ marginTop: 12, backgroundColor: "#EFF6FF", borderRadius: 8, padding: 10, alignItems: "center" }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#2563EB" }}>
                {type === "clock_in" && `上班 ${clockIn}`}
                {type === "clock_out" && `下班 ${clockOut}`}
                {type === "both" && `上班 ${clockIn}  →  下班 ${clockOut}`}
              </Text>
            </View>
          </View>
          {/* Reason */}
          <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569", marginBottom: 8 }}>原因說明</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="請說明未能正常打卡的原因（如：系統異常、忘記打卡等）"
              multiline
              numberOfLines={4}
              style={{ fontSize: 14, color: "#1E293B", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, padding: 10, minHeight: 80, textAlignVertical: "top" }}
            />
          </View>
          {error ? <Text style={{ color: "#EF4444", fontSize: 13, textAlign: "center" }}>{error}</Text> : null}
          <View style={{ backgroundColor: "#FFF7ED", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#FED7AA" }}>
            <Text style={{ fontSize: 12, color: "#92400E" }}>⚠️ 補打卡申請需經管理員審核，核准後系統將自動補登打卡記錄。</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const TYPE_LABEL: Record<string, string> = {
  clock_in: "補上班",
  clock_out: "補下班",
  both: "上下班都補",
};

function CorrectionHistoryModal({ visible, onClose, employeeId }: {
  visible: boolean;
  onClose: () => void;
  employeeId: number;
}) {
  const { data: corrections, isLoading, refetch } = trpc.punchCorrection.getByEmployee.useQuery(
    { employeeId },
    { enabled: visible && !!employeeId }
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
          <TouchableOpacity onPress={onClose}><Text style={{ color: "#64748B", fontSize: 15 }}>關閉</Text></TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#1E293B" }}>補打卡申請記錄</Text>
          <TouchableOpacity onPress={() => refetch()}><Text style={{ color: "#2563EB", fontSize: 14 }}>重新整理</Text></TouchableOpacity>
        </View>
        {isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        ) : !corrections || corrections.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
            <Text style={{ fontSize: 15, fontWeight: "600", color: "#475569", marginBottom: 6 }}>尚無補打卡申請記錄</Text>
            <Text style={{ fontSize: 13, color: "#94A3B8", textAlign: "center" }}>您提交的補打卡申請將顯示在這裡</Text>
          </View>
        ) : (
          <FlatList
            data={corrections}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ padding: 14, gap: 10 }}
            renderItem={({ item }) => {
              const rawDate = item.date as unknown as string | Date;
              const dateStr = typeof rawDate === "string" ? rawDate.split("T")[0] : (rawDate as Date).toISOString().split("T")[0];
              return (
                <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
                  {/* Top row */}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <View>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>{dateStr}</Text>
                      <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{TYPE_LABEL[item.type] ?? item.type}</Text>
                    </View>
                    <CorrectionStatusBadge status={item.status} />
                  </View>
                  {/* Times */}
                  <View style={{ flexDirection: "row", backgroundColor: "#F8FAFC", borderRadius: 8, padding: 10, gap: 8, marginBottom: 10 }}>
                    {item.requestedClockIn && (
                      <View style={{ flex: 1, alignItems: "center" }}>
                        <Text style={{ fontSize: 10, color: "#94A3B8", marginBottom: 2 }}>申請上班</Text>
                        <Text style={{ fontSize: 15, fontWeight: "700", color: "#22C55E" }}>{item.requestedClockIn}</Text>
                      </View>
                    )}
                    {item.requestedClockIn && item.requestedClockOut && (
                      <View style={{ width: 1, backgroundColor: "#E2E8F0" }} />
                    )}
                    {item.requestedClockOut && (
                      <View style={{ flex: 1, alignItems: "center" }}>
                        <Text style={{ fontSize: 10, color: "#94A3B8", marginBottom: 2 }}>申請下班</Text>
                        <Text style={{ fontSize: 15, fontWeight: "700", color: "#3B82F6" }}>{item.requestedClockOut}</Text>
                      </View>
                    )}
                  </View>
                  {/* Reason */}
                  <Text style={{ fontSize: 12, color: "#64748B" }}>原因：{item.reason}</Text>
                  {/* Review note */}
                  {item.reviewNote && (
                    <View style={{ marginTop: 8, backgroundColor: item.status === "approved" ? "#F0FDF4" : "#FEF2F2", borderRadius: 8, padding: 8 }}>
                      <Text style={{ fontSize: 12, color: item.status === "approved" ? "#16A34A" : "#DC2626" }}>
                        審核備注：{item.reviewNote}
                      </Text>
                    </View>
                  )}
                  {/* Created at */}
                  <Text style={{ fontSize: 11, color: "#CBD5E1", marginTop: 8 }}>
                    申請時間：{item.createdAt ? new Date(item.createdAt as any).toLocaleString("zh-TW") : ""}
                  </Text>
                </View>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

export default function RecordsScreen() {
  const { employee } = useEmployeeAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"records" | "corrections">("records");

  const endDate = getTWDateStr();
  const startDate = getTWDateStr(-30);

  const { data: records, refetch, isLoading } = trpc.attendance.getHistory.useQuery(
    { employeeId: employee?.id ?? 0, startDate, endDate },
    { enabled: !!employee }
  );

  const { data: corrections, refetch: refetchCorrections, isLoading: loadingCorrections } = trpc.punchCorrection.getByEmployee.useQuery(
    { employeeId: employee?.id ?? 0 },
    { enabled: !!employee }
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchCorrections()]);
    setRefreshing(false);
  }, []);

  const sortedRecords = [...(records ?? [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const pendingCount = (corrections ?? []).filter(c => c.status === "pending").length;

  // Stats
  const totalDays = sortedRecords.length;
  const lateDays = sortedRecords.filter(r => r.status === "late").length;
  const normalDays = sortedRecords.filter(r => r.status === "normal").length;

  return (
    <ScreenContainer containerClassName="bg-[#F1F5F9]">
      {/* Page Header */}
      <View style={{
        backgroundColor: "white",
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 0,
        borderBottomWidth: 1,
        borderBottomColor: "#E2E8F0",
      }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <View>
            <Text style={{ fontSize: 20, fontWeight: "700", color: "#1E293B" }}>打卡紀錄</Text>
            <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>最近 30 天</Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowCorrectionModal(true)}
            style={{ backgroundColor: "#EFF6FF", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: "#BFDBFE" }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#2563EB" }}>+ 補打卡申請</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={{ flexDirection: "row", gap: 0 }}>
          {[
            { key: "records", label: "打卡紀錄" },
            { key: "corrections", label: `補打卡申請${pendingCount > 0 ? ` (${pendingCount})` : ""}` },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key as any)}
              style={{
                flex: 1,
                paddingVertical: 10,
                alignItems: "center",
                borderBottomWidth: 2,
                borderBottomColor: activeTab === tab.key ? "#2563EB" : "transparent",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: activeTab === tab.key ? "#2563EB" : "#94A3B8" }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {activeTab === "records" ? (
        <>
          {/* Stats Row */}
          {!isLoading && totalDays > 0 && (
            <View style={{
              backgroundColor: "white",
              flexDirection: "row",
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: "#F1F5F9",
              gap: 0,
            }}>
              {[
                { label: "出勤天數", value: String(totalDays), color: "#2563EB" },
                { label: "正常", value: String(normalDays), color: "#16A34A" },
                { label: "遲到", value: String(lateDays), color: "#D97706" },
              ].map((stat, i) => (
                <View key={i} style={{ flex: 1, alignItems: "center", borderRightWidth: i < 2 ? 1 : 0, borderRightColor: "#F1F5F9" }}>
                  <Text style={{ fontSize: 22, fontWeight: "700", color: stat.color }}>{stat.value}</Text>
                  <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{stat.label}</Text>
                </View>
              ))}
            </View>
          )}

          {isLoading ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator size="large" color="#2563EB" />
            </View>
          ) : sortedRecords.length === 0 ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
              <Text style={{ fontSize: 14, color: "#94A3B8", textAlign: "center" }}>
                最近 30 天內沒有打卡紀錄
              </Text>
            </View>
          ) : (
            <FlatList
              data={sortedRecords}
              keyExtractor={(item) => String(item.id)}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: 24 }}
              renderItem={({ item }) => (
                <View style={{
                  backgroundColor: "white",
                  borderRadius: 12,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.04,
                  shadowRadius: 3,
                  elevation: 1,
                }}>
                  {/* Top Row */}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <View>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>
                        {formatDate(item.date)}
                      </Text>
                      <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
                        {item.shiftLabel || "班次1"}
                      </Text>
                    </View>
                    <StatusBadge status={item.status} />
                  </View>

                  {/* Time Row */}
                  <View style={{ flexDirection: "row", backgroundColor: "#F8FAFC", borderRadius: 10, padding: 10 }}>
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 3 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#22C55E" }} />
                        <Text style={{ fontSize: 10, color: "#94A3B8" }}>上班</Text>
                      </View>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: item.clockInTime ? "#22C55E" : "#CBD5E1" }}>
                        {formatTime(item.clockInTime)}
                      </Text>
                    </View>
                    <View style={{ width: 1, backgroundColor: "#E2E8F0" }} />
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 3 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#3B82F6" }} />
                        <Text style={{ fontSize: 10, color: "#94A3B8" }}>下班</Text>
                      </View>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: item.clockOutTime ? "#3B82F6" : "#CBD5E1" }}>
                        {formatTime(item.clockOutTime)}
                      </Text>
                    </View>
                    <View style={{ width: 1, backgroundColor: "#E2E8F0" }} />
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text style={{ fontSize: 10, color: "#94A3B8", marginBottom: 3 }}>工時</Text>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: "#1E293B" }}>
                        {calcWorkHours(item.clockInTime, item.clockOutTime)}
                      </Text>
                    </View>
                  </View>

                  {item.clockInLocation && (
                    <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>
                      📍 {item.clockInLocation}
                    </Text>
                  )}
                  {item.note && item.note.includes("補打卡") && (
                    <View style={{ marginTop: 8, backgroundColor: "#F0FDF4", borderRadius: 6, padding: 6 }}>
                      <Text style={{ fontSize: 11, color: "#16A34A" }}>✓ {item.note}</Text>
                    </View>
                  )}
                </View>
              )}
            />
          )}
        </>
      ) : (
        /* Corrections Tab */
        <>
          {loadingCorrections ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator size="large" color="#2563EB" />
            </View>
          ) : !corrections || corrections.length === 0 ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
              <Text style={{ fontSize: 15, fontWeight: "600", color: "#475569", marginBottom: 6 }}>尚無補打卡申請記錄</Text>
              <Text style={{ fontSize: 13, color: "#94A3B8", textAlign: "center" }}>點擊右上角「+ 補打卡申請」提交申請</Text>
            </View>
          ) : (
            <FlatList
              data={[...corrections].sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime())}
              keyExtractor={(item) => String(item.id)}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 24 }}
              renderItem={({ item }) => {
                const rawDate = item.date as unknown as string | Date;
                const dateStr = typeof rawDate === "string" ? rawDate.split("T")[0] : (rawDate as Date).toISOString().split("T")[0];
                return (
                  <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
                    {/* Top row */}
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <View>
                        <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>{dateStr}</Text>
                        <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{TYPE_LABEL[item.type] ?? item.type}</Text>
                      </View>
                      <CorrectionStatusBadge status={item.status} />
                    </View>
                    {/* Times */}
                    <View style={{ flexDirection: "row", backgroundColor: "#F8FAFC", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                      {item.requestedClockIn && (
                        <View style={{ flex: 1, alignItems: "center" }}>
                          <Text style={{ fontSize: 10, color: "#94A3B8", marginBottom: 2 }}>申請上班</Text>
                          <Text style={{ fontSize: 15, fontWeight: "700", color: "#22C55E" }}>{item.requestedClockIn}</Text>
                        </View>
                      )}
                      {item.requestedClockIn && item.requestedClockOut && (
                        <View style={{ width: 1, backgroundColor: "#E2E8F0" }} />
                      )}
                      {item.requestedClockOut && (
                        <View style={{ flex: 1, alignItems: "center" }}>
                          <Text style={{ fontSize: 10, color: "#94A3B8", marginBottom: 2 }}>申請下班</Text>
                          <Text style={{ fontSize: 15, fontWeight: "700", color: "#3B82F6" }}>{item.requestedClockOut}</Text>
                        </View>
                      )}
                    </View>
                    {/* Reason */}
                    <Text style={{ fontSize: 12, color: "#64748B" }}>原因：{item.reason}</Text>
                    {/* Review note */}
                    {item.reviewNote && (
                      <View style={{ marginTop: 8, backgroundColor: item.status === "approved" ? "#F0FDF4" : "#FEF2F2", borderRadius: 8, padding: 8 }}>
                        <Text style={{ fontSize: 12, color: item.status === "approved" ? "#16A34A" : "#DC2626" }}>
                          審核備注：{item.reviewNote}
                        </Text>
                      </View>
                    )}
                    {/* Created at */}
                    <Text style={{ fontSize: 11, color: "#CBD5E1", marginTop: 8 }}>
                      申請時間：{item.createdAt ? new Date(item.createdAt as any).toLocaleString("zh-TW") : ""}
                    </Text>
                  </View>
                );
              }}
            />
          )}
        </>
      )}

      <PunchCorrectionModal
        visible={showCorrectionModal}
        onClose={() => setShowCorrectionModal(false)}
        employeeId={employee?.id ?? 0}
        onSuccess={() => refetchCorrections()}
      />
    </ScreenContainer>
  );
}
