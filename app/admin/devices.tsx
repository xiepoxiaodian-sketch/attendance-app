import { useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { AdminHeader } from "@/components/admin-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { trpc } from "@/lib/trpc";

function formatDate(d: any) {
  if (!d) return "—";
  const date = new Date(d);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function DevicesScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);

  const { data: devices, refetch, isLoading } = trpc.devices.getAll.useQuery();
  const deleteMutation = trpc.devices.delete.useMutation({ onSuccess: () => refetch() });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleRevoke = (id: number, employeeName: string) => {
    setPendingDelete({ id, name: employeeName });
    setConfirmVisible(true);
  };

  const handleConfirmDelete = () => {
    if (pendingDelete) {
      deleteMutation.mutate({ id: pendingDelete.id });
      setPendingDelete(null);
    }
    setConfirmVisible(false);
  };

  return (
    <ScreenContainer containerClassName="bg-[#F1F5F9]">
      <AdminHeader title="裝置管理" subtitle={`共 ${devices?.length ?? 0} 台已登錄裝置`} onRefresh={onRefresh} refreshing={refreshing} />

      <ConfirmDialog
        visible={confirmVisible}
        title="解除裝置綁定"
        message={`確定要移除「${pendingDelete?.name ?? ""}」的裝置登錄嗎？移除後該裝置記錄將被刪除。`}
        confirmText="解除"
        confirmStyle="destructive"
        onConfirm={handleConfirmDelete}
        onCancel={() => { setConfirmVisible(false); setPendingDelete(null); }}
      />

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={devices ?? []}
          keyExtractor={item => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 14, gap: 10 }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>📱</Text>
              <Text style={{ fontSize: 15, color: "#94A3B8" }}>尚無已登錄裝置</Text>
            </View>
          }
          renderItem={({ item }) => (
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
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <Text style={{ fontSize: 22 }}>📱</Text>
                    <View>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>
                        {(item as any).employeeName ?? `員工 #${item.employeeId}`}
                      </Text>
                      <Text style={{ fontSize: 12, color: "#64748B" }}>
                        {(item as any).employeeUsername ?? ""}
                      </Text>
                    </View>
                  </View>

                  <View style={{ backgroundColor: "#F8FAFC", borderRadius: 8, padding: 10, gap: 4 }}>
                    <Text style={{ fontSize: 12, color: "#475569" }}>
                      裝置 ID：{item.deviceId.substring(0, 20)}...
                    </Text>
                    <Text style={{ fontSize: 12, color: "#475569" }}>
                      平台：{item.platform ?? "未知"}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#475569" }}>
                      綁定時間：{formatDate(item.registeredAt)}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => handleRevoke(item.id, (item as any).employeeName ?? `員工 #${item.employeeId}`)}
                  style={{ marginLeft: 10, backgroundColor: "#FEF2F2", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                >
                  <Text style={{ fontSize: 13, color: "#EF4444", fontWeight: "600" }}>解除</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </ScreenContainer>
  );
}
