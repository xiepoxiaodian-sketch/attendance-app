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
  Switch,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
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
    !searchQuery || e.fullName.toLowerCase().includes(searchQuery.toLowerCase()) || e.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={{ backgroundColor: "#1E40AF", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: "white", fontSize: 22, fontWeight: "700" }}>員工管理</Text>
          <TouchableOpacity
            onPress={() => { setSelectedEmployee(null); setForm(INITIAL_FORM); setFormError(""); setShowModal(true); }}
            style={{ backgroundColor: "white", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }}
          >
            <Text style={{ color: "#1E40AF", fontWeight: "600", fontSize: 14 }}>+ 新增</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={{ padding: 12, backgroundColor: "white", borderBottomWidth: 0.5, borderBottomColor: "#E2E8F0" }}>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="搜尋員工姓名或帳號..."
          returnKeyType="search"
          style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: "#1E293B" }}
          placeholderTextColor="#94A3B8"
        />
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#1E40AF" />
        </View>
      ) : (
        <FlatList
          data={filteredEmployees}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 12 }}
          renderItem={({ item }) => (
            <View style={{ backgroundColor: "white", borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: item.role === "admin" ? "#FEF3C7" : "#EFF6FF", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                  <Text style={{ fontSize: 20 }}>{item.role === "admin" ? "👑" : "👤"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: item.isActive ? "#1E293B" : "#94A3B8" }}>
                      {item.fullName}
                    </Text>
                    {!item.isActive && (
                      <View style={{ backgroundColor: "#FEE2E2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginLeft: 6 }}>
                        <Text style={{ fontSize: 10, color: "#DC2626" }}>停用</Text>
                      </View>
                    )}
                    {item.needsSetup && (
                      <View style={{ backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginLeft: 4 }}>
                        <Text style={{ fontSize: 10, color: "#D97706" }}>待設定</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 12, color: "#64748B", marginTop: 1 }}>
                    @{item.username} · {item.jobTitle || (item.role === "admin" ? "管理員" : "員工")} · {item.employeeType === "part_time" ? "兼職" : "全職"}
                  </Text>
                </View>
              </View>

              {/* Actions */}
              <View style={{ flexDirection: "row", marginTop: 10, gap: 8 }}>
                <TouchableOpacity
                  onPress={() => handleEdit(item)}
                  style={{ flex: 1, backgroundColor: "#EFF6FF", borderRadius: 8, paddingVertical: 6, alignItems: "center" }}
                >
                  <Text style={{ color: "#1E40AF", fontSize: 13, fontWeight: "500" }}>編輯</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setSelectedEmployee(item); setNewPassword(""); setShowResetModal(true); }}
                  style={{ flex: 1, backgroundColor: "#F0FDF4", borderRadius: 8, paddingVertical: 6, alignItems: "center" }}
                >
                  <Text style={{ color: "#16A34A", fontSize: 13, fontWeight: "500" }}>重置密碼</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleToggleActive(item)}
                  style={{ flex: 1, backgroundColor: item.isActive ? "#FEF3C7" : "#F0FDF4", borderRadius: 8, paddingVertical: 6, alignItems: "center" }}
                >
                  <Text style={{ color: item.isActive ? "#D97706" : "#16A34A", fontSize: 13, fontWeight: "500" }}>
                    {item.isActive ? "停用" : "啟用"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDelete(item)}
                  style={{ flex: 1, backgroundColor: "#FEE2E2", borderRadius: 8, paddingVertical: 6, alignItems: "center" }}
                >
                  <Text style={{ color: "#DC2626", fontSize: 13, fontWeight: "500" }}>刪除</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Create/Edit Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: "#E2E8F0", backgroundColor: "white" }}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={{ color: "#64748B", fontSize: 16 }}>取消</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: "600", color: "#1E293B" }}>
              {selectedEmployee ? "編輯員工" : "新增員工"}
            </Text>
            <TouchableOpacity onPress={selectedEmployee ? handleUpdate : handleCreate} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? (
                <ActivityIndicator size="small" color="#1E40AF" />
              ) : (
                <Text style={{ color: "#1E40AF", fontSize: 16, fontWeight: "600" }}>
                  {selectedEmployee ? "更新" : "建立"}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {[
              { label: "帳號", key: "username", placeholder: "登入帳號", disabled: !!selectedEmployee },
              ...(!selectedEmployee ? [{ label: "初始密碼", key: "password", placeholder: "至少 6 個字元", secure: true }] : []),
              { label: "姓名", key: "fullName", placeholder: "員工姓名" },
              { label: "職稱", key: "jobTitle", placeholder: "例：工程師、業務" },
              { label: "電話", key: "phone", placeholder: "聯絡電話" },
            ].map((field: any, i) => (
              <View key={i} style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 13, fontWeight: "500", color: "#64748B", marginBottom: 6 }}>{field.label}</Text>
                <TextInput
                  value={(form as any)[field.key]}
                  onChangeText={(v) => setForm(f => ({ ...f, [field.key]: v }))}
                  placeholder={field.placeholder}
                  secureTextEntry={field.secure}
                  editable={!field.disabled}
                  returnKeyType="next"
                  style={{
                    backgroundColor: field.disabled ? "#F1F5F9" : "white",
                    borderWidth: 1,
                    borderColor: "#E2E8F0",
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 15,
                    color: field.disabled ? "#94A3B8" : "#1E293B",
                  }}
                  placeholderTextColor="#94A3B8"
                />
              </View>
            ))}

            {/* Role */}
            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 13, fontWeight: "500", color: "#64748B", marginBottom: 8 }}>角色</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[{ value: "employee", label: "員工" }, { value: "admin", label: "管理員" }].map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setForm(f => ({ ...f, role: opt.value as any }))}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: form.role === opt.value ? "#1E40AF" : "#E2E8F0", backgroundColor: form.role === opt.value ? "#EFF6FF" : "white", alignItems: "center" }}
                  >
                    <Text style={{ color: form.role === opt.value ? "#1E40AF" : "#64748B", fontWeight: "500" }}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Employee Type */}
            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 13, fontWeight: "500", color: "#64748B", marginBottom: 8 }}>員工類型</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[{ value: "full_time", label: "全職" }, { value: "part_time", label: "兼職" }].map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setForm(f => ({ ...f, employeeType: opt.value as any }))}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: form.employeeType === opt.value ? "#1E40AF" : "#E2E8F0", backgroundColor: form.employeeType === opt.value ? "#EFF6FF" : "white", alignItems: "center" }}
                  >
                    <Text style={{ color: form.employeeType === opt.value ? "#1E40AF" : "#64748B", fontWeight: "500" }}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {formError ? (
              <View style={{ backgroundColor: "#FEE2E2", borderRadius: 10, padding: 12 }}>
                <Text style={{ color: "#DC2626", fontSize: 14, textAlign: "center" }}>{formError}</Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      {/* Reset Password Modal */}
      <Modal visible={showResetModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: "#E2E8F0", backgroundColor: "white" }}>
            <TouchableOpacity onPress={() => setShowResetModal(false)}>
              <Text style={{ color: "#64748B", fontSize: 16 }}>取消</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: "600", color: "#1E293B" }}>重置密碼</Text>
            <TouchableOpacity onPress={handleResetPassword} disabled={resetPasswordMutation.isPending}>
              {resetPasswordMutation.isPending ? (
                <ActivityIndicator size="small" color="#1E40AF" />
              ) : (
                <Text style={{ color: "#1E40AF", fontSize: 16, fontWeight: "600" }}>確定</Text>
              )}
            </TouchableOpacity>
          </View>
          <View style={{ padding: 16 }}>
            <Text style={{ fontSize: 14, color: "#64748B", marginBottom: 16 }}>
              為 {selectedEmployee?.fullName} 設定新密碼。員工下次登入時需重新設定。
            </Text>
            <Text style={{ fontSize: 13, fontWeight: "500", color: "#64748B", marginBottom: 8 }}>新密碼</Text>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="至少 6 個字元"
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleResetPassword}
              style={{ backgroundColor: "white", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: "#1E293B" }}
              placeholderTextColor="#94A3B8"
            />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
