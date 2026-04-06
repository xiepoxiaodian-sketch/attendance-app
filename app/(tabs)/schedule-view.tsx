import { useState, useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useEmployeeAuth } from "@/lib/employee-auth";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDow(y: number, m: number) { return new Date(y, m, 1).getDay(); }
function fmtDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

type ShiftEntry = { startTime: string; endTime: string; label: string };

const LEAVE_TYPES: Record<string, { label: string; color: string; bg: string }> = {
  annual:      { label: "特休", color: "#2563EB", bg: "#EFF6FF" },
  sick:        { label: "病假", color: "#DC2626", bg: "#FEF2F2" },
  personal:    { label: "事假", color: "#D97706", bg: "#FFFBEB" },
  marriage:    { label: "婚假", color: "#7C3AED", bg: "#F5F3FF" },
  bereavement: { label: "喪假", color: "#475569", bg: "#F8FAFC" },
  official:    { label: "公假", color: "#0891B2", bg: "#ECFEFF" },
  other:       { label: "休假", color: "#64748B", bg: "#F1F5F9" },
};

export default function ScheduleViewScreen() {
  // Use Taiwan timezone (UTC+8) for today
  const todayTW = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const [year, setYear] = useState(todayTW.getUTCFullYear());
  const [month, setMonth] = useState(todayTW.getUTCMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { employee } = useEmployeeAuth();

  const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = getDaysInMonth(year, month);
  const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const { data: schedules, isLoading } = trpc.schedules.getByEmployee.useQuery(
    { employeeId: employee?.id ?? 0, startDate, endDate },
    { enabled: !!employee?.id }
  );

  const scheduleMap = useMemo(() => {
    const map: Record<string, { shifts: ShiftEntry[]; leaveType?: string | null; leaveMode?: string | null; leaveStart?: string | null; leaveEnd?: string | null; leaveDuration?: string | number | null }> = {};
    for (const s of (schedules ?? []) as Array<{ date: string | Date; shifts: unknown; leaveType?: string | null; leaveMode?: string | null; leaveStart?: string | null; leaveEnd?: string | null; leaveDuration?: string | number | null }>) {
      const dateStr = typeof s.date === "string" ? s.date.slice(0, 10) : new Date(s.date as Date).toISOString().slice(0, 10);
      map[dateStr] = { shifts: s.shifts as ShiftEntry[], leaveType: s.leaveType, leaveMode: s.leaveMode, leaveStart: s.leaveStart, leaveEnd: s.leaveEnd, leaveDuration: s.leaveDuration };
    }
    return map;
  }, [schedules]);

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); setSelectedDate(null); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); setSelectedDate(null); };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDow = getFirstDow(year, month);
  const todayStr = todayTW.toISOString().slice(0, 10);

  const calendarCells: Array<{ day: number | null; dateStr: string | null }> = [];
  for (let i = 0; i < firstDow; i++) calendarCells.push({ day: null, dateStr: null });
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push({ day: d, dateStr: fmtDate(year, month, d) });
  while (calendarCells.length % 7 !== 0) calendarCells.push({ day: null, dateStr: null });

  // Monthly stats
  const totalScheduled = Object.values(scheduleMap).filter(s => s.shifts?.length > 0).length;
  const totalLeave = Object.values(scheduleMap).filter(s => s.leaveType).length;

  const selectedDayData = selectedDate ? scheduleMap[selectedDate] : null;
  const selectedLeaveInfo = selectedDayData?.leaveType ? LEAVE_TYPES[selectedDayData.leaveType] : null;

  return (
    <ScreenContainer containerClassName="bg-[#F1F5F9]">
      {/* Header */}
      <View style={{ backgroundColor: "#1E3A8A", paddingTop: 4, paddingBottom: 14, paddingHorizontal: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: "800", color: "white" }}>我的排班</Text>
        <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>查看當月班表與請假紀錄</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, paddingBottom: 32, gap: 12 }}>
        {/* Monthly Stats */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0", alignItems: "center" }}>
            <Text style={{ fontSize: 28, fontWeight: "800", color: "#2563EB" }}>{totalScheduled}</Text>
            <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>排班天數</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0", alignItems: "center" }}>
            <Text style={{ fontSize: 28, fontWeight: "800", color: "#DC2626" }}>{totalLeave}</Text>
            <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>請假天數</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0", alignItems: "center" }}>
            <Text style={{ fontSize: 28, fontWeight: "800", color: "#16A34A" }}>{totalScheduled - totalLeave}</Text>
            <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>實際出勤</Text>
          </View>
        </View>

        {/* Calendar Card */}
        <View style={{ backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" }}>
          {/* Month Navigation */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
            <TouchableOpacity onPress={prevMonth} style={{ padding: 8 }}>
              <Text style={{ fontSize: 22, color: "#2563EB" }}>‹</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#1E293B" }}>{year} 年 {month + 1} 月</Text>
            <TouchableOpacity onPress={nextMonth} style={{ padding: 8 }}>
              <Text style={{ fontSize: 22, color: "#2563EB" }}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Weekday Headers */}
          <View style={{ flexDirection: "row", paddingHorizontal: 8, paddingTop: 10, paddingBottom: 4 }}>
            {WEEKDAYS.map((d, i) => (
              <View key={d} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: i === 0 || i === 6 ? "#EF4444" : "#94A3B8" }}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Calendar Grid */}
          {isLoading ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator size="large" color="#2563EB" />
            </View>
          ) : (
            <View style={{ paddingHorizontal: 8, paddingBottom: 12 }}>
              {Array.from({ length: calendarCells.length / 7 }, (_, row) => (
                <View key={row} style={{ flexDirection: "row", marginBottom: 4 }}>
                  {calendarCells.slice(row * 7, row * 7 + 7).map((cell, col) => {
                    if (!cell.day || !cell.dateStr) return <View key={col} style={{ flex: 1, height: 68 }} />;
                    const isToday = cell.dateStr === todayStr;
                    const isSelected = cell.dateStr === selectedDate;
                    const dayData = scheduleMap[cell.dateStr];
                    const hasShift = dayData?.shifts?.length > 0;
                    const leaveInfo = dayData?.leaveType ? LEAVE_TYPES[dayData.leaveType] : null;
                    const dow = (firstDow + cell.day - 1) % 7;
                    const isWeekend = dow === 0 || dow === 6;
                    return (
                      <TouchableOpacity
                        key={col}
                        onPress={() => setSelectedDate(isSelected ? null : cell.dateStr!)}
                        style={{
                          flex: 1, height: 68, alignItems: "center", paddingTop: 6, borderRadius: 10, marginHorizontal: 1,
                          backgroundColor: isSelected ? "#DBEAFE" : leaveInfo ? leaveInfo.bg : hasShift ? "#F0FDF4" : "transparent",
                          borderWidth: isSelected ? 1.5 : isToday ? 1.5 : 0,
                          borderColor: isSelected ? "#2563EB" : isToday ? "#93C5FD" : "transparent",
                        }}
                      >
                        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: isToday ? "#2563EB" : "transparent", alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 13, fontWeight: isToday || isSelected ? "700" : "400", color: isToday ? "white" : isWeekend ? "#EF4444" : "#1E293B" }}>{cell.day}</Text>
                        </View>
                        {leaveInfo ? (
                          <View style={{ marginTop: 3, backgroundColor: leaveInfo.bg, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1, borderColor: leaveInfo.color + "40" }}>
                            <Text style={{ fontSize: 9, color: leaveInfo.color, fontWeight: "700" }}>{leaveInfo.label}</Text>
                          </View>
                        ) : hasShift ? (
                          <View style={{ marginTop: 3, alignItems: "center" }}>
                            <Text style={{ fontSize: 8, color: "#16A34A", fontWeight: "700", lineHeight: 11 }}>{dayData.shifts[0].startTime}</Text>
                            <Text style={{ fontSize: 8, color: "#16A34A", fontWeight: "700", lineHeight: 11 }}>{dayData.shifts[0].endTime}</Text>
                          </View>
                        ) : (
                          <View style={{ marginTop: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: "transparent" }} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Legend */}
        <View style={{ flexDirection: "row", gap: 16, paddingHorizontal: 4, flexWrap: "wrap" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#16A34A" }} />
            <Text style={{ fontSize: 12, color: "#64748B" }}>已排班</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#DC2626" }} />
            <Text style={{ fontSize: 12, color: "#64748B" }}>請假</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 9, color: "white", fontWeight: "700" }}>今</Text>
            </View>
            <Text style={{ fontSize: 12, color: "#64748B" }}>今日</Text>
          </View>
        </View>

        {/* Selected Date Detail */}
        {selectedDate && (
          <View style={{ backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" }}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#1E293B" }}>
                {selectedDate.replace(/-/g, " / ")}
              </Text>
              <TouchableOpacity onPress={() => setSelectedDate(null)}>
                <Text style={{ fontSize: 20, color: "#94A3B8" }}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16 }}>
              {!selectedDayData || (!selectedDayData.shifts?.length && !selectedDayData.leaveType) ? (
                <View style={{ alignItems: "center", paddingVertical: 20 }}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>📅</Text>
                  <Text style={{ fontSize: 14, color: "#94A3B8" }}>當日尚未排班</Text>
                </View>
              ) : (
                <View style={{ gap: 12 }}>
                  {/* Leave Info */}
                  {selectedLeaveInfo && (
                    <View style={{ backgroundColor: selectedLeaveInfo.bg, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: selectedLeaveInfo.color + "30" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <View style={{ backgroundColor: selectedLeaveInfo.color, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
                          <Text style={{ fontSize: 13, color: "white", fontWeight: "700" }}>{selectedLeaveInfo.label}</Text>
                        </View>
                        <Text style={{ fontSize: 13, color: selectedLeaveInfo.color, fontWeight: "600" }}>
                          {selectedDayData?.leaveMode === "partial" && selectedDayData.leaveDuration
                            ? `${parseFloat(String(selectedDayData.leaveDuration)).toFixed(1)} 小時`
                            : "整天（8 小時）"}
                        </Text>
                      </View>
                      {selectedDayData?.leaveMode === "partial" && selectedDayData.leaveStart && selectedDayData.leaveEnd && (
                        <Text style={{ fontSize: 12, color: selectedLeaveInfo.color }}>
                          請假時段：{selectedDayData.leaveStart} – {selectedDayData.leaveEnd}
                        </Text>
                      )}
                    </View>
                  )}
                  {/* Shift Info */}
                  {selectedDayData?.shifts?.length > 0 && (
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: "#475569", marginBottom: 8 }}>班次資訊</Text>
                      {selectedDayData.shifts.map((shift, i) => (
                        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#F0FDF4", borderRadius: 10, padding: 12, marginBottom: 6 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#16A34A" }} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: "600", color: "#1E293B" }}>{shift.label || `班次 ${i + 1}`}</Text>
                            <Text style={{ fontSize: 13, color: "#16A34A", marginTop: 2 }}>
                              🕐 {shift.startTime} – {shift.endTime}
                            </Text>
                          </View>
                          <View style={{ backgroundColor: "#DCFCE7", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                            <Text style={{ fontSize: 12, color: "#16A34A", fontWeight: "600" }}>
                              {(() => {
                                const [sh, sm] = shift.startTime.split(":").map(Number);
                                const [eh, em] = shift.endTime.split(":").map(Number);
                                const diff = (eh * 60 + em) - (sh * 60 + sm);
                                return diff > 0 ? `${(diff / 60).toFixed(1)}h` : "--";
                              })()}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Upcoming Schedules */}
        <View style={{ backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" }}>
          <View style={{ paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#1E293B" }}>本月班表一覽</Text>
          </View>
          {Object.keys(scheduleMap).length === 0 ? (
            <View style={{ paddingVertical: 32, alignItems: "center" }}>
              <Text style={{ fontSize: 13, color: "#94A3B8" }}>本月尚無排班資料</Text>
            </View>
          ) : (
            Object.entries(scheduleMap)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([dateStr, dayData], i, arr) => {
                const leaveInfo = dayData.leaveType ? LEAVE_TYPES[dayData.leaveType] : null;
                const d = new Date(dateStr);
                const dow = d.getDay();
                const isWeekend = dow === 0 || dow === 6;
                return (
                  <View key={dateStr} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: "#F8FAFC" }}>
                    <View style={{ width: 44, alignItems: "center", marginRight: 12 }}>
                      <Text style={{ fontSize: 20, fontWeight: "800", color: isWeekend ? "#EF4444" : "#1E293B" }}>{d.getDate()}</Text>
                      <Text style={{ fontSize: 10, color: isWeekend ? "#EF4444" : "#94A3B8" }}>{WEEKDAYS[dow]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      {leaveInfo ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <View style={{ backgroundColor: leaveInfo.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Text style={{ fontSize: 12, color: leaveInfo.color, fontWeight: "700" }}>{leaveInfo.label}</Text>
                          </View>
                          <Text style={{ fontSize: 12, color: "#64748B" }}>
                            {dayData.leaveMode === "partial" && dayData.leaveDuration
                              ? `${parseFloat(String(dayData.leaveDuration)).toFixed(1)} 小時`
                              : "整天"}
                          </Text>
                        </View>
                      ) : dayData.shifts?.length > 0 ? (
                        <View style={{ gap: 2 }}>
                          {dayData.shifts.map((shift, si) => (
                            <Text key={si} style={{ fontSize: 13, color: "#1E293B" }}>
                              {shift.label ? `${shift.label}  ` : ""}<Text style={{ color: "#2563EB", fontWeight: "600" }}>{shift.startTime} – {shift.endTime}</Text>
                            </Text>
                          ))}
                        </View>
                      ) : null}
                    </View>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: leaveInfo ? leaveInfo.bg : "#DCFCE7" }}>
                      <Text style={{ fontSize: 11, fontWeight: "600", color: leaveInfo ? leaveInfo.color : "#16A34A" }}>
                        {leaveInfo ? leaveInfo.label : "排班中"}
                      </Text>
                    </View>
                  </View>
                );
              })
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
