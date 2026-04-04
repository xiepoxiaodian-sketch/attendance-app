import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Switch,
  Platform,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { AdminHeader } from "@/components/admin-header";
import { ConfirmDialog, AlertDialog } from "@/components/confirm-dialog";
import { trpc } from "@/lib/trpc";

export default function AdminSettingsScreen() {
  return (
    <ScreenContainer>
      <AdminHeader title="系統設定" subtitle="打卡規則與通知設定" />
      <SystemSettings />
    </ScreenContainer>
  );
}

// ============================================================
// System Settings Tab
// ============================================================
function SystemSettings() {
  const { data: settings, refetch } = trpc.settings.getAll.useQuery();
  const [alertMsg, setAlertMsg] = useState<{ title: string; message: string } | null>(null);
  const setBatchMutation = trpc.settings.setBatch.useMutation({
    onSuccess: () => { refetch(); setAlertMsg({ title: "成功", message: "設定已儲存" }); },
    onError: (err) => setAlertMsg({ title: "錯誤", message: err.message }),
  });
  // Push notification state
  const [pushStatus, setPushStatus] = useState<"idle" | "subscribed" | "unsupported">("idle");
  const [pushLoading, setPushLoading] = useState(false);
  const { data: vapidData } = trpc.push.getVapidKey.useQuery();
  const subscribeMutation = trpc.push.subscribe.useMutation();
  const unsubscribeMutation = trpc.push.unsubscribe.useMutation();
  const testPushMutation = trpc.push.test.useMutation({
    onSuccess: () => setAlertMsg({ title: "測試通知已發送", message: "請確認您的瀏覽器是否收到通知" }),
    onError: (err) => setAlertMsg({ title: "發送失敗", message: err.message }),
  });

  useEffect(() => {
    if (Platform.OS !== "web") { setPushStatus("unsupported"); return; }
    if (!("Notification" in window) || !("serviceWorker" in navigator)) { setPushStatus("unsupported"); return; }
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setPushStatus(sub ? "subscribed" : "idle");
      });
    }).catch(() => setPushStatus("unsupported"));
  }, []);

  const handleSubscribePush = async () => {
    if (!vapidData?.publicKey) return;
    setPushLoading(true);
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
      });
      setPushStatus("subscribed");
      setAlertMsg({ title: "成功", message: "推播通知已啟用！員工打卡異常時您將收到即時通知。" });
    } catch (e: any) {
      setAlertMsg({ title: "訂閱失敗", message: e.message || "請確認瀏覽器已允許通知權限" });
    } finally {
      setPushLoading(false);
    }
  };

  const handleUnsubscribePush = async () => {
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribeMutation.mutateAsync({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setPushStatus("idle");
      setAlertMsg({ title: "已停用", message: "推播通知已關閉" });
    } catch (e: any) {
      setAlertMsg({ title: "錯誤", message: e.message });
    } finally {
      setPushLoading(false);
    }
  };

  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (settings) {
      setForm({ ...settings });
    }
  }, [settings]);

  const handleSave = () => {
    const updates = Object.entries(form).map(([key, value]) => ({ key, value }));
    setBatchMutation.mutate(updates);
  };

  const fields = [
    { key: "work_location_lat", label: "工作地點緯度", placeholder: "例：25.0330" },
    { key: "work_location_lng", label: "工作地點經度", placeholder: "例：121.5654" },
    { key: "allowed_radius", label: "允許打卡範圍（公尺）", placeholder: "例：200" },
    { key: "late_threshold_minutes", label: "遲到判定（分鐘）", placeholder: "例：10" },
    { key: "company_name", label: "公司名稱", placeholder: "您的公司名稱" },
  ];

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <AlertDialog
        visible={!!alertMsg}
        title={alertMsg?.title ?? ""}
        message={alertMsg?.message ?? ""}
        onClose={() => setAlertMsg(null)}
      />
      <View style={{ backgroundColor: "white", borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: "#64748B", marginBottom: 12 }}>打卡設定</Text>

        {/* Require Device Binding */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: "#F1F5F9" }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ fontSize: 14, color: "#1E293B" }}>要求裝置綁定</Text>
            <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>員工只能使用已綁定的裝置打卡</Text>
          </View>
          <Switch
            value={form.require_device_binding === "true"}
            onValueChange={(v) => setForm(f => ({ ...f, require_device_binding: v ? "true" : "false" }))}
            trackColor={{ false: "#E2E8F0", true: "#BFDBFE" }}
            thumbColor={form.require_device_binding === "true" ? "#1E40AF" : "#94A3B8"}
          />
        </View>

        {/* Require GPS */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: "#F1F5F9" }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ fontSize: 14, color: "#1E293B" }}>要求 GPS 定位</Text>
            <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>打卡時需在指定地點範圍內</Text>
          </View>
          <Switch
            value={form.require_gps === "true"}
            onValueChange={(v) => setForm(f => ({ ...f, require_gps: v ? "true" : "false" }))}
            trackColor={{ false: "#E2E8F0", true: "#BFDBFE" }}
            thumbColor={form.require_gps === "true" ? "#1E40AF" : "#94A3B8"}
          />
        </View>

        {/* Require WiFi IP */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ fontSize: 14, color: "#1E293B" }}>限定公司 WiFi 打卡</Text>
            <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>員工需連公司 WiFi 才能打卡</Text>
          </View>
          <Switch
            value={form.require_ip_whitelist === "true"}
            onValueChange={(v) => setForm(f => ({ ...f, require_ip_whitelist: v ? "true" : "false" }))}
            trackColor={{ false: "#E2E8F0", true: "#BFDBFE" }}
            thumbColor={form.require_ip_whitelist === "true" ? "#1E40AF" : "#94A3B8"}
          />
        </View>
      </View>

      {/* WiFi IP Whitelist input */}
      {form.require_ip_whitelist === "true" && (
        <View style={{ backgroundColor: "white", borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#64748B", marginBottom: 4 }}>公司 WiFi 外部 IP</Text>
          <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12 }}>請到 https://whatismyip.com 查詢公司 WiFi 的對外 IP。多個 IP 用逗號分隔（例：203.69.123.45, 111.22.33.44）</Text>
          <TextInput
            value={form.allowed_ips ?? ""}
            onChangeText={(v) => setForm(f => ({ ...f, allowed_ips: v }))}
            placeholder="例：203.69.123.45"
            returnKeyType="done"
            autoCapitalize="none"
            autoCorrect={false}
            style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: "#1E293B" }}
            placeholderTextColor="#94A3B8"
          />
          <Text style={{ fontSize: 11, color: "#F59E0B", marginTop: 8 }}>⚠️ 啟用後員工必須連公司 WiFi 才能打卡，請確認 IP 正確再儲存</Text>
        </View>
      )}

      <View style={{ backgroundColor: "white", borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: "#64748B", marginBottom: 12 }}>地點與時間設定</Text>
        {fields.map((field, i) => (
          <View key={field.key} style={{ marginBottom: i < fields.length - 1 ? 12 : 0 }}>
            <Text style={{ fontSize: 13, color: "#64748B", marginBottom: 6 }}>{field.label}</Text>
            <TextInput
              value={form[field.key] ?? ""}
              onChangeText={(v) => setForm(f => ({ ...f, [field.key]: v }))}
              placeholder={field.placeholder}
              returnKeyType="done"
              style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: "#1E293B" }}
              placeholderTextColor="#94A3B8"
            />
          </View>
        ))}
      </View>

      {/* Push Notification Settings */}
      <View style={{ backgroundColor: "white", borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: "#64748B", marginBottom: 12 }}>推播通知設定</Text>
        {pushStatus === "unsupported" ? (
          <Text style={{ fontSize: 13, color: "#94A3B8" }}>此瀏覽器不支援推播通知，請使用 Chrome 或 Edge</Text>
        ) : (
          <>
            {/* Notify late */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: "#F1F5F9" }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 14, color: "#1E293B" }}>遲到通知</Text>
                <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>員工遲到打卡時發送通知</Text>
              </View>
              <Switch
                value={form.push_notify_late === "true"}
                onValueChange={(v) => setForm(f => ({ ...f, push_notify_late: v ? "true" : "false" }))}
                trackColor={{ false: "#E2E8F0", true: "#BFDBFE" }}
                thumbColor={form.push_notify_late === "true" ? "#1E40AF" : "#94A3B8"}
              />
            </View>
            {/* Notify early leave */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: "#F1F5F9" }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 14, color: "#1E293B" }}>早退通知</Text>
                <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>員工提早打卡下班時發送通知</Text>
              </View>
              <Switch
                value={form.push_notify_early_leave === "true"}
                onValueChange={(v) => setForm(f => ({ ...f, push_notify_early_leave: v ? "true" : "false" }))}
                trackColor={{ false: "#E2E8F0", true: "#BFDBFE" }}
                thumbColor={form.push_notify_early_leave === "true" ? "#1E40AF" : "#94A3B8"}
              />
            </View>
            {/* Notify missing clock-in (admin) */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: "#F1F5F9" }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 14, color: "#1E293B" }}>未打卡提醒（管理員）</Text>
                <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>員工超過指定時間未打卡時通知管理員</Text>
              </View>
              <Switch
                value={form.push_notify_missing === "true"}
                onValueChange={(v) => setForm(f => ({ ...f, push_notify_missing: v ? "true" : "false" }))}
                trackColor={{ false: "#E2E8F0", true: "#BFDBFE" }}
                thumbColor={form.push_notify_missing === "true" ? "#1E40AF" : "#94A3B8"}
              />
            </View>
            {form.push_notify_missing === "true" && (
              <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: "#F1F5F9", gap: 8 }}>
                <Text style={{ fontSize: 13, color: "#64748B", flex: 1 }}>班次開始後幾分鐘未打卡才提醒</Text>
                <TextInput
                  value={form.push_missing_threshold_minutes ?? "15"}
                  onChangeText={(v) => setForm(f => ({ ...f, push_missing_threshold_minutes: v.replace(/[^0-9]/g, "") }))}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  style={{ width: 60, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, textAlign: "center", color: "#1E293B" }}
                />
                <Text style={{ fontSize: 13, color: "#64748B" }}>分鐘</Text>
              </View>
            )}
            {/* Notify pre-shift reminder (employee) */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, marginBottom: 12 }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 14, color: "#1E293B" }}>打卡前提醒（員工）</Text>
                <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>班次開始前 5 分鐘提醒員工打卡</Text>
              </View>
              <Switch
                value={form.push_notify_reminder === "true"}
                onValueChange={(v) => setForm(f => ({ ...f, push_notify_reminder: v ? "true" : "false" }))}
                trackColor={{ false: "#E2E8F0", true: "#BFDBFE" }}
                thumbColor={form.push_notify_reminder === "true" ? "#1E40AF" : "#94A3B8"}
              />
            </View>
            {/* Subscribe / Unsubscribe button */}
            {pushStatus === "subscribed" ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={() => testPushMutation.mutate()}
                  disabled={testPushMutation.isPending}
                  style={{ flex: 1, backgroundColor: "#F0FDF4", borderRadius: 10, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: "#BBF7D0" }}
                >
                  <Text style={{ color: "#16A34A", fontSize: 14, fontWeight: "600" }}>
                    {testPushMutation.isPending ? "發送中..." : "📨 發送測試通知"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleUnsubscribePush}
                  disabled={pushLoading}
                  style={{ flex: 1, backgroundColor: "#FEF2F2", borderRadius: 10, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: "#FECACA" }}
                >
                  <Text style={{ color: "#DC2626", fontSize: 14, fontWeight: "600" }}>
                    {pushLoading ? "處理中..." : "🔕 停用通知"}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleSubscribePush}
                disabled={pushLoading}
                style={{ backgroundColor: "#1E40AF", borderRadius: 10, paddingVertical: 12, alignItems: "center", opacity: pushLoading ? 0.7 : 1 }}
              >
                {pushLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ color: "white", fontSize: 14, fontWeight: "600" }}>🔔 在此裝置啟用推播通知</Text>
                )}
              </TouchableOpacity>
            )}
            <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>
              {pushStatus === "subscribed" ? "✅ 此裝置已啟用推播通知" : "點擊後瀏覽器會請求通知權限，請選擇「允許」"}
            </Text>
          </>
        )}
      </View>

      <TouchableOpacity
        onPress={handleSave}
        disabled={setBatchMutation.isPending}
        style={{ backgroundColor: "#1E40AF", borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: setBatchMutation.isPending ? 0.7 : 1 }}
      >
        {setBatchMutation.isPending ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>儲存設定</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}
