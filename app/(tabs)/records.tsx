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

function PunchCorrectionModal({ visible, onClose, employeeId, onSuccess }: {
  visible: boolean;
  onClose: () => void;
  employeeId: number;
  onSuccess: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [type, setType] = useState<"clock_in" | "clock_out" | "both">("clock_in");
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const createMutation = trpc.punchCorrection.create.useMutation();

  const handleSubmit = async () => {
    if (!reason.trim()) { setError("請填寫原因"); return; }
    if ((type === "clock_in" || type === "both") && !clockIn) { setError("請填寫補打上班時間"); return; }
    if ((type === "clock_out" || type === "both") && !clockOut) { setError("請填寫補打下班時間"); return; }
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
      setReason(""); setClockIn(""); setClockOut("");
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
          {/* Times */}
          {(type === "clock_in" || type === "both") && (
            <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569", marginBottom: 8 }}>補打上班時間（HH:MM）</Text>
              <TextInput value={clockIn} onChangeText={setClockIn} placeholder="例：09:00" style={{ fontSize: 15, color: "#1E293B", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, padding: 10 }} returnKeyType="done" />
            </View>
          )}
          {(type === "clock_out" || type === "both") && (
            <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569", marginBottom: 8 }}>補打下班時間（HH:MM）</Text>
              <TextInput value={clockOut} onChangeText={setClockOut} placeholder="例：18:00" style={{ fontSize: 15, color: "#1E293B", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, padding: 10 }} returnKeyType="done" />
            </View>
          )}
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

export default function RecordsScreen() {
  const { employee } = useEmployeeAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);

  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const { data: records, refetch, isLoading } = trpc.attendance.getHistory.useQuery(
    { employeeId: employee?.id ?? 0, startDate, endDate },
    { enabled: !!employee }
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const sortedRecords = [...(records ?? [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

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
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: "#E2E8F0",
      }}>
        <Text style={{ fontSize: 20, fontWeight: "700", color: "#1E293B" }}>打卡紀錄</Text>
        <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>最近 30 天</Text>
      </View>

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
                  <Text style={{ fontSize: 15, fontWeight: "600", color: "#1E293B" }}>
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
            </View>
          )}
        />
      )}
    </ScreenContainer>
  );
}
