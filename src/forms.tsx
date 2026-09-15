import React, { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Button, Chip, Field, Plate, s, C } from "./ui";
import { Dish, Ingredient, Stock, Unit, uid, validDate } from "./domain";
const units: Unit[] = ["g", "kg", "ml", "L", "个"];
export const tastes = [
  "家常",
  "清淡",
  "香辣",
  "浓郁",
  "素食",
  "高蛋白",
  "早餐",
];
export function DishForm({
  existing,
  wish,
  onSave,
}: {
  existing?: Dish;
  wish?: boolean;
  onSave: (d: Dish) => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [photo, setPhoto] = useState(existing?.photo);
  const [frame, setFrame] = useState(existing?.frame ?? "#EEE5CE");
  const [tags, setTags] = useState(existing?.tags ?? ["家常"]);
  const [minutes, setMinutes] = useState(String(existing?.minutes ?? 20));
  const [note, setNote] = useState(existing?.note ?? "");
  const [steps, setSteps] = useState(existing?.steps.join("\n") ?? "");
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    existing?.ingredients ?? [],
  );
  const [ingName, setIngName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<Unit>("g");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function pickPhoto() {
    setError("");
    setBusy(true);
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted)
        throw new Error("需要相册访问权限，请在系统设置中允许后再试。");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: Platform.OS === "web",
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (Platform.OS === "web") {
          if (!asset.base64) throw new Error("照片读取失败，请重试");
          setPhoto(
            `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`,
          );
        } else {
          const directory = `${FileSystem.documentDirectory}plates/`;
          await FileSystem.makeDirectoryAsync(directory, {
            intermediates: true,
          });
          const ext = asset.uri.split(".").pop()?.split("?")[0];
          const uri = `${directory}${uid()}.${ext && /^[a-z0-9]{2,5}$/i.test(ext) ? ext : "jpg"}`;
          await FileSystem.copyAsync({ from: asset.uri, to: uri });
          setPhoto(uri);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function addIngredient() {
    if (
      !ingName.trim() ||
      !Number.isFinite(Number(quantity)) ||
      Number(quantity) <= 0
    ) {
      setError("请填写食材名称和大于 0 的数量");
      return;
    }
    setIngredients([
      ...ingredients,
      { name: ingName.trim(), quantity: Number(quantity), unit },
    ]);
    setIngName("");
    setQuantity("");
    setError("");
  }
  function save() {
    if (!name.trim()) return setError("给这道菜取个名字吧");
    if (ingName.trim() || quantity)
      return setError("请先点击「加入食材」，或清空未添加的食材输入");
    if (!ingredients.length && !(existing?.wish ?? wish))
      return setError("请至少添加一种食材，才能计算采购与消耗");
    if (!(Number(minutes) > 0) || !Number.isFinite(Number(minutes)))
      return setError("烹饪时间必须大于 0");
    onSave({
      id: existing?.id ?? uid(),
      name: name.trim(),
      emoji: existing?.emoji ?? "🍲",
      photo,
      frame,
      color: existing?.color ?? "#E6EBD9",
      minutes: Number(minutes),
      tags,
      ingredients,
      steps: steps
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean),
      wish: existing?.wish ?? !!wish,
      note,
    });
  }
  return (
    <>
      <View style={{ alignItems: "center", gap: 16 }}>
        <Plate
          dish={{ photo, frame, color: "#E8ECDf", emoji: "🍲" }}
          size={160}
        />
        <Button
          title={busy ? "正在处理照片…" : "＋ 从相册制作餐盘"}
          secondary
          onPress={pickPhoto}
          disabled={busy}
        />
        <Text style={s.muted}>方形裁剪后居中显示为圆形餐盘</Text>
        <View style={s.wrap}>
          {["#EEE5CE", "#DCE5CD", "#EED7CA", "#D8E5EC"].map((c) => (
            <Pressable
              key={c}
              accessibilityLabel={`选择餐盘颜色 ${c}`}
              onPress={() => setFrame(c)}
              style={{
                backgroundColor: c,
                width: 32,
                height: 32,
                borderRadius: 16,
                borderWidth: frame === c ? 3 : 1,
                borderColor: frame === c ? C.green : C.line,
              }}
            />
          ))}
        </View>
      </View>
      <Field
        label="菜品名称"
        value={name}
        onChange={setName}
        placeholder="例如：妈妈的番茄炒蛋"
      />
      <Field
        label="烹饪时间（分钟）"
        value={minutes}
        onChange={setMinutes}
        numeric
      />
      <Text style={s.label}>口味标签</Text>
      <View style={s.wrap}>
        {tastes.map((t) => (
          <Chip
            key={t}
            label={t}
            active={tags.includes(t)}
            onPress={() =>
              setTags(
                tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t],
              )
            }
          />
        ))}
      </View>
      <Text style={s.h3}>
        {(existing?.wish ?? wish)
          ? "食材灵感（可稍后补充）"
          : "每 1 份需要的食材"}
      </Text>
      <Text style={s.muted}>
        按自己的一人份记录。盐、油等调料也可按需添加；采购只统计这里列出的食材。
      </Text>
      {ingredients.map((i, n) => (
        <View key={n} style={s.row}>
          <Text style={s.body}>
            {i.name} · {i.quantity}
            {i.unit}
          </Text>
          <Button
            title="移除"
            secondary
            small
            onPress={() =>
              setIngredients(ingredients.filter((_, idx) => idx !== n))
            }
          />
        </View>
      ))}
      <Field
        label="食材名称"
        value={ingName}
        onChange={setIngName}
        placeholder="与库存使用相同名称，例如番茄"
      />
      <Field label="数量" value={quantity} onChange={setQuantity} numeric />
      <View style={s.wrap}>
        {units.map((u) => (
          <Chip
            key={u}
            label={u}
            active={unit === u}
            onPress={() => setUnit(u)}
          />
        ))}
      </View>
      <Button title="＋ 加入食材" secondary onPress={addIngredient} />
      <Field
        label="做法（每行一个步骤）"
        value={steps}
        onChange={setSteps}
        multiline
        placeholder="写下让它好吃的小秘诀…"
      />
      <Field
        label="灵感 / 备注 / 来源链接"
        value={note}
        onChange={setNote}
        multiline
      />
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: C.red }}>
          {error}
        </Text>
      )}
      <Button
        title={existing ? "保存修改" : wish ? "收藏到想尝试" : "保存我的餐盘"}
        onPress={save}
        disabled={busy}
      />
    </>
  );
}
export function StockForm({
  existing,
  onSave,
}: {
  existing?: Stock;
  onSave: (i: Stock) => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [q, setQ] = useState(String(existing?.quantity ?? ""));
  const [unit, setUnit] = useState<Unit>(existing?.unit ?? "g");
  const [expires, setExpires] = useState(existing?.expires ?? "");
  const [error, setError] = useState("");
  return (
    <>
      <Field
        label="食材名称"
        value={name}
        onChange={setName}
        placeholder="例如：番茄"
      />
      <Field label="当前剩余数量" value={q} onChange={setQ} numeric />
      <View style={s.wrap}>
        {units.map((u) => (
          <Chip
            key={u}
            label={u}
            active={unit === u}
            onPress={() => setUnit(u)}
          />
        ))}
      </View>
      <Field
        label="保质期（可选，YYYY-MM-DD）"
        value={expires}
        onChange={setExpires}
        placeholder="2026-09-20"
      />
      <Text style={s.muted}>
        每次入库单独记录批次；用餐时优先扣减较早到期的批次。手动修改数量可记录额外消耗。
      </Text>
      {!!error && <Text style={{ color: C.red }}>{error}</Text>}
      <Button
        title="保存食材"
        onPress={() => {
          if (!name.trim() || !(Number(q) > 0) || !Number.isFinite(Number(q)))
            return setError("请填写名称和有效的正数数量");
          if (expires && !validDate(expires))
            return setError("请输入有效保质期");
          onSave({
            id: existing?.id ?? uid(),
            name: name.trim(),
            quantity: Number(q),
            unit,
            expires,
          });
        }}
      />
    </>
  );
}
