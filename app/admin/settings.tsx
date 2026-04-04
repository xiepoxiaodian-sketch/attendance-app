import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  RefreshControl,
  ActivityIndicator,
  Switch,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { AdminHeader } from "@/components/admin-header";
import { ConfirmDialog, AlertDialog } from "@/components/confirm-dialog";
import { trpc } from "@/lib/trpc";
import { useEmployeeAuth } from "@/lib/employee-auth";

type TabKey = "system" | "shifts" | "devices" | "leave";

export default function AdminSettingsScreen() {
  const { employee } = useEmployeeAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("system");
  const [refreshing, setRefreshing] = useState(false);

  const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: "system", label: "系統設定", icon: "⚙️" },
    { key: "shifts", label: "工作時段", icon: "🕐" },
    { key: "devices", label: "裝置管理", icon: "📱" },
    { key: "leave", label: "請假審核", icon: "📋" },
  ];

  return (
    <ScreenContainer>
      <AdminHeader title="設定" subtitle="系統設定與管理" />

      {/* Tabs */}
      <View style={{ backgroundColor: "white", borderBottomWidth: 0.5, borderBottomColor: "#E2E8F0" }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 12,
                marginRight: 4,
                borderBottomWidth: 2,
                borderBottomColor: activeTab === tab.key ? "#1E40AF" : "transparent",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: activeTab === tab.key ? "600" : "400", color: activeTab === tab.key ? "#1E40AF" : "#64748B" }}>
                {tab.icon} {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {activeTab === "system" && <SystemSettings />}
      {activeTab === "shifts" && <ShiftsSettings />}
      {activeTab === "devices" && <DevicesSettings />}
      {activeTab === "leave" && <LeaveReview adminId={employee?.id ?? 0} />}
    </ScreenContainer>
  );
}

// ============================================================
// System Settings Tab
// ============================================================
function SystemSettings() {
  const { data: settings, refetch } = trpc.settings.getAll.useQuery();
  const [alertMsg, setAlertMsg] = useState<{ title: string; message: string } | null>(null);
  const setBatchMutation = trpc.settings.setBatch.useMutation({
    onSuccess: () => { refetch(); setAlertMsg({ title: "成功", message: "設定已儲存" }); },
    onError: (err) => setAlertMsg({ title: "錯誤", message: err.message }),
  });

  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (settings) {
      setForm({ ...settings });
    }
  }, [settings]);

  const handleSave = () => {
    const updates = Object.entries(form).map(([key, value]) => ({ key, value }));
    setBatchMutation.mutate(updates);
  };

  const fields = [
    { key: "work_location_lat", label: "工作地點緯度", placeholder: "例：25.0330" },
    { key: "work_location_lng", label: "工作地點經度", placeholder: "例：121.5654" },
    { key: "allowed_radius", label: "允許打卡範圍（公尺）", placeholder: "例：200" },
    { key: "late_threshold_minutes", label: "遲到判定（分鐘）", placeholder: "例：10" },
    { key: "company_name", label: "公司名稱", placeholder: "您的公司名稱" },
  ];

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <AlertDialog
        visible={!!alertMsg}
        title={alertMsg?.title ?? ""}
        message={alertMsg?.message ?? ""}
        onClose={() => setAlertMsg(null)}
      />
      <View style={{ backgroundColor: "white", borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: "#64748B", marginBottom: 12 }}>打卡設定</Text>

        {/* Require Device Binding */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: "#F1F5F9" }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ fontSize: 14, color: "#1E293B" }}>要求裝置綁定</Text>
            <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>員工只能使用已綁定的裝置打卡</Text>
          </View>
          <Switch
            value={form.require_device_binding === "true"}
            onValueChange={(v) => setForm(f => ({ ...f, require_device_binding: v ? "true" : "false" }))}
            trackColor={{ false: "#E2E8F0", true: "#BFDBFE" }}
            thumbColor={form.require_device_binding === "true" ? "#1E40AF" : "#94A3B8"}
          />
        </View>

        {/* Require GPS */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: "#F1F5F9" }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ fontSize: 14, color: "#1E293B" }}>要求 GPS 定位</Text>
            <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>打卡時需在指定地點範圍內</Text>
          </View>
          <Switch
            value={form.require_gps === "true"}
            onValueChange={(v) => setForm(f => ({ ...f, require_gps: v ? "true" : "false" }))}
            trackColor={{ false: "#E2E8F0", true: "#BFDBFE" }}
            thumbColor={form.require_gps === "true" ? "#1E40AF" : "#94A3B8"}
          />
        </View>

        {/* Require WiFi IP */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ fontSize: 14, color: "#1E293B" }}>限定公司 WiFi 打卡</Text>
            <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>員工需連公司 WiFi 才能打卡</Text>
          </View>
          <Switch
            value={form.require_ip_whitelist === "true"}
            onValueChange={(v) => setForm(f => ({ ...f, require_ip_whitelist: v ? "true" : "false" }))}
            trackColor={{ false: "#E2E8F0", true: "#BFDBFE" }}
            thumbColor={form.require_ip_whitelist === "true" ? "#1E40AF" : "#94A3B8"}
          />
        </View>
      </View>

      {/* WiFi IP Whitelist input */}
      {form.require_ip_whitelist === "true" && (
        <View style={{ backgroundColor: "white", borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#64748B", marginBottom: 4 }}>公司 WiFi 外部 IP</Text>
          <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12 }}>請到 https://whatismyip.com 查詢公司 WiFi 的對外 IP。多個 IP 用逗號分隔（例：203.69.123.45, 111.22.33.44）</Text>
          <TextInput
            value={form.allowed_ips ?? ""}
            onChangeText={(v) => setForm(f => ({ ...f, allowed_ips: v }))}
            placeholder="例：203.69.123.45"
            returnKeyType="done"
            autoCapitalize="none"
            autoCorrect={false}
            style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: "#1E293B" }}
            placeholderTextColor="#94A3B8"
          />
          <Text style={{ fontSize: 11, color: "#F59E0B", marginTop: 8 }}>⚠️ 啟用後員工必須連公司 WiFi 才能打卡，請確認 IP 正確再儲存</Text>
        </View>
      )}

      <View style={{ backgroundColor: "white", borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: "#64748B", marginBottom: 12 }}>地點與時間設定</Text>
        {fields.map((field, i) => (
          <View key={field.key} style={{ marginBottom: i < fields.length - 1 ? 12 : 0 }}>
            <Text style={{ fontSize: 13, color: "#64748B", marginBottom: 6 }}>{field.label}</Text>
            <TextInput
              value={form[field.key] ?? ""}
              onChangeText={(v) => setForm(f => ({ ...f, [field.key]: v }))}
              placeholder={field.placeholder}
              returnKeyType="done"
              style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: "#1E293B" }}
              placeholderTextColor="#94A3B8"
            />
          </View>
        ))}
      </View>

      <TouchableOpacity
        onPress={handleSave}
        disabled={setBatchMutation.isPending}
        style={{ backgroundColor: "#1E40AF", borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: setBatchMutation.isPending ? 0.7 : 1 }}
      >
        {setBatchMutation.isPending ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>儲存設定</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ============================================================
// Work Shifts Tab
// ============================================================
const SHIFT_CATEGORY_CONFIG = {
  indoor: { label: "內場", color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  outdoor: { label: "外場", color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  pt: { label: "PT", color: "#9333EA", bg: "#FAF5FF", border: "#E9D5FF" },
} as const;

const SHIFT_DAY_TYPE_CONFIG = {
  weekday: { label: "平日", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  holiday: { label: "假日", color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
  both: { label: "平日＋假日", color: "#64748B", bg: "#F8FAFC", border: "#E2E8F0" },
} as const;

type ShiftFormState = {
  name: string;
  startTime: string;
  endTime: string;
  isDefaultWeekday: boolean;
  isDefaultHoliday: boolean;
  category: "indoor" | "outdoor" | "pt";
  dayType: "weekday" | "holiday" | "both";
};

const SHIFT_INITIAL_FORM: ShiftFormState = {
  name: "",
  startTime: "09:00",
  endTime: "18:00",
  isDefaultWeekday: false,
  isDefaultHoliday: false,
  category: "indoor",
  dayType: "both",
};

function ShiftCard({ shift, onEdit, onDelete }: { shift: any; onEdit: (s: any) => void; onDelete: (s: any) => void }) {
  const catKey = (shift.category ?? "indoor") as keyof typeof SHIFT_CATEGORY_CONFIG;
  const dayKey = (shift.dayType ?? "both") as keyof typeof SHIFT_DAY_TYPE_CONFIG;
  const cat = SHIFT_CATEGORY_CONFIG[catKey] ?? SHIFT_CATEGORY_CONFIG.indoor;
  const day = SHIFT_DAY_TYPE_CONFIG[dayKey] ?? SHIFT_DAY_TYPE_CONFIG.both;
  return (
    <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "#F1F5F9", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>{shift.name}</Text>
            <View style={{ backgroundColor: day.bg, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: day.border }}>
              <Text style={{ fontSize: 11, color: day.color, fontWeight: "600" }}>{day.label}</Text>
            </View>
            {shift.isDefaultWeekday && (
              <View style={{ backgroundColor: "#EFF6FF", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, color: "#2563EB", fontWeight: "600" }}>平日預設</Text>
              </View>
            )}
            {shift.isDefaultHoliday && (
              <View style={{ backgroundColor: "#F0FDF4", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, color: "#16A34A", fontWeight: "600" }}>假日預設</Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: 14, color: "#475569" }}>🕐 {shift.startTime} ~ {shift.endTime}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity onPress={() => onEdit(shift)} style={{ backgroundColor: "#EFF6FF", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: "#1E40AF", fontSize: 13 }}>編輯</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDelete(shift)} style={{ backgroundColor: "#FEE2E2", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: "#DC2626", fontSize: 13 }}>刪除</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function ShiftGroup({ catKey, items, onEdit, onDelete }: { catKey: "indoor" | "outdoor" | "pt"; items: any[]; onEdit: (s: any) => void; onDelete: (s: any) => void }) {
  if (items.length === 0) return null;
  const cat = SHIFT_CATEGORY_CONFIG[catKey];
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <View style={{ backgroundColor: cat.bg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: cat.border }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: cat.color }}>{cat.label}</Text>
        </View>
        <Text style={{ fontSize: 12, color: "#94A3B8" }}>{items.length} 個班次</Text>
      </View>
      {items.map((s) => <ShiftCard key={s.id} shift={s} onEdit={onEdit} onDelete={onDelete} />)}
    </View>
  );
}

function ShiftsSettings() {
  const { data: shifts, refetch } = trpc.workShifts.list.useQuery();
  const [showModal, setShowModal] = useState(false);
  const [editShift, setEditShift] = useState<any>(null);
  const [form, setForm] = useState<ShiftFormState>(SHIFT_INITIAL_FORM);
  const [alertMsg, setAlertMsg] = useState<{ title: string; message: string } | null>(null);
  const [confirmDeleteShift, setConfirmDeleteShift] = useState<{ id: number; name: string } | null>(null);

  const createMutation = trpc.workShifts.create.useMutation({
    onSuccess: () => { refetch(); setShowModal(false); setAlertMsg({ title: "成功", message: "工作時段已建立" }); },
    onError: (err) => setAlertMsg({ title: "錯誤", message: err.message }),
  });

  const updateMutation = trpc.workShifts.update.useMutation({
    onSuccess: () => { refetch(); setShowModal(false); },
  });

  const deleteMutation = trpc.workShifts.delete.useMutation({
    onSuccess: () => refetch(),
  });

  const handleSave = () => {
    if (!form.name || !form.startTime || !form.endTime) {
      setAlertMsg({ title: "錯誤", message: "請填寫所有必填欄位" });
      return;
    }
    if (editShift) {
      updateMutation.mutate({ id: editShift.id, ...form });
    } else {
      createMutation.mutate(form);
    }
  };

  const allShifts = (shifts ?? []) as any[];
  const indoorShifts = allShifts.filter((s) => s.category === "indoor" || !s.category);
  const outdoorShifts = allShifts.filter((s) => s.category === "outdoor");
  const ptShifts = allShifts.filter((s) => s.category === "pt");

  const handleEdit = (shift: any) => {
    setEditShift(shift);
    setForm({
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      isDefaultWeekday: shift.isDefaultWeekday ?? false,
      isDefaultHoliday: shift.isDefaultHoliday ?? false,
      category: shift.category ?? "indoor",
      dayType: shift.dayType ?? "both",
    });
    setShowModal(true);
  };

  const handleDeletePress = (shift: any) => {
    setConfirmDeleteShift({ id: shift.id, name: shift.name });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <AlertDialog
        visible={!!alertMsg}
        title={alertMsg?.title ?? ""}
        message={alertMsg?.message ?? ""}
        onClose={() => setAlertMsg(null)}
      />
      <ConfirmDialog
        visible={!!confirmDeleteShift}
        title="刪除工作時段"
        message={`確定要刪除「${confirmDeleteShift?.name ?? ""}」嗎？`}
        confirmText="刪除"
        confirmStyle="destructive"
        onConfirm={() => { if (confirmDeleteShift) deleteMutation.mutate({ id: confirmDeleteShift.id }); setConfirmDeleteShift(null); }}
        onCancel={() => setConfirmDeleteShift(null)}
      />
      <TouchableOpacity
        onPress={() => { setEditShift(null); setForm(SHIFT_INITIAL_FORM); setShowModal(true); }}
        style={{ backgroundColor: "#1E40AF", borderRadius: 12, paddingVertical: 12, alignItems: "center", marginBottom: 16 }}
      >
        <Text style={{ color: "white", fontSize: 15, fontWeight: "600" }}>+ 新增工作時段</Text>
      </TouchableOpacity>

      <ShiftGroup catKey="indoor" items={indoorShifts} onEdit={handleEdit} onDelete={handleDeletePress} />
      <ShiftGroup catKey="outdoor" items={outdoorShifts} onEdit={handleEdit} onDelete={handleDeletePress} />
      <ShiftGroup catKey="pt" items={ptShifts} onEdit={handleEdit} onDelete={handleDeletePress} />

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: "#E2E8F0", backgroundColor: "white" }}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={{ color: "#64748B", fontSize: 16 }}>取消</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: "600", color: "#1E293B" }}>
              {editShift ? "編輯時段" : "新增時段"}
            </Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={{ color: "#1E40AF", fontSize: 16, fontWeight: "600" }}>儲存</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {[
              { label: "名稱", key: "name", placeholder: "例：早班、正常班" },
              { label: "上班時間 (HH:MM)", key: "startTime", placeholder: "09:00" },
              { label: "下班時間 (HH:MM)", key: "endTime", placeholder: "18:00" },
            ].map((f, i) => (
              <View key={i} style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 13, color: "#64748B", marginBottom: 6 }}>{f.label}</Text>
                <TextInput
                  value={(form as any)[f.key]}
                  onChangeText={(v) => setForm(prev => ({ ...prev, [f.key]: v }))}
                  placeholder={f.placeholder}
                  returnKeyType="next"
                  style={{ backgroundColor: "white", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, color: "#1E293B" }}
                  placeholderTextColor="#94A3B8"
                />
              </View>
            ))}

            {/* Category Selection */}
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#475569", marginBottom: 8 }}>分類</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
              {(["indoor", "outdoor", "pt"] as const).map(cat => {
                const cfg = SHIFT_CATEGORY_CONFIG[cat];
                const selected = form.category === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setForm(f => ({ ...f, category: cat }))}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      paddingVertical: 10,
                      borderRadius: 10,
                      borderWidth: 2,
                      backgroundColor: selected ? cfg.bg : "#F8FAFC",
                      borderColor: selected ? cfg.color : "#E2E8F0",
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "700", color: selected ? cfg.color : "#94A3B8" }}>{cfg.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Day Type Selection */}
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#475569", marginBottom: 8 }}>適用日期</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
              {(["weekday", "holiday", "both"] as const).map(dt => {
                const cfg = SHIFT_DAY_TYPE_CONFIG[dt];
                const selected = form.dayType === dt;
                return (
                  <TouchableOpacity
                    key={dt}
                    onPress={() => setForm(f => ({ ...f, dayType: dt }))}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      paddingVertical: 10,
                      borderRadius: 10,
                      borderWidth: 2,
                      backgroundColor: selected ? cfg.bg : "#F8FAFC",
                      borderColor: selected ? cfg.color : "#E2E8F0",
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: selected ? cfg.color : "#94A3B8" }}>{cfg.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: "#F1F5F9" }}>
              <Text style={{ fontSize: 14, color: "#1E293B" }}>設為平日預設</Text>
              <Switch value={form.isDefaultWeekday} onValueChange={(v) => setForm(f => ({ ...f, isDefaultWeekday: v }))} trackColor={{ false: "#E2E8F0", true: "#BFDBFE" }} thumbColor={form.isDefaultWeekday ? "#1E40AF" : "#94A3B8"} />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 }}>
              <Text style={{ fontSize: 14, color: "#1E293B" }}>設為假日預設</Text>
              <Switch value={form.isDefaultHoliday} onValueChange={(v) => setForm(f => ({ ...f, isDefaultHoliday: v }))} trackColor={{ false: "#E2E8F0", true: "#BFDBFE" }} thumbColor={form.isDefaultHoliday ? "#1E40AF" : "#94A3B8"} />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ============================================================
// Devices Tab
// ============================================================
function DevicesSettings() {
  const { data: devices, refetch } = trpc.devices.getAll.useQuery();
  const { data: employees } = trpc.employees.list.useQuery();
  const [confirmRevoke, setConfirmRevoke] = useState<{ id: number; name: string } | null>(null);

  const deleteMutation = trpc.devices.delete.useMutation({
    onSuccess: () => refetch(),
  });

  const getEmployeeName = (id: number) => employees?.find(e => e.id === id)?.fullName ?? `#${id}`;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <ConfirmDialog
        visible={!!confirmRevoke}
        title="解除綁定"
        message={`確定要解除 ${confirmRevoke?.name ?? ""} 的綁定嗎？`}
        confirmText="解除"
        confirmStyle="destructive"
        onConfirm={() => { if (confirmRevoke) deleteMutation.mutate({ id: confirmRevoke.id }); setConfirmRevoke(null); }}
        onCancel={() => setConfirmRevoke(null)}
      />
      <Text style={{ fontSize: 13, color: "#64748B", marginBottom: 12 }}>共 {devices?.length ?? 0} 台已綁定裝置</Text>
      {(devices ?? []).map((device) => (
        <View key={device.id} style={{ backgroundColor: "white", borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontSize: 24, marginRight: 10 }}>
              {device.platform === "ios" ? "📱" : device.platform === "android" ? "📱" : "💻"}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: "#1E293B" }}>
                {device.deviceName || "未知裝置"}
              </Text>
              <Text style={{ fontSize: 12, color: "#64748B", marginTop: 1 }}>
                {getEmployeeName(device.employeeId)} · {device.platform?.toUpperCase()}
              </Text>
              <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>
                {new Date(device.registeredAt).toLocaleDateString("zh-TW")}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setConfirmRevoke({ id: device.id, name: device.deviceName || "此裝置" })}
              style={{ backgroundColor: "#FEE2E2", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
            >
              <Text style={{ color: "#DC2626", fontSize: 13 }}>解除</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      {(!devices || devices.length === 0) && (
        <View style={{ alignItems: "center", padding: 32 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>📱</Text>
          <Text style={{ color: "#94A3B8", fontSize: 14 }}>尚無已綁定裝置</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ============================================================
// Leave Review Tab
// ============================================================
function LeaveReview({ adminId }: { adminId: number }) {
  const { data: pendingLeave, refetch } = trpc.leave.getAll.useQuery({ status: "pending" });
  const { data: allLeave, refetch: refetchAll } = trpc.leave.getAll.useQuery({});
  const { data: employees } = trpc.employees.list.useQuery();
  const [reviewNote, setReviewNote] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<"approved" | "rejected" | null>(null);

  const [alertMsg, setAlertMsg] = useState<{ title: string; message: string } | null>(null);
  const reviewMutation = trpc.leave.review.useMutation({
    onSuccess: () => {
      refetch();
      refetchAll();
      setShowNoteModal(false);
      setReviewNote("");
      setAlertMsg({ title: "成功", message: pendingAction === "approved" ? "已核准請假申請" : "已拒絕請假申請" });
    },
    onError: (err) => setAlertMsg({ title: "錯誤", message: err.message }),
  });

  const handleReview = (id: number, status: "approved" | "rejected") => {
    setSelectedId(id);
    setPendingAction(status);
    setShowNoteModal(true);
  };

  const confirmReview = () => {
    if (!selectedId || !pendingAction) return;
    reviewMutation.mutate({
      id: selectedId,
      status: pendingAction,
      reviewedBy: adminId,
      reviewNote: reviewNote || undefined,
    });
  };

  const getEmployeeName = (id: number) => employees?.find(e => e.id === id)?.fullName ?? `#${id}`;

  const LEAVE_LABELS: Record<string, string> = {
    annual: "年假", sick: "病假", personal: "事假", other: "休假"
  };

  const allSorted = [...(allLeave ?? [])].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <AlertDialog
        visible={!!alertMsg}
        title={alertMsg?.title ?? ""}
        message={alertMsg?.message ?? ""}
        onClose={() => setAlertMsg(null)}
      />
      {/* Pending */}
      {(pendingLeave ?? []).length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#D97706", marginBottom: 10 }}>
            ⏳ 待審核 ({pendingLeave?.length})
          </Text>
          {pendingLeave?.map((req) => (
            <View key={req.id} style={{ backgroundColor: "#FFFBEB", borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#FDE68A" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: "#1E293B" }}>
                    {getEmployeeName(req.employeeId)}
                  </Text>
                  <Text style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>
                    {LEAVE_LABELS[req.leaveType] || req.leaveType} · {new Date(req.startDate).toLocaleDateString("zh-TW")} – {new Date(req.endDate).toLocaleDateString("zh-TW")}
                  </Text>
                  {req.reason && <Text style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>{req.reason}</Text>}
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={() => handleReview(req.id, "approved")}
                  style={{ flex: 1, backgroundColor: "#DCFCE7", borderRadius: 8, paddingVertical: 8, alignItems: "center" }}
                >
                  <Text style={{ color: "#16A34A", fontWeight: "600" }}>✓ 核准</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleReview(req.id, "rejected")}
                  style={{ flex: 1, backgroundColor: "#FEE2E2", borderRadius: 8, paddingVertical: 8, alignItems: "center" }}
                >
                  <Text style={{ color: "#DC2626", fontWeight: "600" }}>✗ 拒絕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* All Leave History */}
      <Text style={{ fontSize: 14, fontWeight: "600", color: "#64748B", marginBottom: 10 }}>所有請假紀錄</Text>
      {allSorted.map((req) => {
        const statusMap: Record<string, { label: string; bg: string; text: string }> = {
          pending: { label: "審核中", bg: "#FEF3C7", text: "#D97706" },
          approved: { label: "已核准", bg: "#DCFCE7", text: "#16A34A" },
          rejected: { label: "已拒絕", bg: "#FEE2E2", text: "#DC2626" },
        };
        const s = statusMap[req.status] ?? statusMap.pending;
        return (
          <View key={req.id} style={{ backgroundColor: "white", borderRadius: 12, padding: 12, marginBottom: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: "#1E293B" }}>
                  {getEmployeeName(req.employeeId)} · {LEAVE_LABELS[req.leaveType] || req.leaveType}
                </Text>
                <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
                  {new Date(req.startDate).toLocaleDateString("zh-TW")} – {new Date(req.endDate).toLocaleDateString("zh-TW")}
                </Text>
              </View>
              <View style={{ backgroundColor: s.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                <Text style={{ color: s.text, fontSize: 11, fontWeight: "600" }}>{s.label}</Text>
              </View>
            </View>
          </View>
        );
      })}

      {/* Review Note Modal */}
      <Modal visible={showNoteModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: "#E2E8F0", backgroundColor: "white" }}>
            <TouchableOpacity onPress={() => setShowNoteModal(false)}>
              <Text style={{ color: "#64748B", fontSize: 16 }}>取消</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: "600", color: "#1E293B" }}>
              {pendingAction === "approved" ? "核准請假" : "拒絕請假"}
            </Text>
            <TouchableOpacity onPress={confirmReview} disabled={reviewMutation.isPending}>
              {reviewMutation.isPending ? (
                <ActivityIndicator size="small" color="#1E40AF" />
              ) : (
                <Text style={{ color: pendingAction === "approved" ? "#16A34A" : "#DC2626", fontSize: 16, fontWeight: "600" }}>
                  確定
                </Text>
              )}
            </TouchableOpacity>
          </View>
          <View style={{ padding: 16 }}>
            <Text style={{ fontSize: 13, color: "#64748B", marginBottom: 8 }}>審核意見（選填）</Text>
            <TextInput
              value={reviewNote}
              onChangeText={setReviewNote}
              placeholder="輸入審核意見..."
              multiline
              numberOfLines={4}
              returnKeyType="done"
              style={{ backgroundColor: "white", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: "#1E293B", minHeight: 100, textAlignVertical: "top" }}
              placeholderTextColor="#94A3B8"
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
