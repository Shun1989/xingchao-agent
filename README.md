<div align="center">
  <img src="resources/branding/xingchao-logo.svg" width="112" alt="星潮航局标志" />
  <h1>星潮航局 · Xingchao Navigation</h1>
  <p><strong>本地优先、会交付真实文件的多 Agent 桌面工作台</strong></p>
  <p>原创航海世界观 · 动态团队主题 · Windows / macOS · 自带模型接入</p>
</div>

> 当前状态：本地可交付的完整皮肤首版。十个原创航海团、六十名 Agent、航海图、全局皮肤运行时与补给包管理器已经进入代码；十支舰队均具备独立背景、前景、材质、纹章和舰长呈现，并通过本地视觉与桌面验收。舰长采用高品质分层动态效果并联动语音状态；预留 Live2D 接口，当前不是 Live2D。完整五层记忆、签名和公开发行仍未完成。

## 它解决什么问题

多数 Agent 产品只给出一段建议。星潮航局的目标是让一个女性总助理“澜汐”理解目标、推荐团队、组织分工、申请敏感权限、操作真实工具，并交付可直接打开的文档、表格、代码、图片或项目文件。

这不是角色扮演聊天软件。航海叙事负责辨识度和决策风格，专业能力、工具权限、事实核验与交付标准保持独立、可审计。

## 当前能力

- **澜汐总助理**：面向用户的唯一主控人格，负责目标澄清、选团建议、协调和最终复核。
- **十团六十人**：战略调研、写作传播、品牌设计、软件研发、数据财务、项目行政、法务风险、学习知识、多媒体和生活旅行。
- **航海图**：生成任务 DAG，选择一个主团和最多两个支援团。确认后由主进程登记一次任务运行、绑定实际执行轮次并派发到 Agent 内核；完成、失败与停止可追踪，重启后未决运行标为阻塞。运行历史支持返回原对话、确认后创建新尝试，以及只修复失败的结果写入。当前整张图仍按一次 Agent 任务执行，尚未实现逐节点调度。
- **完整换肤**：主团切换时，以一次原子提交同步切换颜色、材质、背景、前景、导航装饰、纹章和舰长舞台；失败会回滚到上一套完整皮肤，支援团只提供辅助色。
- **自适应常驻舰长**：澜汐按窗口和页面自适应为舞台、伴随或紧凑模式；默认静音、显式启用语音、关键事件播报、一键静音且字幕常驻。当前为高品质分层动态效果，并保留 Live2D 渲染器接口。
- **真实执行**：继承成熟的本地文件、终端、集成浏览器、审批、MCP/OpenConnector、Skills 和产物预览链路。
- **自带模型**：支持用户配置 OpenAI-compatible 模型；API Key 由 Electron `safeStorage` 加密，渲染层无法读取。无法由当前操作系统账户解锁的旧密文会明确标为不可用，用户可重新输入 Key 替换或删除该模型，不会被误报为已配置。
- **补给仓**：导入、列出、选用和移除声明式内容包。主进程执行版本、路径、类型、大小、符号链接、冲突路径和 SHA-256 检查，使用暂存目录原子安装，并在系统确认后持久化每个包唯一的选用版本。通过运行时投影后，已选用包的团队、六人编制、路由信号、任务规划和调色板主题会进入舰队与航海图。

## 产品结构

```mermaid
flowchart LR
  U["用户"] --> L["澜汐总助理"]
  L --> R["团队推荐与用户确认"]
  R --> C["主团船长"]
  C --> D["任务 DAG"]
  D --> A1["主团船员"]
  D --> A2["支援团船长与船员"]
  A1 --> K["OpenCode Agent Engine"]
  A2 --> K
  K --> T["本地工具 / 浏览器 / MCP / Skills"]
  T --> O["真实产物与执行日志"]
  O --> L
  L --> U
```

桌面端保持严格进程边界：Electron 主进程掌管凭据、文件选择、内容包、进程和高风险确认；React 渲染层只消费服务契约和事件，不直接读取密钥或任意文件。Agent 核心使用固定版本的 `opencode-ai@1.18.10`，通过 HTTP + SSE 运行在 loopback-only sidecar 中。

## 十个原创航海团

| 航海团 | 能力域     | 主题色          |
| ------ | ---------- | --------------- |
| 望潮团 | 战略与调研 | 深海蓝 × 铜     |
| 墨帆团 | 写作与传播 | 酒红 × 纸白     |
| 绮港团 | 品牌与设计 | 孔雀青 × 珊瑚   |
| 铸舟团 | 软件研发   | 午夜蓝 × 电光青 |
| 金秤团 | 数据与财务 | 祖母绿 × 金     |
| 舵序团 | 项目与行政 | 岩灰 × 琥珀     |
| 铁律团 | 法务与风险 | 暗红 × 象牙     |
| 灯塔团 | 学习与知识 | 靛蓝 × 烛金     |
| 幻浪团 | 多媒体制作 | 紫罗兰 × 洋红   |
| 栖湾团 | 生活与旅行 | 海沫绿 × 晨橙   |

公开内容全部使用原创姓名、外观和经历。仓库不分发任何第三方作品的角色姓名、头像、台词、服装或标志性美术；私人内容可通过本地补给包导入。

## 本地开发

### 前置条件

- Node.js `>=22.22.2`
- Corepack
- Git
- Windows 11，或当前受支持的 macOS

```bash
git clone https://github.com/Shun1989/xingchao-agent.git
cd xingchao-agent
corepack pnpm run bootstrap
corepack pnpm run dev:worktree
```

首次启动需要配置一个兼容模型。项目不会内置或默认选中付费模型供应商。

### 质量门禁

```bash
corepack pnpm run ts-check
corepack pnpm run lint
corepack pnpm run format
corepack pnpm test
corepack pnpm run smoke:model-credentials
corepack pnpm run visual:test
corepack pnpm run e2e:fleet-skins
corepack pnpm run build
```

当前 Windows 工作区已通过完整测试、50 张视觉基线和 Electron 端到端门禁；边界测试使用 Windows 原生连接与文件模式语义，不要求管理员开发者模式。`smoke:model-credentials` 会使用自动清理的临时用户目录和虚拟 Key 启动两次真实 Electron，验收不可解密密文的识别、替换与删除，不读取现有用户数据，也不发出模型请求。签名安装包和跨平台发布仍需独立验证。星潮航局测试不得依赖真实 API Key、付费模型或联网服务。

## 补给包格式

补给包是 `.xcp` 或 `.zip` 归档，根目录必须包含 `manifest.json`。清单声明包版本、最低应用版本、公开/私人属性、航海团、角色、主题和所有资产的 SHA-256；`executableCode` 必须为 `false`。

当前补给仓负责安全安装、版本选用和管理。选用与运行时激活是两个不同状态：只有通过主进程校验与安全投影的已选用版本，才会把团队、六人编制、路由信号、任务规划和调色板主题接入舰队与航海图；投影失败时会回退到可信内置舰队，而不会保留部分导入内容。

补给包中的安装路径、任意资产、声音、Skills、完整 persona、工具声明以及系统提示词 roster 注入仍未激活。调色板可用不代表会从包路径加载纹理、立绘或 Live2D 文件，也不会改变实际工具或权限。版本化 Schema 位于 [`schemas/content-pack-manifest.v1.schema.json`](schemas/content-pack-manifest.v1.schema.json)。

## 路线图

- 为补给包路径、任意资产、声音、Skills、完整 persona、工具声明和系统提示词 roster 注入分别设计安全激活边界。
- 完成模型/语音能力探测、STT/TTS 适配器与本地 `whisper.cpp` 可选下载。
- 任务记录已支持持续保留、完整 JSON 导出和损坏文件备份恢复；接近容量上限时会提示，不会自动删除。后续补齐归档轮换，再建立逐节点的多 Agent DAG 调度。
- 迁移到 SQLite/FTS，完成五层记忆的查看、编辑、删除、导出和关闭自动提取。
- 接入原创 Cubism 模型、八态动作、实时口型和十套主题饰品层。
- 完成 Windows/macOS 安装包、签名、公证、升级与发行审计。

真实进度与未完成项见 [`docs/implementation-status.md`](docs/implementation-status.md)，研究来源见 [`docs/research-baseline.md`](docs/research-baseline.md) 与 [`docs/research-watch.md`](docs/research-watch.md)。

## 上游与许可证

星潮航局以 [OOMOL Wanta](https://github.com/oomol-lab/wanta) 的 Apache-2.0 桌面基础为工程起点，并保留原始许可证、NOTICE、商标说明和第三方声明。Agent Engine: OpenCode，固定为 `opencode-ai@1.18.10`。完整归属见 [`NOTICE`](NOTICE)、[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) 和 [`TRADEMARKS.md`](TRADEMARKS.md)。

本仓库代码依据 [Apache License 2.0](LICENSE) 发布。
