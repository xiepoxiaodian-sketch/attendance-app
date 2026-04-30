import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useEmployeeAuth } from "@/lib/employee-auth";
import { trpc } from "@/lib/trpc";

export default function SetupCompleteScreen() {
  const router = useRouter();
  const { employee, updateSession } = useEmployeeAuth();

  const completeSetupMutation = trpc.employee.completeSetup.useMutation({
    onSuccess: async () => {
      await updateSession({ needsSetup: false });
      router.replace("/(tabs)" as any);
    },
  });

  const handleComplete = () => {
    if (!employee) return;
    completeSetupMutation.mutate({ employeeId: employee.id });
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <View className="flex-1 px-6 pt-8 items-center justify-center">
        {/* Progress */}
        <View className="flex-row items-center justify-center mb-12">
          {[1, 2, 3, 4].map((step) => (
            <View key={step} className="flex-row items-center">
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: "#1E40AF",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "white", fontWeight: "600" }}>✓</Text>
              </View>
              {step < 4 && (
                <View
                  style={{
                    width: 40,
                    height: 2,
                    backgroundColor: "#1E40AF",
                    marginHorizontal: 4,
                  }}
                />
              )}
            </View>
          ))}
        </View>

        {/* Success Icon */}
        <View
          style={{
            width: 100,
            height: 100,
            borderRadius: 50,
            backgroundColor: "#DCFCE7",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          <Text style={{ fontSize: 48 }}>🎉</Text>
        </View>

        <Text className="text-3xl font-bold text-foreground mb-3 text-center">設定完成！</Text>
        <Text className="text-muted text-center mb-4 text-base leading-relaxed">
          您已完成所有初始設定，現在可以開始使用打卡系統了。
        </Text>

        {/* Summary */}
        <View className="w-full bg-surface rounded-2xl p-5 mb-10">
          <Text className="font-semibold text-foreground mb-4">已完成設定</Text>
          {[
            { icon: "✅", text: "修改登入密碼" },
            { icon: "✅", text: "綁定打卡裝置" },
            { icon: "✅", text: "設定生物識別驗證" },
          ].map((item, i) => (
            <View key={i} className="flex-row items-center mb-2">
              <Text style={{ marginRight: 8 }}>{item.icon}</Text>
              <Text className="text-foreground">{item.text}</Text>
            </View>
          ))}
        </View>

        {/* Start Button */}
        <TouchableOpacity
          onPress={handleComplete}
          disabled={completeSetupMutation.isPending}
          style={{
            backgroundColor: "#1E40AF",
            borderRadius: 12,
            paddingVertical: 14,
            paddingHorizontal: 48,
            alignItems: "center",
            opacity: completeSetupMutation.isPending ? 0.7 : 1,
            width: "100%",
          }}
        >
          {completeSetupMutation.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
              開始使用
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}
