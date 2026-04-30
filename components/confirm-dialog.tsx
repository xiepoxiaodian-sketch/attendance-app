import { Modal, View, Text, TouchableOpacity, Platform } from "react-native";

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmStyle?: "default" | "destructive";
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = "確定",
  cancelText = "取消",
  confirmStyle = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}>
        <View style={{
          backgroundColor: "white",
          borderRadius: 16,
          padding: 24,
          width: "100%",
          maxWidth: 340,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.15,
          shadowRadius: 24,
          elevation: 10,
        }}>
          <Text style={{ fontSize: 17, fontWeight: "700", color: "#1E293B", marginBottom: 8 }}>
            {title}
          </Text>
          <Text style={{ fontSize: 14, color: "#64748B", lineHeight: 20, marginBottom: 24 }}>
            {message}
          </Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={onCancel}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#E2E8F0",
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: "#64748B" }}>{cancelText}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: confirmStyle === "destructive" ? "#EF4444" : "#2563EB",
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: "white" }}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

type AlertDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  buttonText?: string;
  onClose: () => void;
};

export function AlertDialog({
  visible,
  title,
  message,
  buttonText = "確定",
  onClose,
}: AlertDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}>
        <View style={{
          backgroundColor: "white",
          borderRadius: 16,
          padding: 24,
          width: "100%",
          maxWidth: 340,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.15,
          shadowRadius: 24,
          elevation: 10,
        }}>
          <Text style={{ fontSize: 17, fontWeight: "700", color: "#1E293B", marginBottom: 8 }}>
            {title}
          </Text>
          <Text style={{ fontSize: 14, color: "#64748B", lineHeight: 20, marginBottom: 24 }}>
            {message}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            style={{
              paddingVertical: 12,
              borderRadius: 10,
              backgroundColor: "#2563EB",
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "600", color: "white" }}>{buttonText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
