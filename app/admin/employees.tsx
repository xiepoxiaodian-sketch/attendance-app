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
import { AdminHeader } from "@/components/admin-header";
import { trpc } from "@/lib/trpc";

type Employee = {
  id: number;
  username: string;
  fullName: string;
  role: string;
  employeeType: string;
  jobTitle: string | null;
  phone: string | null;
  isActive: boolean;
  needsSetup: boolean;
};

const INITIAL_FORM = {
  username: "",
  password: "",
  fullName: "",
  role: "employee" as "admin" | "employee",
  employeeType: "full_time" as "full_time" | "part_time",
  jobTitle: "",
  phone: "",
};

function FormField({
  label, value, onChangeText, placeholder, secure, disabled, keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  disabled?: boolean;
  keyboardType?: any;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: "#475569", marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={secure}
        editable={!disabled}
        keyboardType={keyboardType}
        style={{
          backgroundColor: disabled ? "#F8FAFC" : "white",
          borderWidth: 1,
          borderColor: "#E2E8F0",
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 11,
          fontSize: 15,
          color: disabled ? "#94A3B8" : "#1E293B",
        }}
        placeholderTextColor="#94A3B8"
      />
    </View>
  );
}

function SegmentControl({
  label, options, value, onChange,
}: {
  label: string;
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: "#475569", marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: "row", backgroundColor: "#F1F5F9", borderRadius: 10, padding: 3 }}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={{
              flex: 1,
              paddingVertical: 8,
              alignItems: "center",
              borderRadius: 8,
              backgroundColor: value === opt.value ? "white" : "transparent",
              shadowColor: value === opt.value ? "#000" : "transparent",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.08,
              shadowRadius: 2,
              elevation: value === opt.value ? 1 : 0,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: value === opt.value ? "#1E293B" : "#64748B" }}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function AdminEmployeesScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [newPassword, setNewPassword] = useState("");
  const [formError, setFormError] = useState("");

  const { data: employees, refetch, isLoading } = trpc.employees.list.useQuery();

  const createMutation = trpc.employees.create.useMutation({
    onSuccess: () => {
      refetch();
      setShowModal(false);
      setForm(INITIAL_FORM);
      Alert.alert("成功", "員工帳號已建立");
    },
    onError: (err) => setFormError(err.message || "建立失敗"),
  });

  const updateMutation = trpc.employees.update.useMutation({
    onSuccess: () => {
      refetch();
      setShowModal(false);
      setSelectedEmployee(null);
    },
  });

  const resetPasswordMutation = trpc.employees.resetPassword.useMutation({
    onSuccess: () => {
      setShowResetModal(false);
      setNewPassword("");
      Alert.alert("成功", "密碼已重置，員工下次登入需重新設定");
    },
    onError: (err) => Alert.alert("錯誤", err.message),
  });

  const deleteMutation = trpc.employees.delete.useMutation({
    onSuccess: () => refetch(),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const handleCreate = () => {
    setFormError("");
    if (!form.username || !form.password || !form.fullName) {
      setFormError("請填寫帳號、密碼和姓名");
      return;
    }
    if (form.password.length < 6) {
      setFormError("密碼至少需要 6 個字元");
      return;
    }
    createMutation.mutate(form);
  };

  const handleEdit = (emp: Employee) => {
    setSelectedEmployee(emp);
    setForm({
      username: emp.username,
      password: "",
      fullName: emp.fullName,
      role: emp.role as "admin" | "employee",
      employeeType: emp.employeeType as "full_time" | "part_time",
      jobTitle: emp.jobTitle || "",
      phone: emp.phone || "",
    });
    setFormError("");
    setShowModal(true);
  };

  const handleUpdate = () => {
    if (!selectedEmployee) return;
    updateMutation.mutate({
      id: selectedEmployee.id,
      fullName: form.fullName,
      role: form.role,
      employeeType: form.employeeType,
      jobTitle: form.jobTitle || undefined,
      phone: form.phone || undefined,
    });
  };

  const handleToggleActive = (emp: Employee) => {
    updateMutation.mutate({ id: emp.id, isActive: !emp.isActive });
  };

  const handleDelete = (emp: Employee) => {
    Alert.alert("刪除員工", `確定要刪除 ${emp.fullName} 的帳號嗎？此操作無法復原。`, [
      { text: "取消" },
      { text: "刪除", style: "destructive", onPress: () => deleteMutation.mutate({ id: emp.id }) },
    ]);
  };

  const handleResetPassword = () => {
    if (!selectedEmployee || !newPassword || newPassword.length < 6) {
      Alert.alert("錯誤", "新密碼至少需要 6 個字元");
      return;
    }
    resetPasswordMutation.mutate({ id: selectedEmployee.id, newPassword });
  };

  const filteredEmployees = (employees ?? []).filter(e =>
    !searchQuery ||
    e.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ScreenContainer containerClassName="bg-[#F1F5F9]">
      <AdminHeader title="員工管理" subtitle={`共 ${employees?.length ?? 0} 位員工`} onRefresh={onRefresh} refreshing={refreshing} />
      {/* Add Button */}
      <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4, backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#F1F5F9", alignItems: "flex-end" }}>
        <TouchableOpacity
          onPress={() => { setSelectedEmployee(null); setForm(INITIAL_FORM); setFormError(""); setShowModal(true); }}
          style={{ backgroundColor: "#2563EB", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }}
        >
          <Text style={{ color: "white", fontWeight: "600", fontSize: 14 }}>+ 新增</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="搜尋員工姓名或帳號..."
          returnKeyType="search"
          style={{
            backgroundColor: "#F8FAFC",
            borderWidth: 1,
            borderColor: "#E2E8F0",
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 9,
            fontSize: 14,
            color: "#1E293B",
          }}
          placeholderTextColor="#94A3B8"
        />
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={filteredEmployees}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 14, gap: 10 }}
          ListEmptyComponent={
            <View style={{ paddingVertical: 60, alignItems: "center" }}>
              <Text style={{ fontSize: 14, color: "#94A3B8" }}>
                {searchQuery ? "找不到符合的員工" : "尚無員工資料"}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{
              backgroundColor: "white",
              borderRadius: 12,
              padding: 14,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.04,
              shadowRadius: 3,
              elevation: 1,
            }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {/* Avatar */}
                <View style={{
                  width: 42, height: 42,
                  borderRadius: 21,
                  backgroundColor: item.role === "admin" ? "#FEF3C7" : "#EFF6FF",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 12,
                }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: item.role === "admin" ? "#D97706" : "#2563EB" }}>
                    {item.fullName[0]}
                  </Text>
                </View>

                {/* Info */}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: item.isActive ? "#1E293B" : "#94A3B8" }}>
                      {item.fullName}
                    </Text>
                    {!item.isActive && (
                      <View style={{ backgroundColor: "#FEE2E2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20 }}>
                        <Text style={{ fontSize: 10, color: "#DC2626", fontWeight: "600" }}>停用</Text>
                      </View>
                    )}
                    {item.isActive && (
                      <View style={{ backgroundColor: "#DCFCE7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20 }}>
                        <Text style={{ fontSize: 10, color: "#16A34A", fontWeight: "600" }}>在職</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                    @{item.username} · {item.jobTitle || (item.role === "admin" ? "管理員" : "員工")} · {item.employeeType === "part_time" ? "兼職" : "全職"}
                  </Text>
                  {item.phone && (
                    <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 1 }}>{item.phone}</Text>
                  )}
                </View>
              </View>

              {/* Action Buttons */}
              <View style={{ flexDirection: "row", marginTop: 12, gap: 8 }}>
                <TouchableOpacity
                  onPress={() => handleEdit(item)}
                  style={{ flex: 1, backgroundColor: "#EFF6FF", borderRadius: 8, paddingVertical: 7, alignItems: "center" }}
                >
                  <Text style={{ color: "#2563EB", fontSize: 13, fontWeight: "600" }}>編輯</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setSelectedEmployee(item); setNewPassword(""); setShowResetModal(true); }}
                  style={{ flex: 1, backgroundColor: "#F0FDF4", borderRadius: 8, paddingVertical: 7, alignItems: "center" }}
                >
                  <Text style={{ color: "#16A34A", fontSize: 13, fontWeight: "600" }}>重置密碼</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleToggleActive(item)}
                  style={{ flex: 1, backgroundColor: item.isActive ? "#FFFBEB" : "#F0FDF4", borderRadius: 8, paddingVertical: 7, alignItems: "center" }}
                >
                  <Text style={{ color: item.isActive ? "#D97706" : "#16A34A", fontSize: 13, fontWeight: "600" }}>
                    {item.isActive ? "停用" : "啟用"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDelete(item)}
                  style={{ flex: 1, backgroundColor: "#FEF2F2", borderRadius: 8, paddingVertical: 7, alignItems: "center" }}
                >
                  <Text style={{ color: "#DC2626", fontSize: 13, fontWeight: "600" }}>刪除</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Create/Edit Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          {/* Modal Header */}
          <View style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: "#E2E8F0",
            backgroundColor: "white",
          }}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={{ color: "#64748B", fontSize: 16 }}>取消</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: "700", color: "#1E293B" }}>
              {selectedEmployee ? "編輯員工" : "新增員工"}
            </Text>
            <TouchableOpacity
              onPress={selectedEmployee ? handleUpdate : handleCreate}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                <Text style={{ color: "#2563EB", fontSize: 16, fontWeight: "700" }}>
                  {selectedEmployee ? "更新" : "建立"}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {formError ? (
              <View style={{ backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA", borderRadius: 10, padding: 12, marginBottom: 14 }}>
                <Text style={{ color: "#EF4444", fontSize: 13 }}>{formError}</Text>
              </View>
            ) : null}

            <FormField
              label="帳號"
              value={form.username}
              onChangeText={(v) => setForm(f => ({ ...f, username: v }))}
              placeholder="登入帳號"
              disabled={!!selectedEmployee}
            />

            {!selectedEmployee && (
              <FormField
                label="初始密碼"
                value={form.password}
                onChangeText={(v) => setForm(f => ({ ...f, password: v }))}
                placeholder="至少 6 個字元"
                secure
              />
            )}

            <FormField
              label="姓名"
              value={form.fullName}
              onChangeText={(v) => setForm(f => ({ ...f, fullName: v }))}
              placeholder="員工姓名"
            />

            <FormField
              label="職稱"
              value={form.jobTitle}
              onChangeText={(v) => setForm(f => ({ ...f, jobTitle: v }))}
              placeholder="例：工程師、店員"
            />

            <FormField
              label="電話"
              value={form.phone}
              onChangeText={(v) => setForm(f => ({ ...f, phone: v }))}
              placeholder="聯絡電話"
              keyboardType="phone-pad"
            />

            <SegmentControl
              label="角色"
              options={[{ label: "員工", value: "employee" }, { label: "管理員", value: "admin" }]}
              value={form.role}
              onChange={(v) => setForm(f => ({ ...f, role: v as "admin" | "employee" }))}
            />

            <SegmentControl
              label="類型"
              options={[{ label: "全職", value: "full_time" }, { label: "兼職", value: "part_time" }]}
              value={form.employeeType}
              onChange={(v) => setForm(f => ({ ...f, employeeType: v as "full_time" | "part_time" }))}
            />
          </ScrollView>
        </View>
      </Modal>

      {/* Reset Password Modal */}
      <Modal visible={showResetModal} animationType="slide" presentationStyle="formSheet">
        <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          <View style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: "#E2E8F0",
            backgroundColor: "white",
          }}>
            <TouchableOpacity onPress={() => setShowResetModal(false)}>
              <Text style={{ color: "#64748B", fontSize: 16 }}>取消</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: "700", color: "#1E293B" }}>重置密碼</Text>
            <TouchableOpacity onPress={handleResetPassword} disabled={resetPasswordMutation.isPending}>
              {resetPasswordMutation.isPending ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                <Text style={{ color: "#2563EB", fontSize: 16, fontWeight: "700" }}>確認</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={{ padding: 16 }}>
            <Text style={{ fontSize: 14, color: "#64748B", marginBottom: 16 }}>
              為 <Text style={{ fontWeight: "700", color: "#1E293B" }}>{selectedEmployee?.fullName}</Text> 設定新密碼
            </Text>
            <FormField
              label="新密碼"
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="至少 6 個字元"
              secure
            />
            <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>
              重置後員工下次登入時需重新完成設定流程
            </Text>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
