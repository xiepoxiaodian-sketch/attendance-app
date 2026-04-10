import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Modal,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { trpc } from "@/lib/trpc";
import { useEmployeeAuth } from "@/lib/employee-auth";

type FeedbackType = "bug" | "suggestion" | "other";
type FeedbackStatus = "pending" | "reviewing" | "resolved" | "closed";

const TYPE_OPTIONS: { value: FeedbackType; label: string; icon: string; color: string; bg: string }[] = [
  { value: "bug", label: "問題回報", icon: "⚠️", color: "#DC2626", bg: "#FEF2F2" },
  { value: "suggestion", label: "功能建議", icon: "💡", color: "#2563EB", bg: "#EFF6FF" },
  { value: "other", label: "其他意見", icon: "💬", color: "#7C3AED", bg: "#F5F3FF" },
];

const TYPE_LABELS: Record<FeedbackType, { label: string; emoji: string; color: string; bg: string }> = {
  bug: { label: "問題回報", emoji: "⚠️", color: "#DC2626", bg: "#FEF2F2" },
  suggestion: { label: "功能建議", emoji: "💡", color: "#2563EB", bg: "#EFF6FF" },
  other: { label: "其他意見", emoji: "💬", color: "#7C3AED", bg: "#F5F3FF" },
};

const STATUS_LABELS: Record<FeedbackStatus, { label: string; color: string; bg: string }> = {
  pending: { label: "待處理", color: "#D97706", bg: "#FEF3C7" },
  reviewing: { label: "處理中", color: "#2563EB", bg: "#DBEAFE" },
  resolved: { label: "已解決", color: "#059669", bg: "#D1FAE5" },
  closed: { label: "已關閉", color: "#6B7280", bg: "#F3F4F6" },
};

function formatDate(dateStr: string | Date | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const twTime = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return twTime.toISOString().replace("T", " ").slice(0, 16);
}

export default function FeedbackScreen() {
  const { employee } = useEmployeeAuth();
  const [activeTab, setActiveTab] = useState<"submit" | "history">("submit");
  const [type, setType] = useState<FeedbackType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [imageModalUri, setImageModalUri] = useState<string | null>(null);

  const createMutation = trpc.feedback.create.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      historyQuery.refetch();
    },
    onError: (err) => {
      Alert.alert("提交失敗", err.message || "請稍後再試");
    },
  });

  const historyQuery = trpc.feedback.getByEmployee.useQuery(
    { employeeId: employee?.id ?? 0 },
    { enabled: !!employee?.id }
  );
  const historyList = historyQuery.data ?? [];
  const detailItem = detailId !== null ? historyList.find(f => f.id === detailId) : null;

  const pickImage = async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("需要相片權限", "請在設定中允許存取相片庫");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
      base64: true,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        const b64 = `data:image/jpeg;base64,${asset.base64}`;
        if (b64.length > 2000000) {
          Alert.alert("圖片太大", "請選擇較小的圖片（建議 2MB 以下）");
          return;
        }
        setScreenshot(b64);
      }
    }
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      Alert.alert("請填寫標題");
      return;
    }
    if (!description.trim()) {
      Alert.alert("請填寫說明");
      return;
    }
    if (!employee?.id) {
      Alert.alert("請先登入");
      return;
    }
    createMutation.mutate({
      employeeId: employee.id,
      type,
      title: title.trim(),
      description: description.trim(),
      screenshotBase64: screenshot,
    });
  };

  const handleReset = () => {
    setType("bug");
    setTitle("");
    setDescription("");
    setScreenshot(null);
    setSubmitted(false);
  };

  if (submitted) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <View style={{
            width: 80, height: 80, borderRadius: 40,
            backgroundColor: "#DCFCE7", alignItems: "center", justifyContent: "center",
            marginBottom: 20,
          }}>
            <Text style={{ fontSize: 36 }}>✅</Text>
          </View>
          <Text style={{ fontSize: 22, fontWeight: "700", color: "#1E293B", marginBottom: 8, textAlign: "center" }}>
            已成功提交
          </Text>
          <Text style={{ fontSize: 15, color: "#64748B", textAlign: "center", lineHeight: 22, marginBottom: 32 }}>
            感謝您的反饋！管理員會盡快查看並處理您的意見。
          </Text>
          <TouchableOpacity
            onPress={handleReset}
            style={{
              backgroundColor: "#1E3A8A",
              paddingHorizontal: 32, paddingVertical: 14,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: "white", fontWeight: "600", fontSize: 16 }}>再次提交</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* Tab Bar */}
      <View style={{ flexDirection: "row", backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
        {(["submit", "history"] as const).map((tab) => {
          const label = tab === "submit" ? "提交反饋" : `我的反饋${historyList.length > 0 ? ` (${historyList.length})` : ""}`;
          const active = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{
                flex: 1, paddingVertical: 14, alignItems: "center",
                borderBottomWidth: 2,
                borderBottomColor: active ? "#1E3A8A" : "transparent",
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: active ? "#1E3A8A" : "#94A3B8" }}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* History Tab */}
      {activeTab === "history" && (
        <ScrollView style={{ flex: 1, backgroundColor: "#F8FAFC" }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {historyQuery.isLoading ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <ActivityIndicator size="large" color="#1E3A8A" />
            </View>
          ) : historyList.length === 0 ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <Text style={{ fontSize: 32, marginBottom: 12 }}>📦</Text>
              <Text style={{ fontSize: 15, color: "#94A3B8", fontWeight: "600" }}>尚無反饋記錄</Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {historyList.map((fb) => {
                const typeInfo = TYPE_LABELS[fb.type as FeedbackType];
                const statusInfo = STATUS_LABELS[fb.status as FeedbackStatus];
                const hasReply = !!fb.adminNote;
                return (
                  <TouchableOpacity
                    key={fb.id}
                    onPress={() => setDetailId(fb.id)}
                    style={{
                      backgroundColor: "white", borderRadius: 14, padding: 16,
                      borderWidth: 1.5,
                      borderColor: hasReply ? "#BFDBFE" : "#E2E8F0",
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: typeInfo.bg }}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: typeInfo.color }}>{typeInfo.emoji} {typeInfo.label}</Text>
                      </View>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: statusInfo.bg }}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: statusInfo.color }}>{statusInfo.label}</Text>
                      </View>
                      {hasReply && (
                        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: "#DBEAFE" }}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#2563EB" }}>💬 已回覆</Text>
                        </View>
                      )}
                      <Text style={{ fontSize: 11, color: "#94A3B8", marginLeft: "auto" }}>{formatDate(fb.createdAt)}</Text>
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B", marginBottom: 4 }}>{fb.title}</Text>
                    <Text style={{ fontSize: 13, color: "#64748B", lineHeight: 18 }} numberOfLines={2}>{fb.description}</Text>
                    {hasReply && (
                      <View style={{ marginTop: 10, backgroundColor: "#EFF6FF", borderRadius: 8, padding: 10, borderLeftWidth: 3, borderLeftColor: "#2563EB" }}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: "#2563EB", marginBottom: 4 }}>💬 管理員回覆</Text>
                        <Text style={{ fontSize: 13, color: "#1E40AF", lineHeight: 18 }} numberOfLines={2}>{fb.adminNote}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* Detail Modal */}
      <Modal visible={detailId !== null} animationType="slide" transparent onRequestClose={() => setDetailId(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: "#1E293B" }}>反饋詳情</Text>
              <TouchableOpacity
                onPress={() => setDetailId(null)}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ fontSize: 16, color: "#64748B" }}>✕</Text>
              </TouchableOpacity>
            </View>
            {detailItem && (
              <ScrollView style={{ padding: 20 }}>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                  {(() => { const t = TYPE_LABELS[detailItem.type as FeedbackType]; return (
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: t.bg }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: t.color }}>{t.emoji} {t.label}</Text>
                    </View>
                  ); })()}
                  {(() => { const s = STATUS_LABELS[detailItem.status as FeedbackStatus]; return (
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: s.bg }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: s.color }}>{s.label}</Text>
                    </View>
                  ); })()}
                </View>
                <Text style={{ fontSize: 18, fontWeight: "800", color: "#1E293B", marginBottom: 6 }}>{detailItem.title}</Text>
                <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 14 }}>{formatDate(detailItem.createdAt)}</Text>
                <View style={{ backgroundColor: "#F8FAFC", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#E2E8F0" }}>
                  <Text style={{ fontSize: 14, color: "#374151", lineHeight: 22 }}>{detailItem.description}</Text>
                </View>
                {detailItem.screenshotBase64 && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 }}>截圖</Text>
                    <TouchableOpacity onPress={() => setImageModalUri(detailItem.screenshotBase64!)}>
                      <Image source={{ uri: detailItem.screenshotBase64 }} style={{ width: "100%", height: 180, borderRadius: 12 }} resizeMode="contain" />
                      <Text style={{ fontSize: 11, color: "#94A3B8", textAlign: "center", marginTop: 4 }}>點擊放大查看</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {detailItem.adminNote ? (
                  <View style={{ backgroundColor: "#EFF6FF", borderRadius: 12, padding: 16, marginBottom: 32, borderLeftWidth: 4, borderLeftColor: "#2563EB" }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#1E3A8A", marginBottom: 8 }}>💬 管理員回覆</Text>
                    <Text style={{ fontSize: 14, color: "#1E40AF", lineHeight: 22 }}>{detailItem.adminNote}</Text>
                    <Text style={{ fontSize: 11, color: "#93C5FD", marginTop: 8 }}>更新於 {formatDate(detailItem.updatedAt)}</Text>
                  </View>
                ) : (
                  <View style={{ backgroundColor: "#F8FAFC", borderRadius: 12, padding: 16, marginBottom: 32, alignItems: "center" }}>
                    <Text style={{ fontSize: 13, color: "#94A3B8" }}>管理員尚未回覆，請耐心等候</Text>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Image Fullscreen Modal */}
      <Modal visible={imageModalUri !== null} transparent animationType="fade" onRequestClose={() => setImageModalUri(null)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "center", alignItems: "center" }}
          onPress={() => setImageModalUri(null)}
          activeOpacity={1}
        >
          {imageModalUri && <Image source={{ uri: imageModalUri }} style={{ width: "95%", height: "80%" }} resizeMode="contain" />}
          <Text style={{ color: "rgba(255,255,255,0.6)", marginTop: 12, fontSize: 13 }}>點擊任意處關閉</Text>
        </TouchableOpacity>
      </Modal>

      {/* Submit Tab */}
      {activeTab === "submit" && (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 26, fontWeight: "800", color: "#1E293B" }}>意見反饋</Text>
            <Text style={{ fontSize: 14, color: "#64748B", marginTop: 4 }}>
              遇到問題或有建議？告訴我們！
            </Text>
          </View>

          {/* Type Selection */}
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 10 }}>
            反饋類型
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
            {TYPE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setType(opt.value)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  paddingHorizontal: 8,
                  borderRadius: 12,
                  alignItems: "center",
                  backgroundColor: type === opt.value ? opt.bg : "#F8FAFC",
                  borderWidth: 2,
                  borderColor: type === opt.value ? opt.color : "#E2E8F0",
                }}
              >
                <Text style={{ fontSize: 22, marginBottom: 4 }}>{opt.icon}</Text>
                <Text style={{
                  fontSize: 12, fontWeight: "600",
                  color: type === opt.value ? opt.color : "#94A3B8",
                  textAlign: "center",
                }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Title */}
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 8 }}>
            標題 <Text style={{ color: "#EF4444" }}>*</Text>
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="請簡短描述問題或建議"
            placeholderTextColor="#94A3B8"
            maxLength={100}
            returnKeyType="next"
            style={{
              backgroundColor: "#F8FAFC",
              borderWidth: 1.5,
              borderColor: "#E2E8F0",
              borderRadius: 12,
              padding: 14,
              fontSize: 15,
              color: "#1E293B",
              marginBottom: 20,
            }}
          />

          {/* Description */}
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 8 }}>
            詳細說明 <Text style={{ color: "#EF4444" }}>*</Text>
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={
              type === "bug"
                ? "請描述問題發生的情況、步驟及預期結果..."
                : type === "suggestion"
                ? "請描述您希望新增或改善的功能..."
                : "請描述您的意見或想法..."
            }
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            style={{
              backgroundColor: "#F8FAFC",
              borderWidth: 1.5,
              borderColor: "#E2E8F0",
              borderRadius: 12,
              padding: 14,
              fontSize: 15,
              color: "#1E293B",
              minHeight: 120,
              marginBottom: 20,
            }}
          />

          {/* Screenshot Upload */}
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 8 }}>
            截圖（選填）
          </Text>
          {screenshot ? (
            <View style={{ marginBottom: 20 }}>
              <Image
                source={{ uri: screenshot }}
                style={{ width: "100%", height: 200, borderRadius: 12, marginBottom: 8 }}
                resizeMode="contain"
              />
              <TouchableOpacity
                onPress={() => setScreenshot(null)}
                style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "center",
                  padding: 10, borderRadius: 10,
                  backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA",
                }}
              >
                <Text style={{ color: "#DC2626", fontWeight: "600", fontSize: 14 }}>移除截圖</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={pickImage}
              style={{
                borderWidth: 2,
                borderColor: "#CBD5E1",
                borderStyle: "dashed",
                borderRadius: 12,
                padding: 24,
                alignItems: "center",
                backgroundColor: "#F8FAFC",
                marginBottom: 20,
              }}
            >
              <Text style={{ fontSize: 32, marginBottom: 8 }}>📷</Text>
              <Text style={{ fontSize: 15, fontWeight: "600", color: "#475569" }}>
                點擊上傳截圖
              </Text>
              <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>
                支援 JPG、PNG（最大 2MB）
              </Text>
            </TouchableOpacity>
          )}

          {/* Submit Button */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={createMutation.isPending}
            style={{
              backgroundColor: createMutation.isPending ? "#94A3B8" : "#1E3A8A",
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text style={{ color: "white", fontWeight: "700", fontSize: 17 }}>提交反饋</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
      )}
    </ScreenContainer>
  );
}
