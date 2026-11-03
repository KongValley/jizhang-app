# 设计说明

记录这个 App 在交互、数据和视觉上的关键取舍，方便后续维护时理解「为什么这么做」。

## 1. 数据模型要点

金额一律用**整数分**存储，避免浮点误差；所有展示都走 `utils.ts` 的格式化函数。

`Transaction.type` 有四种：

| 类型 | 含义 | 计入收支 | 影响余额 |
| --- | --- | --- | --- |
| `expense` | 支出 | 是 | 减 |
| `income` | 收入 | 是 | 加 |
| `transfer` | 账户间转账 | **否** | 转出减、转入加 |
| `adjust` | 余额校准（可为负） | **否** | 加（负数为减） |

这是早期版本最大的坑：转账如果按收入/支出记账，净资产会算错；余额校准当初忘了带符号，导致「调减」反而加钱。现在 `stats.ts` 里所有汇总都显式过滤类型。

数据版本 `DATA_VERSION` 目前为 4。`normalizeData()` 在读取时补齐缺失字段，旧备份也能直接恢复；分类的 emoji 会自动迁移成 SVG 图标。

## 2. 资产负债与还款预测

- 净资产 = 总资产 − 总负债；资产账户余额为负（如透支）如实扣减。
- 负债账户欠款为正数口径存储（余额为负），溢缴则计入资产。
- 还款进度 = (起始本金 − 当前欠款) / 起始本金。
- 还清预测用等额本息公式：

  `n = ceil( ln( M / (M − P·r) ) / ln(1 + r) )`，`r = 年利率 / 12`

  `M ≤ P·r` 时判定「永远还不完」，界面直接提示月供不够，而不是给出一个荒谬的日期。

## 3. 成就与连续记账

- 连续天数：今天没记时从昨天往前数，避免白天打开 App 显示「断签」。
- 徽章进度用**历史最佳**（如最长连续天数）而不是当前值，已经达成的成就不会因为断签被收回。
- 已解锁的徽章写入 `settings.seenBadges`，只弹一次庆祝。

## 4. 布局与溢出（重要）

App 里有多处横向滚动条（账户筛选、快捷模板、记一笔模板）：`overflow-x: auto` + 隐藏滚动条 + `touch-action: pan-x`。桌面浏览器用鼠标看不出可以滑，所以需要滑动的地方避免把关键内容放在最右侧。

文本排版统一遵守：

- 单行信息一律 `white-space: nowrap` + `text-overflow: ellipsis`；
- flex 子项必须 `min-width: 0`，否则不会收缩；
- 分类名、标签、金额都限制最大宽度，长内容截断而不是换行——这样列表行高稳定，不会因为一条长备注把整屏撑开。

`styles.css` 的 `.tx__title`、`.tag--nowrap`、`.tx__amount.is-long` 都是为了这个目标加的。

## 5. 情绪化设计

记账本身反人性，所以加了三层反馈：

1. **当下**：问候语随时间变化、连续天数常驻、记录后轻震动（`haptic()`，iOS 静默忽略）。
2. **阶段**：15 枚徽章覆盖开始、数量、坚持、自律、财富、习惯，解锁时弹庆祝动画。
3. **回望**：月度小结用「稳稳的一个月 / 花得有点猛」这类标题，配一句不给压力的总结。

所有反馈都可以忽略，且不依赖网络或推送。

## 6. 部署形态

同一个前端有两种产物：

| 产物 | 命令 | 用途 |
| --- | --- | --- |
| `dist/` | `npm run build` | PWA：Service Worker + manifest，浏览器安装 |
| `dist-mobile/index.single.html` | `npm run build:mobile` | 单文件（JS/CSS 全内联），供 Expo WebView 壳使用 |

WebView 壳在 `mobile-shell/`，是独立的 Expo 项目（EAS 项目 `@chara1999/jizhang-app`）。

### 三条发布通道

| 改了什么 | 命令 | 用户端 |
| --- | --- | --- |
| 网页 UI / 逻辑 | `npm run build:mobile` 后 `eas update --branch preview`（正式用 `production`） | 下次冷启动生效，**不用重装** |
| 原生依赖 / 图标 / 权限 | `eas build --profile preview`（APK）或 `production`（AAB） | 覆盖安装 |
| PWA | push 到 `main` | GitHub Actions 发布 Pages |

`build:mobile` 会把主仓库 `package.json` 的版本号写进 `mobile-shell/app.json`，版本号只有一个来源；`versionCode` 交给 EAS 远程管理（`appVersionSource: "remote"`）。

OTA 按 `runtimeVersion` 匹配，策略是 `appVersion`：runtime 就等于 `app.json` 的 `version`。因此 **`version` 只在原生构建时递增，网页改动不 bump**——否则已装用户会收不到更新（新 runtime 没有对应的包）。`fingerprint` 策略在这里走不通：EAS 先 prebuild 再算指纹，本地没有 `android/`，两边必然不一致（实测构建失败）。

### 本地联调

```bash
npm run dev                       # 终端 1：主仓库 http://localhost:5173
cd mobile-shell && npx expo start  # 终端 2：壳
```

`App.tsx` 在 `__DEV__` 下不加载内联 HTML，而是用 Metro 的 `hostUri` 拼出 `http://<局域网 IP>:5173` 直接连开发服务器，改网页走 HMR。正式包 `__DEV__` 为 false，永远用内联的 `WEB_HTML`。

因为壳里没有服务器，`index.html` 里的 manifest / favicon 引用会被移除，Logo 也改成了内联 SVG 组件（`BrandMark.tsx`）。
