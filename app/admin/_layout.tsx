import { Stack, useRouter } from "expo-router";
import { useEmployeeAuth } from "@/lib/employee-auth";
import { useEffect } from "react";

export default function AdminLayout() {
  const { employee, isLoading } = useEmployeeAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !employee) {
      router.replace("/login" as any);
    } else if (!isLoading && employee?.role !== "admin") {
      router.replace("/(tabs)" as any);
    }
  }, [employee, isLoading]);

  if (isLoading || !employee || employee.role !== "admin") return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="employees" />
      <Stack.Screen name="schedule" />
      <Stack.Screen name="attendance" />
      <Stack.Screen name="leave-review" />
      <Stack.Screen name="reports" />
      <Stack.Screen name="devices" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
