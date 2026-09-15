# 吃点啥 · 好好吃饭，好好生活

面向 Android / iOS 的个性化家庭菜单 APP。Expo SDK 57 + React Native + TypeScript；独立 Node.js / SQLite 多人饭局服务。

**当前版本：可运行的首版 MVP 源码。** 已完成核心操作与逻辑验证，尚未生成签名 APK / IPA、完成真机相册验收或发布到应用商店。Web 用于快速预览相同界面。

## 功能

| 需求         | 使用方式                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| 个人照片餐盘 | 我的餐盘 → ＋ → 相册选图与裁剪 → 四色圆盘边框 → 保存；照片复制到应用文档目录。                               |
| 一日三餐     | 今日 → 早餐 / 午餐 / 晚餐；支持切换日期与补记，记录菜品与份数，同一天同一餐次防重复。                        |
| 采购规划     | 选餐盘 → 采购 → 调整份数；合并同名食材，统一 g/kg、ml/L，扣除未过期库存，可分享清单。                        |
| 按食材找菜   | 我的餐盘 → 手边食材；输入食材名称，匹配内置和自建菜谱，显示匹配数量。                                        |
| 库存与推荐   | 添加、修改、移除食材批次和保质期；采购确认入库，用餐可自动消耗；按食材、口味及临期情况推荐。                 |
| 多人点菜     | 房间支持最多 24 人、24 道候选菜，每道菜每人一票，可多选、取消、查看排行、将前三名转成采购计划。每 3 秒同步。 |
| 想尝试清单   | 保存照片、用料、做法、备注或来源链接，准备试做时转入个人菜单。                                               |

首启含 **6 道示例菜、1 道待尝试菜、3 批示例库存**，可自行编辑；它们不是对真实冰箱的识别结果。示例餐盘用图标占位，上传照片后替换。

## 本地启动

需要 Node.js 24 和 pnpm 11。

```sh
pnpm install
pnpm start
```

在支持 SDK 57 的 Expo Go / 开发构建中打开终端显示的项目地址。真机需能连接开发电脑。Android 模拟器可用 `pnpm android`；iOS 模拟器需要 macOS + Xcode。

浏览器预览用 `pnpm web`，或导出后本地查看：

```sh
pnpm export
pnpm preview
```

打开 `http://127.0.0.1:8081`。Windows 如遇 pnpm 命令代理异常，可直接执行 `node node_modules/expo/bin/cli start`。

## 多人饭局服务

```sh
pnpm server
```

默认监听 `0.0.0.0:8787`，健康检查 `GET /health`。SQLite 数据存于 `server/data/rooms.sqlite`，不会进入 Git。保持服务运行，在每台手机的「一起吃」填写相同服务地址，例如电脑的局域网地址 `http://192.168.1.20:8787`（换成实际地址），再用邀请码加入。

也可复制 `.env.example` 为 `.env`，设置 `EXPO_PUBLIC_API_URL` 后重启 Expo。这个变量是公开服务地址，不可放密钥。`localhost` 只能连接当前设备本身。部分原生构建限制明文 HTTP；正式真机使用请部署 HTTPS 服务，不关闭系统传输保护。

服务行为：

- 随机 8 位邀请码和独立成员令牌；服务端只保存令牌哈希，读取及投票需要成员认证。
- 点菜接口显式设置选中状态，重试不额外计票；串行数据库操作避免并发投票丢失。
- 菜谱是创建房间时的快照。只共享用料、做法、点菜结果；不上传私人照片、库存、三餐或菜谱备注。
- 房间保留 24 小时；退出取消本人的票；同票数并列，按候选顺序展示。
- 请求体限制、字段校验、参与人数上限和基础频率限制。

### 部署服务

在支持持久卷的主机上：

```sh
docker build -f server/Dockerfile -t chidiansha-api .
docker run -d --name chidiansha-api -p 8787:8787 -v chidiansha-data:/data chidiansha-api
```

通过反向代理提供 HTTPS，再把地址填入 APP。支持 `PORT`、`DB_PATH`、`CORS_ORIGIN` 环境变量。SQLite 使用单实例和持久化目录，不要将同一数据库挂给多个并行实例。首版未绑定线上主机或域名；长期运营还需账号、备份、监控及更完善的限流方案。

## 原生安装包

已提供 `app.json` 和 `eas.json`，包名为 `com.kayceeiii.chidiansha`。在你自己的 Expo 账号下关联项目后：

```sh
pnpm dlx eas-cli login
pnpm dlx eas-cli build:configure
pnpm dlx eas-cli build --platform android --profile preview
pnpm dlx eas-cli build --platform ios --profile production
```

Android preview 生成 APK；iOS 分发需要 Apple 开发者账号与签名配置。正式发布前还需设置图标、启动图、隐私政策、线上 API 地址，并验证真机相册及后台恢复。**代码导出成功不等于已生成安装包。**

参考：[Expo 创建项目](https://docs.expo.dev/get-started/create-a-project/)、[相册组件](https://docs.expo.dev/versions/latest/sdk/imagepicker/)、[EAS 构建](https://docs.expo.dev/build/setup/)。

## 验证

```sh
pnpm typecheck
pnpm test
pnpm export
```

- 8 个领域测试：单位合并、采购/消耗、先到期先消耗、库存不足原子失败、重复餐次、忌口/推荐、过期库存、日期。
- 3 个服务测试：独立客户端并发点菜/取消/退出/重入、重启持久化、输入与访问校验。
- Android / iOS Hermes JavaScript bundle 和 Web bundle 导出。
- 浏览器验收：390px 手机布局；3 份番茄炒蛋缺 50g → 采购补齐 → 用餐扣库 → 重载后三餐保留；连接服务创建房间、点菜与排序。
- 原生系统相册、实际 Android/iOS 安装和应用商店上架尚未验收。未接入推送通知。

## 数据与计算边界

- 个人数据使用 AsyncStorage；照片存于本机应用文档目录。没有个人账号云同步，卸载可能丢失数据。
- 推荐是本地规则，不调用大模型、不联网抓取菜谱。食材需使用一致名称；「番茄」与「西红柿」暂不自动合并，g 与「个」不擅自换算。
- 只统计菜谱中录入的食材；盐油等调料可自行添加。忌口只匹配已录入的名称。
- 用餐按当前库存扣减（包括补记），优先较早到期批次；不足时整次操作不生效，也可仅记录用餐。
- 排行榜导入会替换待采购计划；前三道有票菜默认各 1 份，请按人数调整。

## 目录

```text
App.tsx             五个主页面、操作流程与持久化
src/domain.ts       采购、库存、消耗与推荐规则
src/forms.tsx       相册餐盘与库存表单
src/together.tsx    多人房间与同步
src/ui.tsx          餐盘组件与视觉样式
src/seed.ts         示例菜单
server/             SQLite 饭局服务及测试
tests/              领域测试
scripts/preview.mjs 本机静态界面预览
```
