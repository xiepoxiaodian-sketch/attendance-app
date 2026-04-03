import { Tabs, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Platform } from "react-native";
import { useEmployeeAuth } from "@/lib/employee-auth";
import { useEffect } from "react";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;
  const { employee, isLoading } = useEmployeeAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !employee) {
      router.replace("/login" as any);
    } else if (!isLoading && employee?.needsSetup) {
      router.replace("/setup/password" as any);
    } else if (!isLoading && employee?.role === "admin") {
      router.replace("/admin" as any);
    }
  }, [employee, isLoading]);

  if (isLoading || !employee || employee.role === "admin") return null;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#2563EB",
        tabBarInactiveTintColor: "#94A3B8",
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: "white",
          borderTopColor: "#E2E8F0",
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "打卡",
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="clock.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: "紀錄",
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="list.bullet.clipboard" color={color} />,
        }}
      />
      <Tabs.Screen
        name="leave"
        options={{
          title: "請假",
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "我的",
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="person.crop.circle" color={color} />,
        }}
      />
    </Tabs>
  );
}
