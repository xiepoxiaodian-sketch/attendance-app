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

// ─── Device ID helper ────────────────────────────────────────────────────────
function getDeviceId(): string {
  if (Platform.OS === "web") {
    let id = localStorage.getItem("device_id");
    if (!id) {
      id = `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("device_id", id);
    }
    return id;
  }
  return `${Device.brand}-${Device.modelName}-${Device.osVersion}`
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function getDevicePlatform(): string {
  if (Platform.OS === "web") return "web";
  return Platform.OS;
}

// ─── Format helpers ───────────────────────────────────────────────────────────
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

// ─── Verification step indicator ─────────────────────────────────────────────
type VerifyStep = "idle" | "biometric" | "device" | "location" | "clocking" | "done";

function VerifyStepBadge({ step }: { step: VerifyStep }) {
  if (step === "idle" || step === "done") return null;

  const labels: Record<VerifyStep, string> = {
    idle: "",
    biometric: "🔐 生物識別驗證中...",
    device: "📱 裝置綁定確認中...",
    location: "📍 定位取得中...",
    clocking: "⏳ 打卡記錄中...",
    done: "",
  };

  return (
    <View style={{
      position: "absolute",
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 999,
    }}>
      <View style={{
        backgroundColor: "white",
        borderRadius: 16,
        padding: 28,
        alignItems: "center",
        minWidth: 240,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 12,
      }}>
        <ActivityIndicator size="large" color="#2563EB" style={{ marginBottom: 14 }} />
        <Text style={{ fontSize: 16, fontWeight: "600", color: "#1E293B", textAlign: "center" }}>
          {labels[step]}
        </Text>
        <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 6 }}>請稍候...</Text>
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function ClockScreen() {
  const { employee } = useEmployeeAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [verifyStep, setVerifyStep] = useState<VerifyStep>("idle");
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

  const registerDeviceMutation = trpc.devices.register.useMutation();

  const clockInMutation = trpc.attendance.clockIn.useMutation({
    onSuccess: () => {
      refetchAttendance();
      setVerifyStep("done");
      Alert.alert("打卡成功 ✅", "上班打卡完成！", [{ text: "確定" }]);
    },
    onError: (err) => {
      setVerifyStep("idle");
      Alert.alert("打卡失敗", err.message, [{ text: "確定" }]);
    },
  });

  const clockOutMutation = trpc.attendance.clockOut.useMutation({
    onSuccess: () => {
      refetchAttendance();
      setVerifyStep("done");
      Alert.alert("打卡成功 ✅", "下班打卡完成！", [{ text: "確定" }]);
    },
    onError: (err) => {
      setVerifyStep("idle");
      Alert.alert("打卡失敗", err.message, [{ text: "確定" }]);
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchAttendance();
    setRefreshing(false);
  }, []);

  // ─── Three-step verification + clock ───────────────────────────────────────
  const handleClock = async (shiftLabel: string, isClockIn: boolean) => {
    if (!employee || verifyStep !== "idle") return;

    try {
      // ── Step 1: Biometric ──────────────────────────────────────────────────
      if (Platform.OS !== "web") {
        setVerifyStep("biometric");
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();

        if (hasHardware && isEnrolled) {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: isClockIn
              ? `${shiftLabel} - 上班打卡驗證`
              : `${shiftLabel} - 下班打卡驗證`,
            cancelLabel: "取消",
            disableDeviceFallback: false,
          });
          if (!result.success) {
            setVerifyStep("idle");
            if (result.error !== "user_cancel" && result.error !== "app_cancel") {
              Alert.alert("驗證失敗", "生物識別驗證失敗，請再試一次");
            }
            return;
          }
        } else {
          // No biometric hardware — warn but allow (web or unenrolled device)
          setVerifyStep("idle");
          Alert.alert(
            "無法驗證",
            "此裝置未設定生物識別（Face ID / 指紋），請先在系統設定中啟用後再打卡。",
            [{ text: "確定" }]
          );
          return;
        }
      }

      // ── Step 2: Device binding ─────────────────────────────────────────────
      setVerifyStep("device");
      const deviceId = getDeviceId();
      const platform = getDevicePlatform();

      // Auto-register device on first use (will be a no-op if already registered)
      try {
        await registerDeviceMutation.mutateAsync({
          employeeId: employee.id,
          deviceId,
          deviceName: Platform.OS !== "web"
            ? `${Device.brand ?? ""} ${Device.modelName ?? ""}`.trim()
            : "Web Browser",
          platform,
        });
      } catch (err: any) {
        // Registration error — log but don't block clock-in
        console.warn("Device registration error:", err?.message);
      }

      // ── Step 3: GPS location ───────────────────────────────────────────────
      setVerifyStep("location");
      let lat: number | undefined;
      let lng: number | undefined;
      let locationName: string | undefined;

      const requireGPS = settings?.work_location_lat && settings?.work_location_lng;

      // Helper: get location with timeout — uses native geolocation on Web (Expo Location hangs on Web)
      const getLocationWithTimeout = (timeoutMs: number): Promise<{ latitude: number; longitude: number }> => {
        if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.geolocation) {
          return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
              (err) => reject(new Error(err.code === 1 ? "PERMISSION_DENIED" : "TIMEOUT")),
              { timeout: timeoutMs, enableHighAccuracy: true, maximumAge: 0 }
            );
          });
        }
        // Native: use Expo Location with Promise.race timeout
        return Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).then((loc) => ({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          })),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs)
          ),
        ]);
      };

      if (requireGPS) {
        // GPS required — must succeed
        if (Platform.OS !== "web") {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== "granted") {
            setVerifyStep("idle");
            Alert.alert(
              "需要定位權限",
              "打卡需要取得您的位置，請允許定位權限後再試。",
              [{ text: "確定" }]
            );
            return;
          }
        }
        try {
          const coords = await getLocationWithTimeout(10000);
          lat = coords.latitude;
          lng = coords.longitude;
          locationName = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        } catch (e: any) {
          setVerifyStep("idle");
          if (e?.message === "PERMISSION_DENIED") {
            Alert.alert("需要定位權限", "打卡需要取得您的位置，請允許定位權限後再試。", [{ text: "確定" }]);
          } else {
            Alert.alert("定位超時", "無法在限定時間內取得位置，請確認 GPS 已開啟且信號良好後再試。", [{ text: "確定" }]);
          }
          return;
        }
      } else {
        // GPS not required — try to get location silently (5s timeout)
        try {
          if (Platform.OS !== "web") {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") throw new Error("no permission");
          }
          const coords = await getLocationWithTimeout(5000);
          lat = coords.latitude;
          lng = coords.longitude;
          locationName = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        } catch {
          // Silent fail — location not required
        }
      }

      // ── Step 4: Clock in / out ─────────────────────────────────────────────
      setVerifyStep("clocking");
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
        const record = todayAttendance?.find(
          (r) => r.shiftLabel === shiftLabel && r.clockInTime && !r.clockOutTime
        );
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
    } catch (err: any) {
      setVerifyStep("idle");
      // tRPC errors come in different shapes depending on the error type
      const msg =
        err?.data?.message ||
        err?.shape?.message ||
        err?.message ||
        (typeof err === "string" ? err : null) ||
        "打卡失敗，請稍後再試";
      Alert.alert("打卡失敗", msg, [{ text: "確定" }]);
    } finally {
      // Reset to idle after a short delay
      setTimeout(() => setVerifyStep("idle"), 500);
    }
  };

  const shifts = todaySchedule?.shifts
    ? (todaySchedule.shifts as Array<{ startTime: string; endTime: string; label: string }>)
    : [];
  const displayShifts = shifts.length > 0
    ? shifts
    : [{ startTime: "09:00", endTime: "18:00", label: "班次1" }];

  const timeStr = currentTime.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = timeStr.split(":");
  const hm = parts.length === 3 ? `${parts[0]}:${parts[1]}` : timeStr;
  const sec = parts.length === 3 ? parts[2] : "";

  const isClocking = verifyStep !== "idle" && verifyStep !== "done";

  return (
    <ScreenContainer containerClassName="bg-[#F1F5F9]">
      {/* Overlay during verification */}
      <VerifyStepBadge step={verifyStep} />

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
            <View style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: "rgba(255,255,255,0.15)",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: "white" }}>
                {employee?.fullName?.[0] ?? "?"}
              </Text>
            </View>
            <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: "500" }}>
              {employee?.fullName} · {employee?.jobTitle || "員工"}
            </Text>
          </View>

          {/* Security badges */}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {Platform.OS !== "web" && (
              <View style={{ backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: "600" }}>🔐 生物識別</Text>
              </View>
            )}
            <View style={{ backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: "600" }}>📱 裝置綁定</Text>
            </View>
            {settings?.work_location_lat && (
              <View style={{ backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: "600" }}>📍 GPS 定位</Text>
              </View>
            )}
          </View>
        </View>

        {/* Shift Cards */}
        <View style={{ padding: 14, marginTop: -20, gap: 12 }}>
          {displayShifts.map((shift) => {
            const record = todayAttendance?.find((r) => r.shiftLabel === shift.label);
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
                      <View>
                        <Text style={{ color: "white", fontSize: 16, fontWeight: "700", textAlign: "center" }}>
                          {isClockedIn ? "下班打卡" : "上班打卡"}
                        </Text>
                        <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 11, textAlign: "center", marginTop: 2 }}>
                          {Platform.OS !== "web" ? "生物識別 + 裝置 + 定位" : "裝置綁定 + 定位"}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}

                {isCompleted && (
                  <View style={{ backgroundColor: "#F0FDF4", borderRadius: 10, paddingVertical: 10, alignItems: "center" }}>
                    <Text style={{ color: "#16A34A", fontSize: 14, fontWeight: "600" }}>今日已完成打卡 ✅</Text>
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

          {/* Security info card */}
          <View style={{ backgroundColor: "#EFF6FF", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#BFDBFE", gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#1E40AF", marginBottom: 2 }}>打卡安全驗證</Text>
            {Platform.OS !== "web" && (
              <Text style={{ fontSize: 12, color: "#1E40AF" }}>🔐 生物識別（Face ID / 指紋）</Text>
            )}
            <Text style={{ fontSize: 12, color: "#1E40AF" }}>📱 裝置綁定驗證</Text>
            {settings?.work_location_lat ? (
              <Text style={{ fontSize: 12, color: "#1E40AF" }}>
                📍 GPS 定位（需在 {settings?.allowed_radius || 200} 公尺範圍內）
              </Text>
            ) : (
              <Text style={{ fontSize: 12, color: "#1E40AF" }}>📍 GPS 定位記錄</Text>
            )}
          </View>
          {/* Push notification subscription for employee */}
          {Platform.OS === "web" && <EmployeePushSubscription employeeId={employee?.id ?? 0} />}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Employee Push Subscription Component ────────────────────────────────────
function EmployeePushSubscription({ employeeId }: { employeeId: number }) {
  const [status, setStatus] = useState<"idle" | "subscribed" | "unsupported">("idle");
  const [loading, setLoading] = useState(false);
  const { data: vapidData } = trpc.push.getVapidKey.useQuery();
  const subscribeMutation = trpc.push.subscribe.useMutation();
  const unsubscribeMutation = trpc.push.unsubscribe.useMutation();
  const { data: settings } = trpc.settings.getAll.useQuery();

  // Only show if reminder feature is enabled
  const reminderEnabled = settings?.push_notify_reminder === "true";

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus("unsupported");
      return;
    }
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setStatus(sub ? "subscribed" : "idle");
      });
    }).catch(() => setStatus("unsupported"));
  }, []);

  if (status === "unsupported" || !reminderEnabled) return null;

  const handleSubscribe = async () => {
    if (!vapidData?.publicKey) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidData.publicKey,
      });
      const json = sub.toJSON();
      await subscribeMutation.mutateAsync({
        endpoint: sub.endpoint,
        p256dh: (json.keys as any).p256dh,
        auth: (json.keys as any).auth,
        userAgent: navigator.userAgent,
        employeeId,
      });
      setStatus("subscribed");
    } catch (e: any) {
      Alert.alert("訂閱失敗", e.message || "請確認瀏覽器已允許通知權限");
    } finally {
      setLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribeMutation.mutateAsync({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setStatus("idle");
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  if (status === "subscribed") {
    return (
      <View style={{ backgroundColor: "#F0FDF4", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#BBF7D0", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 12, color: "#16A34A", flex: 1 }}>🔔 已開啟打卡前提醒通知</Text>
        <TouchableOpacity onPress={handleUnsubscribe} disabled={loading}>
          <Text style={{ fontSize: 12, color: "#94A3B8" }}>關閉</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={handleSubscribe}
      disabled={loading}
      style={{ backgroundColor: "#F8FAFC", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#E2E8F0", alignItems: "center", opacity: loading ? 0.7 : 1 }}
    >
      {loading ? (
        <ActivityIndicator color="#64748B" size="small" />
      ) : (
        <Text style={{ fontSize: 13, color: "#64748B" }}>🔔 開啟打卡前 5 分鐘提醒</Text>
      )}
    </TouchableOpacity>
  );
}
