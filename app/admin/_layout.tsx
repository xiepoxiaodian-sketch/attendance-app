import { Slot, useRouter } from "expo-router";
import { useEmployeeAuth } from "@/lib/employee-auth";
import { useEffect } from "react";
import { View, Text, ActivityIndicator } from "react-native";

export default function AdminLayout() {
  const { employee, isLoading } = useEmployeeAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!employee) {
      router.replace("/login" as any);
    } else if (employee.role !== "admin") {
      router.replace("/(tabs)" as any);
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

  if (!employee || employee.role !== "admin") return null;

  // Use Slot instead of Stack to avoid browser history issues on web
  // Stack.push adds to browser history, and closing Modal triggers popstate back
  return <Slot />;
}
