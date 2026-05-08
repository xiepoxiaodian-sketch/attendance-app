/**
 * DatePickerModal - 彈出式日期選擇器
 * 純 React Native 實作，無需原生模組，支援 Web/iOS/Android
 *
 * 使用方式：
 * <DatePickerModal
 *   visible={showPicker}
 *   value="2026-05-08"
 *   onConfirm={(date) => setDate(date)}
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

interface DatePickerModalProps {
  visible: boolean;
  value?: string; // "YYYY-MM-DD"
  onConfirm: (date: string) => void;
  onCancel: () => void;
  minDate?: string; // "YYYY-MM-DD"
  maxDate?: string; // "YYYY-MM-DD"
  title?: string;
}

const MONTHS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function DatePickerModal({
  visible,
  value,
  onConfirm,
  onCancel,
  minDate,
  maxDate,
  title = "選擇日期",
}: DatePickerModalProps) {
  const today = new Date();
  const parseDate = (s?: string) => {
    if (!s) return { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() };
    const [y, m, d] = s.split("-").map(Number);
    return { year: y, month: m, day: d };
  };

  const initial = parseDate(value);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [day, setDay] = useState(initial.day);

  useEffect(() => {
    if (visible) {
      const d = parseDate(value);
      setYear(d.year);
      setMonth(d.month);
      setDay(d.day);
    }
  }, [visible, value]);

  const daysInMonth = getDaysInMonth(year, month);
  const clampedDay = Math.min(day, daysInMonth);

  const currentYear = today.getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const handleConfirm = () => {
    const d = Math.min(day, daysInMonth);
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    onConfirm(dateStr);
  };

  const isDisabled = (y: number, m: number, d: number) => {
    const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (minDate && dateStr < minDate) return true;
    if (maxDate && dateStr > maxDate) return true;
    return false;
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
              {year} 年 {month} 月 {Math.min(day, daysInMonth)} 日
            </Text>
          </View>

          {/* Selectors */}
          <View style={styles.selectors}>
            {/* Year */}
            <View style={styles.selectorCol}>
              <Text style={styles.selectorLabel}>年</Text>
              <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                {years.map((y) => (
                  <Pressable
                    key={y}
                    style={[styles.item, y === year && styles.itemSelected]}
                    onPress={() => setYear(y)}
                  >
                    <Text style={[styles.itemText, y === year && styles.itemTextSelected]}>{y}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Month */}
            <View style={styles.selectorCol}>
              <Text style={styles.selectorLabel}>月</Text>
              <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                {months.map((m) => (
                  <Pressable
                    key={m}
                    style={[styles.item, m === month && styles.itemSelected]}
                    onPress={() => setMonth(m)}
                  >
                    <Text style={[styles.itemText, m === month && styles.itemTextSelected]}>{MONTHS[m - 1]}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Day */}
            <View style={styles.selectorCol}>
              <Text style={styles.selectorLabel}>日</Text>
              <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                {days.map((d) => {
                  const disabled = isDisabled(year, month, d);
                  return (
                    <Pressable
                      key={d}
                      style={[styles.item, d === clampedDay && styles.itemSelected, disabled && styles.itemDisabled]}
                      onPress={() => !disabled && setDay(d)}
                    >
                      <Text style={[styles.itemText, d === clampedDay && styles.itemTextSelected, disabled && styles.itemTextDisabled]}>
                        {d}
                      </Text>
                    </Pressable>
                  );
                })}
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
    width: 320,
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
    fontSize: 20,
    fontWeight: "700",
    color: "#2563EB",
  },
  selectors: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 8,
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
    height: 180,
    width: "100%",
  },
  item: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    marginVertical: 1,
    alignItems: "center",
  },
  itemSelected: {
    backgroundColor: "#2563EB",
  },
  itemDisabled: {
    opacity: 0.3,
  },
  itemText: {
    fontSize: 15,
    color: "#374151",
  },
  itemTextSelected: {
    color: "#fff",
    fontWeight: "700",
  },
  itemTextDisabled: {
    color: "#94A3B8",
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
