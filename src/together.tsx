import React, { useEffect, useRef, useState } from "react";
import { Share, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Dish } from "./domain";
import { Button, Chip, Empty, Field, Plate, s, C } from "./ui";
type Session = { server: string; code: string; token: string };
type Room = {
  code: string;
  revision: number;
  name: string;
  expires: string;
  participants: number;
  dishes: Dish[];
  ranking: { dishId: string; count: number; voters: string[] }[];
  myVotes: string[];
};
const SESSION_KEY = "chidiansha:room:v1";
export function Together({
  dishes,
  notify,
  onPlan,
}: {
  dishes: Dish[];
  notify: (s: string) => void;
  onPlan: (d: Dish[]) => void;
}) {
  const [server, setServer] = useState(process.env.EXPO_PUBLIC_API_URL ?? "");
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const roomRef = useRef<Room | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [chosen, setChosen] = useState<string[]>(
    dishes.slice(0, 6).map((d) => d.id),
  );
  const epoch = useRef(0);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SESSION_KEY)
      .then((raw) => {
        if (raw && active) {
          const item = JSON.parse(raw) as Session;
          if (
            typeof item.server === "string" &&
            typeof item.code === "string" &&
            typeof item.token === "string"
          ) {
            setSession(item);
            setServer(item.server);
          }
        }
      })
      .catch(() => active && setError("上次房间读取失败，请重新加入"))
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
      epoch.current++;
    };
  }, []);
  async function request(
    path: string,
    options: RequestInit = {},
    target?: Session,
  ) {
    const url = (target?.server ?? server).trim().replace(/\/+$/, "");
    if (!/^https?:\/\/[^\s/]+(?::\d+)?(?:\/[^\s]*)?$/.test(url))
      throw new Error("请填写可连接的服务地址，例如 https://你的服务域名");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${url}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(target ? { Authorization: `Bearer ${target.token}` } : {}),
        },
        signal: controller.signal,
      });
      const body = await res.json();
      if (!res.ok)
        throw Object.assign(new Error(body.error ?? "房间服务暂不可用"), {
          status: res.status,
        });
      return body;
    } catch (e) {
      if ((e as Error).name === "AbortError")
        throw new Error("连接超时，请检查服务地址和网络");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  function accept(next: Room) {
    if (
      !roomRef.current ||
      roomRef.current.code !== next.code ||
      next.revision >= roomRef.current.revision
    ) {
      roomRef.current = next;
      setRoom(next);
    }
  }
  useEffect(() => {
    if (!session) return;
    const generation = ++epoch.current;
    let running = false;
    const sync = async () => {
      if (running) return;
      running = true;
      try {
        const result = await request(`/rooms/${session.code}`, {}, session);
        if (epoch.current === generation) {
          accept(result);
          setError("");
        }
      } catch (e) {
        if (epoch.current === generation)
          setError(`同步暂停：${(e as Error).message}`);
      } finally {
        running = false;
      }
    };
    void sync();
    const timer = setInterval(() => void sync(), 3000);
    return () => {
      clearInterval(timer);
      epoch.current++;
    };
  }, [session]);
  async function enter(create: boolean) {
    if (lock.current) return;
    if (!nickname.trim()) return setError("先填写大家能认出的昵称");
    if (create && !chosen.length) return setError("至少选一道候选菜");
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const body = create
        ? {
            name: `${nickname.trim()}的饭局`,
            nickname,
            dishes: dishes
              .filter((d) => chosen.includes(d.id))
              .map(({ photo, ...d }) => d),
          }
        : { nickname };
      const result = await request(
        create ? "/rooms" : `/rooms/${code.trim().toUpperCase()}/join`,
        { method: "POST", body: JSON.stringify(body) },
      );
      const next = {
        server: server.trim().replace(/\/+$/, ""),
        code: result.room.code,
        token: result.token,
      };
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
      roomRef.current = result.room;
      setRoom(result.room);
      setSession(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  async function vote(dishId: string) {
    if (!session || !room || lock.current) return;
    lock.current = true;
    setBusy(true);
    const generation = epoch.current;
    try {
      const result = await request(
        `/rooms/${session.code}/votes`,
        {
          method: "PUT",
          body: JSON.stringify({
            dishId,
            selected: !room.myVotes.includes(dishId),
          }),
        },
        session,
      );
      if (generation === epoch.current) {
        accept(result);
        setError("");
      }
    } catch (e) {
      setError(`点菜未确认：${(e as Error).message}`);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <>
      <View style={{ gap: 10 }}>
        <Text style={s.eyebrow}>GOOD FOOD, BETTER TOGETHER</Text>
        <Text style={s.h1}>这顿，一起决定。</Text>
        <Text style={s.muted}>让每个人的「想吃」，都被看见。</Text>
      </View>
      {!!error && (
        <View style={[s.card, { backgroundColor: "#F9EBE1" }]}>
          <Text accessibilityRole="alert" style={{ color: C.red }}>
            {error}
          </Text>
        </View>
      )}
      {!session ? (
        <>
          <View style={[s.card, { backgroundColor: C.pale }]}>
            <Text style={s.h2}>开一桌，叫上喜欢的人</Text>
            <Text style={s.muted}>
              创建房间，把 8
              位邀请码发给好友。大家连接同一个服务后，可在各自手机点菜，排行榜每
              3 秒同步。
            </Text>
          </View>
          <Field
            label="饭局服务地址"
            value={server}
            onChange={setServer}
            placeholder="https://你的服务域名"
          />
          <Text style={s.muted}>
            开发时可填写运行服务的电脑局域网地址。服务启动方法见项目
            README；跨网络使用需要部署 HTTPS 服务。
          </Text>
          <Field
            label="你的昵称"
            value={nickname}
            onChange={setNickname}
            placeholder="大家怎么称呼你？"
          />
          <Text style={s.h3}>本次候选菜单 · 最多 24 道</Text>
          <View style={s.wrap}>
            {dishes.slice(0, 24).map((d) => (
              <Chip
                key={d.id}
                label={`${d.emoji} ${d.name}`}
                active={chosen.includes(d.id)}
                onPress={() =>
                  setChosen(
                    chosen.includes(d.id)
                      ? chosen.filter((id) => id !== d.id)
                      : [...chosen, d.id],
                  )
                }
              />
            ))}
          </View>
          <Button
            title={busy ? "正在连接…" : "＋ 创建今天的饭局"}
            onPress={() => void enter(true)}
            disabled={busy || !loaded}
          />
          <Text style={[s.h3, { marginTop: 10 }]}>已有饭局？坐下来一起点</Text>
          <Field
            label="8 位邀请码"
            value={code}
            onChange={setCode}
            placeholder="输入好友分享的邀请码"
          />
          <Button
            title="加入好友的饭局"
            secondary
            onPress={() => void enter(false)}
            disabled={busy || !loaded || code.trim().length !== 8}
          />
        </>
      ) : (
        <>
          <View style={[s.card, { backgroundColor: C.pale }]}>
            <Text style={s.h2}>{room?.name ?? "正在连接饭局…"}</Text>
            <Text style={[s.h1, { letterSpacing: 5 }]}>{session.code}</Text>
            <Text style={s.muted}>
              {room
                ? `${room.participants} 人已入座 · 房间保留至 ${new Date(room.expires).toLocaleString("zh-CN")}`
                : "正在获取最新点菜结果"}
            </Text>
            <Button
              title="邀请朋友一起吃"
              secondary
              onPress={async () => {
                try {
                  await Share.share({
                    message: `来「吃点啥」一起点菜！\n服务地址：${session.server}\n邀请码：${session.code}\n打开 APP 的「一起吃」，填写同一服务地址和邀请码加入。`,
                  });
                } catch {
                  notify("分享未完成");
                }
              }}
            />
          </View>
          <View style={s.row}>
            <Text style={s.h2}>今天最想吃的菜</Text>
            <Text style={[s.muted, { color: error ? C.orange : C.green }]}>
              {error ? "等待重连" : "每 3 秒同步"}
            </Text>
          </View>
          <Text style={s.muted}>
            每人每道菜 1
            票，可以选多道，也可以取消。票数相同为并列，按候选菜单顺序展示。
          </Text>
          {room?.ranking.map((item, index) => {
            const dish = room.dishes.find((d) => d.id === item.dishId)!;
            return (
              <View key={dish.id} style={[s.card, { gap: 15 }]}>
                <View style={s.row}>
                  <Text
                    style={[
                      s.h2,
                      { color: index === 0 && item.count ? C.orange : C.muted },
                    ]}
                  >
                    {String(
                      1 +
                        room.ranking.filter((r) => r.count > item.count).length,
                    ).padStart(2, "0")}
                  </Text>
                  <Plate dish={dish} size={62} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.h3}>{dish.name}</Text>
                    <Text style={s.muted}>{item.count} 人想吃</Text>
                  </View>
                  <Button
                    title={
                      room.myVotes.includes(dish.id) ? "✓ 想吃" : "＋ 想吃"
                    }
                    secondary={!room.myVotes.includes(dish.id)}
                    small
                    disabled={busy}
                    onPress={() => void vote(dish.id)}
                  />
                </View>
                {item.voters.length > 0 && (
                  <Text style={s.muted}>
                    {item.voters.join("、")} 想吃这道菜
                  </Text>
                )}
              </View>
            );
          })}
          {!room && (
            <Empty title="正在等大家入座" detail="连接成功后会显示候选菜品。" />
          )}
          <Button
            title="用排行榜前三名安排采购"
            disabled={
              !room || !!error || !room.ranking.some((r) => r.count > 0)
            }
            onPress={() => {
              if (!room) return;
              const top = room.ranking
                .filter((r) => r.count > 0)
                .slice(0, 3)
                .map((r) => room.dishes.find((d) => d.id === r.dishId)!);
              onPlan(top);
              notify("已按前三道菜生成本餐计划，请按用餐人数调整份数");
            }}
          />
          <Text style={s.muted}>
            会替换当前待采购餐盘，每道菜默认 1
            份，请在采购页调整。票数代表想吃人数，不自动等同于烹饪份数。
          </Text>
          <Text style={s.muted}>离开房间会取消你的点菜，其他人仍可继续。</Text>
          <Button
            title="离开此房间"
            secondary
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              try {
                try {
                  await request(
                    `/rooms/${session.code}/leave`,
                    { method: "POST" },
                    session,
                  );
                } catch (e) {
                  // Expired rooms and already-removed membership must not trap the user.
                  if (
                    ![401, 404].includes(
                      (e as Error & { status?: number }).status ?? 0,
                    )
                  )
                    throw e;
                }
                await AsyncStorage.removeItem(SESSION_KEY);
                epoch.current++;
                setSession(null);
                roomRef.current = null;
                setRoom(null);
                setError("");
              } catch (e) {
                setError(`退出未完成：${(e as Error).message}`);
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      )}
    </>
  );
}
