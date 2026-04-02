import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useEmployeeAuth } from "@/lib/employee-auth";
import { trpc } from "@/lib/trpc";

export default function ProfileScreen() {
  const router = useRouter();
  const { employee, logout } = useEmployeeAuth();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const { data: profile } = trpc.employee.getProfile.useQuery(
    { employeeId: employee?.id ?? 0 },
    { enabled: !!employee }
  );

  const { data: devices, refetch: refetchDevices } = trpc.devices.getByEmployee.useQuery(
    { employeeId: employee?.id ?? 0 },
    { enabled: !!employee }
  );

  const changePasswordMutation = trpc.employee.changePassword.useMutation({
    onSuccess: () => {
      setShowPasswordModal(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert("成功", "密碼已更新");
    },
    onError: (err) => {
      setPasswordError(err.message || "修改失敗");
    },
  });

  const deleteDeviceMutation = trpc.devices.delete.useMutation({
    onSuccess: () => refetchDevices(),
  });

  const handleLogout = () => {
    Alert.alert("登出", "確定要登出嗎？", [
      { text: "取消" },
      {
        text: "登出",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login" as any);
        },
      },
    ]);
  };

  const handleChangePassword = () => {
    setPasswordError("");
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("請填寫所有欄位");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("新密碼至少需要 6 個字元");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("新密碼與確認密碼不一致");
      return;
    }
    if (!employee) return;
    changePasswordMutation.mutate({
      employeeId: employee.id,
      currentPassword,
      newPassword,
    });
  };

  const handleDeleteDevice = (id: number) => {
    Alert.alert("解除裝置綁定", "確定要解除此裝置的綁定嗎？解除後需要重新綁定才能打卡。", [
      { text: "取消" },
      {
        text: "解除",
        style: "destructive",
        onPress: () => deleteDeviceMutation.mutate({ id }),
      },
    ]);
  };

  const employeeTypeLabel = profile?.employeeType === "part_time" ? "兼職" : "全職";

  return (
    <ScreenContainer>
      <ScrollView>
        {/* Header */}
        <View style={{ backgroundColor: "#1E40AF", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}>
          <Text style={{ color: "white", fontSize: 22, fontWeight: "700" }}>個人資料</Text>
        </View>

        {/* Avatar Card */}
        <View style={{ marginHorizontal: 16, marginTop: -24, backgroundColor: "white", borderRadius: 16, padding: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3, marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", marginRight: 14 }}>
              <Text style={{ fontSize: 28 }}>👤</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: "700", color: "#1E293B" }}>
                {profile?.fullName || employee?.fullName}
              </Text>
              <Text style={{ fontSize: 14, color: "#64748B", marginTop: 2 }}>
                {profile?.jobTitle || "員工"} · {employeeTypeLabel}
              </Text>
            </View>
          </View>
        </View>

        {/* Info Card */}
        <View style={{ marginHorizontal: 16, backgroundColor: "white", borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#64748B", marginBottom: 12 }}>帳號資訊</Text>
          {[
            { label: "帳號", value: profile?.username || employee?.username },
            { label: "姓名", value: profile?.fullName || employee?.fullName },
            { label: "職稱", value: profile?.jobTitle || "-" },
            { label: "員工類型", value: employeeTypeLabel },
            { label: "電話", value: profile?.phone || "-" },
          ].map((item, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: i < 4 ? 0.5 : 0, borderBottomColor: "#F1F5F9" }}>
              <Text style={{ color: "#64748B", fontSize: 14 }}>{item.label}</Text>
              <Text style={{ color: "#1E293B", fontSize: 14, fontWeight: "500" }}>{item.value}</Text>
            </View>
          ))}
        </View>

        {/* Devices Card */}
        <View style={{ marginHorizontal: 16, backgroundColor: "white", borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#64748B", marginBottom: 12 }}>已綁定裝置</Text>
          {!devices || devices.length === 0 ? (
            <Text style={{ color: "#94A3B8", fontSize: 14, textAlign: "center", paddingVertical: 8 }}>
              尚未綁定任何裝置
            </Text>
          ) : (
            devices.map((device, i) => (
              <View key={device.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: i < devices.length - 1 ? 0.5 : 0, borderBottomColor: "#F1F5F9" }}>
                <Text style={{ fontSize: 24, marginRight: 10 }}>
                  {device.platform === "ios" ? "📱" : device.platform === "android" ? "📱" : "💻"}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: "#1E293B" }}>
                    {device.deviceName || "未知裝置"}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#94A3B8" }}>
                    {device.platform?.toUpperCase()} · {new Date(device.registeredAt ?? "").toLocaleDateString("zh-TW")}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleDeleteDevice(device.id)}>
                  <Text style={{ color: "#EF4444", fontSize: 13 }}>解除</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Actions */}
        <View style={{ marginHorizontal: 16, backgroundColor: "white", borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
          <TouchableOpacity
            onPress={() => setShowPasswordModal(true)}
            style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: "#F1F5F9" }}
          >
            <Text style={{ fontSize: 20, marginRight: 12 }}>🔑</Text>
            <Text style={{ flex: 1, fontSize: 15, color: "#1E293B" }}>修改密碼</Text>
            <Text style={{ color: "#94A3B8" }}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleLogout}
            style={{ flexDirection: "row", alignItems: "center", padding: 16 }}
          >
            <Text style={{ fontSize: 20, marginRight: 12 }}>🚪</Text>
            <Text style={{ flex: 1, fontSize: 15, color: "#EF4444" }}>登出</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Change Password Modal */}
      <Modal visible={showPasswordModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: "#E2E8F0", backgroundColor: "white" }}>
            <TouchableOpacity onPress={() => setShowPasswordModal(false)}>
              <Text style={{ color: "#64748B", fontSize: 16 }}>取消</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: "600", color: "#1E293B" }}>修改密碼</Text>
            <TouchableOpacity onPress={handleChangePassword} disabled={changePasswordMutation.isPending}>
              {changePasswordMutation.isPending ? (
                <ActivityIndicator size="small" color="#1E40AF" />
              ) : (
                <Text style={{ color: "#1E40AF", fontSize: 16, fontWeight: "600" }}>確定</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            {[
              { label: "目前密碼", value: currentPassword, onChange: setCurrentPassword },
              { label: "新密碼", value: newPassword, onChange: setNewPassword },
              { label: "確認新密碼", value: confirmPassword, onChange: setConfirmPassword },
            ].map((field, i) => (
              <View key={i} style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: "#64748B", marginBottom: 8 }}>{field.label}</Text>
                <TextInput
                  value={field.value}
                  onChangeText={field.onChange}
                  secureTextEntry
                  returnKeyType={i < 2 ? "next" : "done"}
                  onSubmitEditing={i === 2 ? handleChangePassword : undefined}
                  style={{ backgroundColor: "white", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: "#1E293B" }}
                  placeholderTextColor="#94A3B8"
                  placeholder={`請輸入${field.label}`}
                />
              </View>
            ))}

            {passwordError ? (
              <View style={{ backgroundColor: "#FEE2E2", borderRadius: 10, padding: 12 }}>
                <Text style={{ color: "#DC2626", fontSize: 14, textAlign: "center" }}>{passwordError}</Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
