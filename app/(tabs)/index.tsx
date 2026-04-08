import { useState, useEffect, useCallback, useRef } from "react";
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
import { ScreenContainer } from "@/components/screen-container";
import { useEmployeeAuth } from "@/lib/employee-auth";
import { trpc } from "@/lib/trpc";

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

// ─── Camera Modal (Web only, uses getUserMedia) ───────────────────────────────
interface CameraModalProps {
  visible: boolean;
  actionLabel: string; // e.g. "上班打卡" or "下班打卡"
  onCapture: (base64: string, timestamp: number) => void;
  onCancel: () => void;
}

function CameraModal({ visible, actionLabel, onCapture, onCancel }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Start camera when modal opens
  useEffect(() => {
    if (!visible) return;
    setCameraReady(false);
    setCameraError(null);
    setCountdown(null);

    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setCameraReady(true);
        }
      } catch (e: any) {
        if (!cancelled) {
          if (e.name === "NotAllowedError") {
            setCameraError("請允許瀏覽器使用相機權限後再試");
          } else if (e.name === "NotFoundError") {
            setCameraError("找不到相機裝置，請確認設備有相機");
          } else {
            setCameraError(`無法開啟相機：${e.message}`);
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setCameraReady(false);
    };
  }, [visible]);

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    // Limit photo to max 480px wide to keep base64 well under 500KB
    const MAX_W = 480;
    const origW = video.videoWidth || 640;
    const origH = video.videoHeight || 480;
    const scale = origW > MAX_W ? MAX_W / origW : 1;
    const w = Math.round(origW * scale);
    const h = Math.round(origH * scale);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;

    // Mirror the image (front camera is mirrored in preview, un-mirror for capture)
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -w, 0, w, h);
    ctx.restore();

    // Draw timestamp watermark
    const now = new Date();
    const twTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const timeStr = twTime.toISOString().replace("T", " ").slice(0, 19) + " (UTC+8)";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, h - 32, w, 32);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold ${Math.round(12 * scale)}px monospace`;
    ctx.fillText(timeStr, 8, h - 10);

    const timestamp = now.getTime();
    // Use quality 0.65 to keep base64 well under 300KB
    const base64 = canvas.toDataURL("image/jpeg", 0.65);

    // Stop camera
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    onCapture(base64, timestamp);
  };

  if (!visible) return null;

  return (
    <View style={{
      position: "absolute",
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0,0,0,0.85)",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }}>
      <View style={{
        backgroundColor: "#1E293B",
        borderRadius: 20,
        padding: 20,
        width: "90%",
        maxWidth: 400,
        alignItems: "center",
      }}>
        <Text style={{ color: "white", fontSize: 18, fontWeight: "700", marginBottom: 4 }}>
          📷 {actionLabel} — 拍照驗證
        </Text>
        <Text style={{ color: "#94A3B8", fontSize: 12, marginBottom: 16, textAlign: "center" }}>
          請確認臉部清晰可見，然後按下快門
        </Text>

        {/* Camera preview */}
        <View style={{
          width: "100%",
          aspectRatio: 4 / 3,
          backgroundColor: "#0F172A",
          borderRadius: 12,
          overflow: "hidden",
          marginBottom: 16,
          alignItems: "center",
          justifyContent: "center",
        }}>
          {cameraError ? (
            <View style={{ padding: 20, alignItems: "center" }}>
              <Text style={{ fontSize: 32, marginBottom: 12 }}>📷</Text>
              <Text style={{ color: "#F87171", fontSize: 14, textAlign: "center", lineHeight: 22 }}>
                {cameraError}
              </Text>
            </View>
          ) : !cameraReady ? (
            <View style={{ alignItems: "center" }}>
              <ActivityIndicator color="white" size="large" />
              <Text style={{ color: "#94A3B8", marginTop: 12, fontSize: 13 }}>相機啟動中...</Text>
            </View>
          ) : null}

          {/* Native video element via dangerouslySetInnerHTML approach — use web-specific ref */}
          {Platform.OS === "web" && (
            <video
              ref={videoRef as any}
              autoPlay
              playsInline
              muted
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform: "scaleX(-1)", // mirror for natural selfie feel
                display: cameraReady ? "block" : "none",
                borderRadius: 12,
              } as any}
            />
          )}
        </View>

        {/* Hidden canvas for capture */}
        {Platform.OS === "web" && (
          <canvas ref={canvasRef as any} style={{ display: "none" } as any} />
        )}

        {/* Buttons */}
        <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
          <TouchableOpacity
            onPress={onCancel}
            style={{
              flex: 1,
              backgroundColor: "#334155",
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#CBD5E1", fontSize: 15, fontWeight: "600" }}>取消</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleCapture}
            disabled={!cameraReady || !!cameraError}
            style={{
              flex: 2,
              backgroundColor: cameraReady && !cameraError ? "#2563EB" : "#475569",
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "white", fontSize: 15, fontWeight: "700" }}>
              {cameraReady ? "📸 拍照確認" : "等待相機..."}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={{ color: "#475569", fontSize: 11, marginTop: 12, textAlign: "center" }}>
          照片將加入時間戳記並存入打卡記錄，僅管理員可查看
        </Text>
      </View>
    </View>
  );
}

// ─── Verification step overlay ────────────────────────────────────────────────
type VerifyStep = "idle" | "biometric" | "location" | "clocking" | "done";

function VerifyStepBadge({ step, error, success, onDismiss }: {
  step: VerifyStep;
  error: string | null;
  success: string | null;
  onDismiss: () => void;
}) {
  const isProcessing = step !== "idle" && step !== "done";
  const hasError = !!error;
  const hasSuccess = !!success;
  if (!isProcessing && !hasError && !hasSuccess) return null;

  const labels: Record<VerifyStep, string> = {
    idle: "",
    biometric: "🔐 生物識別驗證中...",
    location: "📍 定位取得中...（最多等待 6 秒）",
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
        minWidth: 260,
        maxWidth: 320,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 12,
      }}>
        {hasError ? (
          <>
            <Text style={{ fontSize: 36, marginBottom: 12 }}>⚠️</Text>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#DC2626", textAlign: "center", marginBottom: 8 }}>
              打卡失敗
            </Text>
            <Text style={{ fontSize: 14, color: "#374151", textAlign: "center", lineHeight: 22, marginBottom: 20 }}>
              {error}
            </Text>
            <TouchableOpacity
              onPress={onDismiss}
              style={{ backgroundColor: "#2563EB", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 32 }}
            >
              <Text style={{ color: "white", fontSize: 15, fontWeight: "700" }}>確定</Text>
            </TouchableOpacity>
          </>
        ) : hasSuccess ? (
          <>
            <Text style={{ fontSize: 36, marginBottom: 12 }}>✅</Text>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#16A34A", textAlign: "center", marginBottom: 8 }}>
              打卡成功
            </Text>
            <Text style={{ fontSize: 14, color: "#374151", textAlign: "center", lineHeight: 22, marginBottom: 20 }}>
              {success}
            </Text>
            <TouchableOpacity
              onPress={onDismiss}
              style={{ backgroundColor: "#16A34A", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 32 }}
            >
              <Text style={{ color: "white", fontSize: 15, fontWeight: "700" }}>確定</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color="#2563EB" style={{ marginBottom: 14 }} />
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#1E293B", textAlign: "center" }}>
              {labels[step]}
            </Text>
            <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 6 }}>請稍候...</Text>
          </>
        )}
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function ClockScreen() {
  const { employee } = useEmployeeAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [clock, setClock] = useState<{ step: VerifyStep; error: string | null; success: string | null }>({
    step: "idle",
    error: null,
    success: null,
  });
  const [refreshing, setRefreshing] = useState(false);

  // Camera modal state
  const [cameraVisible, setCameraVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    shiftLabel: string;
    isClockIn: boolean;
  } | null>(null);

  const verifyStep = clock.step;
  const clockError = clock.error;
  const clockSuccess = clock.success;
  const setVerifyStep = (step: VerifyStep) => setClock(prev => ({ ...prev, step }));

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

  const parseTrpcError = (err: any): string => {
    // Try to extract the actual message from tRPC error shape
    const raw = err?.shape?.message || err?.data?.message || err?.message || "";
    // Extract nested message if JSON-wrapped
    let msg = raw;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed[0]?.message) msg = parsed[0].message;
    } catch {}

    // Filter out generic HTTP error codes
    if (!msg || msg === "INTERNAL_SERVER_ERROR" || msg === "BAD_REQUEST" || msg === "UNAUTHORIZED") {
      return "打卡失敗，請稍後再試（如問題持續請聯絡管理員）";
    }
    // Filter out SQL errors (contain backtick column names or INSERT/UPDATE keywords)
    const isSqlError = /`[a-zA-Z]+`/.test(msg) || /INSERT|UPDATE|SELECT|WHERE|FROM/i.test(msg);
    // Filter out base64 data leaking into error messages
    const hasBase64 = /data:image\/|base64,/.test(msg) || msg.length > 300;
    if (isSqlError || hasBase64) {
      return "打卡記錄儲存失敗，請稍後再試（如問題持續請聯絡管理員）";
    }
    return msg;
  };

  const showError = (msg: string) => {
    setClock({ step: "idle", error: msg, success: null });
    if (Platform.OS !== "web") {
      Alert.alert("打卡失敗", msg, [{ text: "確定", onPress: () => setClock(prev => ({ ...prev, error: null })) }]);
    }
  };

  const showSuccess = (msg: string) => {
    setClock({ step: "idle", error: null, success: msg });
    if (Platform.OS !== "web") {
      Alert.alert("打卡成功 ✅", msg, [{ text: "確定", onPress: () => setClock(prev => ({ ...prev, success: null })) }]);
    }
  };

  // Ref to track last clock params for fallback retry (without photo)
  const lastClockInParams = useRef<any>(null);
  const lastClockOutParams = useRef<any>(null);

  const clockInMutation = trpc.attendance.clockIn.useMutation({
    onSuccess: () => {
      refetchAttendance();
      const now = new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
      showSuccess(`上班打卡完成！\n打卡時間：${now}`);
    },
    onError: (err: any) => {
      // Extract full error text from all possible tRPC error locations
      const raw = [
        err?.message,
        err?.shape?.message,
        err?.data?.message,
        JSON.stringify(err?.shape),
        JSON.stringify(err?.data),
      ].filter(Boolean).join(' ');
      const isSqlOrPhotoError = /`[a-zA-Z]+`/.test(raw) || /INSERT|UPDATE|SELECT|Unknown column/i.test(raw) ||
        /data:image\/|base64,/.test(raw) || raw.length > 500 ||
        raw.includes('clockInLocation') || raw.includes('clockOutLocation');
      // If error is SQL/photo related and we have a last params with photo, retry without photo
      if (isSqlOrPhotoError && lastClockInParams.current?.photoBase64) {
        console.warn('[clockIn] Retrying without photo due to SQL/photo error');
        const retryParams = { ...lastClockInParams.current, photoBase64: undefined, photoTimestamp: undefined };
        lastClockInParams.current = null;
        clockInMutation.mutate(retryParams);
        return;
      }
      showError(parseTrpcError(err));
    },
  });

  const clockOutMutation = trpc.attendance.clockOut.useMutation({
    onSuccess: () => {
      refetchAttendance();
      const now = new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
      showSuccess(`下班打卡完成！\n打卡時間：${now}`);
    },
    onError: (err: any) => {
      // Extract full error text from all possible tRPC error locations
      const raw = [
        err?.message,
        err?.shape?.message,
        err?.data?.message,
        JSON.stringify(err?.shape),
        JSON.stringify(err?.data),
      ].filter(Boolean).join(' ');
      const isSqlOrPhotoError = /`[a-zA-Z]+`/.test(raw) || /INSERT|UPDATE|SELECT|Unknown column/i.test(raw) ||
        /data:image\/|base64,/.test(raw) || raw.length > 500 ||
        raw.includes('clockOutLocation') || raw.includes('clockInLocation');
      // If error is SQL/photo related and we have a last params with photo, retry without photo
      if (isSqlOrPhotoError && lastClockOutParams.current?.photoBase64) {
        console.warn('[clockOut] Retrying without photo due to SQL/photo error');
        const retryParams = { ...lastClockOutParams.current, photoBase64: undefined, photoTimestamp: undefined };
        lastClockOutParams.current = null;
        clockOutMutation.mutate(retryParams);
        return;
      }
      showError(parseTrpcError(err));
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchAttendance();
    setRefreshing(false);
  }, []);

  // ─── Step 1: User taps clock button → biometric (native) or camera (web) ───
  const handleClock = async (shiftLabel: string, isClockIn: boolean) => {
    if (!employee || verifyStep !== "idle") return;

    try {
      // ── Biometric (native only) ────────────────────────────────────────────
      if (Platform.OS !== "web") {
        setVerifyStep("biometric");
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (hasHardware && isEnrolled) {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: isClockIn ? `${shiftLabel} - 上班打卡驗證` : `${shiftLabel} - 下班打卡驗證`,
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
        }
        setVerifyStep("idle");
        // Native: proceed without camera (camera UX is complex on native)
        await doClockWithLocation(shiftLabel, isClockIn, undefined, undefined);
        return;
      }

      // ── Web: open camera modal ─────────────────────────────────────────────
      setPendingAction({ shiftLabel, isClockIn });
      setCameraVisible(true);
    } catch (err: any) {
      showError(err?.message || "打卡失敗，請稍後再試");
    }
  };

  // ─── Called after camera capture (web) ────────────────────────────────────
  const handleCameraCapture = async (photoBase64: string, photoTimestamp: number) => {
    setCameraVisible(false);
    if (!pendingAction || !employee) return;
    const { shiftLabel, isClockIn } = pendingAction;
    setPendingAction(null);
    await doClockWithLocation(shiftLabel, isClockIn, photoBase64, photoTimestamp);
  };

  const handleCameraCancel = () => {
    setCameraVisible(false);
    setPendingAction(null);
  };

  // ─── Core clock logic (GPS + API call) ────────────────────────────────────
  const doClockWithLocation = async (
    shiftLabel: string,
    isClockIn: boolean,
    photoBase64: string | undefined,
    photoTimestamp: number | undefined,
  ) => {
    if (!employee) return;

    try {
      setVerifyStep("location");
      let lat: number | undefined;
      let lng: number | undefined;
      let locationName: string | undefined;

      // Only require GPS if settings are loaded AND GPS is enabled AND work location is configured
      // If settings not yet loaded (undefined), default to false to avoid blocking clock-in
      const requireGPS = settings !== undefined
        && settings?.require_gps === "true"
        && !!(settings?.work_location_lat && settings?.work_location_lng);

      const getLocationWithTimeout = (timeoutMs: number): Promise<{ latitude: number; longitude: number }> => {
        if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.geolocation) {
          return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
              (err) => {
                if (err.code === 1) reject(new Error("PERMISSION_DENIED"));
                else if (err.code === 2) reject(new Error("POSITION_UNAVAILABLE"));
                else reject(new Error("TIMEOUT"));
              },
              { timeout: timeoutMs, enableHighAccuracy: true, maximumAge: 0 }
            );
          });
        }
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

      try {
        if (Platform.OS !== "web") {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== "granted") {
            if (requireGPS) {
              showError("打卡需要取得您的位置，請允許定位權限後再試。");
              return;
            }
            throw new Error("no permission");
          }
        }
        const coords = await getLocationWithTimeout(6000);
        lat = coords.latitude;
        lng = coords.longitude;
        locationName = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      } catch (e: any) {
        if (requireGPS) {
          if (e?.message === "PERMISSION_DENIED") {
            showError("打卡需要取得您的位置，請允許定位權限後再試。");
          } else if (e?.message === "POSITION_UNAVAILABLE") {
            showError("無法取得您的位置，請確認 GPS 已開啟後再試。");
          } else if (e?.message === "TIMEOUT") {
            showError("定位超時，請確認 GPS 已開啟且信號良好後再試。");
          } else if (e?.message !== "no permission") {
            showError(`定位失敗：${e?.message || "未知錯誤"}`);
          } else {
            showError("打卡需要取得您的位置，請允許定位權限後再試。");
          }
          return;
        }
      }

      setVerifyStep("clocking");
      if (isClockIn) {
        const clockInParams = {
          employeeId: employee.id,
          lat,
          lng,
          locationName,
          shiftLabel,
          photoBase64,
          photoTimestamp,
        };
        lastClockInParams.current = clockInParams;
        clockInMutation.mutate(clockInParams);
      } else {
        const record = todayAttendance?.find(
          (r) => r.shiftLabel === shiftLabel && r.clockInTime && !r.clockOutTime
        );
        const clockOutParams = {
          employeeId: employee.id,
          attendanceId: record?.id,
          lat,
          lng,
          locationName,
          shiftLabel,
          photoBase64,
          photoTimestamp,
        };
        lastClockOutParams.current = clockOutParams;
        clockOutMutation.mutate(clockOutParams);
      }
    } catch (err: any) {
      showError(err?.message || "打卡失敗，請稍後再試");
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
      {/* Camera modal (web only) */}
      {Platform.OS === "web" && (
        <CameraModal
          visible={cameraVisible}
          actionLabel={pendingAction ? (pendingAction.isClockIn ? "上班打卡" : "下班打卡") : ""}
          onCapture={handleCameraCapture}
          onCancel={handleCameraCancel}
        />
      )}

      {/* Overlay during verification / error / success */}
      <VerifyStepBadge
        step={verifyStep}
        error={clockError}
        success={clockSuccess}
        onDismiss={() => setClock(prev => ({ ...prev, error: null, success: null }))}
      />

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
              <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: "600" }}>📷 即時拍照驗證</Text>
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
                          {Platform.OS !== "web" ? "生物識別 + 定位" : "📷 即時拍照 + 定位"}
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

                {/* Error message */}
                {clockError && !isCompleted && (
                  <View style={{
                    backgroundColor: "#FEF2F2",
                    borderRadius: 10,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor: "#FECACA",
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 6,
                  }}>
                    <Text style={{ fontSize: 14 }}>⚠️</Text>
                    <Text style={{ color: "#DC2626", fontSize: 13, fontWeight: "600", flex: 1, lineHeight: 20 }}>
                      {clockError}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}

          {/* No schedule notice */}
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
            <Text style={{ fontSize: 12, color: "#1E40AF" }}>📷 即時相機拍照（含時間戳記，30 秒有效）</Text>
            {settings?.work_location_lat ? (
              <Text style={{ fontSize: 12, color: "#1E40AF" }}>
                📍 GPS 定位（需在 {settings?.allowed_radius || 200} 公尺範圍內）
              </Text>
            ) : (
              <Text style={{ fontSize: 12, color: "#1E40AF" }}>📍 GPS 定位記錄</Text>
            )}
          </View>

          {/* Push notification subscription */}
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
