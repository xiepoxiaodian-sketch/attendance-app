import { useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { AdminHeader } from "@/components/admin-header";
import { trpc } from "@/lib/trpc";

type LeaveStatus = "pending" | "approved" | "rejected" | "all";

const STATUS_TABS: { key: LeaveStatus; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待審核" },
  { key: "approved", label: "已核准" },
  { key: "rejected", label: "已拒絕" },
];

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "年假",
  sick: "病假",
  personal: "事假",
  other: "其他",
};

function formatDate(d: any) {
  if (!d) return "";
  const date = new Date(d);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

export default function LeaveReviewScreen() {
  const [activeStatus, setActiveStatus] = useState<LeaveStatus>("pending");
  const [refreshing, setRefreshing] = useState(false);

  const queryStatus = activeStatus === "all" ? undefined : activeStatus;
  const { data: leaveRequests, refetch, isLoading } = trpc.leave.getAll.useQuery({ status: queryStatus });
  const reviewMutation = trpc.leave.review.useMutation({ onSuccess: () => refetch() });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleApprove = (id: number) => {
    Alert.alert("確認核准", "確定要核准這筆請假申請嗎？", [
      { text: "取消", style: "cancel" },
      { text: "核准", onPress: () => reviewMutation.mutate({ id, status: "approved", reviewedBy: 1 }) },
    ]);
  };

  const handleReject = (id: number) => {
    Alert.alert("確認拒絕", "確定要拒絕這筆請假申請嗎？", [
      { text: "取消", style: "cancel" },
      { text: "拒絕", style: "destructive", onPress: () => reviewMutation.mutate({ id, status: "rejected", reviewedBy: 1 }) },
    ]);
  };

  const getStatusStyle = (status: string) => {
    if (status === "approved") return { bg: "#F0FDF4", text: "#16A34A", label: "已核准" };
    if (status === "rejected") return { bg: "#FEF2F2", text: "#DC2626", label: "已拒絕" };
    return { bg: "#FFFBEB", text: "#D97706", label: "待審核" };
  };

  return (
    <ScreenContainer containerClassName="bg-[#F1F5F9]">
      <AdminHeader title="請假審核" subtitle={`共 ${leaveRequests?.length ?? 0} 筆申請`} onRefresh={onRefresh} refreshing={refreshing} />

      {/* Status Tabs */}
      <View style={{ backgroundColor: "white", flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
        {STATUS_TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveStatus(tab.key)}
            style={{
              flex: 1,
              paddingVertical: 12,
              alignItems: "center",
              borderBottomWidth: 2,
              borderBottomColor: activeStatus === tab.key ? "#2563EB" : "transparent",
            }}
          >
            <Text style={{
              fontSize: 13,
              fontWeight: activeStatus === tab.key ? "700" : "400",
              color: activeStatus === tab.key ? "#2563EB" : "#64748B",
            }}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={leaveRequests ?? []}
          keyExtractor={item => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 14, gap: 10 }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
              <Text style={{ fontSize: 15, color: "#94A3B8" }}>目前無請假申請</Text>
            </View>
          }
          renderItem={({ item }) => {
            const statusStyle = getStatusStyle(item.status);
            return (
              <View style={{
                backgroundColor: "white",
                borderRadius: 12,
                padding: 14,
                borderWidth: 1,
                borderColor: "#F1F5F9",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 3,
                elevation: 1,
              }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>
                      {(item as any).employeeName ?? `員工 #${item.employeeId}`}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                      {LEAVE_TYPE_LABELS[item.leaveType] ?? item.leaveType}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: statusStyle.bg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: statusStyle.text }}>{statusStyle.label}</Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
                  <Text style={{ fontSize: 13, color: "#475569" }}>📅</Text>
                  <Text style={{ fontSize: 13, color: "#475569" }}>
                    {formatDate(item.startDate)} ~ {formatDate(item.endDate)}
                  </Text>
                </View>

                {item.reason ? (
                  <View style={{ backgroundColor: "#F8FAFC", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                    <Text style={{ fontSize: 12, color: "#64748B" }}>申請原因：{item.reason}</Text>
                  </View>
                ) : null}

                {item.status === "pending" && (
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                    <TouchableOpacity
                      onPress={() => handleApprove(item.id)}
                      style={{ flex: 1, backgroundColor: "#2563EB", borderRadius: 8, paddingVertical: 9, alignItems: "center" }}
                    >
                      <Text style={{ color: "white", fontSize: 13, fontWeight: "600" }}>核准</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleReject(item.id)}
                      style={{ flex: 1, backgroundColor: "#F1F5F9", borderRadius: 8, paddingVertical: 9, alignItems: "center", borderWidth: 1, borderColor: "#E2E8F0" }}
                    >
                      <Text style={{ color: "#EF4444", fontSize: 13, fontWeight: "600" }}>拒絕</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </ScreenContainer>
  );
}
