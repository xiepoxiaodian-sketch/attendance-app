import { useState } from "react";
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
  if (Platform.OS === "web") {
    let id = localStorage.getItem("device_id");
    if (!id) {
      id = `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("device_id", id);
    }
    return id;
  }
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
  const [pendingApproval, setPendingApproval] = useState(false);

  const registerMutation = trpc.devices.register.useMutation({
    onSuccess: (result) => {
      if ((result as any).status === "pending") {
        // New device requires admin approval
        setPendingApproval(true);
      } else {
        // Approved (first device or exempt employee)
        router.replace("/setup/biometric" as any);
      }
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

  // ── Pending approval screen ──────────────────────────────────────────────
  if (pendingApproval) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 60, alignItems: "center" }}>
          <Text style={{ fontSize: 64, marginBottom: 24 }}>⏳</Text>
          <Text style={{ fontSize: 22, fontWeight: "700", color: "#1E293B", marginBottom: 12, textAlign: "center" }}>
            等待管理員審核
          </Text>
          <Text style={{ fontSize: 15, color: "#64748B", textAlign: "center", lineHeight: 24, marginBottom: 32 }}>
            您的帳號已有綁定裝置，此新裝置申請已送出，需等待管理員核准後才能使用。
          </Text>

          {/* Device info */}
          <View style={{
            backgroundColor: "#F8FAFC",
            borderRadius: 16,
            padding: 20,
            width: "100%",
            marginBottom: 32,
            borderWidth: 1,
            borderColor: "#E2E8F0",
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ fontSize: 28, marginRight: 12 }}>
                {Platform.OS === "web" ? "💻" : "📱"}
              </Text>
              <View>
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#1E293B" }}>{deviceName}</Text>
                <Text style={{ fontSize: 12, color: "#94A3B8" }}>{Platform.OS.toUpperCase()}</Text>
              </View>
            </View>
            <View style={{ backgroundColor: "#FEF9C3", borderRadius: 8, padding: 10 }}>
              <Text style={{ fontSize: 13, color: "#92400E", textAlign: "center" }}>
                🔔 管理員核准後，您將可以使用此裝置打卡
              </Text>
            </View>
          </View>

          <View style={{ backgroundColor: "#EFF6FF", borderRadius: 12, padding: 16, width: "100%" }}>
            <Text style={{ fontSize: 13, color: "#1D4ED8", lineHeight: 20 }}>
              💡 請聯絡您的管理員，請他在「裝置管理」頁面審核您的申請。
            </Text>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  // ── Normal bind screen ───────────────────────────────────────────────────
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
            ⚠️ 注意：若已有綁定裝置，新裝置申請需等待管理員審核。
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
