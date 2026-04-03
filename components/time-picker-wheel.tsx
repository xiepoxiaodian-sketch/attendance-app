import { useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

interface TimePickerWheelProps {
  value: string; // "HH:MM"
  onChange: (value: string) => void;
  label?: string;
}

function WheelColumn({
  items,
  selectedIndex,
  onSelect,
}: {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const isScrolling = useRef(false);

  useEffect(() => {
    if (!isScrolling.current) {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
    }
  }, [selectedIndex]);

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      isScrolling.current = false;
      const y = e.nativeEvent.contentOffset.y;
      const index = Math.round(y / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(items.length - 1, index));
      onSelect(clamped);
      scrollRef.current?.scrollTo({ y: clamped * ITEM_HEIGHT, animated: true });
    },
    [items.length, onSelect]
  );

  return (
    <View style={styles.column}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onScrollBeginDrag={() => { isScrolling.current = true; }}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * 2 }}
        style={{ height: PICKER_HEIGHT }}
      >
        {items.map((item, i) => {
          const isSelected = i === selectedIndex;
          return (
            <View key={item} style={styles.item}>
              <Text style={[styles.itemText, isSelected && styles.selectedText]}>
                {item}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

export function TimePickerWheel({ value, onChange, label }: TimePickerWheelProps) {
  const [hStr, mStr] = value.split(":");
  const hourIndex = HOURS.indexOf(hStr ?? "09");
  const minuteIndex = MINUTES.findIndex((m) => parseInt(m) >= parseInt(mStr ?? "00"));
  const safeHourIdx = hourIndex >= 0 ? hourIndex : 9;
  const safeMinIdx = minuteIndex >= 0 ? minuteIndex : 0;

  const handleHourChange = (index: number) => {
    const newHour = HOURS[index];
    const currentMin = MINUTES[safeMinIdx];
    onChange(`${newHour}:${currentMin}`);
  };

  const handleMinuteChange = (index: number) => {
    const currentHour = HOURS[safeHourIdx];
    const newMin = MINUTES[index];
    onChange(`${currentHour}:${newMin}`);
  };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.pickerWrapper}>
        {/* Selection highlight */}
        <View style={styles.selectionBar} pointerEvents="none" />

        <WheelColumn items={HOURS} selectedIndex={safeHourIdx} onSelect={handleHourChange} />
        <Text style={styles.colon}>:</Text>
        <WheelColumn items={MINUTES} selectedIndex={safeMinIdx} onSelect={handleMinuteChange} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  label: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 8,
    fontWeight: "600",
  },
  pickerWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    paddingHorizontal: 8,
  },
  selectionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    top: ITEM_HEIGHT * 2,
    height: ITEM_HEIGHT,
    backgroundColor: "#EFF6FF",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#BFDBFE",
    zIndex: 0,
  },
  column: {
    width: 52,
    overflow: "hidden",
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  itemText: {
    fontSize: 22,
    color: "#94A3B8",
    fontWeight: "400",
  },
  selectedText: {
    fontSize: 26,
    color: "#1E40AF",
    fontWeight: "700",
  },
  colon: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1E40AF",
    marginHorizontal: 4,
    marginBottom: 2,
  },
});
