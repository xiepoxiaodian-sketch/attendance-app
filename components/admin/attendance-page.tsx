import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Modal,
  ScrollView,
  Image,
  Linking,
  Platform,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { AdminHeader } from "@/components/admin-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { trpc } from "@/lib/trpc";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(date: any): string {
  if (!date) return "--:--";
  return new Date(date).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDate(dateKey: string): string {
  if (!dateKey) return "";
  const d = new Date(dateKey + "T00:00:00");
  return d.toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit", weekday: "short" });
}

function calcHours(clockIn: any, clockOut: any): string {
  if (!clockIn || !clockOut) return "-";
  const diff = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 1000 / 60;
  return `${Math.floor(diff / 60)}h${Math.round(diff % 60)}m`;
}

function getStatusStyle(status: string | null | undefined) {
  switch (status) {
    case "late": return { bg: "#FEF3C7", text: "#D97706", label: "遲到" };
    case "early_leave": return { bg: "#FFF7ED", text: "#EA580C", label: "早退" };
    case "absent": return { bg: "#FEE2E2", text: "#DC2626", label: "缺勤" };
    case "no_clock_out": return { bg: "#F0F9FF", text: "#0284C7", label: "未下班打卡" };
    default: return { bg: "#DCFCE7", text: "#16A34A", label: "正常" };
  }
}

function groupStatus(shifts: Array<{ status: string | null; clockInTime: any; clockOutTime: any }>): string {
  const statuses = shifts.map(s => {
    if (!s.clockInTime) return "absent";
    if (s.clockInTime && !s.clockOutTime) return "no_clock_out";
    return s.status || "normal";
  });
  if (statuses.includes("absent")) return "absent";
  if (statuses.includes("late")) return "late";
  if (statuses.includes("early_leave")) return "early_leave";
  if (statuses.includes("no_clock_out")) return "no_clock_out";
  return "normal";
}

function toTimeStr(date: any): string {
  if (!date) return "";
  return new Date(date).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function buildDateTime(dateStr: string, timeStr: string): string | null {
  if (!timeStr || !timeStr.match(/^\d{2}:\d{2}$/)) return null;
  // Explicitly use Taiwan timezone (UTC+8) to avoid server timezone issues
  return `${dateStr}T${timeStr}:00+08:00`;
}

// Get date string offset from today (e.g. 0=today, -1=yesterday, 1=tomorrow)
function getDateOffset(offset: number): string {
  // Use Taiwan timezone (UTC+8)
  const tw = new Date(Date.now() + 8 * 60 * 60 * 1000 + offset * 24 * 60 * 60 * 1000);
  return tw.toISOString().split("T")[0];
}

// ─── Edit Modal ─────────────────────────────────────────────────────────────

interface EditModalProps {
  visible: boolean;
  record: any;
  employeeName: string;
  onClose: () => void;
  onSave: (data: { clockInTime?: string | null; clockOutTime?: string | null; note?: string; status?: string }) => void;
  saving: boolean;
}

const STATUS_OPTIONS = [
  { value: "normal",      label: "正常",     bg: "#DCFCE7", color: "#16A34A" },
  { value: "late",        label: "遲到",     bg: "#FEF3C7", color: "#D97706" },
  { value: "early_leave", label: "早退",     bg: "#FEF3C7", color: "#D97706" },
  { value: "absent",      label: "缺勤",     bg: "#FEE2E2", color: "#DC2626" },
];

function EditModal({ visible, record, employeeName, onClose, onSave, saving }: EditModalProps) {
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [note, setNote] = useState("");
  const [statusOverride, setStatusOverride] = useState<string>("normal");

  const initValues = useCallback(() => {
    setClockIn(record ? toTimeStr(record.clockInTime) : "");
    setClockOut(record ? toTimeStr(record.clockOutTime) : "");
    setNote(record?.note ?? "");
    setStatusOverride(record?.status ?? "normal");
  }, [record]);

  const handleSave = () => {
    if (!record) return;
    const dateStr = record.dateKey;
    const newClockIn = clockIn ? buildDateTime(dateStr, clockIn) : null;
    const newClockOut = clockOut ? buildDateTime(dateStr, clockOut) : null;
    onSave({ clockInTime: newClockIn, clockOutTime: newClockOut, note, status: statusOverride });
  };

  if (!record) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} onShow={initValues}>
      <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
          <TouchableOpacity onPress={onClose}><Text style={{ color: "#64748B", fontSize: 15 }}>取消</Text></TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#1E293B" }}>修改打卡記錄</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            <Text style={{ color: saving ? "#94A3B8" : "#2563EB", fontSize: 15, fontWeight: "600" }}>{saving ? "儲存中..." : "儲存"}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={{ backgroundColor: "#EFF6FF", borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#2563EB" }}>{employeeName[0] ?? "?"}</Text>
            </View>
            <View>
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>{employeeName}</Text>
              <Text style={{ fontSize: 12, color: "#64748B" }}>{record.dateKey} · {record.shiftLabel || "一般班"}</Text>
            </View>
          </View>
          <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#475569", marginBottom: 14 }}>打卡時間（格式：HH:MM）</Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: "#22C55E", marginBottom: 6 }}>上班時間</Text>
                <TextInput value={clockIn} onChangeText={setClockIn} placeholder="08:30" keyboardType="numbers-and-punctuation" returnKeyType="done" maxLength={5}
                  style={{ borderWidth: 1.5, borderColor: "#BBF7D0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 22, fontWeight: "700", color: "#16A34A", textAlign: "center", backgroundColor: "#F0FDF4" }} />
              </View>
              <View style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 12 }}>
                <Text style={{ fontSize: 20, color: "#94A3B8" }}>→</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: "#3B82F6", marginBottom: 6 }}>下班時間</Text>
                <TextInput value={clockOut} onChangeText={setClockOut} placeholder="17:30" keyboardType="numbers-and-punctuation" returnKeyType="done" maxLength={5}
                  style={{ borderWidth: 1.5, borderColor: "#BFDBFE", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 22, fontWeight: "700", color: "#2563EB", textAlign: "center", backgroundColor: "#EFF6FF" }} />
              </View>
            </View>
            <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 10, textAlign: "center" }}>留空表示清除該欄位的打卡記錄</Text>
          </View>
          <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#475569", marginBottom: 10 }}>出勤狀態</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {STATUS_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setStatusOverride(opt.value)}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: statusOverride === opt.value ? opt.bg : "#F1F5F9", borderWidth: 1.5, borderColor: statusOverride === opt.value ? opt.color : "transparent" }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: statusOverride === opt.value ? opt.color : "#94A3B8" }}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#475569", marginBottom: 8 }}>備注（選填）</Text>
            <TextInput value={note} onChangeText={setNote} placeholder="管理員備注..." multiline numberOfLines={3} returnKeyType="done"
              style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, padding: 10, minHeight: 70, textAlignVertical: "top", fontSize: 14, color: "#1E293B" }} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Photo Modal ─────────────────────────────────────────────────────────────

function PhotoModal({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  if (!uri) return null;
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center" }} onPress={onClose} activeOpacity={1}>
        <Image source={{ uri }} style={{ width: "90%", height: "70%", resizeMode: "contain" }} />
        <Text style={{ color: "rgba(255,255,255,0.6)", marginTop: 16, fontSize: 13 }}>點擊任意處關閉</Text>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Employee Picker Modal ────────────────────────────────────────────────────

interface EmployeePickerProps {
  visible: boolean;
  employees: Array<{ id: number; fullName: string }>;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onClose: () => void;
}

function EmployeePicker({ visible, employees, selectedId, onSelect, onClose }: EmployeePickerProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
          <TouchableOpacity onPress={onClose}><Text style={{ color: "#64748B", fontSize: 15 }}>取消</Text></TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#1E293B" }}>選擇員工</Text>
          <TouchableOpacity onPress={() => { onSelect(null); onClose(); }}>
            <Text style={{ color: "#2563EB", fontSize: 15, fontWeight: "600" }}>全部員工</Text>
          </TouchableOpacity>
        </View>
        <ScrollView>
          {employees.map(emp => (
            <TouchableOpacity
              key={emp.id}
              onPress={() => { onSelect(emp.id); onClose(); }}
              style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: selectedId === emp.id ? "#DBEAFE" : "#F1F5F9", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: selectedId === emp.id ? "#2563EB" : "#64748B" }}>{emp.fullName[0]}</Text>
              </View>
              <Text style={{ fontSize: 15, color: "#1E293B", flex: 1 }}>{emp.fullName}</Text>
              {selectedId === emp.id && <Text style={{ color: "#2563EB", fontSize: 18 }}>✓</Text>}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "normal" | "late" | "early_leave" | "absent" | "no_clock_out";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "normal", label: "正常" },
  { key: "late", label: "遲到" },
  { key: "early_leave", label: "早退" },
  { key: "absent", label: "缺勤" },
  { key: "no_clock_out", label: "未下班打卡" },
];

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function AdminAttendanceScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: number } | null>(null);
  const [exporting, setExporting] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);

  const { data: groups, refetch, isLoading } = trpc.attendance.getGrouped.useQuery({ startDate, endDate });
  const { data: employees } = trpc.employees.list.useQuery();

  const deleteMutation = trpc.attendance.delete.useMutation({ onSuccess: () => refetch() });
  const adminUpdateMutation = trpc.attendance.adminUpdate.useMutation({ onSuccess: () => refetch() });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const handleSaveEdit = async (data: { clockInTime?: string | null; clockOutTime?: string | null; note?: string; status?: string }) => {
    if (!editRecord) return;
    setSaving(true);
    try {
      const validStatuses = ["normal", "late", "early_leave", "absent"] as const;
      type ValidStatus = typeof validStatuses[number];
      const status = validStatuses.includes(data.status as ValidStatus) ? data.status as ValidStatus : undefined;
      await adminUpdateMutation.mutateAsync({ id: editRecord.id, ...data, status });
      setEditRecord(null);
    } finally {
      setSaving(false);
    }
  };

  // Date quick buttons
  const setDateRange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
  };

  const isActiveRange = (start: string, end: string) => startDate === start && endDate === end;

  // Excel export
  const handleExport = async () => {
    setExporting(true);
    try {
      const baseUrl = "https://attendance-app-production-8901.up.railway.app";
      const url = `${baseUrl}/api/export/excel?type=attendance_detail&startDate=${startDate}&endDate=${endDate}`;
      if (Platform.OS === "web") {
        const a = document.createElement("a");
        a.href = url;
        a.download = `打卡明細_${startDate}_${endDate}.xlsx`;
        a.click();
      } else {
        await Linking.openURL(url);
      }
    } finally {
      setExporting(false);
    }
  };

  // Filter logic
  const allGroups = groups ?? [];
  const empList = (employees ?? []).map(e => ({ id: e.id, fullName: e.fullName }));

  const getGroupStatusKey = (g: typeof allGroups[0]): StatusFilter => groupStatus(g.shifts) as StatusFilter;

  const filteredGroups = allGroups.filter(g => {
    if (selectedEmployeeId !== null && g.employeeId !== selectedEmployeeId) return false;
    if (searchQuery && !g.employeeName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (statusFilter !== "all" && getGroupStatusKey(g) !== statusFilter) return false;
    return true;
  });

  // Count per status (after employee filter, before status filter)
  const baseGroups = allGroups.filter(g => {
    if (selectedEmployeeId !== null && g.employeeId !== selectedEmployeeId) return false;
    if (searchQuery && !g.employeeName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
  const counts: Record<StatusFilter, number> = { all: baseGroups.length, normal: 0, late: 0, early_leave: 0, absent: 0, no_clock_out: 0 };
  for (const g of baseGroups) {
    const s = getGroupStatusKey(g);
    counts[s] = (counts[s] ?? 0) + 1;
  }

  const selectedEmployee = empList.find(e => e.id === selectedEmployeeId);

  return (
    <ScreenContainer containerClassName="bg-[#F1F5F9]">
      <ConfirmDialog
        visible={!!confirmDelete}
        title="刪除紀錄"
        message="確定要刪除此打卡紀錄嗎？"
        confirmText="刪除"
        confirmStyle="destructive"
        onConfirm={() => {
          if (confirmDelete?.id !== undefined) deleteMutation.mutate({ id: confirmDelete.id });
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />

      <EditModal
        visible={!!editRecord}
        record={editRecord}
        employeeName={editRecord?.employeeName ?? ""}
        onClose={() => setEditRecord(null)}
        onSave={handleSaveEdit}
        saving={saving}
      />

      <PhotoModal uri={photoUri} onClose={() => setPhotoUri(null)} />

      <EmployeePicker
        visible={showEmployeePicker}
        employees={empList}
        selectedId={selectedEmployeeId}
        onSelect={setSelectedEmployeeId}
        onClose={() => setShowEmployeePicker(false)}
      />

      <AdminHeader title="打卡紀錄" subtitle={`共 ${filteredGroups.length} 筆紀錄`} onRefresh={onRefresh} refreshing={refreshing} />

      {/* ── Filters Panel ── */}
      <View style={{ backgroundColor: "white", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", gap: 10 }}>

        {/* Row 1: Date range inputs */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#94A3B8", marginBottom: 4 }}>開始日期</Text>
            <TextInput value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" returnKeyType="done"
              style={{ backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: "#1E293B" }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#94A3B8", marginBottom: 4 }}>結束日期</Text>
            <TextInput value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" returnKeyType="done"
              style={{ backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: "#1E293B" }} />
          </View>
        </View>

        {/* Row 2: Date quick buttons + Excel export */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {/* Quick date buttons */}
          {[
            { label: "昨天", start: getDateOffset(-1), end: getDateOffset(-1) },
            { label: "今天", start: getDateOffset(0), end: getDateOffset(0) },
            { label: "明天", start: getDateOffset(1), end: getDateOffset(1) },
            { label: "本週", start: (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().split("T")[0]; })(), end: getDateOffset(0) },
          ].map(btn => {
            const active = isActiveRange(btn.start, btn.end);
            return (
              <TouchableOpacity
                key={btn.label}
                onPress={() => setDateRange(btn.start, btn.end)}
                style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: active ? "#1E3A8A" : "#F1F5F9", borderWidth: 1, borderColor: active ? "#1E3A8A" : "#E2E8F0" }}
              >
                <Text style={{ fontSize: 12, fontWeight: active ? "700" : "400", color: active ? "white" : "#64748B" }}>{btn.label}</Text>
              </TouchableOpacity>
            );
          })}

          {/* Spacer */}
          <View style={{ flex: 1 }} />

          {/* Excel export button */}
          <TouchableOpacity
            onPress={handleExport}
            disabled={exporting}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: exporting ? "#F1F5F9" : "#DCFCE7", borderWidth: 1, borderColor: exporting ? "#E2E8F0" : "#86EFAC" }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: exporting ? "#94A3B8" : "#16A34A" }}>
              {exporting ? "匯出中..." : "📊 Excel"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Row 3: Search + Employee picker */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="搜尋員工姓名..."
            returnKeyType="search"
            style={{ flex: 1, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: "#1E293B" }}
            placeholderTextColor="#94A3B8"
          />
          <TouchableOpacity
            onPress={() => setShowEmployeePicker(true)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: selectedEmployeeId ? "#EFF6FF" : "#F8FAFC", borderWidth: 1, borderColor: selectedEmployeeId ? "#BFDBFE" : "#E2E8F0" }}
          >
            {selectedEmployeeId && (
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#2563EB" }}>{selectedEmployee?.fullName[0]}</Text>
              </View>
            )}
            <Text style={{ fontSize: 13, color: selectedEmployeeId ? "#2563EB" : "#94A3B8", fontWeight: selectedEmployeeId ? "600" : "400" }}>
              {selectedEmployee ? selectedEmployee.fullName : "全部員工"}
            </Text>
            <Text style={{ fontSize: 10, color: "#94A3B8" }}>▼</Text>
          </TouchableOpacity>
        </View>

        {/* Row 4: Status filter buttons */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {STATUS_FILTERS.map(f => {
              const active = statusFilter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => setStatusFilter(f.key)}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: active ? "#1E3A8A" : "#F1F5F9", borderWidth: 1, borderColor: active ? "#1E3A8A" : "#E2E8F0" }}
                >
                  <Text style={{ fontSize: 12, fontWeight: active ? "700" : "400", color: active ? "white" : "#64748B" }}>
                    {f.label} {counts[f.key]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={filteredGroups}
          keyExtractor={(item) => item.key}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={{ paddingVertical: 60, alignItems: "center" }}>
              <Text style={{ fontSize: 14, color: "#94A3B8" }}>此期間無打卡紀錄</Text>
            </View>
          }
          renderItem={({ item: group }) => {
            const overallStatus = getGroupStatusKey(group);
            const overallStyle = getStatusStyle(overallStatus);
            return (
              <View style={{ backgroundColor: "white", borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }}>
                {/* Group Header */}
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: "#2563EB" }}>{group.employeeName[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>{group.employeeName}</Text>
                    <Text style={{ fontSize: 12, color: "#94A3B8" }}>{formatDate(group.dateKey)}</Text>
                  </View>
                  <View style={{ backgroundColor: overallStyle.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                    <Text style={{ fontSize: 12, color: overallStyle.text, fontWeight: "700" }}>{overallStyle.label}</Text>
                  </View>
                </View>

                {/* Shifts */}
                {group.shifts.map((shift, idx) => {
                  const shiftStyle = getStatusStyle(shift.clockInTime ? (shift.clockOutTime ? shift.status : "no_clock_out") : "absent");
                  return (
                    <View key={shift.id} style={{ paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: "#F8FAFC" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569" }}>{shift.shiftLabel || "一般班"}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <View style={{ backgroundColor: shiftStyle.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 }}>
                            <Text style={{ fontSize: 11, color: shiftStyle.text, fontWeight: "600" }}>{shiftStyle.label}</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => setEditRecord({ ...shift, dateKey: group.dateKey, employeeName: group.employeeName })}
                            style={{ backgroundColor: "#EFF6FF", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}
                          >
                            <Text style={{ color: "#2563EB", fontSize: 11, fontWeight: "600" }}>編輯</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setConfirmDelete({ id: shift.id })}>
                            <Text style={{ color: "#EF4444", fontSize: 11, fontWeight: "500" }}>刪除</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#22C55E" }} />
                          <Text style={{ fontSize: 13, color: "#1E293B", fontWeight: "600" }}>{formatTime(shift.clockInTime)}</Text>
                        </View>
                        <Text style={{ color: "#CBD5E1", fontSize: 14 }}>→</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#3B82F6" }} />
                          <Text style={{ fontSize: 13, color: "#1E293B", fontWeight: "600" }}>{formatTime(shift.clockOutTime)}</Text>
                        </View>
                        <Text style={{ fontSize: 12, color: "#94A3B8" }}>{calcHours(shift.clockInTime, shift.clockOutTime)}</Text>
                        <View style={{ flexDirection: "row", gap: 4, marginLeft: "auto" }}>
                          {shift.clockInPhoto && (
                            <TouchableOpacity onPress={() => setPhotoUri(shift.clockInPhoto!)}>
                              <Image source={{ uri: shift.clockInPhoto }} style={{ width: 32, height: 32, borderRadius: 6, borderWidth: 1, borderColor: "#BBF7D0" }} />
                            </TouchableOpacity>
                          )}
                          {shift.clockOutPhoto && (
                            <TouchableOpacity onPress={() => setPhotoUri(shift.clockOutPhoto!)}>
                              <Image source={{ uri: shift.clockOutPhoto }} style={{ width: 32, height: 32, borderRadius: 6, borderWidth: 1, borderColor: "#BFDBFE" }} />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                      {shift.note && (
                        <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }} numberOfLines={1}>📝 {shift.note}</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            );
          }}
        />
      )}
    </ScreenContainer>
  );
}
