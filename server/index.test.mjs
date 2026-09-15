import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createServer } from "./index.mjs";
const dish = {
  name: "番茄炒蛋",
  emoji: "🍅",
  photo: "file:///private/photo.jpg",
  ingredients: [{ name: "番茄", quantity: 150, unit: "g" }],
  tags: ["家常"],
  steps: ["炒熟"],
  minutes: 15,
};
async function start(file) {
  const server = createServer(file);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    server,
    request: async (path, method = "GET", body, token) => {
      const res = await fetch(`${url}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: await res.json() };
    },
  };
}
async function close(server) {
  server.close();
  await once(server, "close");
}
test("two independent phones join, vote concurrently, retry and cancel with one vote each", async () => {
  const { server, request } = await start();
  try {
    const created = await request("/rooms", "POST", {
      name: "今晚吃点啥",
      nickname: "主人",
      dishes: [dish],
    });
    assert.equal(created.status, 201);
    const { room, token } = created.body;
    const id = room.dishes[0].id;
    assert.ok(!("photo" in room.dishes[0]));
    assert.ok(!("members" in room));
    const joined = await request(`/rooms/${room.code}/join`, "POST", {
      nickname: "好友",
    });
    assert.equal(joined.body.room.participants, 2);
    assert.equal((await request(`/rooms/${room.code}`)).status, 401);
    await Promise.all([
      request(
        `/rooms/${room.code}/votes`,
        "PUT",
        { dishId: id, selected: true },
        token,
      ),
      request(
        `/rooms/${room.code}/votes`,
        "PUT",
        { dishId: id, selected: true },
        joined.body.token,
      ),
    ]);
    const read = await request(`/rooms/${room.code}`, "GET", undefined, token);
    assert.equal(read.body.ranking[0].count, 2);
    assert.deepEqual(read.body.ranking[0].voters, ["主人", "好友"]);
    const retry = await request(
      `/rooms/${room.code}/votes`,
      "PUT",
      { dishId: id, selected: true },
      token,
    );
    assert.equal(retry.body.ranking[0].count, 2);
    const cancel = await request(
      `/rooms/${room.code}/votes`,
      "PUT",
      { dishId: id, selected: false },
      token,
    );
    assert.equal(cancel.body.ranking[0].count, 1);
    assert.deepEqual(cancel.body.myVotes, []);
    assert.equal(
      (
        await request(
          `/rooms/${room.code}/votes`,
          "PUT",
          { dishId: "forged", selected: true },
          token,
        )
      ).status,
      400,
    );
    assert.equal(
      (await request(`/rooms/${room.code}/join`, "POST", { nickname: "好友" }))
        .status,
      400,
    );
    assert.equal(
      (
        await request(
          `/rooms/${room.code}/leave`,
          "POST",
          undefined,
          joined.body.token,
        )
      ).status,
      200,
    );
    const left = await request(`/rooms/${room.code}`, "GET", undefined, token);
    assert.equal(left.body.participants, 1);
    assert.equal(left.body.ranking[0].count, 0);
    assert.equal(
      (await request(`/rooms/${room.code}/join`, "POST", { nickname: "好友" }))
        .status,
      200,
    );
  } finally {
    await close(server);
  }
});
test("rooms and access credentials survive server restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "chidiansha-test-"));
  const file = join(directory, "test.sqlite");
  let app = await start(file);
  try {
    const created = await app.request("/rooms", "POST", {
      name: "持久化饭局",
      nickname: "我",
      dishes: [dish],
    });
    await close(app.server);
    app = await start(file);
    const read = await app.request(
      `/rooms/${created.body.room.code}`,
      "GET",
      undefined,
      created.body.token,
    );
    assert.equal(read.status, 200);
    assert.equal(read.body.name, "持久化饭局");
  } finally {
    await close(app.server);
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    assert.ok(directory.split(sep).at(-1).startsWith("chidiansha-test-"));
    rmSync(directory, { recursive: true });
  }
});
test("API rejects malformed candidates, invalid JSON and oversized requests", async () => {
  const { server, request } = await start();
  try {
    assert.equal(
      (
        await request("/rooms", "POST", {
          name: "测试",
          nickname: "我",
          dishes: [
            { ...dish, ingredients: [{ name: "米", quantity: -1, unit: "g" }] },
          ],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/rooms", "POST", {
          name: "测试",
          nickname: "我",
          dishes: [],
        })
      ).status,
      400,
    );
    assert.equal(
      (await request("/rooms", "POST", { huge: "a".repeat(130 * 1024) }))
        .status,
      413,
    );
    assert.equal((await request("/rooms/12345678", "GET")).status, 404);
  } finally {
    await close(server);
  }
});
