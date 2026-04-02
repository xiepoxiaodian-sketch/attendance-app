import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useEmployeeAuth } from "@/lib/employee-auth";
import { trpc } from "@/lib/trpc";

const LEAVE_TYPES = [
  { value: "annual", label: "年假", icon: "🌴" },
  { value: "sick", label: "病假", icon: "🏥" },
  { value: "personal", label: "事假", icon: "📋" },
  { value: "other", label: "其他", icon: "📝" },
];

function getStatusBadge(status: string) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    pending: { label: "審核中", bg: "#FEF3C7", text: "#D97706" },
    approved: { label: "已核准", bg: "#DCFCE7", text: "#16A34A" },
    rejected: { label: "已拒絕", bg: "#FEE2E2", text: "#DC2626" },
  };
  const s = map[status] ?? map.pending;
  return (
    <View style={{ backgroundColor: s.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
      <Text style={{ color: s.text, fontSize: 11, fontWeight: "600" }}>{s.label}</Text>
    </View>
  );
}

function formatDateRange(start: any, end: any): string {
  const s = new Date(start).toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" });
  const e = new Date(end).toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" });
  return s === e ? s : `${s} ~ ${e}`;
}

export default function LeaveScreen() {
  const { employee } = useEmployeeAuth();
  const [showModal, setShowModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState({
    startDate: "",
    endDate: "",
    leaveType: "annual" as "annual" | "sick" | "personal" | "other",
    reason: "",
  });
  const [formError, setFormError] = useState("");

  const { data: leaveRequests, refetch, isLoading } = trpc.leave.getByEmployee.useQuery(
    { employeeId: employee?.id ?? 0 },
    { enabled: !!employee }
  );

  const createMutation = trpc.leave.create.useMutation({
    onSuccess: () => {
      refetch();
      setShowModal(false);
      setForm({ startDate: "", endDate: "", leaveType: "annual", reason: "" });
      Alert.alert("申請成功", "請假申請已送出，等待主管審核。");
    },
    onError: (err) => {
      setFormError(err.message || "申請失敗");
    },
  });

  const deleteMutation = trpc.leave.delete.useMutation({
    onSuccess: () => refetch(),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const handleSubmit = () => {
    setFormError("");
    if (!form.startDate || !form.endDate) {
      setFormError("請填寫請假日期");
      return;
    }
    if (form.startDate > form.endDate) {
      setFormError("結束日期不能早於開始日期");
      return;
    }
    if (!employee) return;
    createMutation.mutate({
      employeeId: employee.id,
      startDate: form.startDate,
      endDate: form.endDate,
      leaveType: form.leaveType,
      reason: form.reason,
    });
  };

  const handleDelete = (id: number) => {
    Alert.alert("取消申請", "確定要取消這筆請假申請嗎？", [
      { text: "取消" },
      {
        text: "確定",
        style: "destructive",
        onPress: () => deleteMutation.mutate({ id }),
      },
    ]);
  };

  const sortedRequests = [...(leaveRequests ?? [])].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
  );

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={{ backgroundColor: "#1E40AF", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={{ color: "white", fontSize: 22, fontWeight: "700" }}>請假申請</Text>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4 }}>
              管理您的請假申請
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowModal(true)}
            style={{ backgroundColor: "white", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }}
          >
            <Text style={{ color: "#1E40AF", fontWeight: "600", fontSize: 14 }}>+ 申請</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#1E40AF" />
        </View>
      ) : sortedRequests.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🌴</Text>
          <Text style={{ color: "#64748B", fontSize: 16, textAlign: "center", marginBottom: 8 }}>
            尚無請假紀錄
          </Text>
          <TouchableOpacity
            onPress={() => setShowModal(true)}
            style={{ backgroundColor: "#1E40AF", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 }}
          >
            <Text style={{ color: "white", fontWeight: "600" }}>申請請假</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sortedRequests}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => {
            const leaveType = LEAVE_TYPES.find(t => t.value === item.leaveType);
            return (
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
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                    <Text style={{ fontSize: 24, marginRight: 10 }}>{leaveType?.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "600", color: "#1E293B" }}>
                        {leaveType?.label}
                      </Text>
                      <Text style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>
                        {formatDateRange(item.startDate, item.endDate)}
                      </Text>
                    </View>
                  </View>
                  {getStatusBadge(item.status)}
                </View>

                {item.reason ? (
                  <Text style={{ fontSize: 13, color: "#64748B", marginTop: 8, lineHeight: 18 }}>
                    {item.reason}
                  </Text>
                ) : null}

                {item.reviewNote ? (
                  <View style={{ backgroundColor: "#F8FAFC", borderRadius: 8, padding: 8, marginTop: 8 }}>
                    <Text style={{ fontSize: 12, color: "#64748B" }}>審核意見：{item.reviewNote}</Text>
                  </View>
                ) : null}

                {item.status === "pending" && (
                  <TouchableOpacity
                    onPress={() => handleDelete(item.id)}
                    style={{ marginTop: 10, alignSelf: "flex-end" }}
                  >
                    <Text style={{ color: "#EF4444", fontSize: 13 }}>取消申請</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      )}

      {/* Apply Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          {/* Modal Header */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: "#E2E8F0", backgroundColor: "white" }}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={{ color: "#64748B", fontSize: 16 }}>取消</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: "600", color: "#1E293B" }}>申請請假</Text>
            <TouchableOpacity onPress={handleSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color="#1E40AF" />
              ) : (
                <Text style={{ color: "#1E40AF", fontSize: 16, fontWeight: "600" }}>送出</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            {/* Leave Type */}
            <Text style={{ fontSize: 14, fontWeight: "500", color: "#64748B", marginBottom: 10 }}>假別</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {LEAVE_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  onPress={() => setForm(f => ({ ...f, leaveType: type.value as any }))}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 20,
                    borderWidth: 1.5,
                    borderColor: form.leaveType === type.value ? "#1E40AF" : "#E2E8F0",
                    backgroundColor: form.leaveType === type.value ? "#EFF6FF" : "white",
                  }}
                >
                  <Text style={{ marginRight: 6 }}>{type.icon}</Text>
                  <Text style={{ color: form.leaveType === type.value ? "#1E40AF" : "#64748B", fontWeight: "500" }}>
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Date Range */}
            <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: "#64748B", marginBottom: 8 }}>開始日期</Text>
                <TextInput
                  value={form.startDate}
                  onChangeText={(v) => setForm(f => ({ ...f, startDate: v }))}
                  placeholder="YYYY-MM-DD"
                  returnKeyType="next"
                  style={{ backgroundColor: "white", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: "#1E293B" }}
                  placeholderTextColor="#94A3B8"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: "#64748B", marginBottom: 8 }}>結束日期</Text>
                <TextInput
                  value={form.endDate}
                  onChangeText={(v) => setForm(f => ({ ...f, endDate: v }))}
                  placeholder="YYYY-MM-DD"
                  returnKeyType="next"
                  style={{ backgroundColor: "white", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: "#1E293B" }}
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            {/* Reason */}
            <Text style={{ fontSize: 14, fontWeight: "500", color: "#64748B", marginBottom: 8 }}>請假原因（選填）</Text>
            <TextInput
              value={form.reason}
              onChangeText={(v) => setForm(f => ({ ...f, reason: v }))}
              placeholder="請輸入請假原因..."
              multiline
              numberOfLines={4}
              returnKeyType="done"
              style={{ backgroundColor: "white", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: "#1E293B", minHeight: 100, textAlignVertical: "top" }}
              placeholderTextColor="#94A3B8"
            />

            {formError ? (
              <View style={{ backgroundColor: "#FEE2E2", borderRadius: 10, padding: 12, marginTop: 12 }}>
                <Text style={{ color: "#DC2626", fontSize: 14, textAlign: "center" }}>{formError}</Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
