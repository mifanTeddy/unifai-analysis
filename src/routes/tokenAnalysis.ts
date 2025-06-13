import { Router, Request, Response } from "express";
import OpenAI from "openai";
import { HttpsProxyAgent } from "https-proxy-agent";
import { unifaiService } from "../services/unifai";
import { logger } from "../utils/logger";
import { dbService } from "../services/database";
import {uuidv4} from "zod/v4";
import path from "path";
import fs from "fs";

const router: Router = Router();

/**
 * 加密货币代币分析 Agent
 * 严格按照 unifai SDK 文档和 use_tools.ts 示例实现
 */
async function runCryptoTokenAnalysis(
  msg: string,
  options: {
    staticToolkits?: string[],
    staticActions?: string[]
  } = {}
) {
  const { staticToolkits, staticActions } = options;

  // 配置代理
  const proxyAgent = new HttpsProxyAgent(process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "");

  const apiKey = process.env.OPENROUTER_API_KEY || 'sk-or-v1-dummy-key';

  // 检测 API 密钥格式
  let openai: OpenAI;
  if (apiKey.startsWith('sk-ant-')) {
    // 如果是 Anthropic 格式的密钥，直接调用 Anthropic API
    logger.info("🔑 检测到 Anthropic API 密钥，使用 Anthropic API");
    openai = new OpenAI({
      apiKey: apiKey,
      baseURL: "https://api.anthropic.com/v1",
      httpAgent: proxyAgent,
      defaultHeaders: {
        'anthropic-version': '2023-06-01',
      },
    });
  } else {
    // 使用 OpenRouter
    logger.info("🔑 使用 OpenRouter API");
    openai = new OpenAI({
      apiKey: apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      httpAgent: proxyAgent,
    });
  }

  // 系统提示词 - 专门用于加密货币代币分析
  const systemPrompt = `
You are a specialized AI assistant for comprehensive cryptocurrency token analysis.
Your task is to perform multi-dimensional analysis of cryptocurrency tokens (like BTC, ETH, BNB, etc.) using available tools.

When analyzing crypto tokens, you should:
1. Search for relevant cryptocurrency market data and analysis tools
2. Gather real-time price data, trading volume, and market capitalization
3. Analyze historical price trends, patterns, and technical indicators
4. Examine tokenomics: total supply, circulating supply, inflation rate
5. Assess market sentiment, social media buzz, and community activity
6. Provide insights on fundamental analysis: use cases, partnerships, development activity
7. Generate comprehensive reports with charts and visualizations when possible
8. Compare with similar tokens in the same category/sector

Always use tools to gather current data rather than relying on potentially outdated information.
Format your final response as a comprehensive HTML report with charts, tables, and detailed analysis.
Focus on actionable insights for investors and traders.
`;

  const messages: any[] = [
    { content: systemPrompt, role: 'system' },
    { content: msg, role: 'user' },
  ];

  // 获取可用工具 - 优先使用动态工具发现
  const availableTools = await unifaiService.getTools({
    dynamicTools: true,
    staticToolkits,
    staticActions,
  });

  logger.info("🔧 获取到的加密货币分析工具数量:", availableTools.length);

  // 工具调用循环 - 按照 use_tools.ts 的模式
  while (true) {
    // 转换模型名称（如果直接调用 Anthropic API）
    let actualModel = 'anthropic/claude-3-7-sonnet-20250219';
    if (apiKey.startsWith('sk-ant-')) {
      actualModel = 'claude-3-7-sonnet-20250219';
      logger.info("🔄 转换模型名称", { original: 'anthropic/claude-3-7-sonnet-20250219', actual: actualModel });
    }

    const response = await openai.chat.completions.create({
      model: actualModel,
      messages,
      tools: availableTools,
    });

    const message = response.choices[0].message;

    if (message.content) {
      logger.info("🤖 LLM 响应:", message.content.substring(0, 200) + "...");
    }

    messages.push(message);

    // 如果没有工具调用，结束循环
    if (!message.tool_calls || message.tool_calls.length === 0) {
      break;
    }

    logger.info(
      '🛠️ 调用加密货币分析工具:',
      message.tool_calls?.map(
        toolCall => `${toolCall.function.name}(${toolCall.function.arguments})`
      )
    );

    // 调用工具并获取结果
    const results = await unifaiService.callTools(message.tool_calls);

    if (results.length === 0) {
      break;
    }

    // 将工具调用结果添加到对话中
    messages.push(...results);
  }

  // 返回最后的 LLM 响应
  return messages[messages.length - 1]?.content || "加密货币代币分析完成，但未生成内容";
}

/**
 * 加密货币代币多维度分析接口
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { query, staticToolkits, staticActions } = req.body;

    if (!query) {
      return res.status(400).json({
        error: "查询参数不能为空"
      });
    }

    logger.info("🚀 开始加密货币代币分析", {
      query: query.substring(0, 100),
      staticToolkits,
      staticActions
    });

    // 运行分析
    const result = await runCryptoTokenAnalysis(query, {
      staticToolkits,
      staticActions
    });

    // 记录分析请求到数据库
    await dbService.createRequest({
      id: `crypto-token-analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: req.headers['user-id'] as string || 'anonymous',
      model: 'anthropic/claude-3-7-sonnet-20250219',
      messages: JSON.stringify([{ role: 'user', content: query }]),
      stream: false,
    });

    const fileName = `analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.html`;
    const filePath = path.join(__dirname, '../../public', fileName);

    const completeHtml = `
<!DOCTYPE html>
<html lang="zh">
    ${result}
</html>`.trim();

    fs.writeFile(filePath, completeHtml, (err) => {
        if (err) {
            logger.error("写入静态页面失败:", err);
            return res.status(500).json({
            error: "生成静态页面失败",
            details: err.message
            });
        }
        logger.info("静态页面生成成功:", filePath);
    });

    const publicUrl = `${req.protocol}://${req.get('host')}/public/${fileName}`;

    res.json({
      success: true,
      url:publicUrl,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error("加密货币代币分析失败:", error);
    res.status(500).json({
      error: "分析过程中发生错误",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * 获取可用的加密货币代币分析工具
 */
router.get('/tools', async (req: Request, res: Response) => {
  try {
    const { staticToolkits, staticActions } = req.query;

    const tools = await unifaiService.getTools({
      dynamicTools: true,
      staticToolkits: staticToolkits ? String(staticToolkits).split(',') : undefined,
      staticActions: staticActions ? String(staticActions).split(',') : undefined,
    });

    res.json({
      success: true,
      tools: tools.map(tool => ({
        name: tool.function?.name || tool.name,
        description: tool.function?.description || tool.description,
        type: tool.type || 'function'
      })),
      count: tools.length
    });

  } catch (error) {
    logger.error("获取加密货币分析工具列表失败:", error);
    res.status(500).json({
      error: "获取工具列表失败",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
