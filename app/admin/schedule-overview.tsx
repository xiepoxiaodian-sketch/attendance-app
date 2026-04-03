import { useState, useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { AdminHeader } from "@/components/admin-header";
import { trpc } from "@/lib/trpc";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
function formatDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function ScheduleOverview() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);

  const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = getDaysInMonth(year, month);
  const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const { data: allSchedules } = trpc.schedules.getWeekAll.useQuery({ startDate, endDate });
  const { data: allEmployees } = trpc.employees.list.useQuery();

  const activeEmployees = useMemo(() => allEmployees?.filter((e) => e.isActive) ?? [], [allEmployees]);

  const scheduleMap = useMemo(() => {
    const map: Record<string, Record<number, Array<{ startTime: string; endTime: string; label: string }>>> = {};
    for (const s of (allSchedules ?? []) as Array<{ date: string | Date; employeeId: number; shifts: unknown }>) {
      const dateStr = typeof s.date === "string" ? s.date.slice(0, 10) : new Date(s.date as Date).toISOString().slice(0, 10);
      if (!map[dateStr]) map[dateStr] = {};
      map[dateStr][s.employeeId] = s.shifts as Array<{ startTime: string; endTime: string; label: string }>;
    }
    return map;
  }, [allSchedules]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1);
    setSelectedDate(null);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1);
    setSelectedDate(null);
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDow = getFirstDayOfWeek(year, month);
  const todayStr = today.toISOString().slice(0, 10);

  const calendarCells: Array<{ day: number | null; dateStr: string | null }> = [];
  for (let i = 0; i < firstDow; i++) calendarCells.push({ day: null, dateStr: null });
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push({ day: d, dateStr: formatDate(year, month, d) });
  while (calendarCells.length % 7 !== 0) calendarCells.push({ day: null, dateStr: null });

  const selectedDaySchedules = selectedDate ? scheduleMap[selectedDate] ?? {} : {};
  const filteredEmployees = activeEmployees.filter(e => selectedEmployeeId === null || e.id === selectedEmployeeId);

  return (
    <ScreenContainer containerClassName="bg-[#F1F5F9]">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <AdminHeader title="排班總覽" subtitle={`${year} 年 ${month + 1} 月`} />
        <View style={{ padding: 14, gap: 12 }}>

          {/* Calendar Card */}
          <View style={{ backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
              <TouchableOpacity onPress={prevMonth} style={{ padding: 8 }}>
                <Text style={{ fontSize: 20, color: "#2563EB" }}>‹</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#1E293B" }}>{year} 年 {month + 1} 月</Text>
              <TouchableOpacity onPress={nextMonth} style={{ padding: 8 }}>
                <Text style={{ fontSize: 20, color: "#2563EB" }}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", paddingHorizontal: 8, paddingTop: 10, paddingBottom: 4 }}>
              {WEEKDAYS.map((d, i) => (
                <View key={d} style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: i === 0 || i === 6 ? "#EF4444" : "#94A3B8" }}>{d}</Text>
                </View>
              ))}
            </View>

            <View style={{ paddingHorizontal: 8, paddingBottom: 12 }}>
              {Array.from({ length: calendarCells.length / 7 }, (_, row) => (
                <View key={row} style={{ flexDirection: "row", marginBottom: 2 }}>
                  {calendarCells.slice(row * 7, row * 7 + 7).map((cell, col) => {
                    if (!cell.day || !cell.dateStr) return <View key={col} style={{ flex: 1, height: 54 }} />;
                    const isToday = cell.dateStr === todayStr;
                    const isSelected = cell.dateStr === selectedDate;
                    const daySchedules = scheduleMap[cell.dateStr] ?? {};
                    const scheduledCount = Object.keys(daySchedules).length;
                    const dow = (firstDow + cell.day - 1) % 7;
                    const isWeekend = dow === 0 || dow === 6;
                    return (
                      <TouchableOpacity
                        key={col}
                        onPress={() => setSelectedDate(isSelected ? null : cell.dateStr!)}
                        style={{
                          flex: 1, height: 54, alignItems: "center", paddingTop: 6,
                          borderRadius: 8, marginHorizontal: 1,
                          backgroundColor: isSelected ? "#DBEAFE" : "transparent",
                          borderWidth: isSelected ? 1.5 : 0,
                          borderColor: isSelected ? "#2563EB" : "transparent",
                        }}
                      >
                        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: isToday ? "#2563EB" : "transparent", alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 13, fontWeight: isToday || isSelected ? "700" : "400", color: isToday ? "white" : isWeekend ? "#EF4444" : "#1E293B" }}>
                            {cell.day}
                          </Text>
                        </View>
                        {scheduledCount > 0 && (
                          <View style={{ marginTop: 2, backgroundColor: "#BFDBFE", borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 9, color: "#1D4ED8", fontWeight: "600" }}>{scheduledCount}人</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>

          {/* Legend */}
          <View style={{ flexDirection: "row", gap: 16, paddingHorizontal: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 9, color: "white", fontWeight: "700" }}>今</Text>
              </View>
              <Text style={{ fontSize: 12, color: "#64748B" }}>今日</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ backgroundColor: "#BFDBFE", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, color: "#1D4ED8", fontWeight: "600" }}>N人</Text>
              </View>
              <Text style={{ fontSize: 12, color: "#64748B" }}>已排班人數，點擊查看明細</Text>
            </View>
          </View>

          {/* Selected Date Detail */}
          {selectedDate && (
            <View style={{ backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" }}>
              <View style={{ paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#1E293B" }}>
                  {selectedDate.replace(/-/g, " / ")} 排班明細
                </Text>
                <TouchableOpacity onPress={() => setSelectedDate(null)}>
                  <Text style={{ fontSize: 20, color: "#94A3B8" }}>×</Text>
                </TouchableOpacity>
              </View>

              {/* Employee filter chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
                <View style={{ flexDirection: "row", padding: 10, gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setSelectedEmployeeId(null)}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: selectedEmployeeId === null ? "#2563EB" : "#F1F5F9" }}
                  >
                    <Text style={{ fontSize: 12, color: selectedEmployeeId === null ? "white" : "#64748B", fontWeight: "600" }}>全部</Text>
                  </TouchableOpacity>
                  {activeEmployees.map((emp) => (
                    <TouchableOpacity
                      key={emp.id}
                      onPress={() => setSelectedEmployeeId(emp.id === selectedEmployeeId ? null : emp.id)}
                      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: selectedEmployeeId === emp.id ? "#2563EB" : "#F1F5F9" }}
                    >
                      <Text style={{ fontSize: 12, color: selectedEmployeeId === emp.id ? "white" : "#64748B", fontWeight: "600" }}>{emp.fullName}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {filteredEmployees.length === 0 ? (
                <View style={{ paddingVertical: 32, alignItems: "center" }}>
                  <Text style={{ fontSize: 13, color: "#94A3B8" }}>今日尚無排班</Text>
                </View>
              ) : (
                filteredEmployees.map((emp, i) => {
                  const shifts = selectedDaySchedules[emp.id];
                  const hasShift = shifts && shifts.length > 0;
                  return (
                    <View key={emp.id} style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < filteredEmployees.length - 1 ? 1 : 0, borderBottomColor: "#F8FAFC", flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: hasShift ? "#EFF6FF" : "#F8FAFC", alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: hasShift ? "#2563EB" : "#CBD5E1" }}>{emp.fullName[0]}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: hasShift ? "#1E293B" : "#94A3B8" }}>{emp.fullName}</Text>
                        {hasShift ? (
                          <View style={{ marginTop: 3, gap: 2 }}>
                            {shifts.map((shift, si) => (
                              <View key={si} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#2563EB" }} />
                                <Text style={{ fontSize: 12, color: "#475569" }}>
                                  {shift.label ? `${shift.label}  ` : ""}{shift.startTime} – {shift.endTime}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : (
                          <Text style={{ fontSize: 12, color: "#CBD5E1", marginTop: 2 }}>未排班</Text>
                        )}
                      </View>
                      <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: hasShift ? "#DCFCE7" : "#F1F5F9" }}>
                        <Text style={{ fontSize: 11, fontWeight: "600", color: hasShift ? "#16A34A" : "#94A3B8" }}>{hasShift ? "已排班" : "休假"}</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* Monthly summary */}
          <View style={{ backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" }}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#1E293B" }}>本月排班統計</Text>
            </View>
            {activeEmployees.length === 0 ? (
              <View style={{ paddingVertical: 24, alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: "#94A3B8" }}>尚無員工資料</Text>
              </View>
            ) : (
              activeEmployees.map((emp, i) => {
                const scheduledDays = Object.values(scheduleMap).filter(dayMap => dayMap[emp.id] && dayMap[emp.id].length > 0).length;
                return (
                  <View key={emp.id} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: i < activeEmployees.length - 1 ? 1 : 0, borderBottomColor: "#F8FAFC" }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: "#2563EB" }}>{emp.fullName[0]}</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, color: "#1E293B", fontWeight: "500" }}>{emp.fullName}</Text>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: scheduledDays > 0 ? "#2563EB" : "#94A3B8" }}>{scheduledDays}</Text>
                      <Text style={{ fontSize: 10, color: "#94A3B8" }}>天</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>

        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
