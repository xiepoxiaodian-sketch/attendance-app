import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  RefreshControl,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function getWeekDates(offset = 0): Date[] {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

export default function AdminScheduleScreen() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [shifts, setShifts] = useState([{ startTime: "09:00", endTime: "18:00", label: "班次1" }]);

  const weekDates = getWeekDates(weekOffset);
  const startDate = toDateStr(weekDates[0]);
  const endDate = toDateStr(weekDates[6]);

  const { data: employees } = trpc.employees.list.useQuery();
  const { data: workShifts } = trpc.workShifts.list.useQuery();

  const activeEmployees = (employees ?? []).filter(e => e.isActive && e.role === "employee");

  // Get schedules for all employees for this week
  const scheduleQueries = trpc.useUtils();

  const upsertMutation = trpc.schedules.upsert.useMutation({
    onSuccess: () => {
      setShowModal(false);
      Alert.alert("成功", "排班已儲存");
    },
    onError: (err) => Alert.alert("錯誤", err.message),
  });

  const handleOpenSchedule = (employeeId: number, date: string) => {
    setSelectedEmployee(employeeId);
    setSelectedDate(date);
    // Default shifts from work shifts config
    const defaultShift = workShifts?.find(s => s.isDefaultWeekday && s.isActive);
    if (defaultShift) {
      setShifts([{ startTime: defaultShift.startTime, endTime: defaultShift.endTime, label: "班次1" }]);
    } else {
      setShifts([{ startTime: "09:00", endTime: "18:00", label: "班次1" }]);
    }
    setShowModal(true);
  };

  const handleSaveSchedule = () => {
    if (!selectedEmployee || !selectedDate) return;
    upsertMutation.mutate({
      employeeId: selectedEmployee,
      date: selectedDate,
      shifts,
    });
  };

  const addShift = () => {
    setShifts(prev => [...prev, { startTime: "09:00", endTime: "18:00", label: `班次${prev.length + 1}` }]);
  };

  const removeShift = (index: number) => {
    setShifts(prev => prev.filter((_, i) => i !== index));
  };

  const updateShift = (index: number, field: string, value: string) => {
    setShifts(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={{ backgroundColor: "#1E40AF", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
        <Text style={{ color: "white", fontSize: 22, fontWeight: "700" }}>排班管理</Text>
      </View>

      {/* Week Navigation */}
      <View style={{ backgroundColor: "white", paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: "#E2E8F0" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <TouchableOpacity onPress={() => setWeekOffset(w => w - 1)} style={{ padding: 8 }}>
            <Text style={{ color: "#1E40AF", fontSize: 18 }}>‹</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#1E293B" }}>
            {weekDates[0].toLocaleDateString("zh-TW", { month: "long", day: "numeric" })} –{" "}
            {weekDates[6].toLocaleDateString("zh-TW", { month: "long", day: "numeric" })}
          </Text>
          <TouchableOpacity onPress={() => setWeekOffset(w => w + 1)} style={{ padding: 8 }}>
            <Text style={{ color: "#1E40AF", fontSize: 18 }}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Day Headers */}
        <View style={{ flexDirection: "row" }}>
          <View style={{ width: 70 }} />
          {weekDates.map((d, i) => {
            const isToday = toDateStr(d) === toDateStr(new Date());
            return (
              <View key={i} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 11, color: "#94A3B8" }}>{WEEKDAYS[d.getDay()]}</Text>
                <View style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: isToday ? "#1E40AF" : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 2,
                }}>
                  <Text style={{ fontSize: 12, fontWeight: isToday ? "700" : "400", color: isToday ? "white" : "#1E293B" }}>
                    {d.getDate()}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Employee Rows */}
      <ScrollView>
        {activeEmployees.map((emp) => (
          <View key={emp.id} style={{ borderBottomWidth: 0.5, borderBottomColor: "#F1F5F9" }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
              <View style={{ width: 70, paddingLeft: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: "500", color: "#1E293B" }} numberOfLines={1}>
                  {emp.fullName}
                </Text>
                <Text style={{ fontSize: 10, color: "#94A3B8" }} numberOfLines={1}>
                  {emp.jobTitle || "員工"}
                </Text>
              </View>
              {weekDates.map((d, i) => {
                const dateStr = toDateStr(d);
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => handleOpenSchedule(emp.id, dateStr)}
                    style={{
                      flex: 1,
                      height: 44,
                      marginHorizontal: 1,
                      borderRadius: 6,
                      backgroundColor: isWeekend ? "#F8FAFC" : "#EFF6FF",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 10, color: isWeekend ? "#CBD5E1" : "#1E40AF" }}>
                      {isWeekend ? "休" : "排班"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        {activeEmployees.length === 0 && (
          <View style={{ padding: 32, alignItems: "center" }}>
            <Text style={{ color: "#94A3B8", fontSize: 14 }}>尚無員工資料</Text>
          </View>
        )}
      </ScrollView>

      {/* Schedule Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: "#E2E8F0", backgroundColor: "white" }}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={{ color: "#64748B", fontSize: 16 }}>取消</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: "600", color: "#1E293B" }}>設定班表</Text>
            <TouchableOpacity onPress={handleSaveSchedule} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? (
                <ActivityIndicator size="small" color="#1E40AF" />
              ) : (
                <Text style={{ color: "#1E40AF", fontSize: 16, fontWeight: "600" }}>儲存</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={{ fontSize: 14, color: "#64748B", marginBottom: 16 }}>
              {employees?.find(e => e.id === selectedEmployee)?.fullName} · {selectedDate}
            </Text>

            {shifts.map((shift, i) => (
              <View key={i} style={{ backgroundColor: "white", borderRadius: 12, padding: 14, marginBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <TextInput
                    value={shift.label}
                    onChangeText={(v) => updateShift(i, "label", v)}
                    style={{ fontSize: 15, fontWeight: "600", color: "#1E293B", flex: 1 }}
                    returnKeyType="done"
                  />
                  {shifts.length > 1 && (
                    <TouchableOpacity onPress={() => removeShift(i)}>
                      <Text style={{ color: "#EF4444", fontSize: 13 }}>移除</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 4 }}>上班時間</Text>
                    <TextInput
                      value={shift.startTime}
                      onChangeText={(v) => updateShift(i, "startTime", v)}
                      placeholder="09:00"
                      returnKeyType="next"
                      style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, color: "#1E293B" }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 4 }}>下班時間</Text>
                    <TextInput
                      value={shift.endTime}
                      onChangeText={(v) => updateShift(i, "endTime", v)}
                      placeholder="18:00"
                      returnKeyType="done"
                      style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, color: "#1E293B" }}
                    />
                  </View>
                </View>
              </View>
            ))}

            <TouchableOpacity
              onPress={addShift}
              style={{ borderWidth: 1.5, borderColor: "#1E40AF", borderStyle: "dashed", borderRadius: 12, padding: 12, alignItems: "center" }}
            >
              <Text style={{ color: "#1E40AF", fontSize: 14 }}>+ 新增班次</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
