import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import * as Device from "expo-device";
import { ScreenContainer } from "@/components/screen-container";
import { useEmployeeAuth } from "@/lib/employee-auth";
import { trpc } from "@/lib/trpc";

function getDeviceId(): string {
  // On web, use a stored UUID
  if (Platform.OS === "web") {
    let id = localStorage.getItem("device_id");
    if (!id) {
      id = `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("device_id", id);
    }
    return id;
  }
  // On native, use device model + brand as a pseudo-unique ID
  // In production, you'd use expo-application's getAndroidId or similar
  return `${Device.brand}-${Device.modelName}-${Device.osVersion}`.replace(/\s+/g, "-").toLowerCase();
}

function getDeviceName(): string {
  if (Platform.OS === "web") return "Web 瀏覽器";
  return `${Device.brand ?? ""} ${Device.modelName ?? ""}`.trim() || "未知裝置";
}

export default function SetupDeviceScreen() {
  const router = useRouter();
  const { employee } = useEmployeeAuth();
  const [deviceId] = useState(() => getDeviceId());
  const [deviceName] = useState(() => getDeviceName());
  const [error, setError] = useState("");

  const registerMutation = trpc.devices.register.useMutation({
    onSuccess: () => {
      router.replace("/setup/biometric" as any);
    },
    onError: (err) => {
      setError(err.message || "裝置綁定失敗");
    },
  });

  const handleBind = () => {
    setError("");
    if (!employee) return;
    registerMutation.mutate({
      employeeId: employee.id,
      deviceId,
      deviceName,
      platform: Platform.OS,
    });
  };

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
                  backgroundColor: step <= 2 ? "#1E40AF" : "#E2E8F0",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {step < 2 ? (
                  <Text style={{ color: "white", fontWeight: "600" }}>✓</Text>
                ) : (
                  <Text style={{ color: step <= 2 ? "white" : "#94A3B8", fontWeight: "600" }}>
                    {step}
                  </Text>
                )}
              </View>
              {step < 4 && (
                <View
                  style={{
                    width: 40,
                    height: 2,
                    backgroundColor: step < 2 ? "#1E40AF" : "#E2E8F0",
                    marginHorizontal: 4,
                  }}
                />
              )}
            </View>
          ))}
        </View>

        <Text className="text-2xl font-bold text-foreground mb-2">綁定打卡裝置</Text>
        <Text className="text-muted mb-8">
          為確保打卡安全，需要將此裝置綁定為您的專屬打卡裝置。綁定後，只能使用此裝置進行打卡。
        </Text>

        {/* Device Info Card */}
        <View className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-8">
          <View className="flex-row items-center mb-3">
            <Text style={{ fontSize: 32, marginRight: 12 }}>
              {Platform.OS === "ios" ? "📱" : Platform.OS === "android" ? "📱" : "💻"}
            </Text>
            <View className="flex-1">
              <Text className="text-lg font-semibold text-foreground">{deviceName}</Text>
              <Text className="text-sm text-muted">{Platform.OS.toUpperCase()}</Text>
            </View>
          </View>
          <View className="border-t border-blue-200 pt-3">
            <Text className="text-xs text-muted">裝置識別碼</Text>
            <Text className="text-sm text-foreground font-mono mt-1" numberOfLines={1}>
              {deviceId}
            </Text>
          </View>
        </View>

        {/* Warning */}
        <View className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8">
          <Text className="text-amber-800 text-sm">
            ⚠️ 注意：綁定後若需更換裝置，請聯絡管理員重新設定。
          </Text>
        </View>

        {/* Error */}
        {error ? (
          <View className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
            <Text className="text-error text-sm text-center">{error}</Text>
          </View>
        ) : null}

        {/* Bind Button */}
        <TouchableOpacity
          onPress={handleBind}
          disabled={registerMutation.isPending}
          style={{
            backgroundColor: "#1E40AF",
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: "center",
            opacity: registerMutation.isPending ? 0.7 : 1,
          }}
        >
          {registerMutation.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
              綁定此裝置
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}
