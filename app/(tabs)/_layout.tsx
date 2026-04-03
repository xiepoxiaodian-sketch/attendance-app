import { Tabs, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Platform, View, Text } from "react-native";
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
        name="leave"
        options={{
          title: "請假",
          tabBarIcon: ({ color }) => <TabItem icon="calendar" label="請假" color={color} />,
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
