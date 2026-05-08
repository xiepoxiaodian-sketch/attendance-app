/**
 * TimePickerModal - 彈出式時間選擇器
 * 純 React Native 實作，無需原生模組，支援 Web/iOS/Android
 *
 * 使用方式：
 * <TimePickerModal
 *   visible={showPicker}
 *   value="09:00"
 *   onConfirm={(time) => setTime(time)}
 *   onCancel={() => setShowPicker(false)}
 * />
 */
import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";

interface TimePickerModalProps {
  visible: boolean;
  value?: string; // "HH:MM"
  onConfirm: (time: string) => void;
  onCancel: () => void;
  title?: string;
  minuteStep?: number; // 預設 5
}

export function TimePickerModal({
  visible,
  value,
  onConfirm,
  onCancel,
  title = "選擇時間",
  minuteStep = 5,
}: TimePickerModalProps) {
  const parseTime = (s?: string) => {
    if (!s) return { hour: 9, minute: 0 };
    const [h, m] = s.split(":").map(Number);
    return { hour: isNaN(h) ? 9 : h, minute: isNaN(m) ? 0 : m };
  };

  const initial = parseTime(value);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);

  useEffect(() => {
    if (visible) {
      const t = parseTime(value);
      setHour(t.hour);
      setMinute(t.minute);
    }
  }, [visible, value]);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);

  const handleConfirm = () => {
    const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    onConfirm(timeStr);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
          </View>

          {/* Preview */}
          <View style={styles.preview}>
            <Text style={styles.previewText}>
              {String(hour).padStart(2, "0")} : {String(minute).padStart(2, "0")}
            </Text>
          </View>

          {/* Selectors */}
          <View style={styles.selectors}>
            {/* Hour */}
            <View style={styles.selectorCol}>
              <Text style={styles.selectorLabel}>時</Text>
              <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                {hours.map((h) => (
                  <Pressable
                    key={h}
                    style={[styles.item, h === hour && styles.itemSelected]}
                    onPress={() => setHour(h)}
                  >
                    <Text style={[styles.itemText, h === hour && styles.itemTextSelected]}>
                      {String(h).padStart(2, "0")}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Separator */}
            <View style={styles.separator}>
              <Text style={styles.separatorText}>:</Text>
            </View>

            {/* Minute */}
            <View style={styles.selectorCol}>
              <Text style={styles.selectorLabel}>分</Text>
              <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                {minutes.map((m) => (
                  <Pressable
                    key={m}
                    style={[styles.item, m === minute && styles.itemSelected]}
                    onPress={() => setMinute(m)}
                  >
                    <Text style={[styles.itemText, m === minute && styles.itemTextSelected]}>
                      {String(m).padStart(2, "0")}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>

          {/* Buttons */}
          <View style={styles.buttons}>
            <Pressable style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>取消</Text>
            </Pressable>
            <Pressable style={styles.confirmBtn} onPress={handleConfirm}>
              <Text style={styles.confirmText}>確認</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    backgroundColor: "#fff",
    borderRadius: 16,
    width: 260,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    alignItems: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
  },
  preview: {
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  previewText: {
    fontSize: 28,
    fontWeight: "700",
    color: "#2563EB",
    letterSpacing: 2,
  },
  selectors: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  selectorCol: {
    flex: 1,
    alignItems: "center",
  },
  selectorLabel: {
    fontSize: 12,
    color: "#94A3B8",
    marginBottom: 4,
    fontWeight: "600",
  },
  scroll: {
    height: 200,
    width: "100%",
  },
  separator: {
    paddingHorizontal: 4,
    paddingTop: 20,
    alignItems: "center",
  },
  separatorText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#94A3B8",
  },
  item: {
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 8,
    marginVertical: 1,
    alignItems: "center",
  },
  itemSelected: {
    backgroundColor: "#2563EB",
  },
  itemText: {
    fontSize: 16,
    color: "#374151",
  },
  itemTextSelected: {
    color: "#fff",
    fontWeight: "700",
  },
  buttons: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderRightWidth: 0.5,
    borderRightColor: "#F1F5F9",
  },
  cancelText: {
    fontSize: 15,
    color: "#64748B",
    fontWeight: "600",
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  confirmText: {
    fontSize: 15,
    color: "#2563EB",
    fontWeight: "700",
  },
});
