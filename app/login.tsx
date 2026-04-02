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
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useEmployeeAuth } from "@/lib/employee-auth";
import { trpc } from "@/lib/trpc";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useEmployeeAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const loginMutation = trpc.employee.login.useMutation({
    onSuccess: async (data) => {
      await login({
        id: data.id,
        username: data.username,
        fullName: data.fullName,
        role: data.role as "admin" | "employee",
        needsSetup: data.needsSetup,
        employeeType: data.employeeType ?? undefined,
        jobTitle: data.jobTitle ?? null,
      });
      if (data.needsSetup) {
        router.replace("/setup/password" as any);
      } else if (data.role === "admin") {
        router.replace("/admin" as any);
      } else {
        router.replace("/(tabs)" as any);
      }
    },
    onError: (err) => {
      setError(err.message || "登入失敗，請再試一次");
    },
  });

  const handleLogin = () => {
    setError("");
    if (!username.trim() || !password.trim()) {
      setError("請輸入帳號和密碼");
      return;
    }
    loginMutation.mutate({ username: username.trim(), password });
  };

  return (
    <ScreenContainer
      edges={["top", "bottom", "left", "right"]}
      containerClassName="bg-primary"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 px-6 justify-center">
            {/* Logo / Title Area */}
            <View className="items-center mb-12">
              <View className="w-20 h-20 bg-white rounded-2xl items-center justify-center mb-4 shadow-lg">
                <Text style={{ fontSize: 40 }}>🕐</Text>
              </View>
              <Text className="text-3xl font-bold text-white mb-1">員工打卡系統</Text>
              <Text className="text-base text-blue-200">請登入您的帳號</Text>
            </View>

            {/* Login Card */}
            <View className="bg-white rounded-3xl p-6 shadow-xl">
              <Text className="text-2xl font-bold text-foreground mb-6">登入</Text>

              {/* Username */}
              <View className="mb-4">
                <Text className="text-sm font-medium text-muted mb-2">帳號</Text>
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  placeholder="請輸入帳號"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground text-base"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              {/* Password */}
              <View className="mb-6">
                <Text className="text-sm font-medium text-muted mb-2">密碼</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="請輸入密碼"
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
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

              {/* Login Button */}
              <TouchableOpacity
                onPress={handleLogin}
                disabled={loginMutation.isPending}
                style={{
                  backgroundColor: "#1E40AF",
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                  opacity: loginMutation.isPending ? 0.7 : 1,
                }}
              >
                {loginMutation.isPending ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
                    登入
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <Text className="text-center text-blue-200 text-sm mt-8">
              如忘記密碼，請聯絡管理員重置
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
