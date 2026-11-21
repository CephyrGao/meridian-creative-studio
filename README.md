# 经纬创意 · Meridian Creative Studio

**0.8.0-beta.1 · 公开测试版**　｜　[查看 Agent 案例](https://cephyrgao.github.io/meridian-creative-studio/)　｜　[下载测试版](https://github.com/CephyrGao/meridian-creative-studio/releases/tag/v0.8.0-beta.1)

给做出海营销的团队和个人使用的本地 Agent 工作台。从一份产品 Brief 开始，按市场和平台准备广告创意，复核文案与证据，再用投放数据决定下一轮要验证的问题。

### 先看一次完整产出

[Folda Go · 早班咖啡](https://cephyrgao.github.io/meridian-creative-studio/) 展示一条印尼 TikTok 素材。依次翻看 Brief、印尼语分镜、复核记录和下一轮 A/B 实验。案例使用内置教学数据，展示页完全静态，浏览时无需账号或 API Key。

### 在本地使用

| 入口 | 打开方式 |
| --- | --- |
| Windows x64 | 从此版本的发布页下载 `Meridian-Studio.exe`，双击运行。桌面界面使用 Microsoft Edge WebView2 Runtime。 |
| Windows、macOS、Linux | 解压 `Meridian-Creative-Studio.zip`，准备 Node.js 22 或更高版本。在解压目录运行 `node local.mjs` 并打开终端显示的网址，Windows 也可以双击 `Start-Workbench.cmd`。 |
| 从源码启动 | 在仓库根目录依次执行 `node scripts/build.mjs` 和 `node scripts/local.mjs --open`。 |

### 在工作台里做什么

- **营销流程**　按产品事实和市场生成创意方向、目标语言文案和 15 秒分镜。创意经过规则、模型与人工复核，可将投放 CSV 转换为同组比较和下一轮实验 Brief。
- **项目资料**　按工作区管理文件、记忆和定时任务，读取 Word、Excel、文字层 PDF，搜索或摘录网页。
- **Agent 设置**　集中配置模型与搜索 API、本地目录、技能，以及双向 MCP。支持 stdio、Streamable HTTP 和兼容旧服务的 HTTP + SSE。
- **运行记录**　查看项目的更新时间、模型用量、预算和错误日志，可展开请求与响应，以及导出备份。

### 构建与校验

适用于 Node.js 22 及以上。在仓库根目录运行：

```sh
node scripts/build.mjs
node scripts/validate-artifact.mjs
node scripts/check-agent.mjs
node scripts/check-chat.mjs
node scripts/check-mcp.mjs
node scripts/check-diagnostics.mjs
node scripts/check-workflow.mjs
```

`docs/index.html` 可直接离线打开，也是 GitHub Pages 的发布文件。测试案例中的访谈、创意和投放指标均为模拟数据。操作步骤与桌面构建参数见[使用说明](scripts/使用说明.md)和[构建脚本](scripts/build-desktop.mjs)。第三方组件说明见[依赖说明](THIRD-PARTY-NOTICES.md)。
