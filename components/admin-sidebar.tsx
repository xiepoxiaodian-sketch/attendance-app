import { View, Text, TouchableOpacity, ScrollView, Modal, Animated } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useRef, useEffect } from "react";
import { useEmployeeAuth } from "@/lib/employee-auth";
import { IconSymbol } from "@/components/ui/icon-symbol";

const NAV_ITEMS = [
  { label: "總覽", icon: "chart.bar.fill", path: "/admin" },
  { label: "員工管理", icon: "person.2.fill", path: "/admin/employees" },
  { label: "排班管理", icon: "calendar.badge.clock", path: "/admin/schedule" },
  { label: "打卡紀錄", icon: "clock.fill", path: "/admin/attendance" },
  { label: "請假審核", icon: "doc.text.fill", path: "/admin/leave-review" },
  { label: "報表統計", icon: "chart.line.uptrend.xyaxis", path: "/admin/reports" },
  { label: "裝置管理", icon: "iphone", path: "/admin/devices" },
  { label: "系統設定", icon: "gear", path: "/admin/settings" },
];

const BOTTOM_ITEMS = [
  { label: "員工打卡頁", icon: "clock.arrow.circlepath", path: "/(tabs)" },
  { label: "登出", icon: "rectangle.portrait.and.arrow.right", path: "__logout__" },
];

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function AdminSidebar({ visible, onClose }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { employee, logout } = useEmployeeAuth();
  const slideAnim = useRef(new Animated.Value(-280)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -280, duration: 200, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleNav = async (path: string) => {
    onClose();
    if (path === "__logout__") {
      await logout();
      setTimeout(() => router.replace("/login" as any), 300);
      return;
    }
    setTimeout(() => router.push(path as any), 200);
  };

  const isActive = (path: string) => {
    if (path === "/admin") return pathname === "/admin";
    return pathname.startsWith(path);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Animated.View
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", opacity: opacityAnim }}
      >
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      {/* Sidebar panel */}
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          width: 260,
          backgroundColor: "#1E3A8A",
          transform: [{ translateX: slideAnim }],
        }}
      >
        {/* Header */}
        <View style={{ paddingTop: 56, paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)" }}>
          <Text style={{ fontSize: 18, fontWeight: "800", color: "white", letterSpacing: 0.3 }}>打卡管理系統</Text>
          <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>管理員後台</Text>
        </View>

        {/* User Info */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)", flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: "white" }}>
              {employee?.fullName?.[0] ?? "A"}
            </Text>
          </View>
          <View>
            <Text style={{ fontSize: 14, fontWeight: "600", color: "white" }}>{employee?.fullName ?? "管理員"}</Text>
            <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>系統管理員</Text>
          </View>
        </View>

        {/* Nav Items */}
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <View style={{ paddingVertical: 8 }}>
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.path);
              return (
                <TouchableOpacity
                  key={item.path}
                  onPress={() => handleNav(item.path)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingVertical: 13,
                    marginHorizontal: 8,
                    marginVertical: 1,
                    borderRadius: 10,
                    backgroundColor: active ? "rgba(255,255,255,0.15)" : "transparent",
                    gap: 12,
                  }}
                >
                  <IconSymbol size={18} name={item.icon as any} color={active ? "white" : "rgba(255,255,255,0.65)"} />
                  <Text style={{ fontSize: 14, fontWeight: active ? "700" : "400", color: active ? "white" : "rgba(255,255,255,0.75)", flex: 1 }}>
                    {item.label}
                  </Text>
                  {active && <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 16 }}>›</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.1)", marginHorizontal: 16, marginVertical: 8 }} />

          {/* Bottom Items */}
          <View style={{ paddingBottom: 32 }}>
            {BOTTOM_ITEMS.map((item) => (
              <TouchableOpacity
                key={item.path}
                onPress={() => handleNav(item.path)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  paddingVertical: 13,
                  marginHorizontal: 8,
                  marginVertical: 1,
                  borderRadius: 10,
                  gap: 12,
                }}
              >
                <IconSymbol size={18} name={item.icon as any} color="rgba(255,255,255,0.65)" />
                <Text style={{ fontSize: 14, color: item.path === "__logout__" ? "rgba(255,150,150,0.9)" : "rgba(255,255,255,0.75)" }}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}
