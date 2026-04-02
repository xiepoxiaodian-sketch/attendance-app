import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useEmployeeAuth } from "@/lib/employee-auth";
import { trpc } from "@/lib/trpc";

function formatTime(date: Date | string | null | undefined): string {
  if (!date) return "--:--";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit", weekday: "short" });
}

function calcWorkHours(clockIn: any, clockOut: any): string {
  if (!clockIn || !clockOut) return "-";
  const inTime = new Date(clockIn).getTime();
  const outTime = new Date(clockOut).getTime();
  const diff = (outTime - inTime) / 1000 / 60;
  const h = Math.floor(diff / 60);
  const m = Math.round(diff % 60);
  return `${h}h ${m}m`;
}

function getStatusBadge(status: string | null | undefined) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    normal: { label: "正常", bg: "#DCFCE7", text: "#16A34A" },
    late: { label: "遲到", bg: "#FEF3C7", text: "#D97706" },
    early_leave: { label: "早退", bg: "#FEF3C7", text: "#D97706" },
    absent: { label: "缺勤", bg: "#FEE2E2", text: "#DC2626" },
  };
  const s = map[status ?? "normal"] ?? map.normal;
  return (
    <View style={{ backgroundColor: s.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
      <Text style={{ color: s.text, fontSize: 11, fontWeight: "600" }}>{s.label}</Text>
    </View>
  );
}

export default function RecordsScreen() {
  const { employee } = useEmployeeAuth();
  const [refreshing, setRefreshing] = useState(false);

  // Get last 30 days
  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const { data: records, refetch, isLoading } = trpc.attendance.getHistory.useQuery(
    { employeeId: employee?.id ?? 0, startDate, endDate },
    { enabled: !!employee }
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const sortedRecords = [...(records ?? [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={{ backgroundColor: "#1E40AF", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 }}>
        <Text style={{ color: "white", fontSize: 22, fontWeight: "700" }}>打卡紀錄</Text>
        <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4 }}>
          最近 30 天
        </Text>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#1E40AF" />
        </View>
      ) : sortedRecords.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>📋</Text>
          <Text style={{ color: "#64748B", fontSize: 16, textAlign: "center" }}>
            最近 30 天內沒有打卡紀錄
          </Text>
        </View>
      ) : (
        <FlatList
          data={sortedRecords}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View
              style={{
                backgroundColor: "white",
                borderRadius: 14,
                padding: 14,
                marginBottom: 10,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.06,
                shadowRadius: 6,
                elevation: 2,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: "#1E293B" }}>
                    {formatDate(item.date)}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 1 }}>
                    {item.shiftLabel || "班次1"}
                  </Text>
                </View>
                {getStatusBadge(item.status)}
              </View>

              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 11, color: "#94A3B8", marginBottom: 2 }}>上班</Text>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: item.clockInTime ? "#22C55E" : "#CBD5E1" }}>
                    {formatTime(item.clockInTime)}
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 11, color: "#94A3B8", marginBottom: 2 }}>下班</Text>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: item.clockOutTime ? "#3B82F6" : "#CBD5E1" }}>
                    {formatTime(item.clockOutTime)}
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 11, color: "#94A3B8", marginBottom: 2 }}>工時</Text>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: "#1E293B" }}>
                    {calcWorkHours(item.clockInTime, item.clockOutTime)}
                  </Text>
                </View>
              </View>

              {item.clockInLocation && (
                <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ fontSize: 11, color: "#94A3B8" }}>📍 {item.clockInLocation}</Text>
                </View>
              )}
            </View>
          )}
        />
      )}
    </ScreenContainer>
  );
}
