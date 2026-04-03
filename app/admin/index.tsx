import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useEmployeeAuth } from "@/lib/employee-auth";
import { trpc } from "@/lib/trpc";

function StatCard({
  icon, label, value, iconBg,
}: {
  icon: string; label: string; value: string | number; iconBg: string;
}) {
  return (
    <View style={{
      flex: 1,
      backgroundColor: "white",
      borderRadius: 12,
      padding: 14,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
      borderWidth: 1,
      borderColor: "#F1F5F9",
    }}>
      <View style={{
        width: 34, height: 34,
        borderRadius: 8,
        backgroundColor: iconBg,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 10,
      }}>
        <Text style={{ fontSize: 16 }}>{icon}</Text>
      </View>
      <Text style={{ fontSize: 22, fontWeight: "700", color: "#1E293B", lineHeight: 26 }}>{value}</Text>
      <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{label}</Text>
    </View>
  );
}

export default function AdminDashboard() {
  const { employee, logout } = useEmployeeAuth();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const { data: summary, refetch: refetchSummary } = trpc.attendance.todaySummary.useQuery();
  const { data: allEmployees } = trpc.employees.list.useQuery();
  const { data: leaveRequests } = trpc.leave.getAll.useQuery({ status: "pending" });
  const { data: todayAttendance, refetch: refetchAttendance } = trpc.attendance.getAll.useQuery({
    startDate: today, endDate: today,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchSummary(), refetchAttendance()]);
    setRefreshing(false);
  }, []);

  const handleLogout = async () => {
    await logout();
    router.replace("/login" as any);
  };

  const totalEmployees = allEmployees?.filter(e => e.isActive).length ?? 0;
  const presentCount = summary?.clockedIn ?? 0;
  const lateCount = summary?.late ?? 0;
  const pendingLeave = leaveRequests?.length ?? 0;

  const todayDateStr = new Date().toLocaleDateString("zh-TW", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <ScreenContainer containerClassName="bg-[#F1F5F9]">
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Page Header */}
        <View style={{
          backgroundColor: "white",
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 14,
          borderBottomWidth: 1,
          borderBottomColor: "#E2E8F0",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <View>
            <Text style={{ fontSize: 20, fontWeight: "700", color: "#1E293B" }}>總覽</Text>
            <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{todayDateStr} · 今日出勤狀況</Text>
          </View>
          <TouchableOpacity
            onPress={handleLogout}
            style={{
              backgroundColor: "#F1F5F9",
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderWidth: 1,
              borderColor: "#E2E8F0",
            }}
          >
            <Text style={{ color: "#64748B", fontSize: 13, fontWeight: "500" }}>登出</Text>
          </TouchableOpacity>
        </View>

        <View style={{ padding: 14, gap: 12 }}>
          {/* Stats Row 1 */}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <StatCard icon="👥" value={`${totalEmployees} 人`} label="在職員工" iconBg="#EFF6FF" />
            <StatCard icon="✅" value={`${presentCount} 人`} label="今日已打卡" iconBg="#F0FDF4" />
          </View>

          {/* Stats Row 2 */}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <StatCard icon="⚠️" value={`${lateCount} 人`} label="今日遲到" iconBg="#FEF2F2" />
            <StatCard icon="📋" value={`${pendingLeave} 件`} label="待審請假" iconBg="#FFFBEB" />
          </View>

          {/* Today Attendance Card */}
          <View style={{
            backgroundColor: "white",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#E2E8F0",
            overflow: "hidden",
          }}>
            <View style={{
              paddingHorizontal: 16,
              paddingVertical: 13,
              borderBottomWidth: 1,
              borderBottomColor: "#F1F5F9",
            }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#1E293B" }}>今日打卡狀況</Text>
            </View>
            {!todayAttendance || todayAttendance.length === 0 ? (
              <View style={{ paddingVertical: 36, alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: "#94A3B8" }}>今日尚無打卡紀錄</Text>
              </View>
            ) : (
              todayAttendance.slice(0, 8).map((record, i) => {
                const emp = allEmployees?.find(e => e.id === record.employeeId);
                const isLate = record.status === "late";
                const isEarlyLeave = record.status === "early_leave";
                const statusBg = isLate || isEarlyLeave ? "#FEF3C7" : "#DCFCE7";
                const statusColor = isLate || isEarlyLeave ? "#D97706" : "#16A34A";
                const statusLabel = isLate ? "遲到" : isEarlyLeave ? "早退" : "正常";
                const clockIn = record.clockInTime
                  ? new Date(record.clockInTime).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false })
                  : "--:--";
                const clockOut = record.clockOutTime
                  ? new Date(record.clockOutTime).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false })
                  : null;
                return (
                  <View key={record.id} style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingVertical: 11,
                    borderBottomWidth: i < Math.min(todayAttendance.length, 8) - 1 ? 1 : 0,
                    borderBottomColor: "#F8FAFC",
                  }}>
                    <View style={{
                      width: 34, height: 34,
                      borderRadius: 17,
                      backgroundColor: "#EFF6FF",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 10,
                    }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#2563EB" }}>
                        {(emp?.fullName ?? "?")[0]}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: "#1E293B" }}>
                        {emp?.fullName ?? `員工 #${record.employeeId}`}
                      </Text>
                      <Text style={{ fontSize: 12, color: "#64748B", marginTop: 1 }}>
                        上班 {clockIn}{clockOut ? ` · 下班 ${clockOut}` : " · 上班中"}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: statusBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
                      <Text style={{ fontSize: 11, color: statusColor, fontWeight: "600" }}>{statusLabel}</Text>
                    </View>
                  </View>
                );
              })
            )}
            {todayAttendance && todayAttendance.length > 8 && (
              <TouchableOpacity
                onPress={() => router.push("/admin/attendance" as any)}
                style={{ padding: 12, alignItems: "center", borderTopWidth: 1, borderTopColor: "#F1F5F9" }}
              >
                <Text style={{ color: "#2563EB", fontSize: 13, fontWeight: "500" }}>
                  查看全部 {todayAttendance.length} 筆紀錄
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Pending Leave Card */}
          <View style={{
            backgroundColor: "white",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#E2E8F0",
            overflow: "hidden",
          }}>
            <View style={{
              paddingHorizontal: 16,
              paddingVertical: 13,
              borderBottomWidth: 1,
              borderBottomColor: "#F1F5F9",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#1E293B" }}>待審請假申請</Text>
              {pendingLeave > 0 && (
                <TouchableOpacity onPress={() => router.push("/admin/settings" as any)}>
                  <Text style={{ fontSize: 13, color: "#2563EB", fontWeight: "500" }}>查看全部</Text>
                </TouchableOpacity>
              )}
            </View>
            {pendingLeave === 0 ? (
              <View style={{ paddingVertical: 36, alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: "#94A3B8" }}>目前無待審核申請</Text>
              </View>
            ) : (
              leaveRequests?.slice(0, 3).map((req, i) => {
                const emp = allEmployees?.find(e => e.id === req.employeeId);
                const leaveTypeLabel = req.leaveType === "annual" ? "年假" : req.leaveType === "sick" ? "病假" : req.leaveType === "personal" ? "事假" : "其他";
                return (
                  <View key={req.id} style={{
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderBottomWidth: i < Math.min(3, pendingLeave) - 1 ? 1 : 0,
                    borderBottomColor: "#F8FAFC",
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: "#1E293B" }}>
                        {emp?.fullName ?? `員工 #${req.employeeId}`}
                      </Text>
                      <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                        {String(req.startDate)} ~ {String(req.endDate)} · {leaveTypeLabel}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: "#FFFBEB", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
                      <Text style={{ fontSize: 11, color: "#D97706", fontWeight: "600" }}>待審核</Text>
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
