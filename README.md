# DeepSeek Peak Pricing Status

**简体中文** | [English](README.en.md)

为 **DeepSeek Harness（DSH）** 添加一个轻量峰谷时段指示器：圆点位于输入框右下角、模型选择器左侧，不修改原模型选择器。

> 非官方社区插件。提示由本地时间与维护的日历计算，不读取账单，也不保证实际计费价格；请以提供方最新规则为准。

## 功能

- 淡绿：空闲时段；淡红：高峰时段。
- 鼠标悬停或键盘聚焦，显示当前阶段、北京时间、判定依据、高峰窗口、下一次切换倒计时和当前模型。
- 每 30 秒重新计算一次，边界处最多有约 30 秒延迟。
- 仅对提供方 ID 为 `deepseek-account`、`deepseek-official`、`deepseek` 的选择显示；未知提供方和第三方路由隐藏。不会仅凭模型名称包含 DeepSeek 就显示。
- 通过 `modelSelection` 投影订阅模型变化，通过 `conversation.input.right` 加法插槽显示，不替换模型选择器。
- 无额外 npm 运行时依赖，无打包步骤；React 由 DSH 客户端提供。

## 兼容性

在 macOS 上的 DeepSeek Harness `0.2.0-rc.2` 环境开发。依赖该版本的客户端插件、Session 投影和插槽 API；其他版本尚未验证。提供方 ID 为显式白名单，不验证自定义提供方背后的实际请求地址。

## 安装

### 通过 DSH 插件页面安装（bundle）

1. 打开 DSH 侧边栏的 **插件** 页面，进入安装入口。
2. 输入本仓库的 GitHub 地址：
   ```text
   https://github.com/UbiStaff/dsh-plugin-peak-pricing-status
   ```
3. 安装并启用 bundle，按界面提示重启应用与宿主。
4. 选择官方 DeepSeek 提供方，检查圆点及模型切换。

包内的 [cordis.patch.yml](cordis.patch.yml) 自动添加插件条目，无需手工写 profile 补丁。需要网络能够访问 GitHub，并且 DSH 版本支持 bundle 安装。**本版已验证 bundle 声明及打包结构；真实 DSH 安装、启用、卸载与圆点显示尚未完成端到端验证。**

### 从旧版手动安装迁移

先备份 profile 配置，移除旧的 `peak-pricing-status` 手动 `insert` 条目，再通过插件页面安装。不要同时加载手动副本与 bundle，否则可能出现重复 ID 或插槽冲突。保留其他配置不变。

### 手动安装（备用）

下载整个仓库到当前 profile 的 `plugins/peak-pricing-status/`，将 [手动补丁示例](examples/cordis.patch.example.yml) 追加到现有 profile 补丁列表，然后重启应用与宿主。macOS Desktop 常见 profile 为 `~/.dsh/profiles/desktop/`。无需 `npm install`，不要覆盖原配置。

此包不含账户配置、API Key、个人 profile 或 DSH 本体。

## 日历和时间规则

当前实现使用固定北京时间（UTC+8）：

- 工作日高峰：09:00–12:00、14:00–18:00，区间右端不包含。
- 已登记的放假日全天为空闲。
- 已登记的调休上班日按工作日处理，包括周六和周日。
- 其余周末为空闲。

包含 [2026 年日历](peak-calendar.json)，来源链接记录在该文件中。每年公布放假安排后，在 `schedules` 中增加新年份的 `holidays`、`makeupWorkdays` 和来源信息。缺失年份会退回普通周一至周五规则，**不能准确排除该年的节假日**，提示中会说明回退状态。

修改日历或客户端脚本后刷新页面；修改插件装载配置后需重启宿主。参考价格规则：[DeepSeek 模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)。规则可能变化，请自行维护；插件不是实时价格查询服务。

## 开发与测试

建议使用 Node.js 22 或更高版本，在仓库根目录执行：

```sh
npm test
```

测试包括：

- 21 个时段案例、跨日/节假日/调休边界与下一次切换计算。
- 客户端与纯算法模块在 190 个时间点的结果一致性。
- 插槽注册、延迟服务、样式安装与卸载、模型投影注入及提供方显示限制。

主要文件：

| 文件 | 用途 |
| --- | --- |
| [lib/client.js](lib/client.js) | 手写经典脚本，注册客户端组件并计算展示状态 |
| [lib/index.js](lib/index.js) | 宿主侧读取日历并报告诊断信息 |
| [lib/peak-window.js](lib/peak-window.js) | 独立时段算法 |
| [peak-calendar.json](peak-calendar.json) | 年度节假日与调休表 |

客户端不能直接导入本地算法模块，因此算法有两份实现；修改时运行全部测试，保持一致。自动化测试不是完整浏览器端到端测试，发布前仍应手动检查位置、悬停、颜色和模型切换。

## 卸载

通过插件页面安装的 bundle：在同一页面禁用或卸载，并按提示重启。手动安装：移除对应的 `insert` 条目，保留其他配置，然后重启。
