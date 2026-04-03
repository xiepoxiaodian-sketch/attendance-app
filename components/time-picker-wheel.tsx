import { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
  TouchableOpacity,
  Modal,
} from "react-native";

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

interface TimePickerWheelProps {
  value: string; // "HH:MM"
  onChange: (value: string) => void;
  label?: string;
}

// ─── Web version: dropdown selects ──────────────────────────────────────────
function TimePickerWeb({ value, onChange, label }: TimePickerWheelProps) {
  const [hStr, mStr] = value.split(":");
  const safeHour = HOURS.includes(hStr) ? hStr : "09";
  const safeMin = MINUTES.includes(mStr) ? mStr : MINUTES.find(m => parseInt(m) >= parseInt(mStr ?? "0")) ?? "00";

  const handleHourChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(`${e.target.value}:${safeMin}`);
  };
  const handleMinChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(`${safeHour}:${e.target.value}`);
  };

  return (
    <View style={webStyles.container}>
      {label && <Text style={webStyles.label}>{label}</Text>}
      <View style={webStyles.pickerWrapper}>
        {/* @ts-ignore - web-only select element */}
        <select
          value={safeHour}
          onChange={handleHourChange}
          style={{
            fontSize: 22,
            fontWeight: "700",
            color: "#1E40AF",
            backgroundColor: "#F8FAFC",
            border: "none",
            outline: "none",
            padding: "8px 4px",
            cursor: "pointer",
            appearance: "none",
            WebkitAppearance: "none",
            textAlign: "center",
            width: 52,
          }}
        >
          {HOURS.map(h => (
            // @ts-ignore
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
        <Text style={webStyles.colon}>:</Text>
        {/* @ts-ignore - web-only select element */}
        <select
          value={safeMin}
          onChange={handleMinChange}
          style={{
            fontSize: 22,
            fontWeight: "700",
            color: "#1E40AF",
            backgroundColor: "#F8FAFC",
            border: "none",
            outline: "none",
            padding: "8px 4px",
            cursor: "pointer",
            appearance: "none",
            WebkitAppearance: "none",
            textAlign: "center",
            width: 52,
          }}
        >
          {MINUTES.map(m => (
            // @ts-ignore
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </View>
    </View>
  );
}

const webStyles = StyleSheet.create({
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
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  colon: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1E40AF",
    marginHorizontal: 4,
  },
});

// ─── Native version: scroll wheel ───────────────────────────────────────────
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
  const pendingIndex = useRef(selectedIndex);

  useEffect(() => {
    if (!isScrolling.current) {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
    }
  }, [selectedIndex]);

  const snapToIndex = useCallback(
    (y: number) => {
      const index = Math.round(y / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(items.length - 1, index));
      pendingIndex.current = clamped;
      scrollRef.current?.scrollTo({ y: clamped * ITEM_HEIGHT, animated: true });
      onSelect(clamped);
    },
    [items.length, onSelect]
  );

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      isScrolling.current = false;
      snapToIndex(e.nativeEvent.contentOffset.y);
    },
    [snapToIndex]
  );

  return (
    <View style={nativeStyles.column}>
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
            <TouchableOpacity
              key={item}
              style={nativeStyles.item}
              onPress={() => {
                onSelect(i);
                scrollRef.current?.scrollTo({ y: i * ITEM_HEIGHT, animated: true });
              }}
              activeOpacity={0.7}
            >
              <Text style={[nativeStyles.itemText, isSelected && nativeStyles.selectedText]}>
                {item}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function TimePickerNative({ value, onChange, label }: TimePickerWheelProps) {
  const [hStr, mStr] = value.split(":");
  const hourIndex = HOURS.indexOf(hStr ?? "09");
  const minuteIndex = MINUTES.findIndex((m) => parseInt(m) >= parseInt(mStr ?? "00"));
  const safeHourIdx = hourIndex >= 0 ? hourIndex : 9;
  const safeMinIdx = minuteIndex >= 0 ? minuteIndex : 0;

  const handleHourChange = (index: number) => {
    onChange(`${HOURS[index]}:${MINUTES[safeMinIdx]}`);
  };

  const handleMinuteChange = (index: number) => {
    onChange(`${HOURS[safeHourIdx]}:${MINUTES[index]}`);
  };

  return (
    <View style={nativeStyles.container}>
      {label && <Text style={nativeStyles.label}>{label}</Text>}
      <View style={nativeStyles.pickerWrapper}>
        <View style={nativeStyles.selectionBar} pointerEvents="none" />
        <WheelColumn items={HOURS} selectedIndex={safeHourIdx} onSelect={handleHourChange} />
        <Text style={nativeStyles.colon}>:</Text>
        <WheelColumn items={MINUTES} selectedIndex={safeMinIdx} onSelect={handleMinuteChange} />
      </View>
    </View>
  );
}

const nativeStyles = StyleSheet.create({
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

// ─── Export: platform-aware ──────────────────────────────────────────────────
export function TimePickerWheel(props: TimePickerWheelProps) {
  if (Platform.OS === "web") {
    return <TimePickerWeb {...props} />;
  }
  return <TimePickerNative {...props} />;
}
