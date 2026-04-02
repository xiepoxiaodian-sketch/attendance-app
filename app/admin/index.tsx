import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useEmployeeAuth } from "@/lib/employee-auth";
import { trpc } from "@/lib/trpc";

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string | number; color: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: "white", borderRadius: 14, padding: 14, marginHorizontal: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 }}>
      <Text style={{ fontSize: 24, marginBottom: 6 }}>{icon}</Text>
      <Text style={{ fontSize: 22, fontWeight: "700", color }}>{value}</Text>
      <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{label}</Text>
    </View>
  );
}

export default function AdminDashboard() {
  const { employee, logout } = useEmployeeAuth();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data: summary, refetch: refetchSummary } = trpc.attendance.todaySummary.useQuery();
  const { data: allEmployees } = trpc.employees.list.useQuery();
  const { data: leaveRequests } = trpc.leave.getAll.useQuery({ status: "pending" });
  const { data: todayAttendance, refetch: refetchAttendance } = trpc.attendance.getAll.useQuery({
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
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

  const today = new Date().toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const totalEmployees = allEmployees?.filter(e => e.isActive && e.role === "employee").length ?? 0;
  const presentCount = summary?.clockedIn ?? 0;
  const lateCount = summary?.late ?? 0;
  const absentCount = totalEmployees - presentCount;
  const pendingLeave = leaveRequests?.length ?? 0;

  return (
    <ScreenContainer>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={{ backgroundColor: "#1E40AF", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View>
              <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 13 }}>管理後台</Text>
              <Text style={{ color: "white", fontSize: 22, fontWeight: "700", marginTop: 2 }}>
                {employee?.fullName}
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4 }}>{today}</Text>
            </View>
            <TouchableOpacity
              onPress={handleLogout}
              style={{ backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <Text style={{ color: "white", fontSize: 13 }}>登出</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ padding: 16 }}>
          {/* Today Stats */}
          <Text style={{ fontSize: 15, fontWeight: "600", color: "#64748B", marginBottom: 10 }}>今日出勤概況</Text>
          <View style={{ flexDirection: "row", marginHorizontal: -4, marginBottom: 16 }}>
            <StatCard icon="✅" label="已到班" value={presentCount} color="#22C55E" />
            <StatCard icon="⏰" label="遲到" value={lateCount} color="#F59E0B" />
            <StatCard icon="❌" label="未到班" value={absentCount < 0 ? 0 : absentCount} color="#EF4444" />
            <StatCard icon="📋" label="待審假單" value={pendingLeave} color="#3B82F6" />
          </View>

          {/* Today's Attendance List */}
          <Text style={{ fontSize: 15, fontWeight: "600", color: "#64748B", marginBottom: 10 }}>今日打卡紀錄</Text>
          {!todayAttendance ? (
            <ActivityIndicator color="#1E40AF" />
          ) : todayAttendance.length === 0 ? (
            <View style={{ backgroundColor: "white", borderRadius: 14, padding: 20, alignItems: "center" }}>
              <Text style={{ color: "#94A3B8", fontSize: 14 }}>今日尚無打卡紀錄</Text>
            </View>
          ) : (
            <View style={{ backgroundColor: "white", borderRadius: 14, overflow: "hidden" }}>
              {todayAttendance.slice(0, 10).map((record, i) => {
                const emp = allEmployees?.find(e => e.id === record.employeeId);
                return (
                  <View
                    key={record.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      padding: 12,
                      borderBottomWidth: i < Math.min(todayAttendance.length, 10) - 1 ? 0.5 : 0,
                      borderBottomColor: "#F1F5F9",
                    }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                      <Text style={{ fontSize: 16 }}>👤</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "500", color: "#1E293B" }}>
                        {emp?.fullName || `員工 #${record.employeeId}`}
                      </Text>
                      <Text style={{ fontSize: 12, color: "#94A3B8" }}>
                        {record.shiftLabel} · 上班 {record.clockInTime ? new Date(record.clockInTime).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }) : "--:--"}
                        {record.clockOutTime ? ` · 下班 ${new Date(record.clockOutTime).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false })}` : ""}
                      </Text>
                    </View>
                    <View style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 10,
                      backgroundColor: record.status === "late" ? "#FEF3C7" : record.status === "early_leave" ? "#FEF3C7" : "#DCFCE7",
                    }}>
                      <Text style={{ fontSize: 11, fontWeight: "600", color: record.status === "late" || record.status === "early_leave" ? "#D97706" : "#16A34A" }}>
                        {record.status === "late" ? "遲到" : record.status === "early_leave" ? "早退" : "正常"}
                      </Text>
                    </View>
                  </View>
                );
              })}
              {todayAttendance.length > 10 && (
                <TouchableOpacity
                  onPress={() => router.push("/admin/attendance" as any)}
                  style={{ padding: 12, alignItems: "center", borderTopWidth: 0.5, borderTopColor: "#F1F5F9" }}
                >
                  <Text style={{ color: "#1E40AF", fontSize: 13 }}>查看全部 {todayAttendance.length} 筆紀錄</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Pending Leave */}
          {pendingLeave > 0 && (
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: "#64748B", marginBottom: 10 }}>待審請假</Text>
              <TouchableOpacity
                onPress={() => router.push("/admin/settings" as any)}
                style={{ backgroundColor: "#FEF3C7", borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center" }}
              >
                <Text style={{ fontSize: 24, marginRight: 12 }}>📋</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#92400E" }}>
                    有 {pendingLeave} 筆請假申請待審核
                  </Text>
                  <Text style={{ fontSize: 12, color: "#B45309", marginTop: 2 }}>點擊前往審核</Text>
                </View>
                <Text style={{ color: "#B45309" }}>›</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
