import { useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, TextInput, Modal, Alert, RefreshControl, ActivityIndicator, ScrollView } from "react-native";
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
  category: "indoor" | "outdoor" | "pt" | null;
  dayType: "weekday" | "holiday" | "both" | null;
  createdAt: Date;
};

type FormState = {
  name: string;
  startTime: string;
  endTime: string;
  isDefaultWeekday: boolean;
  isDefaultHoliday: boolean;
  category: "indoor" | "outdoor" | "pt";
  dayType: "weekday" | "holiday" | "both";
};

const INITIAL_FORM: FormState = {
  name: "",
  startTime: "09:00",
  endTime: "18:00",
  isDefaultWeekday: false,
  isDefaultHoliday: false,
  category: "indoor",
  dayType: "both",
};

const CATEGORY_CONFIG = {
  indoor: { label: "內場", color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  outdoor: { label: "外場", color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  pt: { label: "PT", color: "#9333EA", bg: "#FAF5FF", border: "#E9D5FF" },
};

const DAY_TYPE_CONFIG = {
  weekday: { label: "平日", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  holiday: { label: "假日", color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
  both: { label: "平日＋假日", color: "#64748B", bg: "#F8FAFC", border: "#E2E8F0" },
};

export default function WorkShiftsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
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
      category: shift.category ?? "indoor",
      dayType: shift.dayType ?? "both",
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
      category: form.category,
      dayType: form.dayType,
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

  // Group shifts by category
  const grouped = {
    indoor: (shifts ?? []).filter(s => (s as unknown as WorkShift).category === "indoor" || !(s as unknown as WorkShift).category),
    outdoor: (shifts ?? []).filter(s => (s as unknown as WorkShift).category === "outdoor"),
    pt: (shifts ?? []).filter(s => (s as unknown as WorkShift).category === "pt"),
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

  const renderShiftCard = (item: WorkShift) => {
    const cat = CATEGORY_CONFIG[item.category ?? "indoor"];
    const day = DAY_TYPE_CONFIG[item.dayType ?? "both"];
    return (
      <View key={item.id} style={{
        backgroundColor: "white",
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
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
            {/* Name + tags */}
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>{item.name}</Text>
              {/* Day type tag */}
              <View style={{ backgroundColor: day.bg, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: day.border }}>
                <Text style={{ fontSize: 11, color: day.color, fontWeight: "600" }}>{day.label}</Text>
              </View>
              {item.isDefaultWeekday && (
                <View style={{ backgroundColor: "#EFF6FF", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, color: "#2563EB", fontWeight: "600" }}>平日預設</Text>
                </View>
              )}
              {item.isDefaultHoliday && (
                <View style={{ backgroundColor: "#F0FDF4", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, color: "#16A34A", fontWeight: "600" }}>假日預設</Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: 14, color: "#475569" }}>🕐 {item.startTime} ~ {item.endTime}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={() => openEdit(item)}
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
    );
  };

  const renderGroup = (catKey: "indoor" | "outdoor" | "pt") => {
    const items = grouped[catKey] as unknown as WorkShift[];
    if (items.length === 0) return null;
    const cat = CATEGORY_CONFIG[catKey];
    return (
      <View key={catKey} style={{ marginBottom: 16 }}>
        {/* Group header */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <View style={{ backgroundColor: cat.bg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: cat.border }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: cat.color }}>{cat.label}</Text>
          </View>
          <Text style={{ fontSize: 12, color: "#94A3B8" }}>{items.length} 個班次</Text>
        </View>
        {items.map(item => renderShiftCard(item))}
      </View>
    );
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
        <ScrollView contentContainerStyle={{ padding: 14 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          {(shifts?.length ?? 0) === 0 ? (
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🕐</Text>
              <Text style={{ fontSize: 15, color: "#94A3B8" }}>尚未設定工作班次</Text>
            </View>
          ) : (
            <>
              {renderGroup("indoor")}
              {renderGroup("outdoor")}
              {renderGroup("pt")}
            </>
          )}
        </ScrollView>
      )}

      {/* Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <ScrollView style={{ backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#1E293B", marginBottom: 20 }}>
              {editId ? "編輯班次" : "新增班次"}
            </Text>

            {formError ? (
              <View style={{ backgroundColor: "#FEF2F2", borderRadius: 8, padding: 10, marginBottom: 12 }}>
                <Text style={{ color: "#EF4444", fontSize: 13 }}>{formError}</Text>
              </View>
            ) : null}

            {/* Name */}
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#475569", marginBottom: 6 }}>班次名稱</Text>
            <TextInput
              value={form.name}
              onChangeText={v => setForm(f => ({ ...f, name: v }))}
              placeholder="例：早班、晚班"
              style={{ ...inputStyle, marginBottom: 14 }}
              placeholderTextColor="#94A3B8"
              returnKeyType="next"
            />

            {/* Time */}
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

            {/* Category */}
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#475569", marginBottom: 8 }}>分類</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
              {(["indoor", "outdoor", "pt"] as const).map(cat => {
                const cfg = CATEGORY_CONFIG[cat];
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

            {/* Day Type */}
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#475569", marginBottom: 8 }}>適用日期</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
              {(["weekday", "holiday", "both"] as const).map(dt => {
                const cfg = DAY_TYPE_CONFIG[dt];
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

            {/* Default toggles */}
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
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
