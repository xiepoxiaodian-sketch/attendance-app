import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useState } from "react";
import { AdminSidebar } from "./admin-sidebar";
import { useAdminNav } from "@/lib/admin-nav-context";

type Props = {
  title: string;
  subtitle?: string;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  /** Show a back button on the left side (replaces hamburger) */
  showBack?: boolean;
  /** Called when back button is pressed. Defaults to navigate("dashboard") */
  onBack?: () => void;
};

export function AdminHeader({ title, subtitle, onRefresh, refreshing, showBack, onBack }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [localRefreshing, setLocalRefreshing] = useState(false);
  const { currentPage, navigate } = useAdminNav();

  const handleRefresh = async () => {
    if (!onRefresh || localRefreshing || refreshing) return;
    setLocalRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setLocalRefreshing(false);
    }
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate("dashboard");
    }
  };

  const isRefreshing = refreshing || localRefreshing;

  return (
    <>
      <View style={{
        backgroundColor: "white",
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: "#E2E8F0",
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}>
        {showBack ? (
          /* Back Button */
          <TouchableOpacity
            onPress={handleBack}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              backgroundColor: "#F1F5F9",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 18, color: "#475569", fontWeight: "600" }}>‹</Text>
          </TouchableOpacity>
        ) : (
          /* Hamburger Menu */
          <TouchableOpacity
            onPress={() => setSidebarOpen(true)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              backgroundColor: "#F1F5F9",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View style={{ gap: 4 }}>
              <View style={{ width: 18, height: 2, backgroundColor: "#475569", borderRadius: 1 }} />
              <View style={{ width: 14, height: 2, backgroundColor: "#475569", borderRadius: 1 }} />
              <View style={{ width: 18, height: 2, backgroundColor: "#475569", borderRadius: 1 }} />
            </View>
          </TouchableOpacity>
        )}

        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#1E293B" }}>{title}</Text>
          {subtitle ? (
            <Text style={{ fontSize: 12, color: "#64748B", marginTop: 1 }}>{subtitle}</Text>
          ) : null}
        </View>

        {/* Refresh Button */}
        {onRefresh && (
          <TouchableOpacity
            onPress={handleRefresh}
            disabled={isRefreshing}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              backgroundColor: isRefreshing ? "#EFF6FF" : "#F1F5F9",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <Text style={{ fontSize: 16 }}>🔄</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {!showBack && (
        <AdminSidebar
          visible={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          currentPage={currentPage}
          onNavigate={(page) => {
            setSidebarOpen(false);
            navigate(page);
          }}
        />
      )}
    </>
  );
}
