import { Tabs, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Platform, View, Text, ActivityIndicator } from "react-native";
import { useEmployeeAuth } from "@/lib/employee-auth";
import { useEffect } from "react";

type TabItemProps = {
  icon: string;
  label: string;
  color: string;
};

function TabItem({ icon, label, color }: TabItemProps) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <IconSymbol size={22} name={icon as any} color={color} />
      <Text style={{ fontSize: 13, fontWeight: "600", color }}>{label}</Text>
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 10 : Math.max(insets.bottom, 6);
  const tabBarHeight = 52 + bottomPadding;
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

  // Show loading spinner while checking auth (not blank)
  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1E3A8A" }}>
        <ActivityIndicator size="large" color="white" />
        <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 12, fontSize: 14 }}>載入中...</Text>
      </View>
    );
  }

  // Not logged in or admin: redirect handled by useEffect, show nothing while redirecting
  if (!employee || employee.role === "admin") return null;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#2563EB",
        tabBarInactiveTintColor: "#94A3B8",
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarShowLabel: false,
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
          tabBarIcon: ({ color }) => <TabItem icon="clock.fill" label="打卡" color={color} />,
        }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: "紀錄",
          tabBarIcon: ({ color }) => <TabItem icon="list.bullet.clipboard" label="紀錄" color={color} />,
        }}
      />
      <Tabs.Screen
        name="schedule-view"
        options={{
          title: "排班",
          tabBarIcon: ({ color }) => <TabItem icon="calendar" label="排班" color={color} />,
        }}
      />
      <Tabs.Screen
        name="leave"
        options={{
          title: "請假",
          tabBarIcon: ({ color }) => <TabItem icon="doc.text.fill" label="請假" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "我的",
          tabBarIcon: ({ color }) => <TabItem icon="person.crop.circle" label="我的" color={color} />,
        }}
      />
    </Tabs>
  );
}
