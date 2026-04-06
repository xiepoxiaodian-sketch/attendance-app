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
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { AdminHeader } from "@/components/admin-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { trpc } from "@/lib/trpc";

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

// Determine the "worst" status for a group of shifts
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

// Parse "HH:MM" from a Date/ISO string
function toTimeStr(date: any): string {
  if (!date) return "";
  return new Date(date).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// Build ISO datetime string from date + "HH:MM"
function buildDateTime(dateStr: string, timeStr: string): string | null {
  if (!timeStr || !timeStr.match(/^\d{2}:\d{2}$/)) return null;
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(dateStr + "T00:00:00");
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

interface EditModalProps {
  visible: boolean;
  record: any;
  employeeName: string;
  onClose: () => void;
  onSave: (data: { clockInTime?: string | null; clockOutTime?: string | null; note?: string }) => void;
  saving: boolean;
}

function EditModal({ visible, record, employeeName, onClose, onSave, saving }: EditModalProps) {
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [note, setNote] = useState("");

  const initValues = useCallback(() => {
    setClockIn(record ? toTimeStr(record.clockInTime) : "");
    setClockOut(record ? toTimeStr(record.clockOutTime) : "");
    setNote(record?.note ?? "");
  }, [record]);

  const handleSave = () => {
    if (!record) return;
    const dateStr = record.dateKey;
    const newClockIn = clockIn ? buildDateTime(dateStr, clockIn) : null;
    const newClockOut = clockOut ? buildDateTime(dateStr, clockOut) : null;
    onSave({ clockInTime: newClockIn, clockOutTime: newClockOut, note });
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
                <TextInput
                  value={clockIn}
                  onChangeText={setClockIn}
                  placeholder="08:30"
                  keyboardType="numbers-and-punctuation"
                  returnKeyType="done"
                  maxLength={5}
                  style={{ borderWidth: 1.5, borderColor: "#BBF7D0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 22, fontWeight: "700", color: "#16A34A", textAlign: "center", backgroundColor: "#F0FDF4" }}
                />
              </View>
              <View style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 12 }}>
                <Text style={{ fontSize: 20, color: "#94A3B8" }}>→</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: "#3B82F6", marginBottom: 6 }}>下班時間</Text>
                <TextInput
                  value={clockOut}
                  onChangeText={setClockOut}
                  placeholder="17:30"
                  keyboardType="numbers-and-punctuation"
                  returnKeyType="done"
                  maxLength={5}
                  style={{ borderWidth: 1.5, borderColor: "#BFDBFE", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 22, fontWeight: "700", color: "#2563EB", textAlign: "center", backgroundColor: "#EFF6FF" }}
                />
              </View>
            </View>
            <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 10, textAlign: "center" }}>留空表示清除該欄位的打卡記錄</Text>
          </View>

          <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#475569", marginBottom: 8 }}>備注（選填）</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="管理員備注..."
              multiline
              numberOfLines={3}
              returnKeyType="done"
              style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, padding: 10, minHeight: 70, textAlignVertical: "top", fontSize: 14, color: "#1E293B" }}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// Photo viewer modal
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

type StatusFilter = "all" | "normal" | "late" | "early_leave" | "absent" | "no_clock_out";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "normal", label: "正常" },
  { key: "late", label: "遲到" },
  { key: "early_leave", label: "早退" },
  { key: "absent", label: "缺勤" },
  { key: "no_clock_out", label: "未下班打卡" },
];

export default function AdminAttendanceScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editRecord, setEditRecord] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: number } | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);

  const { data: groups, refetch, isLoading } = trpc.attendance.getGrouped.useQuery({ startDate, endDate });

  const deleteMutation = trpc.attendance.delete.useMutation({ onSuccess: () => refetch() });
  const adminUpdateMutation = trpc.attendance.adminUpdate.useMutation({ onSuccess: () => refetch() });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const handleSaveEdit = async (data: { clockInTime?: string | null; clockOutTime?: string | null; note?: string }) => {
    if (!editRecord) return;
    setSaving(true);
    try {
      await adminUpdateMutation.mutateAsync({ id: editRecord.id, ...data });
      setEditRecord(null);
    } finally {
      setSaving(false);
    }
  };

  // Filter and count
  const allGroups = groups ?? [];

  const getGroupStatusKey = (g: typeof allGroups[0]): StatusFilter => {
    const s = groupStatus(g.shifts);
    return s as StatusFilter;
  };

  const filteredGroups = allGroups
    .filter(g => {
      if (searchQuery && !g.employeeName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (statusFilter === "all") return true;
      return getGroupStatusKey(g) === statusFilter;
    });

  // Count per status
  const counts: Record<StatusFilter, number> = { all: allGroups.length, normal: 0, late: 0, early_leave: 0, absent: 0, no_clock_out: 0 };
  for (const g of allGroups) {
    const s = getGroupStatusKey(g);
    counts[s] = (counts[s] ?? 0) + 1;
  }

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

      <AdminHeader title="打卡紀錄" subtitle={`共 ${filteredGroups.length} 筆紀錄`} onRefresh={onRefresh} refreshing={refreshing} />

      {/* Filters */}
      <View style={{ backgroundColor: "white", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", gap: 8 }}>
        {/* Date Range */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#94A3B8", marginBottom: 4 }}>開始日期</Text>
            <TextInput
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
              returnKeyType="done"
              style={{ backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: "#1E293B" }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#94A3B8", marginBottom: 4 }}>結束日期</Text>
            <TextInput
              value={endDate}
              onChangeText={setEndDate}
              placeholder="YYYY-MM-DD"
              returnKeyType="done"
              style={{ backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: "#1E293B" }}
            />
          </View>
        </View>

        {/* Search */}
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="搜尋員工姓名..."
          returnKeyType="search"
          style={{ backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: "#1E293B" }}
          placeholderTextColor="#94A3B8"
        />

        {/* Status Filter Buttons */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 2 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {STATUS_FILTERS.map(f => {
              const active = statusFilter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => setStatusFilter(f.key)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 20,
                    backgroundColor: active ? "#1E3A8A" : "#F1F5F9",
                    borderWidth: 1,
                    borderColor: active ? "#1E3A8A" : "#E2E8F0",
                  }}
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
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: group.shifts.length > 0 ? 1 : 0, borderBottomColor: "#F1F5F9" }}>
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
                      {/* Shift label + status */}
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

                      {/* Times + photos */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        {/* Clock in */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#22C55E" }} />
                          <Text style={{ fontSize: 13, color: "#1E293B", fontWeight: "600" }}>{formatTime(shift.clockInTime)}</Text>
                        </View>
                        <Text style={{ color: "#CBD5E1", fontSize: 14 }}>→</Text>
                        {/* Clock out */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#3B82F6" }} />
                          <Text style={{ fontSize: 13, color: "#1E293B", fontWeight: "600" }}>{formatTime(shift.clockOutTime)}</Text>
                        </View>
                        {/* Duration */}
                        <Text style={{ fontSize: 12, color: "#94A3B8" }}>{calcHours(shift.clockInTime, shift.clockOutTime)}</Text>

                        {/* Photos */}
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
