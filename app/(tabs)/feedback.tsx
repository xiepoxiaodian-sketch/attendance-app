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
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { trpc } from "@/lib/trpc";
import { useEmployeeAuth } from "@/lib/employee-auth";

type FeedbackType = "bug" | "suggestion" | "other";

const TYPE_OPTIONS: { value: FeedbackType; label: string; icon: string; color: string; bg: string }[] = [
  { value: "bug", label: "問題回報", icon: "⚠️", color: "#DC2626", bg: "#FEF2F2" },
  { value: "suggestion", label: "功能建議", icon: "💡", color: "#2563EB", bg: "#EFF6FF" },
  { value: "other", label: "其他意見", icon: "💬", color: "#7C3AED", bg: "#F5F3FF" },
];

export default function FeedbackScreen() {
  const { employee } = useEmployeeAuth();
  const [type, setType] = useState<FeedbackType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const createMutation = trpc.feedback.create.useMutation({
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err) => {
      Alert.alert("提交失敗", err.message || "請稍後再試");
    },
  });

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
    </ScreenContainer>
  );
}
