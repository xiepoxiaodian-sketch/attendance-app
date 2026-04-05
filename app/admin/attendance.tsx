import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Platform,
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
    case "late":        return { bg: "#FEF3C7", text: "#D97706", label: "遲到" };
    case "early_leave": return { bg: "#FEF3C7", text: "#D97706", label: "早退" };
    case "absent":      return { bg: "#FEE2E2", text: "#DC2626", label: "缺勤" };
    default:            return { bg: "#DCFCE7", text: "#16A34A", label: "正常" };
  }
}

// ─── Thumbnail component (web only) ──────────────────────────────────────────
function PhotoThumbnail({ url, label, onPress }: { url: string; label: string; onPress: () => void }) {
  if (Platform.OS !== "web") return null;
  return (
    <TouchableOpacity onPress={onPress} style={{ alignItems: "center", gap: 2 }}>
      <View style={{
        width: 44, height: 44, borderRadius: 6, overflow: "hidden",
        borderWidth: 1.5, borderColor: "#3B82F6",
        backgroundColor: "#EFF6FF",
      }}>
        <img
          src={url}
          alt={label}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" } as any}
        />
      </View>
      <Text style={{ fontSize: 9, color: "#3B82F6", fontWeight: "600" }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Photo Viewer Modal ───────────────────────────────────────────────────────
function PhotoViewer({ visible, clockInPhoto, clockOutPhoto, employeeName, date, shiftLabel, initialTab, onClose }: {
  visible: boolean; clockInPhoto?: string | null; clockOutPhoto?: string | null;
  employeeName: string; date: string; shiftLabel: string;
  initialTab?: "in" | "out";
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"in" | "out">(initialTab ?? "in");
  // Sync initialTab when modal opens
  useMemo(() => { if (visible) setActiveTab(initialTab ?? "in"); }, [visible, initialTab]);
  if (!visible) return null;
  const currentPhoto = activeTab === "in" ? clockInPhoto : clockOutPhoto;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <View style={{ backgroundColor: "#1E293B", borderRadius: 20, width: "100%", maxWidth: 480, overflow: "hidden" }}>
          {/* Header */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "#334155" }}>
            <View>
              <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>{employeeName}</Text>
              <Text style={{ color: "#94A3B8", fontSize: 12, marginTop: 2 }}>{date} · {shiftLabel}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#334155", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#94A3B8", fontSize: 18 }}>×</Text>
            </TouchableOpacity>
          </View>
          {/* Tabs */}
          <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#334155" }}>
            {(["in", "out"] as const).map(tab => (
              <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)}
                style={{ flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: activeTab === tab ? "#3B82F6" : "transparent" }}>
                <Text style={{ color: activeTab === tab ? "#3B82F6" : "#64748B", fontWeight: "600", fontSize: 13 }}>
                  {tab === "in" ? "🟢 上班照片" : "🔵 下班照片"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Photo */}
          <View style={{ padding: 16 }}>
            {currentPhoto ? (
              <View style={{ borderRadius: 12, overflow: "hidden", backgroundColor: "#0F172A" }}>
                {Platform.OS === "web" ? (
                  <img src={currentPhoto} alt={activeTab === "in" ? "上班打卡照片" : "下班打卡照片"}
                    style={{ width: "100%", height: "auto", display: "block", borderRadius: 12 } as any} />
                ) : (
                  <View style={{ padding: 20, alignItems: "center" }}>
                    <Text style={{ color: "#94A3B8", fontSize: 13, textAlign: "center" }}>照片已儲存，請在瀏覽器中查看</Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={{ backgroundColor: "#0F172A", borderRadius: 12, paddingVertical: 48, alignItems: "center" }}>
                <Text style={{ fontSize: 32, marginBottom: 12 }}>📷</Text>
                <Text style={{ color: "#475569", fontSize: 14, textAlign: "center" }}>
                  {activeTab === "in" ? "此次上班打卡無照片記錄" : "此次下班打卡無照片記錄"}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Status filter options ────────────────────────────────────────────────────
type StatusFilter = "all" | "normal" | "late" | "early_leave" | "absent" | "no_clockout";
const STATUS_FILTERS: { key: StatusFilter; label: string; color: string; bg: string }[] = [
  { key: "all",         label: "全部",   color: "#64748B", bg: "#F1F5F9" },
  { key: "normal",      label: "正常",   color: "#16A34A", bg: "#DCFCE7" },
  { key: "late",        label: "遲到",   color: "#D97706", bg: "#FEF3C7" },
  { key: "early_leave", label: "早退",   color: "#D97706", bg: "#FEF3C7" },
  { key: "absent",      label: "缺勤",   color: "#DC2626", bg: "#FEE2E2" },
  { key: "no_clockout", label: "未下班打卡", color: "#7C3AED", bg: "#F5F3FF" },
];

// ─── Grouped row: one employee + one date = one card ─────────────────────────
type GroupedRecord = {
  key: string;
  employeeId: number;
  employeeName: string;
  date: string;
  dateRaw: any;
  shifts: {
    id: number;
    shiftLabel: string;
    clockInTime: any;
    clockOutTime: any;
    status: string | null | undefined;
    clockInPhoto?: string | null;
    clockOutPhoto?: string | null;
  }[];
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AdminAttendanceScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id?: number } | null>(null);
  const [photoViewer, setPhotoViewer] = useState<{
    clockInPhoto?: string | null; clockOutPhoto?: string | null;
    employeeName: string; date: string; shiftLabel: string;
    initialTab?: "in" | "out";
  } | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);

  const { data: records, refetch, isLoading } = trpc.attendance.getAll.useQuery({ startDate, endDate });
  const { data: employees } = trpc.employees.list.useQuery();

  const deleteMutation = trpc.attendance.delete.useMutation({ onSuccess: () => refetch() });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const getEmployeeName = useCallback((id: number) =>
    employees?.find(e => e.id === id)?.fullName ?? `#${id}`, [employees]);

  // Group records by employee + date
  const groupedRecords = useMemo<GroupedRecord[]>(() => {
    const map = new Map<string, GroupedRecord>();
    for (const r of (records ?? [])) {
      const dateKey = r.date ? (typeof r.date === "string" ? (r.date as string).split("T")[0] : new Date(r.date as unknown as string).toISOString().split("T")[0]) : "";
      const key = `${r.employeeId}_${dateKey}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          employeeId: r.employeeId,
          employeeName: getEmployeeName(r.employeeId),
          date: formatDate(r.date),
          dateRaw: r.date,
          shifts: [],
        });
      }
      map.get(key)!.shifts.push({
        id: r.id,
        shiftLabel: r.shiftLabel || "一般班",
        clockInTime: r.clockInTime,
        clockOutTime: r.clockOutTime,
        status: r.status,
        clockInPhoto: (r as any).clockInPhoto,
        clockOutPhoto: (r as any).clockOutPhoto,
      });
    }
    // Sort by date desc
    return Array.from(map.values()).sort((a, b) =>
      new Date(b.dateRaw).getTime() - new Date(a.dateRaw).getTime()
    );
  }, [records, getEmployeeName]);

  // Apply filters
  const filteredGroups = useMemo(() => {
    return groupedRecords.filter(group => {
      // Name search
      if (searchQuery && !group.employeeName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      // Status filter
      if (statusFilter === "all") return true;
      if (statusFilter === "no_clockout") return group.shifts.some(s => s.clockInTime && !s.clockOutTime);
      return group.shifts.some(s => s.status === statusFilter);
    });
  }, [groupedRecords, searchQuery, statusFilter]);

  const totalRecords = (records ?? []).length;

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

      {photoViewer && (
        <PhotoViewer
          visible={!!photoViewer}
          clockInPhoto={photoViewer.clockInPhoto}
          clockOutPhoto={photoViewer.clockOutPhoto}
          employeeName={photoViewer.employeeName}
          date={photoViewer.date}
          shiftLabel={photoViewer.shiftLabel}
          initialTab={photoViewer.initialTab}
          onClose={() => setPhotoViewer(null)}
        />
      )}

      <AdminHeader title="打卡紀錄" subtitle={`${filteredGroups.length} 人次 · 共 ${totalRecords} 筆`} onRefresh={onRefresh} refreshing={refreshing} />

      {/* Filters */}
      <View style={{ backgroundColor: "white", paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", gap: 8 }}>
        {/* Date range */}
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
        {/* Name search */}
        <TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="搜尋員工姓名..."
          returnKeyType="search"
          style={{ backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: "#1E293B" }}
          placeholderTextColor="#94A3B8" />
        {/* Status filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -14 }} contentContainerStyle={{ paddingHorizontal: 14, gap: 6, flexDirection: "row" }}>
          {STATUS_FILTERS.map(f => (
            <TouchableOpacity key={f.key} onPress={() => setStatusFilter(f.key)}
              style={{
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                backgroundColor: statusFilter === f.key ? f.bg : "#F8FAFC",
                borderWidth: 1,
                borderColor: statusFilter === f.key ? f.color : "#E2E8F0",
              }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: statusFilter === f.key ? f.color : "#94A3B8" }}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
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
          contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 32 }}
          ListEmptyComponent={
            <View style={{ paddingVertical: 60, alignItems: "center" }}>
              <Text style={{ fontSize: 14, color: "#94A3B8" }}>此期間無打卡紀錄</Text>
            </View>
          }
          renderItem={({ item: group }) => {
            // Determine overall group status badge
            const hasLate = group.shifts.some(s => s.status === "late");
            const hasEarlyLeave = group.shifts.some(s => s.status === "early_leave");
            const hasAbsent = group.shifts.some(s => s.status === "absent");
            const hasNoClockOut = group.shifts.some(s => s.clockInTime && !s.clockOutTime);
            const overallStatus = hasAbsent ? "absent" : hasLate || hasEarlyLeave ? "late" : hasNoClockOut ? "no_clockout" : "normal";
            const statusStyle = overallStatus === "absent" ? { bg: "#FEE2E2", text: "#DC2626", label: "缺勤" }
              : overallStatus === "late" ? { bg: "#FEF3C7", text: "#D97706", label: hasLate && hasEarlyLeave ? "遲到/早退" : hasLate ? "遲到" : "早退" }
              : overallStatus === "no_clockout" ? { bg: "#F5F3FF", text: "#7C3AED", label: "未下班打卡" }
              : { bg: "#DCFCE7", text: "#16A34A", label: "正常" };

            return (
              <View style={{
                backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0",
                shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
                overflow: "hidden",
              }}>
                {/* Card Header: employee + date + overall status */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: group.shifts.length > 0 ? 1 : 0, borderBottomColor: "#F1F5F9" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#2563EB" }}>{group.employeeName[0]}</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: "#1E293B" }}>{group.employeeName}</Text>
                      <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{group.date}</Text>
                    </View>
                  </View>
                  <View style={{ backgroundColor: statusStyle.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                    <Text style={{ fontSize: 11, color: statusStyle.text, fontWeight: "700" }}>{statusStyle.label}</Text>
                  </View>
                </View>

                {/* Shift rows */}
                {group.shifts.map((shift, idx) => {
                  const shiftStatus = getStatusStyle(shift.status);
                  const hasPhoto = !!shift.clockInPhoto || !!shift.clockOutPhoto;
                  return (
                    <View key={shift.id}>
                      {/* Main shift row */}
                      <View style={{
                        flexDirection: "row", alignItems: "center",
                        paddingHorizontal: 14, paddingVertical: 9,
                        borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: "#F8FAFC",
                        backgroundColor: idx % 2 === 0 ? "white" : "#FAFAFA",
                      }}>
                        {/* Shift label */}
                        <Text style={{ fontSize: 11, color: "#64748B", width: 60, flexShrink: 0 }} numberOfLines={1}>{shift.shiftLabel}</Text>

                        {/* Clock In */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1 }}>
                          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#22C55E" }} />
                          <Text style={{ fontSize: 13, color: "#1E293B", fontWeight: "600" }}>{formatTime(shift.clockInTime)}</Text>
                        </View>

                        {/* Arrow */}
                        <Text style={{ fontSize: 12, color: "#CBD5E1", marginHorizontal: 4 }}>→</Text>

                        {/* Clock Out */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1 }}>
                          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#3B82F6" }} />
                          <Text style={{ fontSize: 13, color: shift.clockOutTime ? "#1E293B" : "#94A3B8", fontWeight: shift.clockOutTime ? "600" : "400" }}>
                            {formatTime(shift.clockOutTime)}
                          </Text>
                        </View>

                        {/* Hours */}
                        <Text style={{ fontSize: 11, color: "#94A3B8", width: 44, textAlign: "right" }}>
                          {calcHours(shift.clockInTime, shift.clockOutTime)}
                        </Text>

                        {/* Status badge (per shift) */}
                        {shift.status && shift.status !== "normal" && (
                          <View style={{ backgroundColor: shiftStatus.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, marginLeft: 6 }}>
                            <Text style={{ fontSize: 10, color: shiftStatus.text, fontWeight: "600" }}>{shiftStatus.label}</Text>
                          </View>
                        )}

                        {/* Delete */}
                        <TouchableOpacity onPress={() => setConfirmDelete({ id: shift.id })} style={{ marginLeft: 8 }}>
                          <Text style={{ color: "#EF4444", fontSize: 11 }}>刪除</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Photo thumbnails row — shown below shift row if photos exist */}
                      {hasPhoto && Platform.OS === "web" && (
                        <View style={{
                          flexDirection: "row", alignItems: "center", gap: 10,
                          paddingHorizontal: 14, paddingVertical: 8,
                          backgroundColor: "#F8FAFC",
                          borderTopWidth: 1, borderTopColor: "#F1F5F9",
                        }}>
                          <Text style={{ fontSize: 10, color: "#94A3B8", marginRight: 4 }}>打卡照片：</Text>
                          {shift.clockInPhoto ? (
                            <PhotoThumbnail
                              url={shift.clockInPhoto}
                              label="上班"
                              onPress={() => setPhotoViewer({
                                clockInPhoto: shift.clockInPhoto,
                                clockOutPhoto: shift.clockOutPhoto,
                                employeeName: group.employeeName,
                                date: group.date,
                                shiftLabel: shift.shiftLabel,
                                initialTab: "in",
                              })}
                            />
                          ) : (
                            <View style={{ alignItems: "center", gap: 2 }}>
                              <View style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: "#F1F5F9", borderWidth: 1, borderColor: "#E2E8F0", alignItems: "center", justifyContent: "center" }}>
                                <Text style={{ fontSize: 16 }}>📷</Text>
                              </View>
                              <Text style={{ fontSize: 9, color: "#CBD5E1" }}>上班</Text>
                            </View>
                          )}
                          {shift.clockOutPhoto ? (
                            <PhotoThumbnail
                              url={shift.clockOutPhoto}
                              label="下班"
                              onPress={() => setPhotoViewer({
                                clockInPhoto: shift.clockInPhoto,
                                clockOutPhoto: shift.clockOutPhoto,
                                employeeName: group.employeeName,
                                date: group.date,
                                shiftLabel: shift.shiftLabel,
                                initialTab: "out",
                              })}
                            />
                          ) : (
                            <View style={{ alignItems: "center", gap: 2 }}>
                              <View style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: "#F1F5F9", borderWidth: 1, borderColor: "#E2E8F0", alignItems: "center", justifyContent: "center" }}>
                                <Text style={{ fontSize: 16 }}>📷</Text>
                              </View>
                              <Text style={{ fontSize: 9, color: "#CBD5E1" }}>下班</Text>
                            </View>
                          )}
                          {/* Still show text button as fallback for non-web or if needed */}
                          <TouchableOpacity
                            onPress={() => setPhotoViewer({
                              clockInPhoto: shift.clockInPhoto,
                              clockOutPhoto: shift.clockOutPhoto,
                              employeeName: group.employeeName,
                              date: group.date,
                              shiftLabel: shift.shiftLabel,
                              initialTab: shift.clockInPhoto ? "in" : "out",
                            })}
                            style={{ marginLeft: 4, backgroundColor: "#EFF6FF", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 }}>
                            <Text style={{ fontSize: 10, color: "#2563EB", fontWeight: "600" }}>放大查看</Text>
                          </TouchableOpacity>
                        </View>
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
