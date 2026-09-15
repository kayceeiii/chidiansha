export type Unit = "g" | "kg" | "ml" | "L" | "个";
export type Ingredient = { name: string; quantity: number; unit: Unit };
export type Dish = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  photo?: string;
  frame: string;
  minutes: number;
  tags: string[];
  ingredients: Ingredient[];
  steps: string[];
  wish: boolean;
  note: string;
};
export type Stock = Ingredient & { id: string; expires: string };
export type Pick = { dishId: string; servings: number };
export type Meal = {
  id: string;
  date: string;
  slot: string;
  names: string[];
  servings: number;
  deducted: boolean;
};
export type Purchase = Ingredient & { id: string; at: string };
export type State = {
  version: 1;
  dishes: Dish[];
  stock: Stock[];
  picks: Pick[];
  meals: Meal[];
  purchases: Purchase[];
  tastes: string[];
  avoid: string;
  memberId: string;
};
export const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
export const today = () => localDate(new Date());
export function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function validDate(s: string) {
  const d = new Date(`${s}T12:00:00`);
  return !Number.isNaN(d.valueOf()) && localDate(d) === s;
}
export const round = (n: number) => Math.round(n * 1000) / 1000;
export const normalize = (s: string) =>
  s.trim().replace(/\s+/g, "").toLowerCase();
export function base(i: Ingredient): Ingredient {
  return {
    name: i.name.trim(),
    quantity: i.quantity * (i.unit === "kg" || i.unit === "L" ? 1000 : 1),
    unit: i.unit === "kg" ? "g" : i.unit === "L" ? "ml" : i.unit,
  };
}
export const key = (i: Ingredient) => `${normalize(i.name)}:${base(i).unit}`;
export function aggregate(items: Ingredient[]) {
  const map = new Map<string, Ingredient>();
  for (const raw of items) {
    const i = base(raw);
    const k = key(i);
    const prev = map.get(k);
    map.set(k, { ...i, quantity: round(i.quantity + (prev?.quantity ?? 0)) });
  }
  return [...map.values()];
}
export function requirements(dishes: Dish[], picks: Pick[]) {
  return aggregate(
    picks.flatMap((p) =>
      (dishes.find((d) => d.id === p.dishId)?.ingredients ?? []).map((i) => ({
        ...i,
        quantity: i.quantity * p.servings,
      })),
    ),
  );
}
export function available(stock: Stock[], date = today()) {
  return aggregate(stock.filter((s) => !s.expires || s.expires >= date));
}
export function shopping(state: State) {
  const stock = available(state.stock);
  return requirements(state.dishes, state.picks).map((i) => {
    const have = stock.find((s) => key(s) === key(i))?.quantity ?? 0;
    return {
      ...i,
      needed: i.quantity,
      have,
      quantity: round(Math.max(0, i.quantity - have)),
    };
  });
}
export function consume(
  stock: Stock[],
  need: Ingredient[],
  date = today(),
): Stock[] {
  const totals = available(stock, date);
  const merged = aggregate(need);
  const missing = merged.filter(
    (i) =>
      (totals.find((s) => key(s) === key(i))?.quantity ?? 0) + 0.00001 <
      i.quantity,
  );
  if (missing.length)
    throw new Error(
      `库存不足：${missing.map((i) => i.name).join("、")}。请先补充库存，或关闭「扣减库存」仅记录用餐。`,
    );
  let result = stock.map((s) => ({ ...s }));
  for (const i of merged) {
    let remaining = i.quantity;
    const candidates = result
      .filter((s) => key(s) === key(i) && (!s.expires || s.expires >= date))
      .sort((a, b) => (a.expires || "9999").localeCompare(b.expires || "9999"));
    for (const s of candidates) {
      const factor = s.unit === "kg" || s.unit === "L" ? 1000 : 1;
      const take = Math.min(remaining, s.quantity * factor);
      s.quantity = round(s.quantity - take / factor);
      remaining = round(remaining - take);
    }
  }
  return result.filter((s) => s.quantity > 0);
}
export function recordMeal(
  state: State,
  date: string,
  slot: string,
  deduct: boolean,
): State {
  if (!validDate(date)) throw new Error("请输入有效日期，如 2026-09-15");
  if (!state.picks.length) throw new Error("请先选择今天想吃的餐盘");
  if (state.meals.some((m) => m.date === date && m.slot === slot))
    throw new Error("这一天的该餐已记录，请选择其他餐次");
  const stock = deduct
    ? consume(state.stock, requirements(state.dishes, state.picks))
    : state.stock;
  return {
    ...state,
    stock,
    picks: [],
    meals: [
      {
        id: uid(),
        date,
        slot,
        names: state.picks.map(
          (p) =>
            `${state.dishes.find((d) => d.id === p.dishId)!.name} ×${p.servings}`,
        ),
        servings: state.picks.reduce((n, p) => n + p.servings, 0),
        deducted: deduct,
      },
      ...state.meals,
    ],
  };
}
export function purchase(state: State, item: Ingredient, expires = ""): State {
  if (!(item.quantity > 0) || !Number.isFinite(item.quantity))
    throw new Error("采购数量必须大于 0");
  return {
    ...state,
    stock: [...state.stock, { ...item, id: uid(), expires }],
    purchases: [
      { ...item, id: uid(), at: new Date().toISOString() },
      ...state.purchases,
    ],
  };
}
export function recommendations(state: State, supplied?: string[]) {
  const stock = available(state.stock);
  const have = supplied
    ? supplied.map(normalize)
    : stock.map((i) => normalize(i.name));
  const avoid = state.avoid
    .split(/[,，、\n]/)
    .map(normalize)
    .filter(Boolean);
  return state.dishes
    .filter(
      (d) =>
        !d.wish &&
        !d.ingredients.some((i) => avoid.includes(normalize(i.name))),
    )
    .map((d) => {
      const matched = d.ingredients.filter((i) =>
        have.includes(normalize(i.name)),
      ).length;
      const urgent = d.ingredients.some((i) =>
        state.stock.some(
          (s) =>
            normalize(s.name) === normalize(i.name) &&
            s.expires >= today() &&
            s.expires <= localDate(new Date(Date.now() + 3 * 86400000)),
        ),
      );
      const taste = d.tags.some((t) => state.tastes.includes(t));
      const ratio = d.ingredients.length ? matched / d.ingredients.length : 0;
      return {
        dish: d,
        matched,
        score: ratio * 70 + (taste ? 20 : 0) + (!supplied && urgent ? 10 : 0),
        reason: `${matched}/${d.ingredients.length} 种食材匹配${taste ? " · 符合口味" : ""}${!supplied && urgent ? " · 优先用临期食材" : ""}`,
      };
    })
    .filter((r) => !supplied || r.matched > 0)
    .sort((a, b) => b.score - a.score);
}
