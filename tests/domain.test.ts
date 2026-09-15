import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregate,
  consume,
  localDate,
  purchase,
  recommendations,
  recordMeal,
  shopping,
  today,
  validDate,
  State,
} from "../src/domain";
import { initialState } from "../src/seed";

test("purchase plan merges units and deducts inventory without negative requirements", () => {
  const state = initialState();
  state.picks = [{ dishId: "tomato-eggs", servings: 3 }];
  state.stock = [
    { id: "a", name: "番茄", quantity: 0.4, unit: "kg", expires: "" },
    { id: "b", name: "鸡蛋", quantity: 8, unit: "个", expires: "" },
  ];
  const plan = shopping(state);
  assert.equal(plan.find((i) => i.name === "番茄")?.quantity, 50);
  assert.equal(plan.find((i) => i.name === "鸡蛋")?.quantity, 0);
  assert.deepEqual(
    aggregate([
      { name: "牛奶", quantity: 0.5, unit: "L" },
      { name: "牛奶", quantity: 100, unit: "ml" },
    ]),
    [{ name: "牛奶", quantity: 600, unit: "ml" }],
  );
});
test("purchase followed by consumption keeps inventory and logs consistent", () => {
  let state = initialState();
  state.picks = [{ dishId: "broccoli-shrimp", servings: 2 }];
  for (const item of shopping(state).filter((i) => i.quantity > 0))
    state = purchase(state, item);
  assert.ok(shopping(state).every((i) => i.quantity === 0));
  const result = recordMeal(state, today(), "午餐", true);
  assert.equal(result.meals.length, 1);
  assert.equal(result.meals[0]?.deducted, true);
  assert.equal(result.picks.length, 0);
  assert.ok(
    result.stock.every((i) => i.name !== "虾仁" && i.name !== "西兰花"),
  );
  assert.equal(result.purchases.length, 2);
});
test("oldest usable batch is consumed first, expired stock is never used", () => {
  const stock = [
    {
      id: "expired",
      name: "番茄",
      quantity: 400,
      unit: "g" as const,
      expires: "2026-01-01",
    },
    {
      id: "later",
      name: "番茄",
      quantity: 0.3,
      unit: "kg" as const,
      expires: "2026-10-01",
    },
    {
      id: "first",
      name: "番茄",
      quantity: 100,
      unit: "g" as const,
      expires: "2026-09-20",
    },
  ];
  const result = consume(
    stock,
    [{ name: "番茄", quantity: 250, unit: "g" }],
    "2026-09-15",
  );
  assert.equal(result.find((i) => i.id === "later")?.quantity, 0.15);
  assert.equal(result.find((i) => i.id === "expired")?.quantity, 400);
  assert.ok(!result.some((i) => i.id === "first"));
  assert.equal(stock[1]?.quantity, 0.3);
});
test("insufficient stock fails atomically and can be logged without deduction", () => {
  const state = initialState();
  state.picks = [{ dishId: "potato-beef", servings: 1 }];
  const before = JSON.stringify(state);
  assert.throws(() => recordMeal(state, today(), "晚餐", true), /库存不足/);
  assert.equal(JSON.stringify(state), before);
  const logged = recordMeal(state, today(), "晚餐", false);
  assert.deepEqual(logged.stock, state.stock);
  assert.equal(logged.meals[0]?.deducted, false);
});
test("duplicate meal cannot double-consume ingredients", () => {
  const state = initialState();
  state.picks = [{ dishId: "tomato-eggs", servings: 1 }];
  const once = recordMeal(state, today(), "早餐", true);
  once.picks = state.picks;
  assert.throws(() => recordMeal(once, today(), "早餐", true), /已记录/);
});
test("recommendation honors exclusions, ingredient availability and wish status", () => {
  const state = initialState();
  state.avoid = "鸡蛋";
  assert.ok(
    recommendations(state).every(
      (r) => !r.dish.ingredients.some((i) => i.name === "鸡蛋"),
    ),
  );
  assert.ok(recommendations(state).every((r) => !r.dish.wish));
  const matches = recommendations(state, ["西兰花", "虾仁"]);
  assert.equal(matches[0]?.dish.id, "broccoli-shrimp");
  assert.equal(matches[0]?.matched, 2);
  assert.deepEqual(recommendations(state, ["不存在的食材"]), []);
});
test("expired stock does not satisfy procurement requirements", () => {
  const state = initialState();
  state.picks = [{ dishId: "tomato-eggs", servings: 1 }];
  state.stock.forEach((i) => (i.expires = "2000-01-01"));
  assert.equal(shopping(state).find((i) => i.name === "番茄")?.quantity, 150);
});
test("date validation rejects impossible dates and supports leap years", () => {
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("not-a-date"), false);
});
