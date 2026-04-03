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

export default function ClockScreen() {
  const { employee } = useEmployeeAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isClocking, setIsClocking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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
    onError: (err) => Alert.alert("打卡失敗", err.message, [{ text: "確定" }]),
  });

  const clockOutMutation = trpc.attendance.clockOut.useMutation({
    onSuccess: () => {
      refetchAttendance();
      Alert.alert("打卡成功", "下班打卡完成！", [{ text: "確定" }]);
    },
    onError: (err) => Alert.alert("打卡失敗", err.message, [{ text: "確定" }]),
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
        } catch (e) {}
      }

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

      const deviceId = getDeviceId();
      if (isClockIn) {
        await clockInMutation.mutateAsync({ employeeId: employee.id, deviceId, lat, lng, locationName, shiftLabel });
      } else {
        const record = todayAttendance?.find(r => r.shiftLabel === shiftLabel && r.clockInTime && !r.clockOutTime);
        await clockOutMutation.mutateAsync({ employeeId: employee.id, attendanceId: record?.id, deviceId, lat, lng, locationName, shiftLabel });
      }
    } finally {
      setIsClocking(false);
    }
  };

  const shifts = (todaySchedule && todaySchedule.shifts
    ? todaySchedule.shifts as Array<{ startTime: string; endTime: string; label: string }>
    : []);
  const displayShifts = shifts.length > 0 ? shifts : [{ startTime: "09:00", endTime: "18:00", label: "班次1" }];

  const timeStr = currentTime.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const [hm, sec] = timeStr.split(":").length === 3
    ? [timeStr.slice(0, 5), timeStr.slice(6)]
    : [timeStr, ""];

  return (
    <ScreenContainer containerClassName="bg-[#F1F5F9]">
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header Card */}
        <View style={{
          backgroundColor: "#1E3A8A",
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 40,
        }}>
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginBottom: 2 }}>
            {formatDate(currentTime)}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 4 }}>
            <Text style={{ color: "white", fontSize: 52, fontWeight: "700", letterSpacing: -2, lineHeight: 60 }}>
              {hm}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 24, fontWeight: "400", marginBottom: 6, marginLeft: 2 }}>
              :{sec}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8 }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: "white" }}>
                {employee?.fullName?.[0] ?? "?"}
              </Text>
            </View>
            <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: "500" }}>
              {employee?.fullName} · {employee?.jobTitle || "員工"}
            </Text>
          </View>
        </View>

        {/* Shift Cards */}
        <View style={{ padding: 14, marginTop: -20, gap: 12 }}>
          {displayShifts.map((shift) => {
            const record = todayAttendance?.find(r => r.shiftLabel === shift.label);
            const isClockedIn = !!record?.clockInTime && !record?.clockOutTime;
            const isCompleted = !!record?.clockInTime && !!record?.clockOutTime;

            return (
              <View
                key={shift.label}
                style={{
                  backgroundColor: "white",
                  borderRadius: 16,
                  padding: 18,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.05,
                  shadowRadius: 8,
                  elevation: 2,
                }}
              >
                {/* Shift Header */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <View>
                    <Text style={{ fontSize: 17, fontWeight: "700", color: "#1E293B" }}>{shift.label}</Text>
                    <Text style={{ fontSize: 13, color: "#64748B", marginTop: 3 }}>
                      {shift.startTime} – {shift.endTime}
                    </Text>
                  </View>
                  <View style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 20,
                    backgroundColor: isCompleted ? "#DCFCE7" : isClockedIn ? "#DBEAFE" : "#F1F5F9",
                  }}>
                    <Text style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: isCompleted ? "#16A34A" : isClockedIn ? "#1D4ED8" : "#64748B",
                    }}>
                      {isCompleted ? "已完成" : isClockedIn ? "上班中" : "未打卡"}
                    </Text>
                  </View>
                </View>

                {/* Clock Times Row */}
                <View style={{
                  flexDirection: "row",
                  backgroundColor: "#F8FAFC",
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 14,
                }}>
                  <View style={{ flex: 1, alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E" }} />
                      <Text style={{ fontSize: 11, color: "#64748B", fontWeight: "500" }}>上班</Text>
                    </View>
                    <Text style={{ fontSize: 22, fontWeight: "700", color: record?.clockInTime ? "#22C55E" : "#CBD5E1" }}>
                      {formatTime(record?.clockInTime)}
                    </Text>
                    {record?.status === "late" && (
                      <Text style={{ fontSize: 10, color: "#F59E0B", marginTop: 2, fontWeight: "600" }}>遲到</Text>
                    )}
                  </View>
                  <View style={{ width: 1, backgroundColor: "#E2E8F0" }} />
                  <View style={{ flex: 1, alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#3B82F6" }} />
                      <Text style={{ fontSize: 11, color: "#64748B", fontWeight: "500" }}>下班</Text>
                    </View>
                    <Text style={{ fontSize: 22, fontWeight: "700", color: record?.clockOutTime ? "#3B82F6" : "#CBD5E1" }}>
                      {formatTime(record?.clockOutTime)}
                    </Text>
                    {record?.status === "early_leave" && (
                      <Text style={{ fontSize: 10, color: "#F59E0B", marginTop: 2, fontWeight: "600" }}>早退</Text>
                    )}
                  </View>
                </View>

                {/* Clock Button */}
                {!isCompleted && (
                  <TouchableOpacity
                    onPress={() => handleClock(shift.label, !isClockedIn)}
                    disabled={isClocking}
                    style={{
                      backgroundColor: isClockedIn ? "#2563EB" : "#1E3A8A",
                      borderRadius: 12,
                      paddingVertical: 14,
                      alignItems: "center",
                      opacity: isClocking ? 0.7 : 1,
                    }}
                  >
                    {isClocking ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>
                        {isClockedIn ? "下班打卡" : "上班打卡"}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}

                {isCompleted && (
                  <View style={{ backgroundColor: "#F0FDF4", borderRadius: 10, paddingVertical: 10, alignItems: "center" }}>
                    <Text style={{ color: "#16A34A", fontSize: 14, fontWeight: "600" }}>今日已完成打卡</Text>
                  </View>
                )}
              </View>
            );
          })}

          {/* Notices */}
          {shifts.length === 0 && (
            <View style={{ backgroundColor: "#FFFBEB", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#FDE68A" }}>
              <Text style={{ color: "#92400E", fontSize: 13, textAlign: "center" }}>
                今日尚未排班，顯示預設班次
              </Text>
            </View>
          )}

          {settings?.work_location_lat && (
            <View style={{ backgroundColor: "#F0FDF4", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#BBF7D0", flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 16 }}>📍</Text>
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
