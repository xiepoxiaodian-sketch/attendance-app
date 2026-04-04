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
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { AdminHeader } from "@/components/admin-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { trpc } from "@/lib/trpc";

function formatTime(date: any): string {
  if (!date) return "--:--";
  return new Date(date).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDate(date: any): string {
  if (!date) return "";
  const d = new Date(date);
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
    case "early_leave": return { bg: "#FEF3C7", text: "#D97706", label: "早退" };
    case "absent": return { bg: "#FEE2E2", text: "#DC2626", label: "缺勤" };
    default: return { bg: "#DCFCE7", text: "#16A34A", label: "正常" };
  }
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
  const d = new Date(dateStr);
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

  // Reset when record changes
  const initValues = useCallback(() => {
    setClockIn(record ? toTimeStr(record.clockInTime) : "");
    setClockOut(record ? toTimeStr(record.clockOutTime) : "");
    setNote(record?.note ?? "");
  }, [record]);

  // Call init when modal opens
  const handleOpen = () => { initValues(); };

  const handleSave = () => {
    if (!record) return;
    const dateStr = typeof record.date === "string" ? record.date.slice(0, 10) : new Date(record.date).toISOString().slice(0, 10);
    const newClockIn = clockIn ? buildDateTime(dateStr, clockIn) : null;
    const newClockOut = clockOut ? buildDateTime(dateStr, clockOut) : null;
    onSave({ clockInTime: newClockIn, clockOutTime: newClockOut, note });
  };

  if (!record) return null;
  const dateStr = typeof record.date === "string" ? record.date.slice(0, 10) : new Date(record.date).toISOString().slice(0, 10);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} onShow={handleOpen}>
      <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        {/* Header */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
          <TouchableOpacity onPress={onClose}><Text style={{ color: "#64748B", fontSize: 15 }}>取消</Text></TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#1E293B" }}>修改打卡記錄</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            <Text style={{ color: saving ? "#94A3B8" : "#2563EB", fontSize: 15, fontWeight: "600" }}>{saving ? "儲存中..." : "儲存"}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {/* Employee Info */}
          <View style={{ backgroundColor: "#EFF6FF", borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#2563EB" }}>{employeeName[0] ?? "?"}</Text>
            </View>
            <View>
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>{employeeName}</Text>
              <Text style={{ fontSize: 12, color: "#64748B" }}>{dateStr} · {record.shiftLabel || "一般班"}</Text>
            </View>
          </View>

          {/* Clock In/Out Times */}
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
                  style={{
                    borderWidth: 1.5, borderColor: "#BBF7D0", borderRadius: 10,
                    paddingHorizontal: 12, paddingVertical: 12,
                    fontSize: 22, fontWeight: "700", color: "#16A34A", textAlign: "center",
                    backgroundColor: "#F0FDF4",
                  }}
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
                  style={{
                    borderWidth: 1.5, borderColor: "#BFDBFE", borderRadius: 10,
                    paddingHorizontal: 12, paddingVertical: 12,
                    fontSize: 22, fontWeight: "700", color: "#2563EB", textAlign: "center",
                    backgroundColor: "#EFF6FF",
                  }}
                />
              </View>
            </View>
            <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 10, textAlign: "center" }}>留空表示清除該欄位的打卡記錄</Text>
          </View>

          {/* Note */}
          <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#475569", marginBottom: 8 }}>備注（選填）</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="管理員備注..."
              multiline
              numberOfLines={3}
              returnKeyType="done"
              style={{
                borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8,
                padding: 10, minHeight: 70, textAlignVertical: "top",
                fontSize: 14, color: "#1E293B",
              }}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function AdminAttendanceScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{ id?: number; batch?: boolean } | null>(null);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);

  const { data: records, refetch, isLoading } = trpc.attendance.getAll.useQuery({ startDate, endDate });
  const { data: employees } = trpc.employees.list.useQuery();

  const deleteMutation = trpc.attendance.delete.useMutation({ onSuccess: () => refetch() });
  const deleteBatchMutation = trpc.attendance.deleteBatch.useMutation({
    onSuccess: () => { setSelectedIds([]); refetch(); },
  });
  const adminUpdateMutation = trpc.attendance.adminUpdate.useMutation({ onSuccess: () => refetch() });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const handleDelete = (id: number) => setConfirmDelete({ id });
  const handleDeleteSelected = () => { if (selectedIds.length > 0) setConfirmDelete({ batch: true }); };

  const handleConfirmDelete = () => {
    if (confirmDelete?.id !== undefined) {
      deleteMutation.mutate({ id: confirmDelete.id });
    } else if (confirmDelete?.batch) {
      deleteBatchMutation.mutate({ ids: selectedIds });
    }
    setConfirmDelete(null);
  };

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

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const getEmployeeName = (id: number) => employees?.find(e => e.id === id)?.fullName ?? `#${id}`;

  const filteredRecords = (records ?? [])
    .filter(r => !searchQuery || getEmployeeName(r.employeeId).toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <ScreenContainer containerClassName="bg-[#F1F5F9]">
      <ConfirmDialog
        visible={!!confirmDelete}
        title={confirmDelete?.batch ? "批量刪除" : "刪除紀錄"}
        message={confirmDelete?.batch ? `確定要刪除選取的 ${selectedIds.length} 筆紀錄嗎？` : "確定要刪除此打卡紀錄嗎？"}
        confirmText="刪除"
        confirmStyle="destructive"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <EditModal
        visible={!!editRecord}
        record={editRecord}
        employeeName={editRecord ? getEmployeeName(editRecord.employeeId) : ""}
        onClose={() => setEditRecord(null)}
        onSave={handleSaveEdit}
        saving={saving}
      />

      <AdminHeader title="打卡紀錄" subtitle={`共 ${filteredRecords.length} 筆紀錄`} onRefresh={onRefresh} refreshing={refreshing} />
      {selectedIds.length > 0 && (
        <View style={{ backgroundColor: "white", paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", alignItems: "flex-end" }}>
          <TouchableOpacity
            onPress={handleDeleteSelected}
            style={{ backgroundColor: "#EF4444", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 }}
          >
            <Text style={{ color: "white", fontSize: 13, fontWeight: "600" }}>刪除 {selectedIds.length} 筆</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filters */}
      <View style={{ backgroundColor: "white", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", gap: 8 }}>
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
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="搜尋員工姓名..."
          returnKeyType="search"
          style={{ backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: "#1E293B" }}
          placeholderTextColor="#94A3B8"
        />
      </View>

      {/* Select All Bar */}
      {filteredRecords.length > 0 && (
        <View style={{ backgroundColor: "white", paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 12, color: "#94A3B8" }}>長按選取 · 可批量刪除 · 點擊可編輯</Text>
          <TouchableOpacity onPress={() => {
            if (selectedIds.length === filteredRecords.length) setSelectedIds([]);
            else setSelectedIds(filteredRecords.map(r => r.id));
          }}>
            <Text style={{ color: "#2563EB", fontSize: 13, fontWeight: "500" }}>
              {selectedIds.length === filteredRecords.length && filteredRecords.length > 0 ? "取消全選" : "全選"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={filteredRecords}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: 24 }}
          ListEmptyComponent={
            <View style={{ paddingVertical: 60, alignItems: "center" }}>
              <Text style={{ fontSize: 14, color: "#94A3B8" }}>此期間無打卡紀錄</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isSelected = selectedIds.includes(item.id);
            const statusStyle = getStatusStyle(item.status);
            return (
              <TouchableOpacity
                onLongPress={() => toggleSelect(item.id)}
                onPress={() => selectedIds.length > 0 ? toggleSelect(item.id) : setEditRecord(item)}
                style={{
                  backgroundColor: isSelected ? "#EFF6FF" : "white",
                  borderRadius: 12,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: isSelected ? "#2563EB" : "#E2E8F0",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.04,
                  shadowRadius: 3,
                  elevation: 1,
                }}
              >
                {/* Top Row */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {isSelected && (
                      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ color: "white", fontSize: 11, fontWeight: "700" }}>✓</Text>
                      </View>
                    )}
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: "#2563EB" }}>
                        {getEmployeeName(item.employeeId)[0]}
                      </Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: "#1E293B" }}>
                        {getEmployeeName(item.employeeId)}
                      </Text>
                      <Text style={{ fontSize: 11, color: "#94A3B8" }}>{item.shiftLabel || "一般班"}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ backgroundColor: statusStyle.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
                      <Text style={{ fontSize: 11, color: statusStyle.text, fontWeight: "600" }}>{statusStyle.label}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setEditRecord(item)} style={{ backgroundColor: "#EFF6FF", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ color: "#2563EB", fontSize: 12, fontWeight: "600" }}>編輯</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(item.id)}>
                      <Text style={{ color: "#EF4444", fontSize: 12, fontWeight: "500" }}>刪除</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Bottom Row */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 40 }}>
                  <Text style={{ fontSize: 12, color: "#64748B" }}>
                    {formatDate(item.date)}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#22C55E" }} />
                    <Text style={{ fontSize: 12, color: "#64748B" }}>{formatTime(item.clockInTime)}</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#3B82F6" }} />
                    <Text style={{ fontSize: 12, color: "#64748B" }}>{formatTime(item.clockOutTime)}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: "#94A3B8" }}>
                    {calcHours(item.clockInTime, item.clockOutTime)}
                  </Text>
                  {item.note && (
                    <Text style={{ fontSize: 11, color: "#94A3B8", flex: 1 }} numberOfLines={1}>📝 {item.note}</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </ScreenContainer>
  );
}
