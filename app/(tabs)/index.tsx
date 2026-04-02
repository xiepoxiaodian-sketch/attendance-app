import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
} from "react-native";
import * as Location from "expo-location";
import * as LocalAuthentication from "expo-local-authentication";
import * as Device from "expo-device";
import { ScreenContainer } from "@/components/screen-container";
import { useEmployeeAuth } from "@/lib/employee-auth";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";

function getDeviceId(): string {
  if (Platform.OS === "web") {
    let id = localStorage.getItem("device_id");
    if (!id) {
      id = `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("device_id", id);
    }
    return id;
  }
  return `${Device.brand}-${Device.modelName}-${Device.osVersion}`.replace(/\s+/g, "-").toLowerCase();
}

function formatTime(date: Date | string | null | undefined): string {
  if (!date) return "--:--";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function getStatusColor(status: string | null | undefined): string {
  switch (status) {
    case "late": return "#F59E0B";
    case "early_leave": return "#F59E0B";
    case "absent": return "#EF4444";
    default: return "#22C55E";
  }
}

function getStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "late": return "遲到";
    case "early_leave": return "早退";
    case "absent": return "缺勤";
    default: return "正常";
  }
}

export default function ClockScreen() {
  const { employee } = useEmployeeAuth();
  const colors = useColors();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isClocking, setIsClocking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const utils = trpc.useUtils();

  const { data: todayAttendance, refetch: refetchAttendance } = trpc.attendance.getToday.useQuery(
    { employeeId: employee?.id ?? 0 },
    { enabled: !!employee }
  );

  const { data: todaySchedule } = trpc.schedules.getToday.useQuery(
    { employeeId: employee?.id ?? 0 },
    { enabled: !!employee }
  );

  const { data: settings } = trpc.settings.getAll.useQuery();

  const clockInMutation = trpc.attendance.clockIn.useMutation({
    onSuccess: () => {
      refetchAttendance();
      Alert.alert("打卡成功", "上班打卡完成！", [{ text: "確定" }]);
    },
    onError: (err) => {
      Alert.alert("打卡失敗", err.message, [{ text: "確定" }]);
    },
  });

  const clockOutMutation = trpc.attendance.clockOut.useMutation({
    onSuccess: () => {
      refetchAttendance();
      Alert.alert("打卡成功", "下班打卡完成！", [{ text: "確定" }]);
    },
    onError: (err) => {
      Alert.alert("打卡失敗", err.message, [{ text: "確定" }]);
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchAttendance();
    setRefreshing(false);
  }, []);

  const handleClock = async (shiftLabel: string, isClockIn: boolean) => {
    if (!employee) return;
    setIsClocking(true);

    try {
      // 1. Get GPS location
      let lat: number | undefined;
      let lng: number | undefined;
      let locationName: string | undefined;

      const requireGPS = settings?.work_location_lat && settings?.work_location_lng;
      if (requireGPS) {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === "granted") {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            lat = loc.coords.latitude;
            lng = loc.coords.longitude;
            locationName = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          }
        } catch (e) {
          // GPS not available, continue without it
        }
      }

      // 2. Biometric authentication
      if (Platform.OS !== "web") {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (hasHardware && isEnrolled) {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: isClockIn ? `${shiftLabel} - 上班打卡驗證` : `${shiftLabel} - 下班打卡驗證`,
            cancelLabel: "取消",
            disableDeviceFallback: false,
          });
          if (!result.success) {
            if (result.error !== "user_cancel" && result.error !== "app_cancel") {
              Alert.alert("驗證失敗", "生物識別驗證失敗，請再試一次");
            }
            setIsClocking(false);
            return;
          }
        }
      }

      // 3. Submit clock in/out
      const deviceId = getDeviceId();
      if (isClockIn) {
        await clockInMutation.mutateAsync({
          employeeId: employee.id,
          deviceId,
          lat,
          lng,
          locationName,
          shiftLabel,
        });
      } else {
        const record = todayAttendance?.find(r => r.shiftLabel === shiftLabel && r.clockInTime && !r.clockOutTime);
        await clockOutMutation.mutateAsync({
          employeeId: employee.id,
          attendanceId: record?.id,
          deviceId,
          lat,
          lng,
          locationName,
          shiftLabel,
        });
      }
    } finally {
      setIsClocking(false);
    }
  };

  // Determine shift status
  const shifts = (todaySchedule?.shifts as Array<{ startTime: string; endTime: string; label: string }>) ?? [];
  const defaultShifts = shifts.length > 0 ? shifts : [{ startTime: "09:00", endTime: "18:00", label: "班次1" }];

  return (
    <ScreenContainer>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ flexGrow: 1 }}
      >
        {/* Header */}
        <View style={{ backgroundColor: "#1E40AF", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}>
          <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 14, marginBottom: 4 }}>
            {employee?.fullName} · {employee?.jobTitle || (employee?.role === "admin" ? "管理員" : "員工")}
          </Text>
          <Text style={{ color: "white", fontSize: 48, fontWeight: "700", letterSpacing: -1 }}>
            {currentTime.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 14, marginTop: 4 }}>
            {formatDate(currentTime)}
          </Text>
        </View>

        <View style={{ flex: 1, padding: 16, marginTop: -16 }}>
          {/* Today's Shifts */}
          {defaultShifts.map((shift) => {
            const record = todayAttendance?.find(r => r.shiftLabel === shift.label);
            const isClockedIn = !!record?.clockInTime && !record?.clockOutTime;
            const isCompleted = !!record?.clockInTime && !!record?.clockOutTime;

            return (
              <View
                key={shift.label}
                style={{
                  backgroundColor: "white",
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 12,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.08,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
                {/* Shift Header */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <View>
                    <Text style={{ fontSize: 16, fontWeight: "600", color: "#1E293B" }}>{shift.label}</Text>
                    <Text style={{ fontSize: 14, color: "#64748B", marginTop: 2 }}>
                      {shift.startTime} – {shift.endTime}
                    </Text>
                  </View>
                  {isCompleted ? (
                    <View style={{ backgroundColor: "#DCFCE7", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                      <Text style={{ color: "#16A34A", fontSize: 12, fontWeight: "600" }}>已完成</Text>
                    </View>
                  ) : isClockedIn ? (
                    <View style={{ backgroundColor: "#DBEAFE", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                      <Text style={{ color: "#1D4ED8", fontSize: 12, fontWeight: "600" }}>上班中</Text>
                    </View>
                  ) : (
                    <View style={{ backgroundColor: "#F1F5F9", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                      <Text style={{ color: "#64748B", fontSize: 12, fontWeight: "600" }}>未打卡</Text>
                    </View>
                  )}
                </View>

                {/* Clock Times */}
                <View style={{ flexDirection: "row", marginBottom: 12 }}>
                  <View style={{ flex: 1, alignItems: "center" }}>
                    <Text style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>上班</Text>
                    <Text style={{ fontSize: 20, fontWeight: "700", color: record?.clockInTime ? "#22C55E" : "#CBD5E1" }}>
                      {formatTime(record?.clockInTime)}
                    </Text>
                    {record?.status === "late" && (
                      <Text style={{ fontSize: 11, color: "#F59E0B", marginTop: 2 }}>遲到</Text>
                    )}
                  </View>
                  <View style={{ width: 1, backgroundColor: "#E2E8F0", marginHorizontal: 8 }} />
                  <View style={{ flex: 1, alignItems: "center" }}>
                    <Text style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>下班</Text>
                    <Text style={{ fontSize: 20, fontWeight: "700", color: record?.clockOutTime ? "#3B82F6" : "#CBD5E1" }}>
                      {formatTime(record?.clockOutTime)}
                    </Text>
                    {record?.status === "early_leave" && (
                      <Text style={{ fontSize: 11, color: "#F59E0B", marginTop: 2 }}>早退</Text>
                    )}
                  </View>
                </View>

                {/* Clock Button */}
                {!isCompleted && (
                  <TouchableOpacity
                    onPress={() => handleClock(shift.label, !isClockedIn)}
                    disabled={isClocking}
                    style={{
                      backgroundColor: isClockedIn ? "#3B82F6" : "#1E40AF",
                      borderRadius: 12,
                      paddingVertical: 12,
                      alignItems: "center",
                      opacity: isClocking ? 0.7 : 1,
                    }}
                  >
                    {isClocking ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
                        {isClockedIn ? "⬇️ 下班打卡" : "⬆️ 上班打卡"}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {/* No schedule notice */}
          {shifts.length === 0 && (
            <View style={{ backgroundColor: "#FFF7ED", borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <Text style={{ color: "#92400E", fontSize: 13, textAlign: "center" }}>
                ℹ️ 今日尚未排班，顯示預設班次
              </Text>
            </View>
          )}

          {/* GPS Status */}
          {settings?.work_location_lat && (
            <View style={{ backgroundColor: "#F0FDF4", borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>📍</Text>
              <Text style={{ color: "#166534", fontSize: 13, flex: 1 }}>
                打卡需在工作地點 {settings?.allowed_radius || 200} 公尺範圍內
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
