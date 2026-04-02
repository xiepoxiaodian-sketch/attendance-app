import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";

function formatTime(date: any): string {
  if (!date) return "--:--";
  return new Date(date).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDate(date: any): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit", weekday: "short" });
}

function calcHours(clockIn: any, clockOut: any): string {
  if (!clockIn || !clockOut) return "-";
  const diff = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 1000 / 60;
  return `${Math.floor(diff / 60)}h${Math.round(diff % 60)}m`;
}

export default function AdminAttendanceScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);

  const { data: records, refetch, isLoading } = trpc.attendance.getAll.useQuery({
    startDate,
    endDate,
  });

  const { data: employees } = trpc.employees.list.useQuery();

  const deleteMutation = trpc.attendance.delete.useMutation({
    onSuccess: () => refetch(),
  });

  const deleteBatchMutation = trpc.attendance.deleteBatch.useMutation({
    onSuccess: () => {
      setSelectedIds([]);
      refetch();
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const handleDelete = (id: number) => {
    Alert.alert("刪除紀錄", "確定要刪除此打卡紀錄嗎？", [
      { text: "取消" },
      { text: "刪除", style: "destructive", onPress: () => deleteMutation.mutate({ id }) },
    ]);
  };

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    Alert.alert("批量刪除", `確定要刪除選取的 ${selectedIds.length} 筆紀錄嗎？`, [
      { text: "取消" },
      { text: "刪除", style: "destructive", onPress: () => deleteBatchMutation.mutate({ ids: selectedIds }) },
    ]);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const getEmployeeName = (id: number) => {
    return employees?.find(e => e.id === id)?.fullName ?? `#${id}`;
  };

  const filteredRecords = (records ?? []).filter(r => {
    if (!searchQuery) return true;
    const name = getEmployeeName(r.employeeId).toLowerCase();
    return name.includes(searchQuery.toLowerCase());
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={{ backgroundColor: "#1E40AF", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
        <Text style={{ color: "white", fontSize: 22, fontWeight: "700" }}>打卡紀錄管理</Text>
      </View>

      {/* Filters */}
      <View style={{ backgroundColor: "white", padding: 12, borderBottomWidth: 0.5, borderBottomColor: "#E2E8F0" }}>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>開始日期</Text>
            <TextInput
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
              returnKeyType="done"
              style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, color: "#1E293B" }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>結束日期</Text>
            <TextInput
              value={endDate}
              onChangeText={setEndDate}
              placeholder="YYYY-MM-DD"
              returnKeyType="done"
              style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, color: "#1E293B" }}
            />
          </View>
        </View>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="搜尋員工姓名..."
          returnKeyType="search"
          style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, color: "#1E293B" }}
          placeholderTextColor="#94A3B8"
        />
      </View>

      {/* Batch Actions */}
      {selectedIds.length > 0 && (
        <View style={{ backgroundColor: "#FEF3C7", padding: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: "#92400E", fontSize: 13 }}>已選 {selectedIds.length} 筆</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity onPress={() => setSelectedIds([])} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "white" }}>
              <Text style={{ color: "#64748B", fontSize: 13 }}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDeleteSelected} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "#EF4444" }}>
              <Text style={{ color: "white", fontSize: 13, fontWeight: "600" }}>刪除</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Summary */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 8, flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: "#64748B", fontSize: 13 }}>共 {filteredRecords.length} 筆紀錄</Text>
        <TouchableOpacity onPress={() => {
          if (selectedIds.length === filteredRecords.length) {
            setSelectedIds([]);
          } else {
            setSelectedIds(filteredRecords.map(r => r.id));
          }
        }}>
          <Text style={{ color: "#1E40AF", fontSize: 13 }}>
            {selectedIds.length === filteredRecords.length && filteredRecords.length > 0 ? "取消全選" : "全選"}
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#1E40AF" />
        </View>
      ) : (
        <FlatList
          data={filteredRecords}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }}
          renderItem={({ item }) => {
            const isSelected = selectedIds.includes(item.id);
            return (
              <TouchableOpacity
                onLongPress={() => toggleSelect(item.id)}
                onPress={() => selectedIds.length > 0 ? toggleSelect(item.id) : undefined}
                style={{
                  backgroundColor: isSelected ? "#EFF6FF" : "white",
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 8,
                  borderWidth: isSelected ? 1.5 : 0,
                  borderColor: isSelected ? "#1E40AF" : "transparent",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 4,
                  elevation: 1,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    {isSelected && <Text style={{ marginRight: 6 }}>✓</Text>}
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#1E293B" }}>
                      {getEmployeeName(item.employeeId)}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#94A3B8", marginLeft: 6 }}>
                      {item.shiftLabel}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      borderRadius: 8,
                      backgroundColor: item.status === "late" || item.status === "early_leave" ? "#FEF3C7" : "#DCFCE7",
                    }}>
                      <Text style={{ fontSize: 11, color: item.status === "late" || item.status === "early_leave" ? "#D97706" : "#16A34A" }}>
                        {item.status === "late" ? "遲到" : item.status === "early_leave" ? "早退" : item.status === "absent" ? "缺勤" : "正常"}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDelete(item.id)}>
                      <Text style={{ color: "#EF4444", fontSize: 12 }}>刪除</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={{ flexDirection: "row" }}>
                  <Text style={{ fontSize: 12, color: "#64748B", marginRight: 12 }}>
                    📅 {formatDate(item.date)}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#22C55E", marginRight: 8 }}>
                    ⬆ {formatTime(item.clockInTime)}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#3B82F6", marginRight: 8 }}>
                    ⬇ {formatTime(item.clockOutTime)}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#94A3B8" }}>
                    ⏱ {calcHours(item.clockInTime, item.clockOutTime)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </ScreenContainer>
  );
}
