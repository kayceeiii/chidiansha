import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { C, Button, Chip, Empty, Field, Plate, Sheet, s } from "./src/ui";
import { DishForm, StockForm, tastes } from "./src/forms";
import {
  Dish,
  State,
  Stock,
  key,
  localDate,
  purchase,
  recommendations,
  recordMeal,
  shopping,
  today,
  validDate,
} from "./src/domain";
import { initialState } from "./src/seed";
import { Together } from "./src/together";

type Tab = "today" | "menu" | "shop" | "pantry" | "friends";
type ModalState =
  | { type: "dish"; dish?: Dish; wish?: boolean }
  | { type: "detail"; dish: Dish }
  | { type: "stock"; stock?: Stock }
  | { type: "meal" }
  | { type: "taste" }
  | null;
const STORE_KEY = "chidiansha:state:v1";
const tabs: { id: Tab; title: string; icon: keyof typeof Ionicons.glyphMap }[] =
  [
    { id: "today", title: "今日", icon: "sunny-outline" },
    { id: "menu", title: "我的餐盘", icon: "restaurant-outline" },
    { id: "shop", title: "采购", icon: "bag-handle-outline" },
    { id: "pantry", title: "食材库", icon: "cube-outline" },
    { id: "friends", title: "一起吃", icon: "people-outline" },
  ];

export default function App() {
  return (
    <SafeAreaProvider>
      <Kitchen />
    </SafeAreaProvider>
  );
}
function Kitchen() {
  const [data, setData] = useState<State>(initialState);
  const current = useRef(data);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [tab, setTab] = useState<Tab>("today");
  const [modal, setModal] = useState<ModalState>(null);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [wishlist, setWishlist] = useState(false);
  const [matchInput, setMatchInput] = useState("");
  const [showMatch, setShowMatch] = useState(false);
  const [date, setDate] = useState(today());
  const [showPurchases, setShowPurchases] = useState(false);
  const [stockFilter, setStockFilter] = useState("全部");
  const [slot, setSlot] = useState("午餐");
  const [deduct, setDeduct] = useState(true);
  const [mealError, setMealError] = useState("");
  const [purchaseExpiry, setPurchaseExpiry] = useState("");
  const [mealDate, setMealDate] = useState(date);
  useEffect(() => {
    if (modal?.type === "meal") setMealDate(date);
  }, [modal?.type]);
  async function load() {
    try {
      const raw = await AsyncStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed.version !== 1 ||
          !Array.isArray(parsed.dishes) ||
          !Array.isArray(parsed.stock) ||
          !Array.isArray(parsed.meals) ||
          !Array.isArray(parsed.picks) ||
          !Array.isArray(parsed.purchases) ||
          !Array.isArray(parsed.tastes) ||
          typeof parsed.avoid !== "string"
        )
          throw new Error("本地数据格式无法识别");
        current.current = parsed;
        setData(parsed);
      }
      setLoadError("");
      setReady(true);
    } catch (e) {
      setLoadError(`数据读取失败，原数据已保留。${(e as Error).message}`);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function persist(next: State) {
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(STORE_KEY, JSON.stringify(next)))
      .then(() => setSaveError(""))
      .catch(() => setSaveError("本次修改尚未保存到设备，请重试后再退出。"));
  }
  useEffect(() => {
    if (ready) persist(data);
  }, [data, ready]);
  function change(fn: (state: State) => State) {
    try {
      const next = fn(current.current);
      current.current = next;
      setData(next);
      return true;
    } catch (e) {
      setNotice((e as Error).message);
      return false;
    }
  }
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 4800);
    return () => clearTimeout(id);
  }, [notice]);
  function select(dish: Dish) {
    change((st) => ({
      ...st,
      picks: st.picks.some((p) => p.dishId === dish.id)
        ? st.picks.filter((p) => p.dishId !== dish.id)
        : [...st.picks, { dishId: dish.id, servings: 1 }],
    }));
  }
  function shiftDate(days: number) {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + days);
    setDate(localDate(d));
  }
  const dishes = data.dishes.filter(
    (d) =>
      d.wish === wishlist &&
      d.name.includes(query) &&
      (category === "全部" || d.tags.includes(category)),
  );
  const recommended = recommendations(data);
  const supplyMatches = recommendations(
    data,
    matchInput.split(/[,，、\s]+/).filter(Boolean),
  );
  const list = shopping(data);
  const missing = list.filter((i) => i.quantity > 0);
  const near = data.stock.filter(
    (i) =>
      i.expires && i.expires <= localDate(new Date(Date.now() + 3 * 86400000)),
  );
  const log = data.meals.filter((m) => m.date === date);
  const selectedCount = data.picks.length;
  const todayLabel = new Date(`${date}T12:00:00`).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  function dishCard(dish: Dish, reason?: string) {
    const selected = data.picks.some((p) => p.dishId === dish.id);
    return (
      <View
        key={dish.id}
        style={[styles.dishCard, selected && { borderColor: C.green }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`查看${dish.name}`}
          onPress={() => setModal({ type: "detail", dish })}
          style={{ alignItems: "center", gap: 14, width: "100%" }}
        >
          <Plate dish={dish} />
          <Text style={[s.h3, { textAlign: "center" }]}>{dish.name}</Text>
        </Pressable>
        <Text style={[s.muted, { fontSize: 11, textAlign: "center" }]}>
          {reason ??
            `${dish.minutes} 分钟 · ${dish.tags.slice(0, 2).join(" / ")}`}
        </Text>
        {!dish.wish ? (
          <Button
            title={selected ? "✓ 已选入菜单" : "＋ 今天吃它"}
            small
            secondary={!selected}
            onPress={() => select(dish)}
          />
        ) : (
          <Button
            title="看看怎么做"
            small
            secondary
            onPress={() => setModal({ type: "detail", dish })}
          />
        )}
      </View>
    );
  }
  function head(
    eyebrow: string,
    title: string,
    subtitle: string,
    action?: React.ReactNode,
  ) {
    return (
      <View style={{ gap: 10 }}>
        <Text style={s.eyebrow}>{eyebrow}</Text>
        <View style={s.row}>
          <Text style={s.h1}>{title}</Text>
          {action}
        </View>
        <Text style={s.muted}>{subtitle}</Text>
      </View>
    );
  }
  if (!ready)
    return (
      <SafeAreaView
        style={[s.root, { justifyContent: "center", padding: 30, gap: 18 }]}
      >
        {loadError ? (
          <>
            <Text style={s.body}>{loadError}</Text>
            <Button title="重新读取" onPress={() => void load()} />
          </>
        ) : (
          <ActivityIndicator color={C.green} size="large" />
        )}
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />
      <View style={styles.app}>
        <View style={styles.brand}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
            <View style={styles.brandIcon}>
              <Ionicons name="leaf" size={18} color="white" />
            </View>
            <Text style={styles.brandName}>
              吃点啥
              <Text style={{ color: C.muted, fontSize: 12, fontWeight: "400" }}>
                {" "}
                / 好好吃饭，好好生活
              </Text>
            </Text>
          </View>
          <Pressable
            onPress={() => setModal({ type: "taste" })}
            accessibilityRole="button"
            accessibilityLabel="我的口味偏好"
          >
            <View style={styles.avatar}>
              <Text style={{ color: C.green, fontWeight: "700" }}>我</Text>
            </View>
          </Pressable>
        </View>
        {!!saveError && (
          <View style={{ padding: 12, backgroundColor: "#F9E8DE" }}>
            <Text style={{ color: C.red }}>{saveError}</Text>
            <Button
              title="重试保存"
              small
              onPress={() => persist(current.current)}
            />
          </View>
        )}
        <ScrollView
          key={tab}
          contentContainerStyle={s.page}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {tab === "today" && (
            <>
              {head(
                "YOUR EVERYDAY TABLE",
                "今天，吃点好的。",
                "把每一顿日常，都过成喜欢的模样。",
              )}
              <View style={styles.hero}>
                <View style={{ flex: 1, gap: 12 }}>
                  <Text style={[s.eyebrow, { color: "#DCE5CA" }]}>
                    为你的口味而选
                  </Text>
                  <Text
                    style={{
                      fontSize: 23,
                      lineHeight: 32,
                      color: "white",
                      fontWeight: "700",
                    }}
                  >
                    {recommended[0]?.dish.name ?? "你的第一道拿手菜"}
                  </Text>
                  <Text
                    style={{ fontSize: 12, color: "#E1E7D7", lineHeight: 20 }}
                  >
                    {recommended[0]?.reason ?? "从一张照片开始，留住家的味道"}
                  </Text>
                  <Pressable
                    onPress={() =>
                      recommended[0]
                        ? setModal({
                            type: "detail",
                            dish: recommended[0].dish,
                          })
                        : setModal({ type: "dish" })
                    }
                    style={styles.heroButton}
                  >
                    <Text
                      style={{
                        color: C.green,
                        fontWeight: "700",
                        fontSize: 12,
                      }}
                    >
                      去看看 ↗
                    </Text>
                  </Pressable>
                </View>
                {recommended[0] && (
                  <Plate dish={recommended[0].dish} size={138} />
                )}
              </View>
              <View style={s.row}>
                <Text style={s.h2}>我的三餐</Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Pressable
                    accessibilityLabel="前一天"
                    onPress={() => shiftDate(-1)}
                    hitSlop={10}
                  >
                    <Ionicons name="chevron-back" size={18} color={C.muted} />
                  </Pressable>
                  <Text style={s.muted}>
                    {date === today() ? "今天" : date.slice(5)}
                  </Text>
                  <Pressable
                    accessibilityLabel="后一天"
                    onPress={() => shiftDate(1)}
                    hitSlop={10}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={C.muted}
                    />
                  </Pressable>
                </View>
              </View>
              <Text style={[s.muted, { marginTop: -16 }]}>
                {todayLabel} · 已记录 {log.length}/3 餐
              </Text>
              <View style={{ gap: 10 }}>
                {["早餐", "午餐", "晚餐"].map((name, index) => {
                  const meal = log.find((m) => m.slot === name);
                  return (
                    <Pressable
                      key={name}
                      onPress={() => {
                        if (meal) return;
                        setSlot(name);
                        setMealError("");
                        setModal({ type: "meal" });
                      }}
                      style={[s.card, s.row, { borderRadius: 17, padding: 16 }]}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 13,
                          alignItems: "center",
                          flex: 1,
                        }}
                      >
                        <View
                          style={[
                            styles.mealIcon,
                            {
                              backgroundColor: [
                                "#F9EFDD",
                                "#EBF0E1",
                                "#ECEAF3",
                              ][index],
                            },
                          ]}
                        >
                          <Ionicons
                            name={
                              (
                                [
                                  "partly-sunny-outline",
                                  "sunny-outline",
                                  "moon-outline",
                                ] as const
                              )[index]
                            }
                            color={C.green}
                            size={23}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.h3}>{name}</Text>
                          <Text style={s.muted}>
                            {meal
                              ? meal.names.join("、")
                              : "还没记录，给这一餐留个位置"}
                          </Text>
                          {meal && (
                            <Text style={{ color: C.green, fontSize: 11 }}>
                              {meal.deducted ? "已扣减食材库存" : "仅记录用餐"}
                            </Text>
                          )}
                        </View>
                      </View>
                      <Ionicons
                        name={meal ? "checkmark-circle" : "add-circle-outline"}
                        size={23}
                        color={meal ? C.green : "#A8AF9F"}
                      />
                    </Pressable>
                  );
                })}
              </View>
              <View style={s.row}>
                <Text style={s.h2}>今天的灵感</Text>
                <Pressable
                  onPress={() => {
                    setTab("menu");
                    setWishlist(false);
                  }}
                >
                  <Text style={{ color: C.green, fontSize: 13 }}>
                    全部餐盘 ↗
                  </Text>
                </Pressable>
              </View>
              <View style={styles.grid}>
                {recommended.slice(0, 2).map((r) => dishCard(r.dish, r.reason))}
              </View>
              <Pressable
                onPress={() => {
                  setTab("pantry");
                  setStockFilter("临期 / 过期");
                }}
                style={[s.card, { backgroundColor: "#EFEFDF", borderWidth: 0 }]}
              >
                <View style={s.row}>
                  <Text style={s.h3}>🌿 把新鲜留在餐桌上</Text>
                  <Ionicons name="arrow-forward" size={19} color={C.green} />
                </View>
                <Text style={s.muted}>
                  {near.length
                    ? `${near.length} 批食材临期或已过期，去看看怎么安排。`
                    : "冰箱状态不错，继续按需采购，减少浪费。"}
                </Text>
              </Pressable>
              <Text style={[s.muted, { fontSize: 11, textAlign: "center" }]}>
                首版内置示例餐盘与 3 批示例食材，可自行编辑。
              </Text>
            </>
          )}
          {tab === "menu" && (
            <>
              {head(
                "A LITTLE TASTE OF YOU",
                "我的私人餐盘",
                "收藏家的味道，也给新灵感留一个位置。",
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="创建餐盘"
                  onPress={() => setModal({ type: "dish", wish: wishlist })}
                  style={styles.plus}
                >
                  <Ionicons name="add" size={24} color="white" />
                </Pressable>,
              )}
              <View style={styles.segment}>
                <Pressable
                  style={[
                    styles.segmentItem,
                    !wishlist && styles.segmentActive,
                  ]}
                  onPress={() => setWishlist(false)}
                >
                  <Text style={!wishlist ? s.h3 : s.muted}>
                    我的菜单 · {data.dishes.filter((d) => !d.wish).length}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.segmentItem, wishlist && styles.segmentActive]}
                  onPress={() => setWishlist(true)}
                >
                  <Text style={wishlist ? s.h3 : s.muted}>
                    想尝试 · {data.dishes.filter((d) => d.wish).length}
                  </Text>
                </Pressable>
              </View>
              <View style={styles.search}>
                <Ionicons name="search-outline" size={19} color={C.muted} />
                <TextInput
                  accessibilityLabel="搜索菜品"
                  style={{ flex: 1, color: C.ink, paddingVertical: 12 }}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="寻找一道想吃的菜…"
                  placeholderTextColor={C.muted}
                />
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {["全部", ...tastes].map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    active={category === t}
                    onPress={() => setCategory(t)}
                  />
                ))}
              </ScrollView>
              {!wishlist && (
                <View style={[s.card, { backgroundColor: "#EFF1E6" }]}>
                  <Pressable
                    style={s.row}
                    onPress={() => setShowMatch(!showMatch)}
                  >
                    <Text style={s.h3}>🥬 手边食材，可以做什么？</Text>
                    <Ionicons
                      name={showMatch ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={C.green}
                    />
                  </Pressable>
                  {showMatch && (
                    <>
                      <Field
                        label="输入食材，用逗号分隔"
                        value={matchInput}
                        onChange={setMatchInput}
                        placeholder="番茄，鸡蛋，西兰花"
                      />
                      <Text style={s.muted}>
                        从已有菜谱中按食材匹配推荐，也会避开你的忌口。
                      </Text>
                      {matchInput.trim() &&
                        (supplyMatches.length ? (
                          supplyMatches.slice(0, 4).map((r) => (
                            <Pressable
                              key={r.dish.id}
                              onPress={() =>
                                setModal({ type: "detail", dish: r.dish })
                              }
                            >
                              <Text style={s.body}>{r.dish.name} ↗</Text>
                              <Text style={s.muted}>{r.reason}</Text>
                            </Pressable>
                          ))
                        ) : (
                          <Text style={s.muted}>
                            还没有匹配菜谱，试试其他食材或创建新餐盘。
                          </Text>
                        ))}
                    </>
                  )}
                </View>
              )}
              <View style={styles.grid}>{dishes.map((d) => dishCard(d))}</View>
              {!dishes.length && (
                <Empty
                  title="给这里添一道菜吧"
                  detail="上传照片，记录用料，做成你的专属餐盘。"
                />
              )}
            </>
          )}
          {tab === "shop" && (
            <>
              {head(
                "FROM PLATE TO PANTRY",
                "这一餐，准备好了",
                "按餐盘份数汇总，已有的食材就不用重复买。",
              )}
              <View style={s.row}>
                <Text style={s.h2}>已选餐盘 · {selectedCount}</Text>
                <Button
                  title="去选菜"
                  small
                  secondary
                  onPress={() => {
                    setTab("menu");
                    setWishlist(false);
                  }}
                />
              </View>
              {!selectedCount && (
                <Empty
                  title="今天想吃什么？"
                  detail="先在「我的餐盘」点选菜品，采购清单会自动生成。"
                />
              )}
              {data.picks.map((p) => {
                const dish = data.dishes.find((d) => d.id === p.dishId)!;
                return (
                  <View key={p.dishId} style={[s.card, s.row]}>
                    <Plate dish={dish} size={66} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.h3}>{dish.name}</Text>
                      <Text style={s.muted}>按 {p.servings} 份计算</Text>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <Pressable
                        accessibilityLabel={`减少${dish.name}份数`}
                        hitSlop={8}
                        onPress={() =>
                          change((st) => ({
                            ...st,
                            picks: st.picks.flatMap((x) =>
                              x.dishId !== p.dishId
                                ? [x]
                                : x.servings > 1
                                  ? [{ ...x, servings: x.servings - 1 }]
                                  : [],
                            ),
                          }))
                        }
                      >
                        <Ionicons
                          name="remove-circle-outline"
                          size={25}
                          color={C.green}
                        />
                      </Pressable>
                      <Text style={s.h3}>{p.servings}</Text>
                      <Pressable
                        accessibilityLabel={`增加${dish.name}份数`}
                        hitSlop={8}
                        onPress={() =>
                          change((st) => ({
                            ...st,
                            picks: st.picks.map((x) =>
                              x.dishId === p.dishId
                                ? {
                                    ...x,
                                    servings: Math.min(99, x.servings + 1),
                                  }
                                : x,
                            ),
                          }))
                        }
                      >
                        <Ionicons
                          name="add-circle-outline"
                          size={25}
                          color={C.green}
                        />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
              {!!selectedCount && (
                <>
                  <View style={s.row}>
                    <Text style={s.h2}>还需要买 · {missing.length} 种</Text>
                    <Pressable
                      onPress={async () => {
                        try {
                          await Share.share({
                            message: `吃点啥 · 采购清单\n${missing.map((i) => `${i.name} ${i.quantity}${i.unit}`).join("\n") || "所需食材已齐全"}`,
                          });
                        } catch {
                          setNotice("暂时无法分享，请稍后重试");
                        }
                      }}
                    >
                      <Text style={{ color: C.green }}>分享清单 ↗</Text>
                    </Pressable>
                  </View>
                  <Field
                    label="本次入库保质期（可选）"
                    value={purchaseExpiry}
                    onChange={setPurchaseExpiry}
                    placeholder="YYYY-MM-DD，可入库后逐项修改"
                  />
                  <View style={s.card}>
                    {list.map((i) => (
                      <View style={[s.row, styles.listLine]} key={key(i)}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.h3}>
                            {i.name}{" "}
                            <Text style={{ color: C.orange, fontSize: 14 }}>
                              {i.quantity > 0
                                ? `${i.quantity}${i.unit}`
                                : "已备齐"}
                            </Text>
                          </Text>
                          <Text style={s.muted}>
                            需要 {i.needed}
                            {i.unit} · 库存 {i.have}
                            {i.unit}
                          </Text>
                        </View>
                        {i.quantity > 0 ? (
                          <Button
                            title="买好了"
                            small
                            secondary
                            onPress={() => {
                              if (purchaseExpiry && !validDate(purchaseExpiry))
                                return setNotice("请填写有效保质期");
                              change((st) => {
                                const live = shopping(st).find(
                                  (x) => key(x) === key(i),
                                );
                                return live && live.quantity > 0
                                  ? purchase(
                                      st,
                                      {
                                        name: live.name,
                                        unit: live.unit,
                                        quantity: live.quantity,
                                      },
                                      purchaseExpiry,
                                    )
                                  : st;
                              });
                            }}
                          />
                        ) : (
                          <Ionicons
                            name="checkmark-circle"
                            color={C.green}
                            size={24}
                          />
                        )}
                      </View>
                    ))}
                  </View>
                  <Text style={s.muted}>
                    「买好了」会将缺少的数量入库，并实时重算清单；超额购买可在食材库补录。
                  </Text>
                  <Button
                    title="吃好了，记录这一餐"
                    onPress={() => {
                      setMealError("");
                      setModal({ type: "meal" });
                    }}
                  />
                </>
              )}
              <Pressable
                style={s.row}
                onPress={() => setShowPurchases(!showPurchases)}
              >
                <Text style={s.h2}>采购足迹 · {data.purchases.length}</Text>
                <Ionicons
                  name={showPurchases ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={C.green}
                />
              </Pressable>
              {showPurchases &&
                (data.purchases.length ? (
                  data.purchases.slice(0, 30).map((p) => (
                    <View key={p.id} style={s.row}>
                      <Text style={s.body}>
                        {p.name} · {p.quantity}
                        {p.unit}
                      </Text>
                      <Text style={s.muted}>
                        {new Date(p.at).toLocaleDateString("zh-CN")}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={s.muted}>确认采购后，记录会出现在这里。</Text>
                ))}
            </>
          )}
          {tab === "pantry" && (
            <>
              {head(
                "FRESH THINGS, LESS WASTE",
                "我的小小食材库",
                "知道家里有什么，下一餐就有了方向。",
                <Pressable
                  accessibilityLabel="添加库存"
                  onPress={() => setModal({ type: "stock" })}
                  style={styles.plus}
                >
                  <Ionicons name="add" color="white" size={24} />
                </Pressable>,
              )}
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={[s.card, { flex: 1, backgroundColor: C.pale }]}>
                  <Text style={s.muted}>在库批次</Text>
                  <Text style={s.h1}>
                    {data.stock.length}
                    <Text style={s.muted}> 批</Text>
                  </Text>
                </View>
                <View style={[s.card, { flex: 1, backgroundColor: "#F6ECDE" }]}>
                  <Text style={s.muted}>需要关注</Text>
                  <Text style={[s.h1, { color: C.orange }]}>
                    {near.length}
                    <Text style={s.muted}> 批</Text>
                  </Text>
                </View>
              </View>
              <View style={s.wrap}>
                {["全部", "临期 / 过期"].map((f) => (
                  <Chip
                    key={f}
                    label={f}
                    active={stockFilter === f}
                    onPress={() => setStockFilter(f)}
                  />
                ))}
              </View>
              {(stockFilter === "全部" ? data.stock : near).map((i) => {
                const expired = !!i.expires && i.expires < today();
                const urgent = !!i.expires && near.some((n) => n.id === i.id);
                return (
                  <Pressable
                    key={i.id}
                    onPress={() => setModal({ type: "stock", stock: i })}
                    style={[s.card, s.row]}
                  >
                    <View
                      style={[
                        styles.mealIcon,
                        { backgroundColor: urgent ? "#F9EBDC" : C.pale },
                      ]}
                    >
                      <Ionicons
                        name="nutrition-outline"
                        size={25}
                        color={urgent ? C.orange : C.green}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.h3}>{i.name}</Text>
                      <Text
                        style={[
                          s.muted,
                          urgent && { color: expired ? C.red : C.orange },
                        ]}
                      >
                        {i.expires
                          ? `${expired ? "已过期 · 不计入可用库存" : urgent ? "建议尽快安排" : "保质期"} ${i.expires}`
                          : "未设置保质期"}
                      </Text>
                    </View>
                    <Text style={s.h3}>
                      {i.quantity}
                      <Text style={s.muted}> {i.unit}</Text>
                    </Text>
                  </Pressable>
                );
              })}
              {!(stockFilter === "全部" ? data.stock : near).length && (
                <Empty
                  title={
                    stockFilter === "全部"
                      ? "冰箱里有些什么？"
                      : "没有需要关注的食材"
                  }
                  detail="点击右上角添加食材，或从采购清单确认入库。"
                />
              )}
              <Text style={s.muted}>
                点击食材可修改数量、保质期，或移除耗尽的批次。过期批次不参与采购抵扣和用餐消耗。
              </Text>
              <View style={s.row}>
                <Text style={s.h2}>用现有食材做一餐</Text>
                <Pressable onPress={() => setModal({ type: "taste" })}>
                  <Text style={{ color: C.green }}>调整口味 ↗</Text>
                </Pressable>
              </View>
              <View style={styles.grid}>
                {recommended.slice(0, 4).map((r) => dishCard(r.dish, r.reason))}
              </View>
            </>
          )}
          {tab === "friends" && (
            <Together
              dishes={data.dishes.filter((d) => !d.wish)}
              notify={setNotice}
              onPlan={(shared) => {
                change((st) => {
                  const additions = shared.filter(
                    (d) => !st.dishes.some((x) => x.id === d.id),
                  );
                  return {
                    ...st,
                    dishes: [...st.dishes, ...additions],
                    picks: shared.map((d) => ({ dishId: d.id, servings: 1 })),
                  };
                });
                setTab("shop");
              }}
            />
          )}
        </ScrollView>
        {!!selectedCount && tab === "menu" && (
          <Pressable style={styles.selectionBar} onPress={() => setTab("shop")}>
            <Text style={{ color: "white", fontWeight: "700" }}>
              已选 {selectedCount} 道菜 · 让晚饭有着落
            </Text>
            <Text style={{ color: "white" }}>去备菜 →</Text>
          </Pressable>
        )}
        {!!notice && (
          <Pressable onPress={() => setNotice("")} style={styles.toast}>
            <Text
              accessibilityRole="alert"
              style={{ color: "white", lineHeight: 22 }}
            >
              {notice}
            </Text>
          </Pressable>
        )}
        <View style={styles.nav}>
          {tabs.map((t) => (
            <Pressable
              key={t.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.id }}
              onPress={() => setTab(t.id)}
              style={styles.navItem}
            >
              <View
                style={[
                  styles.navIcon,
                  tab === t.id && { backgroundColor: C.pale },
                ]}
              >
                <Ionicons
                  name={t.icon}
                  size={23}
                  color={tab === t.id ? C.green : "#949B8E"}
                />
              </View>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: tab === t.id ? "700" : "400",
                  color: tab === t.id ? C.green : C.muted,
                }}
              >
                {t.title}
              </Text>
            </Pressable>
          ))}
        </View>
        {modal?.type === "dish" && (
          <Sheet
            title={
              modal.dish
                ? "编辑我的餐盘"
                : modal.wish
                  ? "留住一道新灵感"
                  : "制作专属餐盘"
            }
            onClose={() => setModal(null)}
          >
            <DishForm
              existing={modal.dish}
              wish={modal.wish}
              onSave={(dish) => {
                change((st) => ({
                  ...st,
                  dishes: st.dishes.some((d) => d.id === dish.id)
                    ? st.dishes.map((d) => (d.id === dish.id ? dish : d))
                    : [...st.dishes, dish],
                }));
                setModal(null);
                setNotice("餐盘已保存");
              }}
            />
          </Sheet>
        )}
        {modal?.type === "detail" && (
          <Sheet title="餐盘里的小美好" onClose={() => setModal(null)}>
            <View style={{ alignItems: "center", gap: 15 }}>
              <Plate dish={modal.dish} size={195} />
              <Text style={s.h2}>{modal.dish.name}</Text>
              <Text style={s.muted}>
                {modal.dish.minutes} 分钟 · {modal.dish.tags.join(" / ")}
              </Text>
            </View>
            <Text style={s.h3}>食材 · 每 1 份</Text>
            {modal.dish.ingredients.map((i, n) => (
              <View key={n} style={s.row}>
                <Text style={s.body}>{i.name}</Text>
                <Text style={s.muted}>
                  {i.quantity}
                  {i.unit}
                </Text>
              </View>
            ))}
            <Text style={s.h3}>跟着做，一点也不难</Text>
            {modal.dish.steps.length ? (
              modal.dish.steps.map((step, n) => (
                <View key={n} style={{ flexDirection: "row", gap: 14 }}>
                  <Text style={[s.h3, { color: C.orange }]}>
                    {String(n + 1).padStart(2, "0")}
                  </Text>
                  <Text style={[s.body, { flex: 1 }]}>{step}</Text>
                </View>
              ))
            ) : (
              <Text style={s.muted}>
                还没有写做法，编辑餐盘补充你的拿手秘诀。
              </Text>
            )}
            {!!modal.dish.note && (
              <Text style={s.muted}>{modal.dish.note}</Text>
            )}
            <Button
              title={
                modal.dish.wish
                  ? "加入我的菜单，准备试做"
                  : data.picks.some((p) => p.dishId === modal.dish.id)
                    ? "从本餐菜单移除"
                    : "今天就吃它"
              }
              onPress={() => {
                if (modal.dish.wish && !modal.dish.ingredients.length) {
                  setModal({ type: "dish", dish: modal.dish });
                  setNotice("试做前请先补充食材用量，再加入个人菜单");
                  return;
                }
                if (modal.dish.wish)
                  change((st) => ({
                    ...st,
                    dishes: st.dishes.map((d) =>
                      d.id === modal.dish.id ? { ...d, wish: false } : d,
                    ),
                  }));
                else select(modal.dish);
                setModal(null);
              }}
            />
            <Button
              title="编辑餐盘 / 照片"
              secondary
              onPress={() => setModal({ type: "dish", dish: modal.dish })}
            />
            {!modal.dish.wish && (
              <Button
                title="移到想尝试清单"
                secondary
                onPress={() => {
                  change((st) => ({
                    ...st,
                    dishes: st.dishes.map((d) =>
                      d.id === modal.dish.id ? { ...d, wish: true } : d,
                    ),
                    picks: st.picks.filter((p) => p.dishId !== modal.dish.id),
                  }));
                  setModal(null);
                }}
              />
            )}
          </Sheet>
        )}
        {modal?.type === "stock" && (
          <Sheet
            title={modal.stock ? "管理这一批食材" : "给食材一个位置"}
            onClose={() => setModal(null)}
          >
            <StockForm
              existing={modal.stock}
              onSave={(stock) => {
                change((st) => ({
                  ...st,
                  stock: st.stock.some((i) => i.id === stock.id)
                    ? st.stock.map((i) => (i.id === stock.id ? stock : i))
                    : [...st.stock, stock],
                }));
                setModal(null);
              }}
            />
            {modal.stock && (
              <Button
                title="已耗尽 / 丢弃，移除此批次"
                secondary
                onPress={() => {
                  change((st) => ({
                    ...st,
                    stock: st.stock.filter((i) => i.id !== modal.stock!.id),
                  }));
                  setModal(null);
                  setNotice("已移除此批次食材");
                }}
              />
            )}
          </Sheet>
        )}
        {modal?.type === "meal" && (
          <Sheet title="给这一餐留个记录" onClose={() => setModal(null)}>
            <Field
              label="用餐日期（YYYY-MM-DD）"
              value={mealDate}
              onChange={setMealDate}
              placeholder={today()}
            />
            <Text style={s.muted}>
              可切换日期补记。若开启扣减，将从当前食材库存中消耗。
            </Text>
            <View style={s.wrap}>
              {["早餐", "午餐", "晚餐"].map((t) => (
                <Chip
                  key={t}
                  label={t}
                  active={slot === t}
                  onPress={() => setSlot(t)}
                />
              ))}
            </View>
            {selectedCount ? (
              data.picks.map((p) => (
                <Text key={p.dishId} style={s.body}>
                  {data.dishes.find((d) => d.id === p.dishId)?.name} ×{" "}
                  {p.servings} 份
                </Text>
              ))
            ) : (
              <>
                <Text style={s.muted}>还没有选餐盘，请先选菜再记录。</Text>
                <Button
                  title="去选今天的菜"
                  secondary
                  onPress={() => {
                    setModal(null);
                    setTab("menu");
                    setWishlist(false);
                  }}
                />
              </>
            )}
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.h3}>同时扣减库存</Text>
                <Text style={s.muted}>在外就餐时可关闭，保留家中食材。</Text>
              </View>
              <Switch
                accessibilityLabel="同时扣减库存"
                value={deduct}
                onValueChange={setDeduct}
                trackColor={{ true: C.green }}
              />
            </View>
            {!!mealError && <Text style={{ color: C.red }}>{mealError}</Text>}
            <Button
              title="确认，记下这一餐"
              disabled={!selectedCount}
              onPress={() => {
                try {
                  const next = recordMeal(
                    current.current,
                    mealDate,
                    slot,
                    deduct,
                  );
                  change(() => next);
                  setDate(mealDate);
                  setModal(null);
                  setNotice("好好吃饭的这一天，已记下");
                } catch (e) {
                  setMealError((e as Error).message);
                }
              }}
            />
          </Sheet>
        )}
        {modal?.type === "taste" && (
          <Sheet title="更懂你的胃" onClose={() => setModal(null)}>
            <Text style={s.body}>喜欢什么口味？</Text>
            <View style={s.wrap}>
              {tastes.map((t) => (
                <Chip
                  key={t}
                  label={t}
                  active={data.tastes.includes(t)}
                  onPress={() =>
                    change((st) => ({
                      ...st,
                      tastes: st.tastes.includes(t)
                        ? st.tastes.filter((x) => x !== t)
                        : [...st.tastes, t],
                    }))
                  }
                />
              ))}
            </View>
            <Field
              label="不吃的食材（逗号分隔）"
              value={data.avoid}
              onChange={(avoid) => change((st) => ({ ...st, avoid }))}
              placeholder="例如：虾仁，牛奶"
            />
            <Text style={s.muted}>
              推荐按已记录食材名称匹配忌口，不会识别别名或未录入的调料。请在下厨前核对完整用料。
            </Text>
            <Text style={s.muted}>
              个人照片、三餐和库存保存在本机。多人房间只共享候选菜谱与点菜结果，不上传你的照片、库存或三餐记录。
            </Text>
            <Button title="保存我的偏好" onPress={() => setModal(null)} />
          </Sheet>
        )}
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: "#E7EADF" },
  app: {
    flex: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    backgroundColor: C.bg,
  },
  brand: {
    paddingHorizontal: 24,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  brandIcon: {
    width: 31,
    height: 31,
    borderRadius: 11,
    backgroundColor: C.green,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: { fontSize: 18, fontWeight: "800", color: C.ink },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E7EADA",
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: C.green,
    borderRadius: 25,
    padding: 22,
    alignItems: "center",
    overflow: "hidden",
  },
  heroButton: {
    backgroundColor: "#F6F6E9",
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 22,
  },
  mealIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  dishCard: {
    width: "48%",
    flexGrow: 1,
    maxWidth: "49%",
    padding: 14,
    paddingTop: 21,
    backgroundColor: "white",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.line,
    gap: 11,
  },
  plus: {
    backgroundColor: C.green,
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    backgroundColor: "white",
    paddingHorizontal: 14,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: "#EBEDE4",
    borderRadius: 14,
    padding: 4,
  },
  segmentItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 11,
  },
  segmentActive: { backgroundColor: "white" },
  listLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0E8",
    paddingVertical: 9,
  },
  nav: {
    flexDirection: "row",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: C.line,
    backgroundColor: "#FFFFFF",
  },
  navItem: { flex: 1, alignItems: "center", gap: 3 },
  navIcon: { paddingHorizontal: 17, paddingVertical: 5, borderRadius: 15 },
  selectionBar: {
    backgroundColor: C.green,
    borderRadius: 17,
    padding: 17,
    marginHorizontal: 18,
    marginBottom: 9,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  toast: {
    position: "absolute",
    bottom: 85,
    left: 20,
    right: 20,
    backgroundColor: "#293C2CF2",
    padding: 16,
    borderRadius: 16,
    zIndex: 10,
  },
});
