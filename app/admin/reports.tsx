import { useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { AdminHeader } from "@/components/admin-header";
import { trpc } from "@/lib/trpc";

function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export default function ReportsScreen() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [refreshing, setRefreshing] = useState(false);

  const { start, end } = getMonthRange(year, month);
  const { data: allEmployees } = trpc.employees.list.useQuery();
  const { data: attendanceRecords, refetch, isLoading } = trpc.attendance.getAll.useQuery({ startDate: start, endDate: end });
  const { data: leaveRequests } = trpc.leave.getAll.useQuery({ status: "approved" });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  // Calculate stats per employee
  const activeEmployees = allEmployees?.filter(e => e.isActive) ?? [];
  const records = attendanceRecords ?? [];

  const employeeStats = activeEmployees.map(emp => {
    const empRecords = records.filter(r => r.employeeId === emp.id);
    const presentDays = empRecords.filter(r => r.clockInTime).length;
    const lateDays = empRecords.filter(r => r.status === "late").length;
    const absentDays = empRecords.filter(r => !r.clockInTime).length;
    const empLeave = leaveRequests?.filter(l => {
      const lStart = new Date(l.startDate);
      const lEnd = new Date(l.endDate);
      const mStart = new Date(start);
      const mEnd = new Date(end);
      return l.employeeId === emp.id && lStart <= mEnd && lEnd >= mStart;
    }) ?? [];

    return {
      id: emp.id,
      name: emp.fullName,
      jobTitle: emp.jobTitle ?? emp.role,
      presentDays,
      lateDays,
      absentDays,
      leaveDays: empLeave.length,
    };
  });

  const totalPresent = records.filter(r => r.clockInTime).length;
  const totalLate = records.filter(r => r.status === "late").length;

  return (
    <ScreenContainer containerClassName="bg-[#F1F5F9]">
      <AdminHeader title="報表統計" subtitle={`${year} 年 ${month} 月`} />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Month Selector */}
        <View style={{
          backgroundColor: "white",
          borderRadius: 12,
          padding: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderWidth: 1,
          borderColor: "#F1F5F9",
        }}>
          <TouchableOpacity
            onPress={prevMonth}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 16, color: "#475569" }}>‹</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: "700", color: "#1E293B" }}>
            {year} 年 {month} 月
          </Text>
          <TouchableOpacity
            onPress={nextMonth}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 16, color: "#475569" }}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Summary Cards */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#F1F5F9" }}>
            <Text style={{ fontSize: 24, fontWeight: "700", color: "#2563EB" }}>{activeEmployees.length}</Text>
            <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>在職員工</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#F1F5F9" }}>
            <Text style={{ fontSize: 24, fontWeight: "700", color: "#16A34A" }}>{totalPresent}</Text>
            <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>本月出勤次數</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#F1F5F9" }}>
            <Text style={{ fontSize: 24, fontWeight: "700", color: "#D97706" }}>{totalLate}</Text>
            <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>本月遲到次數</Text>
          </View>
        </View>

        {/* Employee Table */}
        <View style={{ backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#F1F5F9", overflow: "hidden" }}>
          {/* Table Header */}
          <View style={{ flexDirection: "row", backgroundColor: "#F8FAFC", paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
            <Text style={{ flex: 2, fontSize: 12, fontWeight: "600", color: "#64748B" }}>員工</Text>
            <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: "#64748B", textAlign: "center" }}>出勤</Text>
            <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: "#64748B", textAlign: "center" }}>遲到</Text>
            <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: "#64748B", textAlign: "center" }}>請假</Text>
          </View>

          {isLoading ? (
            <View style={{ padding: 24, alignItems: "center" }}>
              <ActivityIndicator size="small" color="#2563EB" />
            </View>
          ) : employeeStats.length === 0 ? (
            <View style={{ padding: 24, alignItems: "center" }}>
              <Text style={{ color: "#94A3B8", fontSize: 14 }}>無員工資料</Text>
            </View>
          ) : (
            employeeStats.map((emp, idx) => (
              <View
                key={emp.id}
                style={{
                  flexDirection: "row",
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderBottomWidth: idx < employeeStats.length - 1 ? 1 : 0,
                  borderBottomColor: "#F1F5F9",
                  alignItems: "center",
                }}
              >
                <View style={{ flex: 2 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#1E293B" }}>{emp.name}</Text>
                  <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{emp.jobTitle}</Text>
                </View>
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#16A34A" }}>{emp.presentDays}</Text>
                  <Text style={{ fontSize: 10, color: "#94A3B8" }}>天</Text>
                </View>
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: emp.lateDays > 0 ? "#D97706" : "#94A3B8" }}>{emp.lateDays}</Text>
                  <Text style={{ fontSize: 10, color: "#94A3B8" }}>次</Text>
                </View>
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: emp.leaveDays > 0 ? "#2563EB" : "#94A3B8" }}>{emp.leaveDays}</Text>
                  <Text style={{ fontSize: 10, color: "#94A3B8" }}>天</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
