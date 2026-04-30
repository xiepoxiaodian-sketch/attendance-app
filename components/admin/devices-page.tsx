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
import { AdminHeader } from "@/components/admin-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { trpc } from "@/lib/trpc";

function formatDate(d: any) {
  if (!d) return "—";
  const date = new Date(d);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

type TabType = "pending" | "all";

const STATUS_LABEL: Record<string, { text: string; bg: string; color: string }> = {
  approved: { text: "已核准", bg: "#DCFCE7", color: "#16A34A" },
  pending:  { text: "待審核", bg: "#FEF9C3", color: "#CA8A04" },
  rejected: { text: "已拒絕", bg: "#FEE2E2", color: "#DC2626" },
};

export default function DevicesScreen() {
  const [tab, setTab] = useState<TabType>("pending");
  const [refreshing, setRefreshing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null);
  const [confirmReview, setConfirmReview] = useState<{
    id: number; name: string; action: "approved" | "rejected";
  } | null>(null);

  const { data: allDevices, refetch: refetchAll, isLoading: loadingAll } = trpc.devices.getAll.useQuery();
  const { data: pendingDevices, refetch: refetchPending, isLoading: loadingPending } = trpc.devices.getPending.useQuery();

  const deleteMutation = trpc.devices.delete.useMutation({
    onSuccess: () => { refetchAll(); refetchPending(); },
  });
  const reviewMutation = trpc.devices.review.useMutation({
    onSuccess: () => { refetchAll(); refetchPending(); },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchAll(), refetchPending()]);
    setRefreshing(false);
  }, [refetchAll, refetchPending]);

  const isLoading = tab === "pending" ? loadingPending : loadingAll;
  const displayData = tab === "pending" ? (pendingDevices ?? []) : (allDevices ?? []);

  // Find employees with multiple devices
  const multiDeviceEmployeeIds = new Set<number>();
  if (allDevices) {
    const counts: Record<number, number> = {};
    for (const d of allDevices) {
      if (d.employeeId) counts[d.employeeId] = (counts[d.employeeId] ?? 0) + 1;
    }
    for (const [id, count] of Object.entries(counts)) {
      if (count > 1) multiDeviceEmployeeIds.add(Number(id));
    }
  }

  const pendingCount = pendingDevices?.length ?? 0;

  return (
    <ScreenContainer containerClassName="bg-[#F1F5F9]">
      <AdminHeader
        title="裝置管理"
        subtitle={`待審核 ${pendingCount} 台`}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />

      <ConfirmDialog
        visible={!!confirmDelete}
        title="解除裝置綁定"
        message={`確定要解除「${confirmDelete?.name ?? ""}」的裝置綁定嗎？`}
        confirmText="解除"
        confirmStyle="destructive"
        onConfirm={() => {
          if (confirmDelete) deleteMutation.mutate({ id: confirmDelete.id });
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmDialog
        visible={!!confirmReview}
        title={confirmReview?.action === "approved" ? "核准裝置" : "拒絕裝置"}
        message={
          confirmReview?.action === "approved"
            ? `確定核准「${confirmReview?.name ?? ""}」的新裝置申請？`
            : `確定拒絕「${confirmReview?.name ?? ""}」的新裝置申請？員工將無法使用此裝置打卡。`
        }
        confirmText={confirmReview?.action === "approved" ? "核准" : "拒絕"}
        confirmStyle={confirmReview?.action === "approved" ? "default" : "destructive"}
        onConfirm={() => {
          if (confirmReview) reviewMutation.mutate({ id: confirmReview.id, status: confirmReview.action });
          setConfirmReview(null);
        }}
        onCancel={() => setConfirmReview(null)}
      />

      {/* Tab switcher */}
      <View style={{ flexDirection: "row", marginHorizontal: 14, marginTop: 10, marginBottom: 4, backgroundColor: "#E2E8F0", borderRadius: 10, padding: 3 }}>
        {(["pending", "all"] as TabType[]).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 8,
              alignItems: "center",
              backgroundColor: tab === t ? "white" : "transparent",
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: tab === t ? "#1E293B" : "#64748B" }}>
              {t === "pending"
                ? `待審核${pendingCount > 0 ? ` (${pendingCount})` : ""}`
                : `全部裝置 (${allDevices?.length ?? 0})`}
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
          data={displayData}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 14, gap: 10 }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>
                {tab === "pending" ? "✅" : "📱"}
              </Text>
              <Text style={{ fontSize: 15, color: "#94A3B8" }}>
                {tab === "pending" ? "目前沒有待審核的裝置申請" : "尚無已綁定裝置"}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const statusInfo = STATUS_LABEL[(item as any).status ?? "approved"];
            const isMulti = multiDeviceEmployeeIds.has(item.employeeId ?? -1);
            const isPending = (item as any).status === "pending";

            return (
              <View style={{
                backgroundColor: "white",
                borderRadius: 12,
                padding: 14,
                borderWidth: isPending ? 1.5 : 1,
                borderColor: isPending ? "#FCD34D" : "#F1F5F9",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 3,
                elevation: 1,
              }}>
                {/* Header */}
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                  <Text style={{ fontSize: 22, marginRight: 10 }}>📱</Text>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>
                        {(item as any).employeeName ?? `員工 #${item.employeeId}`}
                      </Text>
                      {(item as any).employeeJobTitle ? (
                        <View style={{ backgroundColor: "#EFF6FF", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 }}>
                          <Text style={{ fontSize: 11, color: "#2563EB", fontWeight: "600" }}>
                            {(item as any).employeeJobTitle}
                          </Text>
                        </View>
                      ) : null}
                      {isMulti && tab === "all" && (
                        <View style={{ backgroundColor: "#FEF3C7", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 }}>
                          <Text style={{ fontSize: 11, color: "#D97706", fontWeight: "600" }}>多裝置</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={{ backgroundColor: statusInfo.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 12, color: statusInfo.color, fontWeight: "600" }}>{statusInfo.text}</Text>
                  </View>
                </View>

                {/* Device info */}
                <View style={{ backgroundColor: "#F8FAFC", borderRadius: 8, padding: 10, gap: 3, marginBottom: 10 }}>
                  <Text style={{ fontSize: 12, color: "#475569" }}>裝置型號：{item.deviceName ?? "未知"}</Text>
                  <Text style={{ fontSize: 12, color: "#475569" }}>平台：{item.platform ?? "未知"}</Text>
                  <Text style={{ fontSize: 12, color: "#475569" }}>申請時間：{formatDate(item.registeredAt)}</Text>
                </View>

                {/* Actions */}
                {isPending ? (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => setConfirmReview({
                        id: item.id,
                        name: (item as any).employeeName ?? `員工 #${item.employeeId}`,
                        action: "approved",
                      })}
                      style={{ flex: 1, backgroundColor: "#DCFCE7", borderRadius: 8, paddingVertical: 8, alignItems: "center" }}
                    >
                      <Text style={{ fontSize: 13, color: "#16A34A", fontWeight: "700" }}>✓ 核准</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setConfirmReview({
                        id: item.id,
                        name: (item as any).employeeName ?? `員工 #${item.employeeId}`,
                        action: "rejected",
                      })}
                      style={{ flex: 1, backgroundColor: "#FEE2E2", borderRadius: 8, paddingVertical: 8, alignItems: "center" }}
                    >
                      <Text style={{ fontSize: 13, color: "#DC2626", fontWeight: "700" }}>✗ 拒絕</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setConfirmDelete({
                        id: item.id,
                        name: (item as any).employeeName ?? `員工 #${item.employeeId}`,
                      })}
                      style={{ backgroundColor: "#F1F5F9", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" }}
                    >
                      <Text style={{ fontSize: 13, color: "#64748B", fontWeight: "600" }}>刪除</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                    <TouchableOpacity
                      onPress={() => setConfirmDelete({
                        id: item.id,
                        name: (item as any).employeeName ?? `員工 #${item.employeeId}`,
                      })}
                      style={{ backgroundColor: "#FEF2F2", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                    >
                      <Text style={{ fontSize: 13, color: "#EF4444", fontWeight: "600" }}>解除綁定</Text>
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
