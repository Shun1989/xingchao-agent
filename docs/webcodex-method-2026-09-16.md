# 文章中的 WebCodex 方法：原理与 Windows 落地

核对日期：2026-09-16。来源为用户提供的《文章.pdf》、WebCodex 项目文档和 OpenAI 官方隧道文档。本次完成的是方法核对，没有安装 WebCodex、创建隧道或更改账号设置。

## 结论

这是“让 ChatGPT 网页调用本地开发工具”，不是把网页额度转换成 Codex/API 额度。文章标题中的“几乎无限”和“不加钱”不能作为额度或计费承诺；本文不承诺任何套餐均可使用，需以账号实际开发者模式、工作区权限及当时服务条款为准。

调用路径：

```text
ChatGPT 网页中的模型
  → MCP 工具调用 / OpenAI Secure Tunnel
  → 本机 WebCodex Server
  → 本机 Runner
  → 指定项目的文件、Git、命令与测试
```

WebCodex 提供工具和执行环境，不提供模型本身。仓库仍在本机，但工具读取并返回的代码、命令输出会进入云端模型的上下文。“文件在本地”不等于“内容不会发送到云端”。[WebCodex 项目说明](https://github.com/yyjeqhc/webcodex)

## Windows 操作路径

1. 从 [WebCodex Releases](https://github.com/yyjeqhc/webcodex/releases) 安装 Windows x64 Desktop。
2. 在 [Platform Tunnels](https://platform.openai.com/settings/organization/tunnels) 创建隧道，关联正确的 Platform organization 和目标 ChatGPT workspace，保存 `tunnel_...` ID。创建/编辑需要 Tunnels Read + Manage；运行需要 Read + Use。ChatGPT 开发者模式是另一项独立权限。[官方隧道指南](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
3. 在 Platform 创建 Restricted runtime API key，仅赋予 Tunnels Read + Use。该密钥用于隧道，不是让 WebCodex 调用模型的推理密钥；不要把管理密钥用于长期运行的客户端。[官方权限说明](https://github.com/openai/tunnel-client/blob/master/docs/permissions.md)
4. WebCodex Desktop 中保存 Tunnel ID 和 runtime key；选择 Local Full Runtime，并指定本项目目录 `C:\Users\guoyu\Documents\ChatGPT\海贼王主题Agent`。确认 Service、Runner、Project 就绪，再启动 OpenAI Secure Tunnel。
5. 在 ChatGPT 创建开发者模式应用，连接方式选 Tunnel，填隧道 ID。此 WebCodex 官方隧道路线上 Authentication 选 None：本地隧道客户端负责注入 MCP 凭据，并非把普通公网服务设为无认证。不要把 runtime key 填到 ChatGPT 对话里。[Desktop 配置说明](https://github.com/yyjeqhc/webcodex/blob/main/docs/desktop-install.md)
6. 新对话启用 WebCodex，先验收读取、写入与命令执行。只有本地状态灯变绿，不代表 ChatGPT 已连通。

可用以下验收请求：

> 列出 WebCodex 项目并确认所选根目录；读取项目 AGENTS.md 和 package.json；运行 git status --short。然后在该项目创建一个唯一命名的临时文本文件，读回内容并删除，只报告实际工具输出，不修改现有文件。

若入口或隧道不可见，先核对账号的开发者模式、workspace 关联和 Tunnels Use 权限。连接超时再检查 Desktop 的代理设置及 Activity，不扩大项目目录权限。

## 与当前项目的关系

适合先作为项目外部的开发入口：ChatGPT 用 WebCodex 帮忙读代码、改代码和跑测试。

不建议直接把它当作 Wanta 内的“免费模型 provider”。当前项目的 BYOA 边界是 AgentAdapter 的输入、事件、生命周期和能力声明；WebCodex 的 MCP 工具服务不是同一种接口。若要让外部 ChatGPT 操作产品内的 Mission，应另行设计限定能力的 MCP 服务，而不是将网页登录态接成模型 API。此项未在本次实现，也不影响当前 Mission 恢复流程修复。

项目内参考：[Agent adapter contract](ai/agent-adapter.md)。
