import { useState, useMemo, useCallback, useRef } from "react";
import { View, Text, ScrollView, TouchableOpacity, Platform, Modal } from "react-native";
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

const LEAVE_LABELS: Record<string, { label: string; color: string }> = {
  annual:       { label: "特休", color: "#2563EB" },
  sick:         { label: "病假", color: "#DC2626" },
  personal:     { label: "事假", color: "#D97706" },
  marriage:     { label: "婚假", color: "#7C3AED" },
  bereavement:  { label: "喪假", color: "#475569" },
  official:     { label: "公假", color: "#0891B2" },
  other:        { label: "休假", color: "#64748B" },
};

const TAG_COLORS: Record<string, string> = {
  indoor: "#2563EB",
  outdoor: "#16A34A",
  supervisor: "#D97706",
};
const TAG_LABELS: Record<string, string> = {
  indoor: "內場",
  outdoor: "外場",
  supervisor: "幹部",
};

type ScheduleEntry = {
  shifts: Array<{ startTime: string; endTime: string; label: string }>;
  leaveType?: string | null;
};

function buildPrintHTML(
  year: number,
  month: number,
  activeEmployees: Array<{ id: number; fullName: string; tag?: string | null }>,
  scheduleMap: Record<string, Record<number, ScheduleEntry>>,
  todayStr: string,
): string {
  const daysCount = getDaysInMonth(year, month);
  const days = Array.from({ length: daysCount }, (_, i) => i + 1);
  const monthStr = String(month + 1).padStart(2, "0");

  const headerCells = days.map(d => {
    const dateStr = `${year}-${monthStr}-${String(d).padStart(2, "0")}`;
    const dow = new Date(year, month, d).getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isToday = dateStr === todayStr;
    const dowLabel = ["日","一","二","三","四","五","六"][dow];
    const bg = isToday ? "#2563EB" : isWeekend ? "#475569" : "#1E293B";
    return `<th style="background:${bg};color:#fff;text-align:center;font-size:8pt;font-weight:600;padding:4px 2px;border:1px solid #CBD5E1;">${d}<span style="display:block;font-size:7pt;opacity:0.8;">${dowLabel}</span></th>`;
  }).join("");

  const empRows = activeEmployees.map(emp => {
    const tagColor = TAG_COLORS[emp.tag ?? ""] ?? "#94A3B8";
    const tagLabel = TAG_LABELS[emp.tag ?? ""] ?? "";
    const cells = days.map(d => {
      const dateStr = `${year}-${monthStr}-${String(d).padStart(2, "0")}`;
      const entry = scheduleMap[dateStr]?.[emp.id];
      const dow = new Date(year, month, d).getDay();
      const isWeekend = dow === 0 || dow === 6;
      const isToday = dateStr === todayStr;
      const todayOutline = isToday ? "outline:2px solid #2563EB;outline-offset:-2px;" : "";
      if (isWeekend && !entry) {
        return `<td style="background:#F8FAFC;border:1px solid #CBD5E1;text-align:center;font-size:7pt;color:#CBD5E1;${todayOutline}"></td>`;
      }
      if (entry?.leaveType) {
        const lv = LEAVE_LABELS[entry.leaveType];
        const lvLabel = lv?.label ?? "假";
        const lvColor = lv?.color ?? "#64748B";
        const lvBg = lvColor + "22";
        return `<td style="background:${lvBg};border:1px solid #CBD5E1;text-align:center;font-size:7pt;${todayOutline}"><span style="font-weight:700;color:${lvColor};font-size:7pt;">${lvLabel}</span></td>`;
      }
      if (entry?.shifts && entry.shifts.length > 0) {
        const shiftLines = entry.shifts.map(s =>
          `<span style="display:block;font-weight:600;color:#1D4ED8;font-size:7pt;line-height:1.4;">${s.startTime}<br/>${s.endTime}</span>`
        ).join("");
        return `<td style="background:#EFF6FF;border:1px solid #CBD5E1;text-align:center;vertical-align:top;padding:3px 2px;${todayOutline}">${shiftLines}</td>`;
      }
      return `<td style="border:1px solid #CBD5E1;${todayOutline}"></td>`;
    }).join("");
    return `<tr>
      <td style="width:52px;text-align:center;font-weight:600;background:#F8FAFC;font-size:8pt;border:1px solid #CBD5E1;padding:3px 4px;">
        ${emp.fullName}<br/><span style="font-size:6.5pt;color:${tagColor};">${tagLabel}</span>
      </td>${cells}
    </tr>`;
  }).join("");

  const statCells = days.map(d => {
    const dateStr = `${year}-${monthStr}-${String(d).padStart(2, "0")}`;
    const dayMap = scheduleMap[dateStr] ?? {};
    const dow = new Date(year, month, d).getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isToday = dateStr === todayStr;
    const todayOutline = isToday ? "outline:2px solid #2563EB;outline-offset:-2px;" : "";
    const count = Object.values(dayMap).filter(e => e.shifts && e.shifts.length > 0).length;
    const indoorCount = activeEmployees.filter(e => e.tag === "indoor" && (dayMap[e.id]?.shifts?.length ?? 0) > 0).length;
    const outdoorCount = activeEmployees.filter(e => e.tag === "outdoor" && (dayMap[e.id]?.shifts?.length ?? 0) > 0).length;
    if (isWeekend && count === 0) {
      return `<td colspan="3" style="background:#F1F5F9;text-align:center;font-size:7.5pt;font-weight:600;color:#94A3B8;border:1px solid #CBD5E1;${todayOutline}">—</td>`;
    }
    return `<td style="background:#F1F5F9;text-align:center;font-size:7.5pt;font-weight:700;color:#334155;border:1px solid #CBD5E1;${todayOutline}">${count}</td><td style="background:#EFF6FF;text-align:center;font-size:7.5pt;font-weight:700;color:#2563EB;border:1px solid #CBD5E1;">${indoorCount}</td><td style="background:#F0FDF4;text-align:center;font-size:7.5pt;font-weight:700;color:#16A34A;border:1px solid #CBD5E1;">${outdoorCount}</td>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>${year}年${month + 1}月排班表</title>
<style>
@page { size: A4 landscape; margin: 8mm 6mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "PingFang TC","Microsoft JhengHei",sans-serif; background:#fff; color:#1E293B; font-size:9pt; }
.header { display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #1E293B; padding-bottom:5px; margin-bottom:8px; }
.header-title { font-size:13pt; font-weight:700; }
.header-meta { font-size:8pt; color:#64748B; }
table { width:100%; border-collapse:collapse; table-layout:fixed; }
th.name-col, td.name-col { width:52px; }
.legend { display:flex; gap:14px; margin-top:6px; font-size:7.5pt; color:#64748B; align-items:center; flex-wrap:wrap; }
.legend-box { width:11px; height:11px; border-radius:2px; border:1px solid #CBD5E1; display:inline-block; margin-right:3px; vertical-align:middle; }
.stat-label { background:#E2E8F0; text-align:center; font-size:7.5pt; font-weight:700; color:#334155; border:1px solid #CBD5E1; padding:3px 2px; }
@media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="header-title">${year} 年 ${month + 1} 月排班表</div>
    <div class="header-meta">列印時間：${new Date().toLocaleDateString("zh-TW")}　共 ${activeEmployees.length} 位員工</div>
  </div>
  <div class="header-meta" style="text-align:right;">
    <span style="color:#2563EB;">■</span> 內場　<span style="color:#16A34A;">■</span> 外場　<span style="color:#D97706;">■</span> 幹部<br/>
    橫向 A4 / 底部統計：總人數 / 內場 / 外場
  </div>
</div>
<table>
  <thead>
    <tr>
      <th class="name-col" style="background:#1E293B;color:#fff;text-align:center;font-size:8pt;font-weight:600;padding:4px 2px;border:1px solid #CBD5E1;">員工</th>
      ${headerCells}
    </tr>
  </thead>
  <tbody>
    ${empRows}
    <tr>
      <td class="stat-label">上班<br/>內場<br/>外場</td>
      ${statCells}
    </tr>
  </tbody>
</table>
<div class="legend">
  <span><span class="legend-box" style="background:#EFF6FF;"></span>正常上班</span>
  <span><span class="legend-box" style="background:#DBEAFE22;border-color:#2563EB;"></span>特休</span>
  <span><span class="legend-box" style="background:#FEE2E222;border-color:#DC2626;"></span>病假</span>
  <span><span class="legend-box" style="background:#FEF3C722;border-color:#D97706;"></span>事假</span>
  <span><span class="legend-box" style="background:#F8FAFC;"></span>休假日（六日）</span>
  <span><span class="legend-box" style="outline:2px solid #2563EB;outline-offset:-2px;"></span>今日</span>
</div>
</body>
</html>`;
}

export default function ScheduleOverview() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = getDaysInMonth(year, month);
  const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const { data: allSchedules } = trpc.schedules.getWeekAll.useQuery({ startDate, endDate });
  const { data: allEmployees } = trpc.employees.list.useQuery();

  const activeEmployees = useMemo(
    () => (allEmployees?.filter((e) => e.isActive) ?? []) as Array<{ id: number; fullName: string; isActive: boolean; tag?: string | null }>,
    [allEmployees]
  );

  const scheduleMap = useMemo(() => {
    const map: Record<string, Record<number, ScheduleEntry>> = {};
    for (const s of (allSchedules ?? []) as Array<{ date: string | Date; employeeId: number; shifts: unknown; leaveType?: string | null }>) {
      const dateStr = typeof s.date === "string" ? s.date.slice(0, 10) : new Date(s.date as Date).toISOString().slice(0, 10);
      if (!map[dateStr]) map[dateStr] = {};
      map[dateStr][s.employeeId] = {
        shifts: s.shifts as Array<{ startTime: string; endTime: string; label: string }>,
        leaveType: s.leaveType,
      };
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

  const todayStr = today.toISOString().slice(0, 10);
  const daysInMonth = getDaysInMonth(year, month);
  const firstDow = getFirstDayOfWeek(year, month);

  const calendarCells: Array<{ day: number | null; dateStr: string | null }> = [];
  for (let i = 0; i < firstDow; i++) calendarCells.push({ day: null, dateStr: null });
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push({ day: d, dateStr: formatDate(year, month, d) });
  while (calendarCells.length % 7 !== 0) calendarCells.push({ day: null, dateStr: null });

  const selectedDaySchedules = selectedDate ? scheduleMap[selectedDate] ?? {} : {};
  const filteredEmployees = activeEmployees.filter(e => selectedEmployeeId === null || e.id === selectedEmployeeId);

  // ── 列印預覽 ──────────────────────────────────────────────────────────
  const printHTML = useMemo(() => {
    if (!showPrintPreview) return "";
    return buildPrintHTML(year, month, activeEmployees, scheduleMap, todayStr);
  }, [showPrintPreview, year, month, activeEmployees, scheduleMap, todayStr]);

  const handleOpenPreview = useCallback(() => {
    setShowPrintPreview(true);
  }, []);

  const handleConfirmPrint = useCallback(() => {
    if (Platform.OS !== "web") return;
    // Open a new window with the HTML and trigger print
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(printHTML.replace("</body>", "<script>window.onload=function(){window.print();}<\/script></body>"));
    printWindow.document.close();
  }, [printHTML]);
  // ─────────────────────────────────────────────────────────────────────

  return (
    <ScreenContainer containerClassName="bg-[#F1F5F9]">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <AdminHeader title="排班總覽" subtitle={`${year} 年 ${month + 1} 月`} />

        {/* 列印按鈕列 */}
        {Platform.OS === "web" && (
          <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, flexDirection: "row", justifyContent: "flex-end" }}>
            <TouchableOpacity
              onPress={handleOpenPreview}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#2563EB", paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 }}
            >
              <Text style={{ fontSize: 13, color: "white", fontWeight: "600" }}>🖨 預覽並列印</Text>
            </TouchableOpacity>
          </View>
        )}

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
                  const entry = selectedDaySchedules[emp.id];
                  const shifts = entry?.shifts;
                  const hasShift = shifts && shifts.length > 0;
                  return (
                    <View key={emp.id} style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < filteredEmployees.length - 1 ? 1 : 0, borderBottomColor: "#F8FAFC", flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: hasShift ? "#EFF6FF" : "#F8FAFC", alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: hasShift ? "#2563EB" : "#CBD5E1" }}>{emp.fullName[0]}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: hasShift ? "#1E293B" : "#94A3B8" }}>{emp.fullName}</Text>
                        {hasShift ? (
                          <View style={{ gap: 2, marginTop: 2 }}>
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
                const empEntries = Object.values(scheduleMap).map(dayMap => dayMap[emp.id]).filter(Boolean);
                const scheduledDays = empEntries.filter(e => e.shifts && e.shifts.length > 0).length;
                const leaveCounts: Record<string, number> = {};
                for (const entry of empEntries) {
                  if (entry.leaveType) {
                    leaveCounts[entry.leaveType] = (leaveCounts[entry.leaveType] ?? 0) + 1;
                  }
                }
                const leaveEntries = Object.entries(leaveCounts);
                return (
                  <View key={emp.id} style={{ paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: i < activeEmployees.length - 1 ? 1 : 0, borderBottomColor: "#F8FAFC" }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: "#2563EB" }}>{emp.fullName[0]}</Text>
                      </View>
                      <Text style={{ flex: 1, fontSize: 14, color: "#1E293B", fontWeight: "500" }}>{emp.fullName}</Text>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ fontSize: 16, fontWeight: "700", color: scheduledDays > 0 ? "#2563EB" : "#94A3B8" }}>{scheduledDays}</Text>
                        <Text style={{ fontSize: 10, color: "#94A3B8" }}>天</Text>
                      </View>
                    </View>
                    {leaveEntries.length > 0 && (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6, marginLeft: 42 }}>
                        {leaveEntries.map(([type, count]) => {
                          const info = LEAVE_LABELS[type];
                          if (!info) return null;
                          return (
                            <View key={type} style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#F8FAFC", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "#E2E8F0" }}>
                              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: info.color, marginRight: 4 }} />
                              <Text style={{ fontSize: 11, color: info.color, fontWeight: "600" }}>{info.label} {count}天</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>

        </View>
      </ScrollView>

      {/* ── 列印預覽 Modal ── */}
      {Platform.OS === "web" && showPrintPreview && (
        <Modal
          visible={showPrintPreview}
          animationType="slide"
          onRequestClose={() => setShowPrintPreview(false)}
        >
          <View style={{ flex: 1, backgroundColor: "#1E293B" }}>
            {/* Preview Toolbar */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#0F172A" }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "white" }}>
                📄 {year} 年 {month + 1} 月排班表預覽
              </Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  onPress={handleConfirmPrint}
                  style={{ backgroundColor: "#2563EB", paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>🖨 確認列印</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowPrintPreview(false)}
                  style={{ backgroundColor: "#475569", paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 }}
                >
                  <Text style={{ color: "white", fontWeight: "600", fontSize: 14 }}>✕ 關閉</Text>
                </TouchableOpacity>
              </View>
            </View>
            {/* iframe preview */}
            <View style={{ flex: 1, margin: 12, borderRadius: 8, overflow: "hidden", backgroundColor: "white" }}>
              {/* @ts-ignore – iframe is web-only */}
              <iframe
                ref={iframeRef}
                srcDoc={printHTML}
                style={{ width: "100%", height: "100%", border: "none" }}
                title="列印預覽"
              />
            </View>
            <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              <Text style={{ fontSize: 11, color: "#64748B", textAlign: "center" }}>
                預覽使用實際資料庫資料 · 點擊「確認列印」開啟系統列印對話框
              </Text>
            </View>
          </View>
        </Modal>
      )}
    </ScreenContainer>
  );
}
