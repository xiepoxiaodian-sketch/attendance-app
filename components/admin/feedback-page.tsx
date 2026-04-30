import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  Image,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { AdminHeader } from "@/components/admin-header";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";

type FeedbackStatus = "pending" | "reviewing" | "resolved" | "closed";
type FeedbackType = "bug" | "suggestion" | "other";

const TYPE_LABELS: Record<FeedbackType, { label: string; emoji: string; color: string; bg: string }> = {
  bug: { label: "問題回報", emoji: "⚠️", color: "#DC2626", bg: "#FEF2F2" },
  suggestion: { label: "功能建議", emoji: "💡", color: "#2563EB", bg: "#EFF6FF" },
  other: { label: "其他意見", emoji: "💬", color: "#7C3AED", bg: "#F5F3FF" },
};

const STATUS_LABELS: Record<FeedbackStatus, { label: string; color: string; bg: string }> = {
  pending: { label: "待處理", color: "#D97706", bg: "#FEF3C7" },
  reviewing: { label: "審核中", color: "#2563EB", bg: "#DBEAFE" },
  resolved: { label: "已解決", color: "#059669", bg: "#D1FAE5" },
  closed: { label: "已關閉", color: "#6B7280", bg: "#F3F4F6" },
};

function formatDate(dateStr: string | Date | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const twTime = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return twTime.toISOString().replace("T", " ").slice(0, 16);
}

export default function AdminFeedbackScreen() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<FeedbackStatus | "all">("all");
  const [filterType, setFilterType] = useState<FeedbackType | "all">("all");
  const [adminNote, setAdminNote] = useState("");
  const [newStatus, setNewStatus] = useState<FeedbackStatus>("reviewing");
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);

  const { data: feedbacks = [], isLoading, refetch } = trpc.feedback.getAll.useQuery();
  const { data: selectedFeedback } = trpc.feedback.getById.useQuery(
    { id: selectedId! },
    { enabled: selectedId !== null }
  );

  const updateMutation = trpc.feedback.updateStatus.useMutation({
    onSuccess: () => {
      refetch();
      setSelectedId(null);
      Alert.alert("已更新", "反饋狀態已成功更新");
    },
    onError: (err) => {
      Alert.alert("更新失敗", err.message);
    },
  });

  const filtered = feedbacks.filter((f) => {
    if (filterStatus !== "all" && f.status !== filterStatus) return false;
    if (filterType !== "all" && f.type !== filterType) return false;
    return true;
  });

  const pendingCount = feedbacks.filter((f) => f.status === "pending").length;

  const handleOpenDetail = (id: number) => {
    const fb = feedbacks.find((f) => f.id === id);
    setAdminNote(fb?.adminNote ?? "");
    setNewStatus(fb?.status as FeedbackStatus ?? "reviewing");
    setSelectedId(id);
  };

  const handleUpdate = () => {
    if (!selectedId) return;
    updateMutation.mutate({
      id: selectedId,
      status: newStatus,
      adminNote: adminNote.trim() || undefined,
    });
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <AdminHeader
        title="意見反饋"
        subtitle={pendingCount > 0 ? `${pendingCount} 筆待處理` : undefined}
        onRefresh={async () => { await refetch(); }}
      />

      {/* Filter Bar */}
      <View style={{ backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
        {/* Status Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["all", "pending", "reviewing", "resolved", "closed"] as const).map((s) => {
              const active = filterStatus === s;
              const label = s === "all" ? "全部" : STATUS_LABELS[s].label;
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => setFilterStatus(s)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 6,
                    borderRadius: 20,
                    backgroundColor: active ? "#1E3A8A" : "#F1F5F9",
                    borderWidth: 1,
                    borderColor: active ? "#1E3A8A" : "#E2E8F0",
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: active ? "white" : "#64748B" }}>
                    {label}
                    {s === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
        {/* Type Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["all", "bug", "suggestion", "other"] as const).map((t) => {
              const active = filterType === t;
              const label = t === "all" ? "全部類型" : TYPE_LABELS[t].label;
              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => setFilterType(t)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 5,
                    borderRadius: 20,
                    backgroundColor: active ? "#E0F2FE" : "#F8FAFC",
                    borderWidth: 1,
                    borderColor: active ? "#0284C7" : "#E2E8F0",
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: active ? "#0284C7" : "#94A3B8" }}>
                    {t !== "all" ? TYPE_LABELS[t as FeedbackType].emoji + " " : ""}{label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* List */}
      <ScrollView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        {isLoading ? (
          <View style={{ padding: 40, alignItems: "center" }}>
            <ActivityIndicator size="large" color="#1E3A8A" />
            <Text style={{ color: "#64748B", marginTop: 12 }}>載入中...</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={{ padding: 40, alignItems: "center" }}>
            <Text style={{ fontSize: 32, marginBottom: 12 }}>📭</Text>
            <Text style={{ fontSize: 16, color: "#94A3B8", fontWeight: "600" }}>暫無反饋記錄</Text>
          </View>
        ) : (
          <View style={{ padding: 12, gap: 10 }}>
            {filtered.map((fb) => {
              const typeInfo = TYPE_LABELS[fb.type as FeedbackType];
              const statusInfo = STATUS_LABELS[fb.status as FeedbackStatus];
              return (
                <TouchableOpacity
                  key={fb.id}
                  onPress={() => handleOpenDetail(fb.id)}
                  style={{
                    backgroundColor: "white",
                    borderRadius: 14,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: fb.status === "pending" ? "#FDE68A" : "#E2E8F0",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.05,
                    shadowRadius: 2,
                    elevation: 1,
                  }}
                >
                  {/* Top Row */}
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 }}>
                    <View style={{
                      paddingHorizontal: 8, paddingVertical: 3,
                      borderRadius: 8, backgroundColor: typeInfo.bg,
                    }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: typeInfo.color }}>
                        {typeInfo.emoji} {typeInfo.label}
                      </Text>
                    </View>
                    <View style={{
                      paddingHorizontal: 8, paddingVertical: 3,
                      borderRadius: 8, backgroundColor: statusInfo.bg,
                    }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: statusInfo.color }}>
                        {statusInfo.label}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11, color: "#94A3B8", marginLeft: "auto" }}>
                      {formatDate(fb.createdAt)}
                    </Text>
                  </View>

                  {/* Title */}
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B", marginBottom: 4 }}>
                    {fb.title}
                  </Text>

                  {/* Description preview */}
                  <Text style={{ fontSize: 13, color: "#64748B", lineHeight: 18 }} numberOfLines={2}>
                    {fb.description}
                  </Text>

                  {/* Employee */}
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 6 }}>
                    <View style={{
                      width: 24, height: 24, borderRadius: 12,
                      backgroundColor: "#EFF6FF",
                      alignItems: "center", justifyContent: "center",
                    }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: "#2563EB" }}>
                        {(fb.employeeName ?? "?")[0]}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, color: "#475569", fontWeight: "500" }}>
                      {fb.employeeName ?? "未知員工"} ({fb.employeeUsername ?? "—"})
                    </Text>
                    <View style={{ flexDirection: "row", gap: 6, marginLeft: "auto" }}>
                      {fb.adminNote && (
                        <View style={{ backgroundColor: "#DBEAFE", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ fontSize: 10, color: "#2563EB", fontWeight: "600" }}>💬 已回覆</Text>
                        </View>
                      )}
                      {fb.screenshotBase64 && (
                        <Text style={{ fontSize: 11, color: "#94A3B8" }}>📷 含截圖</Text>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Detail Modal */}
      <Modal
        visible={selectedId !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedId(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{
            backgroundColor: "white",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: "90%",
          }}>
            {/* Modal Header */}
            <View style={{
              flexDirection: "row", alignItems: "center",
              padding: 20, borderBottomWidth: 1, borderBottomColor: "#E2E8F0",
            }}>
              <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: "#1E293B" }}>
                反饋詳情
              </Text>
              <TouchableOpacity
                onPress={() => setSelectedId(null)}
                style={{
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: "#F1F5F9",
                  alignItems: "center", justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 16, color: "#64748B" }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 20 }}>
              {selectedFeedback ? (
                <>
                  {/* Type & Status */}
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                    {(() => {
                      const t = TYPE_LABELS[selectedFeedback.type as FeedbackType];
                      return (
                        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: t.bg }}>
                          <Text style={{ fontSize: 12, fontWeight: "700", color: t.color }}>
                            {t.emoji} {t.label}
                          </Text>
                        </View>
                      );
                    })()}
                    {(() => {
                      const s = STATUS_LABELS[selectedFeedback.status as FeedbackStatus];
                      return (
                        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: s.bg }}>
                          <Text style={{ fontSize: 12, fontWeight: "700", color: s.color }}>{s.label}</Text>
                        </View>
                      );
                    })()}
                  </View>

                  {/* Title */}
                  <Text style={{ fontSize: 18, fontWeight: "800", color: "#1E293B", marginBottom: 8 }}>
                    {selectedFeedback.title}
                  </Text>

                  {/* Meta */}
                  <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 16 }}>
                    {selectedFeedback.employeeName} ({selectedFeedback.employeeUsername}) · {formatDate(selectedFeedback.createdAt)}
                  </Text>

                  {/* Description */}
                  <View style={{
                    backgroundColor: "#F8FAFC", borderRadius: 12,
                    padding: 14, marginBottom: 16,
                    borderWidth: 1, borderColor: "#E2E8F0",
                  }}>
                    <Text style={{ fontSize: 14, color: "#374151", lineHeight: 22 }}>
                      {selectedFeedback.description}
                    </Text>
                  </View>

                  {/* Screenshot */}
                  {selectedFeedback.screenshotBase64 && (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 }}>截圖</Text>
                      <TouchableOpacity
                        onPress={() => {
                          setImageUri(selectedFeedback.screenshotBase64!);
                          setImageModalVisible(true);
                        }}
                      >
                        <Image
                          source={{ uri: selectedFeedback.screenshotBase64 }}
                          style={{ width: "100%", height: 200, borderRadius: 12 }}
                          resizeMode="contain"
                        />
                        <Text style={{ fontSize: 11, color: "#94A3B8", textAlign: "center", marginTop: 4 }}>
                          點擊放大查看
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Admin Reply */}
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#1E3A8A" }}>💬 回覆員工</Text>
                    <View style={{ backgroundColor: "#DBEAFE", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                      <Text style={{ fontSize: 10, color: "#2563EB", fontWeight: "600" }}>員工可看到</Text>
                    </View>
                  </View>
                  <TextInput
                    value={adminNote}
                    onChangeText={setAdminNote}
                    placeholder="輸入回覆內容，員工將可在「我的反饋」中看到此回覆..."
                    placeholderTextColor="#94A3B8"
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    style={{
                      backgroundColor: "#EFF6FF",
                      borderWidth: 1.5,
                      borderColor: "#BFDBFE",
                      borderRadius: 10,
                      padding: 12,
                      fontSize: 14,
                      color: "#1E293B",
                      minHeight: 100,
                      marginBottom: 16,
                    }}
                  />

                  {/* Status Update */}
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 }}>
                    更新狀態
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                    {(["pending", "reviewing", "resolved", "closed"] as FeedbackStatus[]).map((s) => {
                      const info = STATUS_LABELS[s];
                      const active = newStatus === s;
                      return (
                        <TouchableOpacity
                          key={s}
                          onPress={() => setNewStatus(s)}
                          style={{
                            paddingHorizontal: 14, paddingVertical: 8,
                            borderRadius: 10,
                            backgroundColor: active ? info.bg : "#F8FAFC",
                            borderWidth: 2,
                            borderColor: active ? info.color : "#E2E8F0",
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: "600", color: active ? info.color : "#94A3B8" }}>
                            {info.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Submit */}
                  <TouchableOpacity
                    onPress={handleUpdate}
                    disabled={updateMutation.isPending}
                    style={{
                      backgroundColor: updateMutation.isPending ? "#94A3B8" : "#1E3A8A",
                      borderRadius: 12,
                      paddingVertical: 14,
                      alignItems: "center",
                      marginBottom: 32,
                    }}
                  >
                    {updateMutation.isPending ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>確認更新</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <ActivityIndicator size="large" color="#1E3A8A" style={{ margin: 40 }} />
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Image Fullscreen Modal */}
      <Modal
        visible={imageModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setImageModalVisible(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "center", alignItems: "center" }}
          onPress={() => setImageModalVisible(false)}
          activeOpacity={1}
        >
          {imageUri && (
            <Image
              source={{ uri: imageUri }}
              style={{ width: "95%", height: "80%" }}
              resizeMode="contain"
            />
          )}
          <Text style={{ color: "rgba(255,255,255,0.6)", marginTop: 12, fontSize: 13 }}>
            點擊任意處關閉
          </Text>
        </TouchableOpacity>
      </Modal>
    </ScreenContainer>
  );
}
