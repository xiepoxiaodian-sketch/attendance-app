import { useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, TextInput, Modal, Alert, RefreshControl, ActivityIndicator } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { AdminHeader } from "@/components/admin-header";
import { trpc } from "@/lib/trpc";

type WorkShift = {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  isDefaultWeekday: boolean;
  isDefaultHoliday: boolean;
  isActive: boolean;
  createdAt: Date;
};

const INITIAL_FORM = { name: "", startTime: "09:00", endTime: "18:00", isDefaultWeekday: false, isDefaultHoliday: false };

export default function WorkShiftsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<typeof INITIAL_FORM>(INITIAL_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [formError, setFormError] = useState("");

  const { data: shifts, refetch, isLoading } = trpc.workShifts.list.useQuery();
  const createMutation = trpc.workShifts.create.useMutation({ onSuccess: () => { refetch(); setShowModal(false); } });
  const updateMutation = trpc.workShifts.update.useMutation({ onSuccess: () => { refetch(); setShowModal(false); } });
  const deleteMutation = trpc.workShifts.delete.useMutation({ onSuccess: () => refetch() });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const openCreate = () => {
    setEditId(null);
    setForm(INITIAL_FORM);
    setFormError("");
    setShowModal(true);
  };

  const openEdit = (shift: WorkShift) => {
    setEditId(shift.id);
    setForm({
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      isDefaultWeekday: shift.isDefaultWeekday,
      isDefaultHoliday: shift.isDefaultHoliday,
    });
    setFormError("");
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) { setFormError("請輸入班次名稱"); return; }
    if (!form.startTime || !form.endTime) { setFormError("請輸入上下班時間"); return; }
    const payload = {
      name: form.name.trim(),
      startTime: form.startTime,
      endTime: form.endTime,
      isDefaultWeekday: form.isDefaultWeekday,
      isDefaultHoliday: form.isDefaultHoliday,
    };
    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (id: number, name: string) => {
    Alert.alert("刪除班次", `確定要刪除「${name}」班次嗎？`, [
      { text: "取消", style: "cancel" },
      { text: "刪除", style: "destructive", onPress: () => deleteMutation.mutate({ id }) },
    ]);
  };

  const inputStyle = {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1E293B",
  };

  return (
    <ScreenContainer containerClassName="bg-[#F1F5F9]">
      <AdminHeader title="工作時段" subtitle={`共 ${shifts?.length ?? 0} 個班次`} onRefresh={onRefresh} refreshing={refreshing} />

      {/* Add Button */}
      <View style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#F1F5F9", alignItems: "flex-end" }}>
        <TouchableOpacity
          onPress={openCreate}
          style={{ backgroundColor: "#2563EB", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }}
        >
          <Text style={{ color: "white", fontWeight: "600", fontSize: 14 }}>+ 新增班次</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={shifts ?? []}
          keyExtractor={item => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 14, gap: 10 }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🕐</Text>
              <Text style={{ fontSize: 15, color: "#94A3B8" }}>尚未設定工作班次</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{
              backgroundColor: "white",
              borderRadius: 12,
              padding: 14,
              borderWidth: 1,
              borderColor: "#F1F5F9",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 3,
              elevation: 1,
            }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>{item.name}</Text>
                    {item.isDefaultWeekday && (
                      <View style={{ backgroundColor: "#EFF6FF", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 11, color: "#2563EB", fontWeight: "600" }}>平日預設</Text>
                      </View>
                    )}
                  {item.isDefaultHoliday && (
                      <View style={{ backgroundColor: "#F0FDF4", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 11, color: "#16A34A", fontWeight: "600" }}>假日預設</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 14, color: "#475569" }}>
                    🕐 {item.startTime} ~ {item.endTime}
                  </Text>

                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => openEdit(item as unknown as WorkShift)}
                    style={{ backgroundColor: "#F1F5F9", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                  >
                    <Text style={{ fontSize: 13, color: "#475569" }}>編輯</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(item.id, item.name)}
                    style={{ backgroundColor: "#FEF2F2", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                  >
                    <Text style={{ fontSize: 13, color: "#EF4444" }}>刪除</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        />
      )}

      {/* Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#1E293B", marginBottom: 20 }}>
              {editId ? "編輯班次" : "新增班次"}
            </Text>

            {formError ? (
              <View style={{ backgroundColor: "#FEF2F2", borderRadius: 8, padding: 10, marginBottom: 12 }}>
                <Text style={{ color: "#EF4444", fontSize: 13 }}>{formError}</Text>
              </View>
            ) : null}

            <Text style={{ fontSize: 13, fontWeight: "600", color: "#475569", marginBottom: 6 }}>班次名稱</Text>
            <TextInput
              value={form.name}
              onChangeText={v => setForm(f => ({ ...f, name: v }))}
              placeholder="例：早班、晚班"
              style={{ ...inputStyle, marginBottom: 14 }}
              placeholderTextColor="#94A3B8"
              returnKeyType="next"
            />

            <View style={{ flexDirection: "row", gap: 12, marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#475569", marginBottom: 6 }}>上班時間</Text>
                <TextInput
                  value={form.startTime}
                  onChangeText={v => setForm(f => ({ ...f, startTime: v }))}
                  placeholder="09:00"
                  style={inputStyle}
                  placeholderTextColor="#94A3B8"
                  returnKeyType="next"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#475569", marginBottom: 6 }}>下班時間</Text>
                <TextInput
                  value={form.endTime}
                  onChangeText={v => setForm(f => ({ ...f, endTime: v }))}
                  placeholder="18:00"
                  style={inputStyle}
                  placeholderTextColor="#94A3B8"
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
              <TouchableOpacity
                onPress={() => setForm(f => ({ ...f, isDefaultWeekday: !f.isDefaultWeekday }))}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: form.isDefaultWeekday ? "#EFF6FF" : "#F8FAFC", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: form.isDefaultWeekday ? "#2563EB" : "#E2E8F0" }}
              >
                <Text style={{ fontSize: 16 }}>{form.isDefaultWeekday ? "☑" : "☐"}</Text>
                <Text style={{ fontSize: 13, color: form.isDefaultWeekday ? "#2563EB" : "#64748B", fontWeight: "600" }}>平日預設</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setForm(f => ({ ...f, isDefaultHoliday: !f.isDefaultHoliday }))}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: form.isDefaultHoliday ? "#F0FDF4" : "#F8FAFC", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: form.isDefaultHoliday ? "#16A34A" : "#E2E8F0" }}
              >
                <Text style={{ fontSize: 16 }}>{form.isDefaultHoliday ? "☑" : "☐"}</Text>
                <Text style={{ fontSize: 13, color: form.isDefaultHoliday ? "#16A34A" : "#64748B", fontWeight: "600" }}>假日預設</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => setShowModal(false)}
                style={{ flex: 1, backgroundColor: "#F1F5F9", borderRadius: 12, paddingVertical: 13, alignItems: "center" }}
              >
                <Text style={{ color: "#64748B", fontWeight: "600" }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                style={{ flex: 1, backgroundColor: "#2563EB", borderRadius: 12, paddingVertical: 13, alignItems: "center" }}
              >
                <Text style={{ color: "white", fontWeight: "600" }}>儲存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
