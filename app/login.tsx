import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Switch,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useEmployeeAuth } from "@/lib/employee-auth";
import { trpc } from "@/lib/trpc";
import * as LocalAuthentication from "expo-local-authentication";

export default function LoginScreen() {
  const router = useRouter();
  const {
    login,
    saveCredentials,
    loadSavedCredentials,
    clearSavedCredentials,
    isBiometricEnabled,
    enableBiometric,
    getBiometricCredentials,
  } = useEmployeeAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [stayLoggedIn, setStayLoggedIn] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState<"face" | "fingerprint" | "none">("none");
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Load saved credentials and check biometric on mount
  useEffect(() => {
    loadSavedCredentials().then((creds) => {
      if (creds) {
        setUsername(creds.username);
        setPassword(creds.password);
        setRememberMe(true);
      }
    });

    // Check biometric availability
    if (Platform.OS !== "web") {
      Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        LocalAuthentication.supportedAuthenticationTypesAsync(),
      ]).then(([hasHw, isEnrolled, types]) => {
        if (hasHw && isEnrolled) {
          setBiometricAvailable(true);
          if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
            setBiometricType("face");
          } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
            setBiometricType("fingerprint");
          }
        }
      });
    }

    // Check if biometric login is enabled
    isBiometricEnabled().then(setBiometricEnabled);
  }, []);

  const loginMutation = trpc.employee.login.useMutation({
    onSuccess: async (data) => {
      if (rememberMe) {
        await saveCredentials(username.trim(), password);
      } else {
        await clearSavedCredentials();
      }

      // Admin always stays logged in (multi-device support, no session restriction)
      const shouldStayLoggedIn = data.role === "admin" ? true : stayLoggedIn;
      await login(
        {
          id: data.id,
          username: data.username,
          fullName: data.fullName,
          role: data.role as "admin" | "employee",
          needsSetup: data.needsSetup,
          employeeType: data.employeeType ?? undefined,
          jobTitle: data.jobTitle ?? null,
        },
        shouldStayLoggedIn
      );

      // If biometric is available and not yet enabled, offer to enable it
      if (biometricAvailable && !biometricEnabled && Platform.OS !== "web") {
        const label = biometricType === "face" ? "臉部識別" : "指紋識別";
        Alert.alert(
          `啟用${label}快速登入`,
          `下次登入時可直接使用${label}，不需輸入帳號密碼`,
          [
            { text: "稍後再說", style: "cancel" },
            {
              text: "啟用",
              onPress: async () => {
                await enableBiometric(username.trim(), password);
                setBiometricEnabled(true);
              },
            },
          ]
        );
      }

      if (data.needsSetup) {
        router.replace("/setup/password" as any);
      } else if (data.role === "admin") {
        router.replace("/admin" as any);
      } else {
        router.replace("/(tabs)" as any);
      }
    },
    onError: (err) => {
      setError(err.message || "帳號或密碼錯誤");
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

  const handleBiometricLogin = async () => {
    if (biometricLoading) return;
    setBiometricLoading(true);
    setError("");
    try {
      const label = biometricType === "face" ? "臉部識別" : "指紋識別";
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `使用${label}快速登入`,
        fallbackLabel: "使用密碼",
        disableDeviceFallback: false,
      });

      if (!result.success) {
        setBiometricLoading(false);
        return;
      }

      const creds = await getBiometricCredentials();
      if (!creds) {
        setError("生物識別資料已失效，請重新登入");
        setBiometricLoading(false);
        return;
      }

      loginMutation.mutate({ username: creds.username, password: creds.password });
    } catch {
      setError("生物識別驗證失敗，請使用帳號密碼登入");
    } finally {
      setBiometricLoading(false);
    }
  };

  const biometricLabel = biometricType === "face" ? "臉部識別" : "指紋識別";
  const biometricIcon = biometricType === "face" ? "🪪" : "👆";

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
          <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: "center" }}>
            {/* Logo / Title Area */}
            <View style={{ alignItems: "center", marginBottom: 40 }}>
              <View style={{
                width: 80, height: 80,
                backgroundColor: "white",
                borderRadius: 20,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
                elevation: 8,
              }}>
                <Text style={{ fontSize: 40 }}>🕐</Text>
              </View>
              <Text style={{ fontSize: 28, fontWeight: "700", color: "white", marginBottom: 4 }}>
                好好上班
              </Text>
              <Text style={{ fontSize: 14, color: "rgba(255,255,255,0.75)" }}>
                請登入您的帳號
              </Text>
            </View>

            {/* Login Card */}
            <View style={{
              backgroundColor: "white",
              borderRadius: 20,
              padding: 24,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.15,
              shadowRadius: 20,
              elevation: 10,
            }}>
              <Text style={{ fontSize: 20, fontWeight: "700", color: "#1E293B", marginBottom: 20 }}>
                帳號登入
              </Text>

              {/* Username */}
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#475569", marginBottom: 6 }}>
                  帳號
                </Text>
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  placeholder="請輸入帳號"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  style={{
                    backgroundColor: "#F8FAFC",
                    borderWidth: 1,
                    borderColor: "#E2E8F0",
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 15,
                    color: "#1E293B",
                  }}
                  placeholderTextColor="#94A3B8"
                />
              </View>

              {/* Password */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#475569", marginBottom: 6 }}>
                  密碼
                </Text>
                <View style={{ position: "relative" }}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="請輸入密碼"
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                    style={{
                      backgroundColor: "#F8FAFC",
                      borderWidth: 1,
                      borderColor: "#E2E8F0",
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      paddingRight: 48,
                      fontSize: 15,
                      color: "#1E293B",
                    }}
                    placeholderTextColor="#94A3B8"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(v => !v)}
                    style={{
                      position: "absolute",
                      right: 12,
                      top: 0,
                      bottom: 0,
                      justifyContent: "center",
                      paddingHorizontal: 4,
                    }}
                  >
                    <Text style={{ fontSize: 18 }}>{showPassword ? "🙈" : "👁️"}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Remember Me & Stay Logged In */}
              <View style={{ marginBottom: 16, gap: 10 }}>
                {/* Remember credentials */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View>
                    <Text style={{ fontSize: 14, color: "#374151", fontWeight: "500" }}>記住帳號密碼</Text>
                    <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 1 }}>下次自動填入帳號和密碼</Text>
                  </View>
                  <Switch
                    value={rememberMe}
                    onValueChange={setRememberMe}
                    trackColor={{ false: "#E2E8F0", true: "#BFDBFE" }}
                    thumbColor={rememberMe ? "#2563EB" : "#94A3B8"}
                  />
                </View>

                <View style={{ height: 1, backgroundColor: "#F1F5F9" }} />

                {/* Stay logged in */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View>
                    <Text style={{ fontSize: 14, color: "#374151", fontWeight: "500" }}>保持登入</Text>
                    <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 1 }}>關閉 App 後自動保持登入狀態</Text>
                  </View>
                  <Switch
                    value={stayLoggedIn}
                    onValueChange={setStayLoggedIn}
                    trackColor={{ false: "#E2E8F0", true: "#BFDBFE" }}
                    thumbColor={stayLoggedIn ? "#2563EB" : "#94A3B8"}
                  />
                </View>
              </View>

              {/* Error */}
              {error ? (
                <View style={{
                  backgroundColor: "#FEF2F2",
                  borderWidth: 1,
                  borderColor: "#FECACA",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 14,
                }}>
                  <Text style={{ color: "#EF4444", fontSize: 13, textAlign: "center" }}>{error}</Text>
                </View>
              ) : null}

              {/* Login Button */}
              <TouchableOpacity
                onPress={handleLogin}
                disabled={loginMutation.isPending}
                style={{
                  backgroundColor: loginMutation.isPending ? "#93C5FD" : "#2563EB",
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                  marginBottom: biometricAvailable && biometricEnabled ? 12 : 0,
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

              {/* Biometric Login Button - only show on native if enabled */}
              {biometricAvailable && biometricEnabled && Platform.OS !== "web" && (
                <TouchableOpacity
                  onPress={handleBiometricLogin}
                  disabled={biometricLoading || loginMutation.isPending}
                  style={{
                    backgroundColor: "#F0F9FF",
                    borderWidth: 1.5,
                    borderColor: "#BAE6FD",
                    borderRadius: 12,
                    paddingVertical: 14,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  {biometricLoading ? (
                    <ActivityIndicator color="#0284C7" />
                  ) : (
                    <>
                      <Text style={{ fontSize: 20 }}>{biometricIcon}</Text>
                      <Text style={{ color: "#0284C7", fontSize: 15, fontWeight: "600" }}>
                        使用{biometricLabel}快速登入
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            <Text style={{ textAlign: "center", color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 24 }}>
              如忘記密碼，請聯絡管理員重置
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
