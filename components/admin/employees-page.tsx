import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useCallback, useEffect, useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { AdminHeader } from "@/components/admin-header";
import { ConfirmDialog, AlertDialog } from "@/components/confirm-dialog";
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
  tag?: "indoor" | "outdoor" | "supervisor" | null;
};

const TAG_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  indoor:     { label: "內場", bg: "#EFF6FF", text: "#2563EB" },
  outdoor:    { label: "外場", bg: "#F0FDF4", text: "#16A34A" },
  supervisor: { label: "幹部", bg: "#FEF3C7", text: "#D97706" },
};

const INITIAL_FORM = {
  username: "",
  password: "",
  fullName: "",
  role: "employee" as "admin" | "employee",
  employeeType: "full_time" as "full_time" | "part_time",
  jobTitle: "",
  phone: "",
  tag: "" as "" | "indoor" | "outdoor" | "supervisor",
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
  const [alertDialog, setAlertDialog] = useState<{ title: string; message: string } | null>(null);
  const [confirmDeleteEmp, setConfirmDeleteEmp] = useState<Employee | null>(null);
  const [displayedEmployees, setDisplayedEmployees] = useState<Employee[]>([]);

  const { data: employees, refetch, isLoading } = trpc.employees.list.useQuery();

  const createMutation = trpc.employees.create.useMutation({
    onSuccess: () => {
      refetch();
      setShowModal(false);
      setForm(INITIAL_FORM);
      setAlertDialog({ title: "成功", message: "員工帳號已建立" });
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
      setAlertDialog({ title: "成功", message: "密碼已重置，員工下次登入需重新設定" });
    },
    onError: (err) => setAlertDialog({ title: "錯誤", message: err.message }),
  });

  const deleteMutation = trpc.employees.delete.useMutation({
    onSuccess: () => refetch(),
  });

  const reorderMutation = trpc.employees.reorder.useMutation({
    onSuccess: () => refetch(),
  });

  // 同步顯示的員工列表
  useEffect(() => {
    if (employees) {
      setDisplayedEmployees([...employees]);
    }
  }, [employees]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

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
    createMutation.mutate({ ...form, tag: form.tag || undefined });
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
      tag: (emp.tag as "" | "indoor" | "outdoor" | "supervisor") || "",
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
      tag: form.tag || null,
    });
  };

  const handleToggleActive = (emp: Employee) => {
    updateMutation.mutate({ id: emp.id, isActive: !emp.isActive });
  };

  const handleDelete = (emp: Employee) => {
    setConfirmDeleteEmp(emp);
  };

  const handleResetPassword = () => {
    if (!selectedEmployee || !newPassword || newPassword.length < 6) {
      setAlertDialog({ title: "錯誤", message: "新密碼至少需要 6 個字元" });
      return;
    }
    resetPasswordMutation.mutate({ id: selectedEmployee.id, newPassword });
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newList = [...displayedEmployees];
    [newList[index], newList[index - 1]] = [newList[index - 1], newList[index]];
    setDisplayedEmployees(newList);
    reorderMutation.mutate({ orderedIds: newList.map(e => e.id) });
  };

  const handleMoveDown = (index: number) => {
    if (index === displayedEmployees.length - 1) return;
    const newList = [...displayedEmployees];
    [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
    setDisplayedEmployees(newList);
    reorderMutation.mutate({ orderedIds: newList.map(e => e.id) });
  };

  const filteredEmployees = displayedEmployees.filter(e =>
    !searchQuery ||
    e.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ScreenContainer containerClassName="bg-[#F1F5F9]">
      <AlertDialog
        visible={!!alertDialog}
        title={alertDialog?.title ?? ""}
        message={alertDialog?.message ?? ""}
        onClose={() => setAlertDialog(null)}
      />
      <ConfirmDialog
        visible={!!confirmDeleteEmp}
        title="刪除員工"
        message={`確定要刪除 ${confirmDeleteEmp?.fullName} 的帳號嗎？此操作無法復原。`}
        confirmText="刪除"
        confirmStyle="destructive"
        onConfirm={() => { if (confirmDeleteEmp) deleteMutation.mutate({ id: confirmDeleteEmp.id }); setConfirmDeleteEmp(null); }}
        onCancel={() => setConfirmDeleteEmp(null)}
      />
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
          renderItem={({ item, index }) => (
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
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
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
                    {item.tag && TAG_LABELS[item.tag] && (
                      <View style={{ backgroundColor: TAG_LABELS[item.tag].bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20 }}>
                        <Text style={{ fontSize: 10, color: TAG_LABELS[item.tag].text, fontWeight: "600" }}>{TAG_LABELS[item.tag].label}</Text>
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
              <View style={{ flexDirection: "row", marginTop: 12, gap: 8, flexWrap: "wrap" }}>
                <TouchableOpacity
                  onPress={() => handleEdit(item)}
                  style={{ flex: 1, minWidth: 70, backgroundColor: "#EFF6FF", borderRadius: 8, paddingVertical: 7, alignItems: "center" }}
                >
                  <Text style={{ color: "#2563EB", fontSize: 13, fontWeight: "600" }}>編輯</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setSelectedEmployee(item); setNewPassword(""); setShowResetModal(true); }}
                  style={{ flex: 1, minWidth: 70, backgroundColor: "#F0FDF4", borderRadius: 8, paddingVertical: 7, alignItems: "center" }}
                >
                  <Text style={{ color: "#16A34A", fontSize: 13, fontWeight: "600" }}>重置密碼</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleToggleActive(item)}
                  style={{ flex: 1, minWidth: 70, backgroundColor: item.isActive ? "#FFFBEB" : "#F0FDF4", borderRadius: 8, paddingVertical: 7, alignItems: "center" }}
                >
                  <Text style={{ color: item.isActive ? "#D97706" : "#16A34A", fontSize: 13, fontWeight: "600" }}>
                    {item.isActive ? "停用" : "啟用"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDelete(item)}
                  style={{ flex: 1, minWidth: 70, backgroundColor: "#FEF2F2", borderRadius: 8, paddingVertical: 7, alignItems: "center" }}
                >
                  <Text style={{ color: "#DC2626", fontSize: 13, fontWeight: "600" }}>刪除</Text>
                </TouchableOpacity>
              </View>

              {/* Sort Buttons */}
              <View style={{ flexDirection: "row", marginTop: 8, gap: 8 }}>
                <TouchableOpacity
                  onPress={() => handleMoveUp(index!)}
                  disabled={index === 0}
                  style={{ flex: 1, backgroundColor: index === 0 ? "#F1F5F9" : "#E0E7FF", borderRadius: 8, paddingVertical: 7, alignItems: "center", opacity: index === 0 ? 0.5 : 1 }}
                >
                  <Text style={{ color: index === 0 ? "#94A3B8" : "#4F46E5", fontSize: 13, fontWeight: "600" }}>↑ 上移</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleMoveDown(index!)}
                  disabled={index === displayedEmployees.length - 1}
                  style={{ flex: 1, backgroundColor: index === displayedEmployees.length - 1 ? "#F1F5F9" : "#E0E7FF", borderRadius: 8, paddingVertical: 7, alignItems: "center", opacity: index === displayedEmployees.length - 1 ? 0.5 : 1 }}
                >
                  <Text style={{ color: index === displayedEmployees.length - 1 ? "#94A3B8" : "#4F46E5", fontSize: 13, fontWeight: "600" }}>↓ 下移</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Create/Edit Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 40 }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: "#1E293B", marginBottom: 20 }}>
              {selectedEmployee ? "編輯員工" : "新增員工"}
            </Text>

            {formError && (
              <View style={{ backgroundColor: "#FEE2E2", borderRadius: 10, padding: 12, marginBottom: 16 }}>
                <Text style={{ color: "#DC2626", fontSize: 13 }}>{formError}</Text>
              </View>
            )}

            <FormField
              label="帳號"
              value={form.username}
              onChangeText={(v) => setForm({ ...form, username: v })}
              placeholder="輸入帳號"
              disabled={!!selectedEmployee}
            />

            {!selectedEmployee && (
              <FormField
                label="密碼"
                value={form.password}
                onChangeText={(v) => setForm({ ...form, password: v })}
                placeholder="輸入密碼（至少 6 個字元）"
                secure
              />
            )}

            <FormField
              label="姓名"
              value={form.fullName}
              onChangeText={(v) => setForm({ ...form, fullName: v })}
              placeholder="輸入姓名"
            />

            <SegmentControl
              label="角色"
              options={[
                { label: "員工", value: "employee" },
                { label: "管理員", value: "admin" },
              ]}
              value={form.role}
              onChange={(v) => setForm({ ...form, role: v as "admin" | "employee" })}
            />

            <SegmentControl
              label="員工類型"
              options={[
                { label: "全職", value: "full_time" },
                { label: "兼職", value: "part_time" },
              ]}
              value={form.employeeType}
              onChange={(v) => setForm({ ...form, employeeType: v as "full_time" | "part_time" })}
            />

            <FormField
              label="職位"
              value={form.jobTitle}
              onChangeText={(v) => setForm({ ...form, jobTitle: v })}
              placeholder="輸入職位（可選）"
            />

            <FormField
              label="電話"
              value={form.phone}
              onChangeText={(v) => setForm({ ...form, phone: v })}
              placeholder="輸入電話（可選）"
              keyboardType="phone-pad"
            />

            <SegmentControl
              label="標籤"
              options={[
                { label: "無", value: "" },
                { label: "內場", value: "indoor" },
                { label: "外場", value: "outdoor" },
                { label: "幹部", value: "supervisor" },
              ]}
              value={form.tag}
              onChange={(v) => setForm({ ...form, tag: v as "" | "indoor" | "outdoor" | "supervisor" })}
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
              <TouchableOpacity
                onPress={() => setShowModal(false)}
                style={{ flex: 1, backgroundColor: "#F1F5F9", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
              >
                <Text style={{ color: "#64748B", fontWeight: "600", fontSize: 15 }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={selectedEmployee ? handleUpdate : handleCreate}
                style={{ flex: 1, backgroundColor: "#2563EB", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
              >
                <Text style={{ color: "white", fontWeight: "600", fontSize: 15 }}>
                  {selectedEmployee ? "更新" : "建立"}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Reset Password Modal */}
      <Modal visible={showResetModal} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 }}>
          <View style={{ backgroundColor: "white", borderRadius: 16, padding: 20, width: "100%", maxWidth: 400 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#1E293B", marginBottom: 12 }}>重置密碼</Text>
            <Text style={{ fontSize: 14, color: "#64748B", marginBottom: 16 }}>
              為 {selectedEmployee?.fullName} 設定新密碼
            </Text>

            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="輸入新密碼（至少 6 個字元）"
              secureTextEntry
              style={{
                backgroundColor: "#F8FAFC",
                borderWidth: 1,
                borderColor: "#E2E8F0",
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 11,
                fontSize: 15,
                color: "#1E293B",
                marginBottom: 16,
              }}
              placeholderTextColor="#94A3B8"
            />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => setShowResetModal(false)}
                style={{ flex: 1, backgroundColor: "#F1F5F9", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
              >
                <Text style={{ color: "#64748B", fontWeight: "600", fontSize: 15 }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleResetPassword}
                style={{ flex: 1, backgroundColor: "#16A34A", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
              >
                <Text style={{ color: "white", fontWeight: "600", fontSize: 15 }}>確認</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
