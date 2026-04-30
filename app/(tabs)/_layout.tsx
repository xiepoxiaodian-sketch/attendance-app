import { Tabs, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Platform, View, Text, ActivityIndicator } from "react-native";
import { useEmployeeAuth } from "@/lib/employee-auth";
import { useEffect } from "react";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 10 : Math.max(insets.bottom, 6);
  const tabBarHeight = 60 + bottomPadding;
  const { employee, isLoading } = useEmployeeAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!employee) {
      router.replace("/login" as any);
    } else if (employee.needsSetup) {
      router.replace("/setup/password" as any);
    } else if (employee.role === "admin") {
      router.replace("/admin" as any);
    }
  }, [employee, isLoading]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1E3A8A" }}>
        <ActivityIndicator size="large" color="white" />
        <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 12, fontSize: 14 }}>載入中...</Text>
      </View>
    );
  }

  if (!employee || employee.role === "admin") return null;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#2563EB",
        tabBarInactiveTintColor: "#94A3B8",
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
        },
        tabBarStyle: {
          paddingTop: 6,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: "white",
          borderTopColor: "#E2E8F0",
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "打卡",
          tabBarIcon: ({ color, size }) => (
            <IconSymbol size={size ?? 24} name="clock.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: "紀錄",
          tabBarIcon: ({ color, size }) => (
            <IconSymbol size={size ?? 24} name="list.bullet.clipboard" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule-view"
        options={{
          title: "排班",
          tabBarIcon: ({ color, size }) => (
            <IconSymbol size={size ?? 24} name="calendar" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="leave"
        options={{
          title: "請假",
          tabBarIcon: ({ color, size }) => (
            <IconSymbol size={size ?? 24} name="doc.text.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="feedback"
        options={{
          title: "反饋",
          tabBarIcon: ({ color, size }) => (
            <IconSymbol size={size ?? 24} name="exclamationmark.bubble.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "我的",
          tabBarIcon: ({ color, size }) => (
            <IconSymbol size={size ?? 24} name="person.crop.circle" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
