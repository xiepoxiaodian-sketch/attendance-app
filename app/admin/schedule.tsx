import { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { AdminHeader } from "@/components/admin-header";
import { trpc } from "@/lib/trpc";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function getWeekDates(offset = 0): Date[] {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - dayOfWeek + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

type ShiftEntry = { startTime: string; endTime: string; label: string };

export default function AdminScheduleScreen() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [shifts, setShifts] = useState<ShiftEntry[]>([{ startTime: "09:00", endTime: "18:00", label: "班次1" }]);

  const weekDates = getWeekDates(weekOffset);
  const startDate = toDateStr(weekDates[0]);
  const endDate = toDateStr(weekDates[6]);

  const { data: employees } = trpc.employees.list.useQuery();
  const { data: workShifts } = trpc.workShifts.list.useQuery();
  const { data: weekSchedules, refetch: refetchSchedules } = trpc.schedules.getWeekAll.useQuery({ startDate, endDate });

  const activeEmployees = (employees ?? []).filter(e => e.isActive && e.role === "employee");

  // Build a lookup map: employeeId -> dateStr -> schedule
  const scheduleMap = useMemo(() => {
    const map: Record<number, Record<string, { id: number; shifts: ShiftEntry[] }>> = {};
    for (const s of (weekSchedules ?? [])) {
      const empId = s.employeeId;
      const rawDate = s.date as unknown as string | Date;
      const dateKey = typeof rawDate === "string" ? rawDate.split("T")[0] : toDateStr(rawDate);
      if (!map[empId]) map[empId] = {};
      map[empId][dateKey] = { id: s.id, shifts: s.shifts as ShiftEntry[] };
    }
    return map;
  }, [weekSchedules]);

  const upsertMutation = trpc.schedules.upsert.useMutation({
    onSuccess: () => {
      setShowModal(false);
      refetchSchedules();
      Alert.alert("成功", "排班已儲存");
    },
    onError: (err) => Alert.alert("錯誤", err.message),
  });

  const deleteMutation = trpc.schedules.delete.useMutation({
    onSuccess: () => {
      setShowModal(false);
      refetchSchedules();
    },
    onError: (err) => Alert.alert("錯誤", err.message),
  });

  const handleOpenSchedule = (employeeId: number, date: string) => {
    setSelectedEmployee(employeeId);
    setSelectedDate(date);
    const existing = scheduleMap[employeeId]?.[date];
    if (existing?.shifts?.length) {
      setShifts(existing.shifts);
    } else {
      const defaultShift = workShifts?.find(s => s.isDefaultWeekday && s.isActive);
      if (defaultShift) {
        setShifts([{ startTime: defaultShift.startTime, endTime: defaultShift.endTime, label: "班次1" }]);
      } else {
        setShifts([{ startTime: "09:00", endTime: "18:00", label: "班次1" }]);
      }
    }
    setShowModal(true);
  };

  const handleSaveSchedule = () => {
    if (!selectedEmployee || !selectedDate) return;
    upsertMutation.mutate({ employeeId: selectedEmployee, date: selectedDate, shifts });
  };

  const handleDeleteSchedule = () => {
    if (!selectedEmployee || !selectedDate) return;
    const existing = scheduleMap[selectedEmployee]?.[selectedDate];
    if (!existing) { setShowModal(false); return; }
    Alert.alert("刪除排班", "確定要刪除此日的排班嗎？", [
      { text: "取消", style: "cancel" },
      { text: "刪除", style: "destructive", onPress: () => deleteMutation.mutate({ id: existing.id }) },
    ]);
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

  const todayStr = toDateStr(new Date());

  return (
    <ScreenContainer containerClassName="bg-[#F1F5F9]">
      <AdminHeader title="排班管理" subtitle="點擊格子設定員工班表" />

      {/* Week Navigation */}
      <View style={{
        backgroundColor: "white",
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#E2E8F0",
      }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <TouchableOpacity
            onPress={() => setWeekOffset(w => w - 1)}
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: "#475569", fontSize: 18, lineHeight: 22 }}>‹</Text>
          </TouchableOpacity>
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#1E293B" }}>
              {weekDates[0].toLocaleDateString("zh-TW", { month: "long", day: "numeric" })} – {weekDates[6].toLocaleDateString("zh-TW", { month: "long", day: "numeric" })}
            </Text>
            {weekOffset !== 0 && (
              <TouchableOpacity onPress={() => setWeekOffset(0)}>
                <Text style={{ fontSize: 11, color: "#2563EB", marginTop: 2 }}>回到本週</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            onPress={() => setWeekOffset(w => w + 1)}
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: "#475569", fontSize: 18, lineHeight: 22 }}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Day Headers */}
        <View style={{ flexDirection: "row" }}>
          <View style={{ width: 60 }} />
          {weekDates.map((d, i) => {
            const isToday = toDateStr(d) === todayStr;
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <View key={i} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 10, color: isWeekend ? "#94A3B8" : "#64748B", fontWeight: "500" }}>
                  {WEEKDAYS[d.getDay()]}
                </Text>
                <View style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: isToday ? "#2563EB" : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 2,
                }}>
                  <Text style={{
                    fontSize: 11,
                    fontWeight: isToday ? "700" : "400",
                    color: isToday ? "white" : isWeekend ? "#94A3B8" : "#1E293B",
                  }}>
                    {d.getDate()}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Employee Rows */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        {activeEmployees.length === 0 ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <Text style={{ color: "#94A3B8", fontSize: 14 }}>尚無員工資料</Text>
          </View>
        ) : (
          activeEmployees.map((emp) => (
            <View
              key={emp.id}
              style={{
                backgroundColor: "white",
                borderBottomWidth: 1,
                borderBottomColor: "#F1F5F9",
                flexDirection: "row",
                alignItems: "stretch",
                paddingVertical: 8,
              }}
            >
              {/* Employee Name */}
              <View style={{ width: 60, paddingLeft: 10, justifyContent: "center" }}>
                <View style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: "#EFF6FF",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 2,
                }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#2563EB" }}>
                    {emp.fullName[0]}
                  </Text>
                </View>
                <Text style={{ fontSize: 9, fontWeight: "600", color: "#1E293B" }} numberOfLines={2}>
                  {emp.fullName}
                </Text>
              </View>

              {/* Day Cells */}
              {weekDates.map((d, i) => {
                const dateStr = toDateStr(d);
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const isToday = dateStr === todayStr;
                const schedule = scheduleMap[emp.id]?.[dateStr];
                const hasSchedule = !!schedule?.shifts?.length;

                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => handleOpenSchedule(emp.id, dateStr)}
                    style={{
                      flex: 1,
                      minHeight: 56,
                      marginHorizontal: 1,
                      borderRadius: 6,
                      backgroundColor: hasSchedule
                        ? (isToday ? "#DBEAFE" : "#EFF6FF")
                        : (isWeekend ? "#F8FAFC" : "#FAFAFA"),
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: isToday ? 1 : 0,
                      borderColor: isToday ? "#93C5FD" : "transparent",
                      padding: 2,
                    }}
                  >
                    {hasSchedule ? (
                      <View style={{ alignItems: "center", gap: 1 }}>
                        {schedule.shifts.map((sh, si) => (
                          <View key={si} style={{ alignItems: "center" }}>
                            <Text style={{ fontSize: 8, color: "#1D4ED8", fontWeight: "700", lineHeight: 11 }}>
                              {sh.startTime}
                            </Text>
                            <Text style={{ fontSize: 7, color: "#93C5FD", lineHeight: 9 }}>↓</Text>
                            <Text style={{ fontSize: 8, color: "#1D4ED8", fontWeight: "700", lineHeight: 11 }}>
                              {sh.endTime}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={{ fontSize: 9, color: isWeekend ? "#CBD5E1" : "#CBD5E1" }}>
                        {isWeekend ? "休" : "—"}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>

      {/* Schedule Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          <View style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: "#E2E8F0",
            backgroundColor: "white",
          }}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={{ color: "#64748B", fontSize: 16 }}>取消</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: "700", color: "#1E293B" }}>設定班表</Text>
            <TouchableOpacity onPress={handleSaveSchedule} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                <Text style={{ color: "#2563EB", fontSize: 16, fontWeight: "700" }}>儲存</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {/* Info Card */}
            <View style={{ backgroundColor: "#EFF6FF", borderRadius: 10, padding: 12, marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#2563EB" }}>
                  {employees?.find(e => e.id === selectedEmployee)?.fullName?.[0] ?? "?"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>
                  {employees?.find(e => e.id === selectedEmployee)?.fullName ?? "員工"}
                </Text>
                <Text style={{ fontSize: 13, color: "#64748B" }}>{selectedDate}</Text>
              </View>
              {selectedEmployee && selectedDate && scheduleMap[selectedEmployee]?.[selectedDate] && (
                <TouchableOpacity
                  onPress={handleDeleteSchedule}
                  style={{ backgroundColor: "#FEF2F2", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                >
                  <Text style={{ fontSize: 13, color: "#EF4444", fontWeight: "600" }}>刪除</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Quick Select from WorkShifts */}
            {(workShifts ?? []).filter(ws => ws.isActive).length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#475569", marginBottom: 8 }}>快速套用班次</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {(workShifts ?? []).filter(ws => ws.isActive).map(ws => (
                      <TouchableOpacity
                        key={ws.id}
                        onPress={() => setShifts([{ startTime: ws.startTime, endTime: ws.endTime, label: ws.name }])}
                        style={{
                          backgroundColor: "white",
                          borderWidth: 1,
                          borderColor: "#2563EB",
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "700", color: "#2563EB" }}>{ws.name}</Text>
                        <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{ws.startTime} ~ {ws.endTime}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Shifts */}
            {shifts.map((shift, i) => (
              <View key={i} style={{
                backgroundColor: "white",
                borderRadius: 12,
                padding: 14,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: "#E2E8F0",
              }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <TextInput
                    value={shift.label}
                    onChangeText={(v) => updateShift(i, "label", v)}
                    style={{ fontSize: 15, fontWeight: "700", color: "#1E293B", flex: 1 }}
                    returnKeyType="done"
                  />
                  {shifts.length > 1 && (
                    <TouchableOpacity onPress={() => removeShift(i)}>
                      <Text style={{ color: "#EF4444", fontSize: 13, fontWeight: "500" }}>移除</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>上班時間</Text>
                    <TextInput
                      value={shift.startTime}
                      onChangeText={(v) => updateShift(i, "startTime", v)}
                      placeholder="09:00"
                      returnKeyType="next"
                      style={{
                        backgroundColor: "#F8FAFC",
                        borderWidth: 1,
                        borderColor: "#E2E8F0",
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 9,
                        fontSize: 15,
                        color: "#1E293B",
                        textAlign: "center",
                      }}
                    />
                  </View>
                  <View style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 10 }}>
                    <Text style={{ color: "#94A3B8", fontSize: 16 }}>→</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>下班時間</Text>
                    <TextInput
                      value={shift.endTime}
                      onChangeText={(v) => updateShift(i, "endTime", v)}
                      placeholder="18:00"
                      returnKeyType="done"
                      style={{
                        backgroundColor: "#F8FAFC",
                        borderWidth: 1,
                        borderColor: "#E2E8F0",
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 9,
                        fontSize: 15,
                        color: "#1E293B",
                        textAlign: "center",
                      }}
                    />
                  </View>
                </View>
              </View>
            ))}

            <TouchableOpacity
              onPress={addShift}
              style={{
                borderWidth: 1.5,
                borderColor: "#2563EB",
                borderStyle: "dashed",
                borderRadius: 12,
                padding: 14,
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <Text style={{ color: "#2563EB", fontSize: 14, fontWeight: "600" }}>+ 新增班次</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
