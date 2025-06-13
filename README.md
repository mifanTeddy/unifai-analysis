# 🚀 AI 加密货币代币分析服务

基于 UnifAI SDK 构建的 OpenAI 兼容聊天服务，专注于加密货币代币分析。

## 📋 项目实现

### 🎯 一：OpenAI 兼容的 Web 服务器
- ✅ **OpenAI 兼容接口**：完全兼容 `/v1/chat/completions` API
- ✅ **Claude 模型支持**：使用 Anthropic Claude 3.7 Sonnet
- ✅ **工具调用循环**：使用 UnifAI SDK 自动处理工具调用，直到没有工具调用为止
- ✅ **返回格式**：包含每次大模型输出和工具名（不包含参数和结果）
- ✅ **流式响应**：支持流式和非流式模式，实时返回部分内容
- ✅ **数据库记录**：记录用户请求、返回、Token 消耗到数据库
- ✅ **代理支持**：内置代理配置，支持中国大陆网络环境

### 🎯 二：加密货币代币分析工作流
- ✅ **UnifAI 工具集成**：使用 SDK 中的 use tools 示例实现
- ✅ **多维度分析**：对加密货币代币（如 BTC、ETH、BNB）进行深度分析
- ✅ **HTML 报告**：结果以 HTML 形式呈现，包含图表和详细分析

## 🛠️ 技术栈

- **运行时**：Node.js + TypeScript + pnpm
- **框架**：Express.js
- **AI SDK**：OpenAI SDK、UnifAI SDK
- **数据库**：内存数据库
- **代理支持**：https-proxy-agent

## 🚀 快速启动

### 1. 安装依赖
```bash
pnpm install
```

### 2. 配置环境变量
复制环境变量模板：
```bash
cp env.example .env
```

编辑 `.env` 文件，配置必要的 API 密钥：
```bash
# OpenRouter API 密钥（推荐）或 Anthropic API 密钥
OPENROUTER_API_KEY=sk-or-v1-xxx
# 或者直接使用 Anthropic API 密钥
# OPENROUTER_API_KEY=sk-ant-xxx

# UnifAI Agent API 密钥（必需）
UNIFAI_AGENT_API_KEY=xxx

# 服务器端口
PORT=3000
```

**重要说明**：
- 系统会自动检测 API 密钥格式：
  - `sk-or-v1-` 开头：使用 OpenRouter API
  - `sk-ant-` 开头：直接使用 Anthropic API
- 如需修改代理地址，请编辑 `src/routes/chat.ts` 和 `src/routes/tokenAnalysis.ts`

### 3. 启动服务
```bash
# 开发模式（推荐）
pnpm dev

# 或直接运行
pnpm tsx src/index.ts
```

服务启动后，访问 http://localhost:3000/health 检查服务状态。

### 4. 运行测试
```bash
# 运行集成测试（需要先启动服务）
npx tsx test-unifai.ts
```

## 📡 API 接口

### 一：OpenAI 兼容聊天接口

**基本聊天**：
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-3-7-sonnet-20250219",
    "messages": [
      {"role": "user", "content": "请帮我分析一下 BNB 代币的最新价格和市场表现"}
    ],
    "stream": false
  }'
```

**流式响应**：
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-3-7-sonnet-20250219",
    "messages": [
      {"role": "user", "content": "简单介绍一下以太坊 ETH 代币的技术特点"}
    ],
    "stream": true
  }'
```

**响应格式**：
```json
{
  "id": "req-xxx",
  "object": "chat.completion",
  "created": 1749793949,
  "model": "anthropic/claude-3-7-sonnet-20250219",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "分析结果...",
      "tool_calls": []
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 659,
    "completion_tokens": 109,
    "total_tokens": 768
  },
  "tools_used": ["search_services", "invoke_service"],
  "response_time_ms": 3306
}
```

### 二：加密货币代币分析接口

**获取可用分析工具**：
```bash
curl http://localhost:3000/v1/tokenAnalysis/tools
```

**执行代币分析**：
```bash
curl -X POST http://localhost:3000/v1/tokenAnalysis/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "query": "请分析 BNB 代币的多维度数据，包括价格走势、市值排名、交易量、技术指标等信息",
    "staticToolkits": ["crypto"],
    "staticActions": ["price_analysis"]
  }'
```

**分析响应格式**：
```json
{
  "success": true,
  "result": "<html>...详细的HTML分析报告...</html>",
  "timestamp": "2025-06-13T05:54:12.000Z"
}
```

### 健康检查
```bash
curl http://localhost:3000/health
```

## 🧪 测试说明

集成测试 `test-unifai.ts` 验证以下功能：

1. **环境配置检查**
   - API 密钥配置验证
   - 服务器状态检查

2. **UnifAI SDK 基础集成**
   - SDK 初始化
   - 工具获取（预期 2 个工具）

3. **功能测试一**
   - OpenAI 兼容接口
   - 工具调用循环
   - 流式响应
   - 数据库记录

4. **功能测试二**
   - 加密货币分析工具列表获取
   - BNB 代币分析执行
   - HTML 结果验证

**测试命令**：
```bash
# 确保服务器运行
pnpm dev

# 在新终端运行测试
npx tsx test-unifai.ts
```

**预期测试结果**：
```
🧪 开始集成测试 - 验证 design.md 要求的功能
============================================================
🔍 检查环境配置...
✅ 环境变量检查通过
🔍 检查服务器状态...
✅ 服务器运行正常

🔧 测试 UnifAI SDK 基础集成
✅ UnifAI SDK 初始化成功
✅ 获取到 2 个工具
✅ UnifAI SDK 集成验证通过

🎯 测试一：OpenAI 兼容的 web server
✅ OpenAI 兼容接口测试成功
✅ 流式模式测试通过

🎯 测试二：加密货币代币分析
✅ 获取工具成功
✅ 代币分析成功

🎉 所有集成测试通过！
```

## 📁 项目结构

```
src/
├── routes/
│   ├── chat.ts              # OpenAI 兼容接口
│   └── tokenAnalysis.ts     # 加密货币代币分析
├── services/
│   ├── unifai.ts           # UnifAI SDK 服务
│   └── database.ts         # 数据库服务
├── middleware/
│   └── errorHandler.ts     # 错误处理
├── utils/
│   └── logger.ts           # 日志工具
├── data-source.ts          # 内存数据库
└── index.ts               # 应用入口

test-unifai.ts              # 集成测试
env.example                  # 环境变量模板
```
