# AGENTS.md

给 AI 编码助手和人类维护者的工作说明。**先读这一页再动代码。**

## 项目概览

纯前端的移动端记账 PWA。没有服务端、没有账号、没有网络请求——所有数据保存在浏览器 `localStorage`。用户的数据只有这一份，所以**任何会丢数据的改动都是最高优先级问题**。

技术栈：React 19 + TypeScript + Vite 8 + vite-plugin-pwa，零 UI 库、零图表库（图标和图表全部自绘 SVG），CSS 手写。

## 常用命令

```bash
npm run dev        # 本地开发 http://localhost:5173
npm run typecheck  # tsc -b（覆盖 src + 三个 config 文件）
npm run lint       # oxlint
npm test           # vitest run
npm run test:watch # 监听模式
npm run build      # 类型检查 + 产出 dist/（PWA）
npm run build:mobile  # 产出单文件 HTML，供 Expo WebView 壳使用
```

**提交前四项必须全过：`typecheck` / `lint` / `test` / `build`。** 不要只看 `build` 通过就宣布完成——`build` 不跑测试。

## 目录结构

```
src/
├── types.ts         数据模型（Transaction / Account / Budget / RecurringRule / DebtPlan …）
├── stats.ts         所有纯计算：汇总、趋势、资产负债、预算、热力图、固定支出、周期日期、还款预测
├── storage.ts       种子数据、normalizeData 校验迁移、CSV/JSON 导出
├── persistence.ts   localStorage 写入节流（防抖 + 退出前落盘）
├── store.tsx        全局 AppData + 增删改操作 + 周期账单到期处理
├── insights.ts      连续记账、成就徽章、月度小结文案
├── utils.ts         金额/日期格式化、haptic
├── ui.tsx           弹层基座（Sheet / Dialog）、Toast、Confirm、MonthSwitcher 等
├── icons.tsx        SVG 线性图标组件
├── icon-set.ts      图标名与旧 emoji 迁移映射
├── App.tsx          页面切换与弹层状态
├── styles.css       设计系统与基础样式
├── v2.css           在 styles.css 之后加载的覆盖层
└── components/      页面与业务组件（Stats 只做外壳，FlowView 是收支视图）
```

## 核心约束

### 1. 金额一律用整数「分」

存储、计算、比较全部用整数分。**任何地方都不要用浮点做金额运算**，展示时才经 `utils.ts` 的 `formatMoney` / `yuan` / `smartYuan` 转成字符串。新写的计算函数同理。

### 2. 四种流水类型，语义不能混

| type | 计入收支统计 | 对余额的影响 |
| --- | --- | --- |
| `expense` | 是 | 账户减 |
| `income` | 是 | 账户加 |
| `transfer` | **否** | 转出减、转入（`toAccountId`）加 |
| `adjust` | **否** | 账户加（金额可为负） |

早期版本把转账当收支记账，导致净资产算错。**新增任何汇总逻辑时，显式过滤类型**，不要假设 `transactions` 里全是收支。判断收支用 `isMoneyTx()`。

### 3. 绝不能静默吞掉用户数据

这是本项目的红线：

- `loadData()` 遇到损坏数据会抛 `DataCorruptedError`，此时 `store.tsx` 进入**只读保护模式**并停止回写，同时把原文备份到 `jizhang.data.v1.corrupt`（即 `${STORAGE_KEY}.corrupt`）。不要改回"catch 住返回空账本"——那会让下一次自动保存覆盖掉用户唯一的数据。
- `saveData()` 返回 `boolean`，写入失败（配额满）必须让用户看到提示，不要忽略返回值。
- 清空/覆盖类操作（`clearTransactions` / `resetAll` / `replaceData`）都要经过 `confirm` 二次确认。

### 4. 性能：不要写 O(账户数 × 账单数)

`accountBalance` / `accountBalanceAt` 是逐账户扫全表的，只适合单账户场景。需要全账户余额时用 `balanceMap(txs, accounts, cutoff)`——一次遍历。同理，预算列表要用 `spentByCategory()` 的出结果复用，不要每行调一次 `spentFor`。

历史上 `Balance` 视图因为嵌套调用付出了 8×A×N 的代价。

### 5. 弹层必须有可访问名称

`Sheet` / `Dialog` 已经内置焦点陷阱（打开移入焦点、Tab 循环、关闭归还焦点）。新弹层注意：

- 有 `title` 时自动用 `aria-labelledby` 关联；
- **没有可见标题时必须传 `label`**，否则读屏只会念"对话框"。`QuickAdd` 和 `Recap` 就是这种用法。

## 容易踩的坑

### 文件编码：不要用 PowerShell 改源码

所有源文件是 **UTF-8**。用 `Set-Content` / `-replace` 之类的 PowerShell 文本操作改文件，**会把中文破坏成乱码**（实测踩过 `ui.tsx`）。改源码请用编辑工具；批量重命名/查看可以用 shell，但写入内容不行。

### CSS 有两层，注意特异性

`main.tsx` 先 import `styles.css` 再 import `v2.css`，**同特异性时 v2 胜出**。改样式前先 grep 两个文件里有没有同名选择器：

- 曾经有 `.chip--nowrap`（CSS）和 `chips--nowrap`（JSX）拼写不一致，导致不换行规则从未生效；
- 曾经有小屏 `@media` 规则因特异性低于 `v2.css` 的基础规则而永远不生效。

要让覆盖生效，选择器特异性必须 ≥ 被覆盖的那条。

### 周期账单的「锚定日」

每月 31 号的规则推进到 2 月会变成 28 号。`RecurringRule.anchorDay` 记录用户选的"每月几号"，`nextRecurringDate()` 用它推算，避免 3 月被永久改成 28 号。**改周期逻辑时不要丢掉 `anchorDay`。**

### 周期账单的幂等键

自动入账用 `sourceRuleId + date` 判重（存在 `Transaction.sourceRuleId`）。不要改回用「分类+账户+金额+日期」做键——两条参数相同的不同规则会互相吞掉，账单少记但 `nextDate` 照常推进。

## 测试

Vitest。默认 `environment: 'node'`（纯函数测试很快），**需要 DOM 的测试在文件第一行加**：

```ts
// @vitest-environment jsdom
```

`src/test-setup.ts` 已提供 `matchMedia` 桩和 `cleanup`，不用重复写。

已有覆盖：`stats.test.ts`（金额/日期/边界）、`storage.test.ts`（校验迁移/CSV/损坏保护）、`persistence.test.ts`（防抖与落盘）、`ui.dom.test.tsx`（焦点陷阱/无障碍）、`quickadd.dom.test.tsx`（归档分类保留）、`stats-page.dom.test.tsx`（统计页渲染）。

写回归测试时，**先验证它能抓住 bug**：把修复临时改回去，确认测试红，再恢复。否则你可能写了个永远为真的断言。

## 其它约定

- 金额边界、日期边界（月末、闰年 2/29、跨年）是历史 bug 高发区，改这块务必补测试。
- 中文文案是产品的一部分（月度小结、成就描述都是刻意的情绪化表达），不要"顺手"改成中性措辞。
- `mobile-shell/` 是独立的 Expo 仓库，已被 `.gitignore` 排除，主仓库只保留构建脚本。
- 部署：推到 `main` 后 GitHub Actions 用 `BASE_PATH=/jizhang-app/` 构建并发布到 GitHub Pages。
- 界面里没有 toast 之外的通知渠道，不要引入新的全局提示体系。
