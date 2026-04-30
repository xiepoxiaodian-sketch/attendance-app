import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useEmployeeAuth } from "@/lib/employee-auth";
import { trpc } from "@/lib/trpc";

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{
      backgroundColor: "white",
      borderRadius: 12,
      marginHorizontal: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: "#E2E8F0",
      overflow: "hidden",
    }}>
      <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748B", letterSpacing: 0.5, textTransform: "uppercase" }}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={{
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: last ? 0 : 1,
      borderBottomColor: "#F1F5F9",
    }}>
      <Text style={{ fontSize: 14, color: "#64748B" }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: "500", color: "#1E293B" }}>{value}</Text>
    </View>
  );
}

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

  const changePasswordMutation = trpc.employee.changePassword.useMutation({
    onSuccess: () => {
      setShowPasswordModal(false);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      Alert.alert("成功", "密碼已更新");
    },
    onError: (err) => setPasswordError(err.message || "修改失敗"),
  });

  const handleLogout = () => {
    if (Platform.OS === "web") {
      if (!window.confirm("確定要登出嗎？")) return;
      logout().then(() => router.replace("/login" as any));
      return;
    }
    Alert.alert("登出", "確定要登出嗎？", [
      { text: "取消" },
      {
        text: "登出",
        style: "destructive",
        onPress: async () => {
          await logout();
          setTimeout(() => router.replace("/login" as any), 50);
        },
      },
    ]);
  };

  const handleChangePassword = () => {
    setPasswordError("");
    if (!currentPassword || !newPassword || !confirmPassword) { setPasswordError("請填寫所有欄位"); return; }
    if (newPassword.length < 6) { setPasswordError("新密碼至少需要 6 個字元"); return; }
    if (newPassword !== confirmPassword) { setPasswordError("新密碼與確認密碼不一致"); return; }
    if (!employee) return;
    changePasswordMutation.mutate({ employeeId: employee.id, currentPassword, newPassword });
  };

  const employeeTypeLabel = profile?.employeeType === "part_time" ? "兼職" : "全職";
  const displayName = profile?.fullName || employee?.fullName || "員工";

  return (
    <ScreenContainer containerClassName="bg-[#F1F5F9]">
      {/* Page Header */}
      <View style={{
        backgroundColor: "white",
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: "#E2E8F0",
      }}>
        <Text style={{ fontSize: 20, fontWeight: "700", color: "#1E293B" }}>個人資料</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 14, paddingBottom: 32 }}>
        {/* Avatar Card */}
        <View style={{
          backgroundColor: "white",
          borderRadius: 12,
          marginHorizontal: 14,
          marginBottom: 12,
          padding: 16,
          borderWidth: 1,
          borderColor: "#E2E8F0",
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
        }}>
          <View style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: "#1E3A8A",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <Text style={{ fontSize: 22, fontWeight: "700", color: "white" }}>
              {displayName[0]}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#1E293B" }}>{displayName}</Text>
            <Text style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>
              {profile?.jobTitle || "員工"} · {employeeTypeLabel}
            </Text>
          </View>
          <View style={{ backgroundColor: "#DBEAFE", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#1D4ED8" }}>
              {employee?.role === "admin" ? "管理員" : "員工"}
            </Text>
          </View>
        </View>

        {/* Account Info */}
        <SectionCard title="帳號資訊">
          <InfoRow label="帳號" value={profile?.username || employee?.username || "-"} />
          <InfoRow label="姓名" value={displayName} />
          <InfoRow label="職稱" value={profile?.jobTitle || "-"} />
          <InfoRow label="員工類型" value={employeeTypeLabel} />
          <InfoRow label="電話" value={profile?.phone || "-"} last />
        </SectionCard>

        {/* Actions */}
        <SectionCard title="帳號設定">
          <TouchableOpacity
            onPress={() => setShowPasswordModal(true)}
            style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}
          >
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
              <Text style={{ fontSize: 16 }}>🔑</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 15, color: "#1E293B" }}>修改密碼</Text>
            <Text style={{ color: "#94A3B8", fontSize: 18 }}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleLogout}
            style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14 }}
          >
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#FEF2F2", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
              <Text style={{ fontSize: 16 }}>🚪</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 15, color: "#EF4444", fontWeight: "500" }}>登出</Text>
          </TouchableOpacity>
        </SectionCard>
      </ScrollView>

      {/* Change Password Modal */}
      <Modal visible={showPasswordModal} animationType="slide" presentationStyle="pageSheet">
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
            <TouchableOpacity onPress={() => setShowPasswordModal(false)}>
              <Text style={{ color: "#64748B", fontSize: 16 }}>取消</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: "700", color: "#1E293B" }}>修改密碼</Text>
            <TouchableOpacity onPress={handleChangePassword} disabled={changePasswordMutation.isPending}>
              {changePasswordMutation.isPending ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                <Text style={{ color: "#2563EB", fontSize: 16, fontWeight: "700" }}>確定</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {[
              { label: "目前密碼", value: currentPassword, onChange: setCurrentPassword },
              { label: "新密碼", value: newPassword, onChange: setNewPassword },
              { label: "確認新密碼", value: confirmPassword, onChange: setConfirmPassword },
            ].map((field, i) => (
              <View key={i} style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#475569", marginBottom: 6 }}>{field.label}</Text>
                <TextInput
                  value={field.value}
                  onChangeText={field.onChange}
                  secureTextEntry
                  returnKeyType={i < 2 ? "next" : "done"}
                  onSubmitEditing={i === 2 ? handleChangePassword : undefined}
                  style={{
                    backgroundColor: "white",
                    borderWidth: 1,
                    borderColor: "#E2E8F0",
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 11,
                    fontSize: 14,
                    color: "#1E293B",
                  }}
                  placeholderTextColor="#94A3B8"
                  placeholder={`請輸入${field.label}`}
                />
              </View>
            ))}

            {passwordError ? (
              <View style={{ backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA", borderRadius: 10, padding: 12 }}>
                <Text style={{ color: "#EF4444", fontSize: 13, textAlign: "center" }}>{passwordError}</Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
