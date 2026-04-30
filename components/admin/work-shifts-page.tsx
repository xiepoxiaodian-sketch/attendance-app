import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Switch,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { AdminHeader } from "@/components/admin-header";
import { ConfirmDialog, AlertDialog } from "@/components/confirm-dialog";
import { trpc } from "@/lib/trpc";

const SHIFT_CATEGORY_CONFIG = {
  indoor: { label: "內場", bg: "#EFF6FF", color: "#2563EB", border: "#BFDBFE" },
  outdoor: { label: "外場", bg: "#F0FDF4", color: "#16A34A", border: "#BBF7D0" },
  pt: { label: "PT", bg: "#FEF3C7", color: "#D97706", border: "#FDE68A" },
};

export default function AdminWorkShiftsScreen() {
  const { data: shifts, refetch } = trpc.workShifts.list.useQuery();
  const [showModal, setShowModal] = useState(false);
  const [editShift, setEditShift] = useState<any>(null);
  const [form, setForm] = useState({
    name: "",
    startTime: "09:00",
    endTime: "18:00",
    isDefaultWeekday: false,
    isDefaultHoliday: false,
    category: "indoor" as "indoor" | "outdoor" | "pt",
  });
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

  const openEdit = (shift: any) => {
    setEditShift(shift);
    setForm({
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      isDefaultWeekday: shift.isDefaultWeekday ?? false,
      isDefaultHoliday: shift.isDefaultHoliday ?? false,
      category: (shift.category ?? "indoor") as "indoor" | "outdoor" | "pt",
    });
    setShowModal(true);
  };

  return (
    <ScreenContainer>
      <AdminHeader title="工作時段" subtitle={`共 ${shifts?.length ?? 0} 個時段`} />
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

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <TouchableOpacity
          onPress={() => {
            setEditShift(null);
            setForm({ name: "", startTime: "09:00", endTime: "18:00", isDefaultWeekday: false, isDefaultHoliday: false, category: "indoor" });
            setShowModal(true);
          }}
          style={{ backgroundColor: "#1E40AF", borderRadius: 12, paddingVertical: 12, alignItems: "center", marginBottom: 16 }}
        >
          <Text style={{ color: "white", fontSize: 15, fontWeight: "600" }}>+ 新增工作時段</Text>
        </TouchableOpacity>

        {(shifts ?? []).map((shift) => {
          const catKey = (shift.category ?? "indoor") as keyof typeof SHIFT_CATEGORY_CONFIG;
          const cat = SHIFT_CATEGORY_CONFIG[catKey] ?? SHIFT_CATEGORY_CONFIG.indoor;
          return (
            <View key={shift.id} style={{ backgroundColor: "white", borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#1E293B" }}>{shift.name}</Text>
                    <View style={{ backgroundColor: cat.bg, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: cat.border }}>
                      <Text style={{ fontSize: 11, color: cat.color, fontWeight: "600" }}>{cat.label}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>
                    {shift.startTime} – {shift.endTime}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                    {shift.isDefaultWeekday && (
                      <View style={{ backgroundColor: "#EFF6FF", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 10, color: "#1E40AF" }}>平日預設</Text>
                      </View>
                    )}
                    {shift.isDefaultHoliday && (
                      <View style={{ backgroundColor: "#F0FDF4", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 10, color: "#16A34A" }}>假日預設</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => openEdit(shift)}
                    style={{ backgroundColor: "#EFF6FF", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                  >
                    <Text style={{ color: "#1E40AF", fontSize: 13 }}>編輯</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setConfirmDeleteShift({ id: shift.id, name: shift.name })}
                    style={{ backgroundColor: "#FEE2E2", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                  >
                    <Text style={{ color: "#DC2626", fontSize: 13 }}>刪除</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}

        {(!shifts || shifts.length === 0) && (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <Text style={{ fontSize: 14, color: "#94A3B8" }}>尚未建立任何工作時段</Text>
          </View>
        )}
      </ScrollView>

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
            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 13, color: "#64748B", marginBottom: 8 }}>班次分類</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(Object.entries(SHIFT_CATEGORY_CONFIG) as [keyof typeof SHIFT_CATEGORY_CONFIG, typeof SHIFT_CATEGORY_CONFIG[keyof typeof SHIFT_CATEGORY_CONFIG]][]).map(([key, cfg]) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setForm(f => ({ ...f, category: key }))}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", borderWidth: 2, borderColor: form.category === key ? cfg.color : "#E2E8F0", backgroundColor: form.category === key ? cfg.bg : "white" }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: form.category === key ? cfg.color : "#94A3B8" }}>{cfg.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: "#F1F5F9" }}>
              <Text style={{ fontSize: 14, color: "#1E293B" }}>設為平日預設</Text>
              <Switch
                value={form.isDefaultWeekday}
                onValueChange={(v) => setForm(f => ({ ...f, isDefaultWeekday: v }))}
                trackColor={{ false: "#E2E8F0", true: "#BFDBFE" }}
                thumbColor={form.isDefaultWeekday ? "#1E40AF" : "#94A3B8"}
              />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 }}>
              <Text style={{ fontSize: 14, color: "#1E293B" }}>設為假日預設</Text>
              <Switch
                value={form.isDefaultHoliday}
                onValueChange={(v) => setForm(f => ({ ...f, isDefaultHoliday: v }))}
                trackColor={{ false: "#E2E8F0", true: "#BFDBFE" }}
                thumbColor={form.isDefaultHoliday ? "#1E40AF" : "#94A3B8"}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
