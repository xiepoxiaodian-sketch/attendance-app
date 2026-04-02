import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useEmployeeAuth } from "@/lib/employee-auth";
import { trpc } from "@/lib/trpc";

export default function SetupPasswordScreen() {
  const router = useRouter();
  const { employee } = useEmployeeAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const changePasswordMutation = trpc.employee.changePassword.useMutation({
    onSuccess: () => {
      router.replace("/setup/device" as any);
    },
    onError: (err) => {
      setError(err.message || "修改密碼失敗");
    },
  });

  const handleNext = () => {
    setError("");
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("請填寫所有欄位");
      return;
    }
    if (newPassword.length < 6) {
      setError("新密碼至少需要 6 個字元");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("新密碼與確認密碼不一致");
      return;
    }
    if (!employee) return;
    changePasswordMutation.mutate({
      employeeId: employee.id,
      currentPassword,
      newPassword,
    });
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 px-6 pt-8">
            {/* Progress */}
            <View className="flex-row items-center justify-center mb-8">
              {[1, 2, 3, 4].map((step) => (
                <View key={step} className="flex-row items-center">
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: step === 1 ? "#1E40AF" : step < 1 ? "#1E40AF" : "#E2E8F0",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: step <= 1 ? "white" : "#94A3B8", fontWeight: "600" }}>
                      {step}
                    </Text>
                  </View>
                  {step < 4 && (
                    <View
                      style={{
                        width: 40,
                        height: 2,
                        backgroundColor: step < 1 ? "#1E40AF" : "#E2E8F0",
                        marginHorizontal: 4,
                      }}
                    />
                  )}
                </View>
              ))}
            </View>

            <Text className="text-2xl font-bold text-foreground mb-2">設定新密碼</Text>
            <Text className="text-muted mb-8">
              首次登入需要修改預設密碼，請設定一個安全的新密碼。
            </Text>

            {/* Current Password */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-muted mb-2">目前密碼</Text>
              <TextInput
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="請輸入目前密碼"
                secureTextEntry
                returnKeyType="next"
                className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground text-base"
                placeholderTextColor="#94A3B8"
              />
            </View>

            {/* New Password */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-muted mb-2">新密碼</Text>
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="請輸入新密碼（至少 6 個字元）"
                secureTextEntry
                returnKeyType="next"
                className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground text-base"
                placeholderTextColor="#94A3B8"
              />
            </View>

            {/* Confirm Password */}
            <View className="mb-6">
              <Text className="text-sm font-medium text-muted mb-2">確認新密碼</Text>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="請再次輸入新密碼"
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleNext}
                className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground text-base"
                placeholderTextColor="#94A3B8"
              />
            </View>

            {/* Error */}
            {error ? (
              <View className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                <Text className="text-error text-sm text-center">{error}</Text>
              </View>
            ) : null}

            {/* Next Button */}
            <TouchableOpacity
              onPress={handleNext}
              disabled={changePasswordMutation.isPending}
              style={{
                backgroundColor: "#1E40AF",
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center",
                opacity: changePasswordMutation.isPending ? 0.7 : 1,
              }}
            >
              {changePasswordMutation.isPending ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
                  下一步
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
