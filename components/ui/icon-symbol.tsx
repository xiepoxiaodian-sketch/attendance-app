// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  // Navigation
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "chevron.left": "chevron-left",
  "chevron.down": "expand-more",
  "chevron.up": "expand-less",

  // Attendance App Icons
  "clock.fill": "access-time-filled",
  "clock": "access-time",
  "calendar": "calendar-today",
  "calendar.badge.clock": "event",
  "person.fill": "person",
  "person.2.fill": "group",
  "person.badge.plus": "person-add",
  "person.crop.circle": "account-circle",
  "list.bullet": "list",
  "list.bullet.clipboard": "assignment",
  "checkmark.circle.fill": "check-circle",
  "xmark.circle.fill": "cancel",
  "gear": "settings",
  "gear.badge": "manage-accounts",
  "location.fill": "location-on",
  "location": "location-on",
  "bell.fill": "notifications",
  "bell": "notifications-none",
  "chart.bar.fill": "bar-chart",
  "doc.text.fill": "description",
  "pencil": "edit",
  "trash.fill": "delete",
  "plus.circle.fill": "add-circle",
  "plus": "add",
  "minus": "remove",
  "arrow.left": "arrow-back",
  "arrow.right": "arrow-forward",
  "arrow.clockwise": "refresh",
  "magnifyingglass": "search",
  "ellipsis": "more-horiz",
  "ellipsis.circle": "more-horiz",
  "exclamationmark.triangle.fill": "warning",
  "info.circle": "info",
  "checkmark": "check",
  "xmark": "close",
  "lock.fill": "lock",
  "lock.open.fill": "lock-open",
  "key.fill": "key",
  "iphone": "smartphone",
  "laptopcomputer": "laptop",
  "wifi": "wifi",
  "map.fill": "map",
  "building.2.fill": "business",
  "briefcase.fill": "work",
  "sun.max.fill": "wb-sunny",
  "moon.fill": "nightlight",
  "star.fill": "star",
  "heart.fill": "favorite",
  "hand.thumbsup.fill": "thumb-up",
  "square.and.arrow.up": "share",
  "arrow.down.to.line": "download",
  "arrow.up.from.line": "upload",
  "eye.fill": "visibility",
  "eye.slash.fill": "visibility-off",
  "faceid": "face",
  "touchid": "fingerprint",
  "alarm.fill": "alarm",
  "chart.line.uptrend.xyaxis": "trending-up",
  "clock.arrow.circlepath": "history",
  "clock.badge.checkmark.fill": "pending-actions",
  "clock.badge.fill": "more-time",
  "rectangle.portrait.and.arrow.right": "logout",
} as unknown as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
