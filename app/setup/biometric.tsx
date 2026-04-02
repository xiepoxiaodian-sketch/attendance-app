import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import { ScreenContainer } from "@/components/screen-container";
import { useEmployeeAuth } from "@/lib/employee-auth";

export default function SetupBiometricScreen() {
  const router = useRouter();
  const { employee } = useEmployeeAuth();
  const [hasHardware, setHasHardware] = useState<boolean | null>(null);
  const [isEnrolled, setIsEnrolled] = useState<boolean | null>(null);
  const [biometricType, setBiometricType] = useState<"face" | "fingerprint" | "none">("none");
  const [isLoading, setIsLoading] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    checkBiometrics();
  }, []);

  const checkBiometrics = async () => {
    if (Platform.OS === "web") {
      setHasHardware(false);
      setIsEnrolled(false);
      return;
    }
    const hw = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setHasHardware(hw);
    setIsEnrolled(enrolled);

    if (hw && enrolled) {
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricType("face");
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricType("fingerprint");
      }
    }
  };

  const handleVerify = async () => {
    setError("");
    setIsLoading(true);
    try {
      if (Platform.OS === "web") {
        // Web fallback - skip biometric
        setIsVerified(true);
        setIsLoading(false);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "驗證生物識別以完成設定",
        cancelLabel: "取消",
        disableDeviceFallback: false,
        fallbackLabel: "使用密碼",
      });

      if (result.success) {
        setIsVerified(true);
      } else if (result.error === "user_cancel" || result.error === "app_cancel") {
        // User cancelled, do nothing
      } else {
        setError("生物識別驗證失敗，請再試一次");
      }
    } catch (e) {
      setError("無法使用生物識別，請確認裝置設定");
    } finally {
      setIsLoading(false);
    }
  };

  const handleNext = () => {
    router.replace("/setup/complete" as any);
  };

  const handleSkip = () => {
    // Allow skipping if no hardware available
    router.replace("/setup/complete" as any);
  };

  const biometricIcon = biometricType === "face" ? "🤳" : biometricType === "fingerprint" ? "👆" : "🔐";
  const biometricName = biometricType === "face" ? "Face ID" : biometricType === "fingerprint" ? "指紋辨識" : "生物識別";

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
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
                  backgroundColor: step <= 3 ? "#1E40AF" : "#E2E8F0",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {step < 3 ? (
                  <Text style={{ color: "white", fontWeight: "600" }}>✓</Text>
                ) : (
                  <Text style={{ color: step <= 3 ? "white" : "#94A3B8", fontWeight: "600" }}>
                    {step}
                  </Text>
                )}
              </View>
              {step < 4 && (
                <View
                  style={{
                    width: 40,
                    height: 2,
                    backgroundColor: step < 3 ? "#1E40AF" : "#E2E8F0",
                    marginHorizontal: 4,
                  }}
                />
              )}
            </View>
          ))}
        </View>

        <Text className="text-2xl font-bold text-foreground mb-2">設定生物識別</Text>
        <Text className="text-muted mb-8">
          每次打卡時需要使用生物識別驗證身份，確保打卡的安全性。
        </Text>

        {/* Biometric Status */}
        {hasHardware === null ? (
          <View className="items-center py-8">
            <ActivityIndicator size="large" color="#1E40AF" />
            <Text className="text-muted mt-4">正在檢查裝置支援...</Text>
          </View>
        ) : !hasHardware || Platform.OS === "web" ? (
          <View className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-8">
            <Text style={{ fontSize: 40, textAlign: "center", marginBottom: 12 }}>⚠️</Text>
            <Text className="text-amber-800 text-center font-medium mb-2">
              此裝置不支援生物識別
            </Text>
            <Text className="text-amber-700 text-sm text-center">
              {Platform.OS === "web"
                ? "網頁版不支援生物識別，請使用手機 App 進行打卡。"
                : "您的裝置不支援指紋或 Face ID，打卡時將使用裝置密碼驗證。"}
            </Text>
          </View>
        ) : !isEnrolled ? (
          <View className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-8">
            <Text style={{ fontSize: 40, textAlign: "center", marginBottom: 12 }}>⚠️</Text>
            <Text className="text-amber-800 text-center font-medium mb-2">
              尚未設定生物識別
            </Text>
            <Text className="text-amber-700 text-sm text-center">
              請先在裝置設定中啟用 {biometricName}，再回來完成設定。
            </Text>
          </View>
        ) : isVerified ? (
          <View className="bg-green-50 border border-green-200 rounded-2xl p-5 mb-8 items-center">
            <Text style={{ fontSize: 48, marginBottom: 12 }}>✅</Text>
            <Text className="text-green-800 font-semibold text-lg mb-1">驗證成功！</Text>
            <Text className="text-green-700 text-sm text-center">
              {biometricName} 設定完成，打卡時將使用此方式驗證。
            </Text>
          </View>
        ) : (
          <View className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-8 items-center">
            <Text style={{ fontSize: 64, marginBottom: 12 }}>{biometricIcon}</Text>
            <Text className="text-foreground font-semibold text-lg mb-2">{biometricName}</Text>
            <Text className="text-muted text-sm text-center">
              點擊下方按鈕，使用 {biometricName} 完成驗證設定。
            </Text>
          </View>
        )}

        {/* Error */}
        {error ? (
          <View className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
            <Text className="text-error text-sm text-center">{error}</Text>
          </View>
        ) : null}

        {/* Buttons */}
        {!hasHardware || Platform.OS === "web" || !isEnrolled ? (
          <TouchableOpacity
            onPress={handleSkip}
            style={{
              backgroundColor: "#1E40AF",
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
              跳過，繼續設定
            </Text>
          </TouchableOpacity>
        ) : isVerified ? (
          <TouchableOpacity
            onPress={handleNext}
            style={{
              backgroundColor: "#22C55E",
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
              下一步
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleVerify}
            disabled={isLoading}
            style={{
              backgroundColor: "#1E40AF",
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
                驗證 {biometricName}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </ScreenContainer>
  );
}
