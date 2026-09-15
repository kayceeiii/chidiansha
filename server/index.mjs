import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const hash = (token) => createHash("sha256").update(token).digest("hex");
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
function text(value, max = 60) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    fail("文本为空或超过长度限制");
  return value.trim();
}
function cleanDish(d, code, index) {
  if (
    !d ||
    !Array.isArray(d.ingredients) ||
    !d.ingredients.length ||
    d.ingredients.length > 40
  )
    fail("每道菜需要 1–40 种食材");
  const ingredients = d.ingredients.map((i) => {
    if (
      !i ||
      !["g", "kg", "ml", "L", "个"].includes(i.unit) ||
      typeof i.quantity !== "number" ||
      !Number.isFinite(i.quantity) ||
      i.quantity <= 0 ||
      i.quantity > 100000
    )
      fail("食材数量或单位无效");
    return { name: text(i.name), quantity: i.quantity, unit: i.unit };
  });
  if (
    !Array.isArray(d.steps) ||
    d.steps.length > 30 ||
    !Array.isArray(d.tags) ||
    d.tags.length > 10
  )
    fail("菜谱格式不正确");
  return {
    id: `room-${code}-${index}`,
    name: text(d.name),
    emoji: typeof d.emoji === "string" && d.emoji.length < 12 ? d.emoji : "🍲",
    frame: /^#[a-f0-9]{6}$/i.test(d.frame) ? d.frame : "#EEE5CE",
    color: /^#[a-f0-9]{6}$/i.test(d.color) ? d.color : "#E5EBD8",
    minutes:
      Number.isFinite(d.minutes) && d.minutes > 0
        ? Math.min(d.minutes, 1440)
        : 20,
    ingredients,
    tags: d.tags.map((t) => text(t, 20)),
    steps: d.steps.map((s) => text(s, 1000)),
    note: "",
    wish: false,
  };
}
function snapshot(room, member) {
  return {
    code: room.code,
    revision: room.revision,
    name: room.name,
    expires: room.expires,
    participants: room.members.length,
    dishes: room.dishes,
    myVotes: member.votes,
    ranking: room.dishes
      .map((d) => ({
        dishId: d.id,
        count: room.members.filter((m) => m.votes.includes(d.id)).length,
        voters: room.members
          .filter((m) => m.votes.includes(d.id))
          .map((m) => m.name),
      }))
      .sort((a, b) => b.count - a.count),
  };
}
async function body(req) {
  let size = 0;
  const parts = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 128 * 1024) fail("请求过大", 413);
    parts.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString());
  } catch {
    fail("JSON 格式无效");
  }
}
export function createServer(dbFile = ":memory:") {
  if (dbFile !== ":memory:")
    mkdirSync(dirname(resolve(dbFile)), { recursive: true });
  const db = new DatabaseSync(dbFile);
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, data TEXT NOT NULL, expires TEXT NOT NULL)",
  );
  const save = (room) =>
    db
      .prepare(
        "INSERT OR REPLACE INTO rooms (code, data, expires) VALUES (?, ?, ?)",
      )
      .run(room.code, JSON.stringify(room), room.expires);
  const get = (code) => {
    const row = db
      .prepare("SELECT data FROM rooms WHERE code = ? AND expires > ?")
      .get(code, new Date().toISOString());
    if (!row) fail("饭局不存在或已过期", 404);
    return JSON.parse(row.data);
  };
  const rate = new Map();
  const app = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Access-Control-Allow-Origin",
      process.env.CORS_ORIGIN || "*",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status, data) => {
      res.writeHead(status);
      res.end(JSON.stringify(data));
    };
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      const now = Date.now();
      for (const [key, entry] of rate)
        if (now - entry.since > 60000) rate.delete(key);
      const ip = `${req.socket.remoteAddress}:${req.method === "GET" ? "read" : "write"}`;
      const entry = rate.get(ip) ?? { since: now, count: 0 };
      entry.count++;
      rate.set(ip, entry);
      if (entry.count > (req.method === "GET" ? 1000 : 60))
        fail("操作太频繁，请稍后再试", 429);
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/health" && req.method === "GET")
        return send(200, { ok: true });
      if (url.pathname === "/rooms" && req.method === "POST") {
        const input = await body(req);
        if (
          !input ||
          !Array.isArray(input.dishes) ||
          !input.dishes.length ||
          input.dishes.length > 24
        )
          fail("请选择 1–24 道候选菜");
        db.prepare("DELETE FROM rooms WHERE expires <= ?").run(
          new Date().toISOString(),
        );
        if (
          db.prepare("SELECT COUNT(*) AS count FROM rooms").get().count >= 5000
        )
          fail("当前饭局已满，请稍后再试", 503);
        let code;
        do {
          code = randomBytes(5).toString("hex").slice(0, 8).toUpperCase();
        } while (db.prepare("SELECT code FROM rooms WHERE code = ?").get(code));
        const token = randomBytes(32).toString("hex");
        const member = {
          tokenHash: hash(token),
          name: text(input.nickname, 24),
          votes: [],
        };
        const room = {
          code,
          name: text(input.name),
          revision: 1,
          expires: new Date(Date.now() + 86400000).toISOString(),
          dishes: input.dishes.map((d, i) => cleanDish(d, code, i)),
          members: [member],
        };
        save(room);
        return send(201, { token, room: snapshot(room, member) });
      }
      const match = url.pathname.match(
        /^\/rooms\/([A-F0-9]{8})(?:\/(join|votes|leave))?$/,
      );
      if (!match) fail("接口不存在", 404);
      const [, code, action] = match;
      if (action === "join" && req.method === "POST") {
        const input = await body(req);
        const name = text(input?.nickname, 24);
        const room = get(code);
        if (room.members.length >= 24) fail("房间最多支持 24 人");
        if (room.members.some((m) => m.name === name))
          fail("昵称已有人使用，请换一个昵称");
        const token = randomBytes(32).toString("hex");
        const member = { tokenHash: hash(token), name, votes: [] };
        room.members.push(member);
        room.revision++;
        save(room);
        return send(200, { token, room: snapshot(room, member) });
      }
      // Read the complete body before loading the room to avoid lost updates between concurrent voters.
      const input =
        action === "votes" && req.method === "PUT"
          ? await body(req)
          : undefined;
      const room = get(code);
      const token = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
      const member = room.members.find((m) => m.tokenHash === hash(token));
      if (!member) fail("请先加入房间", 401);
      if (!action && req.method === "GET")
        return send(200, snapshot(room, member));
      if (action === "leave" && req.method === "POST") {
        room.members = room.members.filter((m) => m !== member);
        room.revision++;
        save(room);
        return send(200, { ok: true });
      }
      if (action === "votes" && req.method === "PUT") {
        if (
          !input ||
          typeof input.selected !== "boolean" ||
          !room.dishes.some((d) => d.id === input.dishId)
        )
          fail("点菜参数无效");
        member.votes = member.votes.filter((id) => id !== input.dishId);
        if (input.selected) member.votes.push(input.dishId);
        room.revision++;
        save(room);
        return send(200, snapshot(room, member));
      }
      fail("请求方法不支持", 405);
    } catch (error) {
      if (!error.status) console.error(error);
      if (!res.headersSent)
        send(error.status ?? 500, {
          error: error.status ? error.message : "服务暂时无法处理请求",
        });
      else res.end();
    }
  });
  app.on("close", () => db.close());
  return app;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT || 8787);
  createServer(process.env.DB_PATH || "server/data/rooms.sqlite").listen(
    port,
    "0.0.0.0",
    () => console.log(`吃点啥饭局服务已启动：http://0.0.0.0:${port}`),
  );
}
