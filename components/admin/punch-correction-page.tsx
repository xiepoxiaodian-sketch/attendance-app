import { useState, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl,
  ActivityIndicator, Modal, TextInput, ScrollView, Image, Dimensions, StatusBar,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { AdminHeader } from "@/components/admin-header";
import { trpc } from "@/lib/trpc";
import { useEmployeeAuth } from "@/lib/employee-auth";

type FilterStatus = "pending" | "approved" | "rejected" | "all";

const STATUS_TABS: { key: FilterStatus; label: string }[] = [
  { key: "pending", label: "待審核" },
  { key: "all", label: "全部" },
  { key: "approved", label: "已核准" },
  { key: "rejected", label: "已拒絕" },
];

const TYPE_LABEL: Record<string, string> = {
  clock_in: "補上班",
  clock_out: "補下班",
  both: "上下班都補",
};

function formatDateTime(d: any): string {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    pending:  { label: "待審核", bg: "#FEF3C7", text: "#D97706" },
    approved: { label: "已核准", bg: "#DCFCE7", text: "#16A34A" },
    rejected: { label: "已拒絕", bg: "#FEE2E2", text: "#DC2626" },
  };
  const s = map[status] ?? map.pending;
  return (
    <View style={{ backgroundColor: s.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
      <Text style={{ color: s.text, fontSize: 11, fontWeight: "600" }}>{s.label}</Text>
    </View>
  );
}

interface ReviewModalProps {
  visible: boolean;
  item: any;
  employeeName: string;
  onClose: () => void;
  onSubmit: (status: "approved" | "rejected", note: string) => void;
  submitting: boolean;
}

function ReviewModal({ visible, item, employeeName, onClose, onSubmit, submitting }: ReviewModalProps) {
  const [note, setNote] = useState("");
  const [action, setAction] = useState<"approved" | "rejected" | null>(null);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const screenWidth = Dimensions.get("window").width;
  const screenHeight = Dimensions.get("window").height;

  const handleSubmit = () => {
    if (!action) return;
    onSubmit(action, note.trim());
    setNote("");
    setAction(null);
  };

  if (!item) return null;

  const rawDate = item.date as unknown as string | Date;
  const dateStr = typeof rawDate === "string" ? rawDate.split("T")[0] : (rawDate as Date).toISOString().split("T")[0];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        {/* Header */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
          <TouchableOpacity onPress={onClose}><Text style={{ color: "#64748B", fontSize: 15 }}>取消</Text></TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#1E293B" }}>補打卡審核</Text>
          <TouchableOpacity onPress={handleSubmit} disabled={!action || submitting}>
            <Text style={{ color: (!action || submitting) ? "#94A3B8" : "#2563EB", fontSize: 15, fontWeight: "600" }}>
              {submitting ? "提交中..." : "確認"}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {/* Employee Info */}
          <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#2563EB" }}>{employeeName[0] ?? "?"}</Text>
              </View>
              <View>
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>{employeeName}</Text>
                <Text style={{ fontSize: 12, color: "#64748B" }}>{dateStr} · {TYPE_LABEL[item.type] ?? item.type}</Text>
              </View>
            </View>

            {/* Requested Times */}
            <View style={{ flexDirection: "row", backgroundColor: "#F8FAFC", borderRadius: 8, padding: 10, gap: 8 }}>
              {item.requestedClockIn && (
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 10, color: "#94A3B8", marginBottom: 2 }}>申請上班</Text>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: "#22C55E" }}>{item.requestedClockIn}</Text>
                </View>
              )}
              {item.requestedClockIn && item.requestedClockOut && (
                <View style={{ width: 1, backgroundColor: "#E2E8F0" }} />
              )}
              {item.requestedClockOut && (
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 10, color: "#94A3B8", marginBottom: 2 }}>申請下班</Text>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: "#3B82F6" }}>{item.requestedClockOut}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Reason */}
          <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569", marginBottom: 6 }}>申請原因</Text>
            <Text style={{ fontSize: 14, color: "#1E293B", lineHeight: 20 }}>{item.reason}</Text>
          </View>
          {/* Screenshot */}
          {item.screenshotBase64 && (
            <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569" }}>系統異常截圖</Text>
                <Text style={{ fontSize: 11, color: "#94A3B8" }}>點擊放大</Text>
              </View>
              <TouchableOpacity onPress={() => setImageViewerVisible(true)} activeOpacity={0.85}>
                <Image
                  source={{ uri: item.screenshotBase64 }}
                  resizeMode="contain"
                  style={{ width: "100%", minHeight: 120, maxHeight: 400, borderRadius: 8 }}
                />
              </TouchableOpacity>
            </View>
          )}

          {/* Full-screen image viewer */}
          <Modal
            visible={imageViewerVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setImageViewerVisible(false)}
          >
            <StatusBar hidden />
            <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center", alignItems: "center" }}>
              <TouchableOpacity
                onPress={() => setImageViewerVisible(false)}
                style={{ position: "absolute", top: 20, right: 20, zIndex: 10, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20, width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>✕</Text>
              </TouchableOpacity>
              <Image
                source={{ uri: item.screenshotBase64 }}
                resizeMode="contain"
                style={{ width: screenWidth, height: screenHeight * 0.9 }}
              />
            </View>
          </Modal>

          {/* Action Selection */}
          <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569", marginBottom: 10 }}>審核結果</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => setAction("approved")}
                style={{
                  flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center",
                  backgroundColor: action === "approved" ? "#16A34A" : "#F0FDF4",
                  borderWidth: 1.5, borderColor: action === "approved" ? "#16A34A" : "#BBF7D0",
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: action === "approved" ? "white" : "#16A34A" }}>✓ 核准</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setAction("rejected")}
                style={{
                  flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center",
                  backgroundColor: action === "rejected" ? "#DC2626" : "#FEF2F2",
                  borderWidth: 1.5, borderColor: action === "rejected" ? "#DC2626" : "#FECACA",
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: action === "rejected" ? "white" : "#DC2626" }}>✗ 拒絕</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Review Note */}
          <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569", marginBottom: 8 }}>審核備注（選填）</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="可填寫核准/拒絕的原因或說明"
              multiline
              numberOfLines={3}
              style={{ fontSize: 14, color: "#1E293B", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, padding: 10, minHeight: 70, textAlignVertical: "top" }}
            />
          </View>

          {!action && (
            <Text style={{ color: "#94A3B8", fontSize: 12, textAlign: "center" }}>請選擇審核結果後按「確認」</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function PunchCorrectionScreen() {
  const { employee } = useEmployeeAuth();
  const [activeStatus, setActiveStatus] = useState<FilterStatus>("pending");
  const [refreshing, setRefreshing] = useState(false);
  const [reviewItem, setReviewItem] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const queryStatus = activeStatus === "all" ? undefined : activeStatus;
  const { data: corrections, refetch, isLoading } = trpc.punchCorrection.getAll.useQuery({ status: queryStatus });
  const { data: employees } = trpc.employees.list.useQuery();
  const reviewMutation = trpc.punchCorrection.review.useMutation({ onSuccess: () => refetch() });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleReview = async (status: "approved" | "rejected", note: string) => {
    if (!reviewItem || !employee) return;
    setSubmitting(true);
    try {
      await reviewMutation.mutateAsync({
        id: reviewItem.id,
        status,
        reviewedBy: employee.id,
        reviewNote: note || undefined,
      });
      setReviewItem(null);
    } finally {
      setSubmitting(false);
    }
  };

  const getEmployeeName = (id: number) => {
    return employees?.find(e => e.id === id)?.fullName ?? `員工 #${id}`;
  };

  const pendingCount = corrections?.filter(c => c.status === "pending").length ?? 0;

  return (
    <ScreenContainer containerClassName="bg-[#F1F5F9]">
      <AdminHeader
        title="補打卡審核"
        subtitle={activeStatus === "pending" ? `${pendingCount} 筆待審核` : `共 ${corrections?.length ?? 0} 筆`}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />

      {/* Status Tabs */}
      <View style={{ backgroundColor: "white", flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
        {STATUS_TABS.map((tab) => {
          const isActive = activeStatus === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveStatus(tab.key)}
              style={{ flex: 1, paddingVertical: 11, alignItems: "center", borderBottomWidth: 2, borderBottomColor: isActive ? "#2563EB" : "transparent" }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: isActive ? "#2563EB" : "#94A3B8" }}>
                {tab.label}{tab.key === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : !corrections || corrections.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ fontSize: 36, marginBottom: 12 }}>
            {activeStatus === "pending" ? "✅" : "📋"}
          </Text>
          <Text style={{ fontSize: 15, fontWeight: "600", color: "#475569", marginBottom: 6 }}>
            {activeStatus === "pending" ? "目前沒有待審核的申請" : "沒有相關記錄"}
          </Text>
          <Text style={{ fontSize: 13, color: "#94A3B8", textAlign: "center" }}>
            {activeStatus === "pending" ? "所有補打卡申請均已處理完畢" : "切換上方分頁查看其他記錄"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={[...corrections].sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime())}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 24 }}
          renderItem={({ item }) => {
            const empName = getEmployeeName(item.employeeId);
            const rawDate = item.date as unknown as string | Date;
            const dateStr = typeof rawDate === "string" ? rawDate.split("T")[0] : (rawDate as Date).toISOString().split("T")[0];
            const isPending = item.status === "pending";

            return (
              <View style={{ backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" }}>
                {/* Card Header */}
                <View style={{ flexDirection: "row", alignItems: "center", padding: 14, borderBottomWidth: 1, borderBottomColor: "#F8FAFC" }}>
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: "#2563EB" }}>{empName[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: "#1E293B" }}>{empName}</Text>
                    <Text style={{ fontSize: 12, color: "#64748B", marginTop: 1 }}>
                      {dateStr} · {TYPE_LABEL[item.type] ?? item.type}
                    </Text>
                  </View>
                  <StatusBadge status={item.status} />
                </View>

                {/* Times */}
                <View style={{ flexDirection: "row", backgroundColor: "#F8FAFC", padding: 10, gap: 8 }}>
                  {item.requestedClockIn && (
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text style={{ fontSize: 10, color: "#94A3B8", marginBottom: 2 }}>申請上班</Text>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: "#22C55E" }}>{item.requestedClockIn}</Text>
                    </View>
                  )}
                  {item.requestedClockIn && item.requestedClockOut && (
                    <View style={{ width: 1, backgroundColor: "#E2E8F0" }} />
                  )}
                  {item.requestedClockOut && (
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text style={{ fontSize: 10, color: "#94A3B8", marginBottom: 2 }}>申請下班</Text>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: "#3B82F6" }}>{item.requestedClockOut}</Text>
                    </View>
                  )}
                </View>

                {/* Reason & Actions */}
                <View style={{ padding: 14 }}>
                  <Text style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>
                    原因：{item.reason}
                  </Text>
                  {item.screenshotBase64 && (
                    <View style={{ marginBottom: 8 }}>
                      <Text style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>📷 附上系統異常截圖</Text>
                      <Image
                        source={{ uri: item.screenshotBase64 }}
                        resizeMode="contain"
                        style={{ width: "100%", minHeight: 80, maxHeight: 160, borderRadius: 6, backgroundColor: "#F8FAFC" }}
                      />
                    </View>
                  )}
                  {item.reviewNote && (
                    <View style={{ marginTop: 6, backgroundColor: item.status === "approved" ? "#F0FDF4" : "#FEF2F2", borderRadius: 8, padding: 8 }}>
                      <Text style={{ fontSize: 12, color: item.status === "approved" ? "#16A34A" : "#DC2626" }}>
                        審核備注：{item.reviewNote}
                      </Text>
                    </View>
                  )}
                  <Text style={{ fontSize: 11, color: "#CBD5E1", marginTop: 8 }}>
                    申請時間：{formatDateTime(item.createdAt)}
                  </Text>

                  {isPending && (
                    <TouchableOpacity
                      onPress={() => setReviewItem(item)}
                      style={{ marginTop: 12, backgroundColor: "#2563EB", borderRadius: 8, paddingVertical: 10, alignItems: "center" }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "700", color: "white" }}>審核此申請</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}

      <ReviewModal
        visible={!!reviewItem}
        item={reviewItem}
        employeeName={reviewItem ? getEmployeeName(reviewItem.employeeId) : ""}
        onClose={() => setReviewItem(null)}
        onSubmit={handleReview}
        submitting={submitting}
      />
    </ScreenContainer>
  );
}
