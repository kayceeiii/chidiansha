import React from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Dish } from "./domain";
export const C = {
  bg: "#F8F7F2",
  paper: "#FFFFFF",
  ink: "#293C2C",
  muted: "#7D8579",
  green: "#536C45",
  pale: "#EDF0E5",
  line: "#E7E8DE",
  orange: "#D7824F",
  red: "#AC5346",
};
export function Button({
  title,
  onPress,
  secondary,
  disabled,
  small,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        small && { paddingVertical: 10, paddingHorizontal: 14 },
        { opacity: disabled ? 0.4 : pressed ? 0.72 : 1 },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: C.green }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={[
        s.chip,
        active && { backgroundColor: C.green, borderColor: C.green },
      ]}
    >
      <Text style={[s.chipText, active && { color: "white" }]}>{label}</Text>
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  numeric,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  multiline?: boolean;
  numeric?: boolean;
}) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#969C90"
        keyboardType={numeric ? "decimal-pad" : "default"}
        multiline={multiline}
        autoCapitalize="none"
        style={[
          s.input,
          multiline && { minHeight: 88, textAlignVertical: "top" },
        ]}
      />
    </View>
  );
}
export function Plate({
  dish,
  size = 116,
}: {
  dish: Pick<Dish, "photo" | "color" | "frame" | "emoji">;
  size?: number;
}) {
  return (
    <View
      style={[
        s.plate,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: dish.frame,
          padding: size * 0.075,
        },
      ]}
    >
      <View
        style={{
          flex: 1,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: "#FFFFFFCC",
          padding: size * 0.045,
          width: "100%",
        }}
      >
        <View
          style={{
            flex: 1,
            borderRadius: size / 2,
            backgroundColor: dish.color,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {dish.photo ? (
            <Image
              source={{ uri: dish.photo }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
          ) : (
            <Text style={{ fontSize: size * 0.4 }}>{dish.emoji}</Text>
          )}
        </View>
      </View>
    </View>
  );
}
export function Sheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={s.overlay}
      >
        <View style={s.sheet}>
          <View style={s.row}>
            <Text style={s.h2}>{title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭"
              onPress={onClose}
              hitSlop={15}
            >
              <Text style={{ fontSize: 26, color: C.muted }}>×</Text>
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 18, paddingBottom: 34 }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={[s.card, { alignItems: "center", paddingVertical: 32 }]}>
      <Text style={{ fontSize: 32 }}>🌱</Text>
      <Text style={s.h3}>{title}</Text>
      <Text style={[s.muted, { textAlign: "center" }]}>{detail}</Text>
    </View>
  );
}
export const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  page: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 32, gap: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  h1: { fontSize: 32, fontWeight: "800", color: C.ink, letterSpacing: -0.7 },
  h2: { fontSize: 21, fontWeight: "700", color: C.ink },
  h3: { fontSize: 16, fontWeight: "700", color: C.ink },
  muted: { fontSize: 13, lineHeight: 21, color: C.muted },
  body: { fontSize: 15, lineHeight: 24, color: C.ink },
  eyebrow: {
    fontSize: 11,
    color: C.green,
    letterSpacing: 2,
    fontWeight: "700",
  },
  card: {
    backgroundColor: C.paper,
    borderRadius: 22,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: C.line,
  },
  button: {
    backgroundColor: C.green,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: { backgroundColor: C.pale },
  buttonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  chip: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 30,
  },
  chipText: { color: C.muted, fontSize: 13 },
  label: { color: C.ink, fontSize: 13, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 13,
    backgroundColor: "#FAFBF7",
    color: C.ink,
    padding: 13,
    fontSize: 15,
  },
  plate: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    boxShadow: "0px 8px 18px rgba(57, 67, 42, 0.12)",
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#13201966",
  },
  sheet: {
    maxHeight: "92%",
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    padding: 24,
    gap: 22,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: C.bg,
  },
});
