import { View, Text, TouchableOpacity } from "react-native";
import { useState } from "react";
import { AdminSidebar } from "./admin-sidebar";

type Props = {
  title: string;
  subtitle?: string;
};

export function AdminHeader({ title, subtitle }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
        {/* Hamburger Menu */}
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

        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#1E293B" }}>{title}</Text>
          {subtitle ? (
            <Text style={{ fontSize: 12, color: "#64748B", marginTop: 1 }}>{subtitle}</Text>
          ) : null}
        </View>
      </View>

      <AdminSidebar visible={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </>
  );
}
