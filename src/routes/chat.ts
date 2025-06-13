import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";
import { HttpsProxyAgent } from "https-proxy-agent";
import { logger } from "../utils/logger";
import { dbService } from "../services/database";
import { unifaiService } from "../services/unifai";
import { AppError } from "../middleware/errorHandler";

const router: Router = Router();

/**
 * 聊天完成请求验证模式
 */
const chatCompletionSchema = z.object({
  model: z.string().min(1, "模型名称不能为空"),
  messages: z.array(z.any()).min(1, "消息数组不能为空"),
  tools: z.array(z.any()).optional(),
  tool_choice: z
    .union([z.literal("auto"), z.literal("none"), z.object({})])
    .optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().positive().optional(),
  stream: z.boolean().optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  n: z.number().positive().optional(),
  user: z.string().optional(),
});

/**
 * 根据模型选择合适的 OpenAI 客户端
 * @param model 模型名称
 * @returns OpenAI 客户端实例
 */
const getOpenAIClient = (model: string): OpenAI => {
  // 配置代理
  const proxyAgent = new HttpsProxyAgent(process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "");

  const apiKey = process.env.OPENROUTER_API_KEY || 'sk-or-v1-dummy-key';

  // 检测 API 密钥格式
  if (apiKey.startsWith('sk-ant-')) {
    // 如果是 Anthropic 格式的密钥，直接调用 Anthropic API
    logger.info("🔑 检测到 Anthropic API 密钥，使用 Anthropic API");
    return new OpenAI({
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
    return new OpenAI({
      apiKey: apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      httpAgent: proxyAgent,
    });
  }
};

/**
 * 计算 Token 费用
 * @param model 模型名称
 * @param promptTokens 提示词 Token 数
 * @param completionTokens 完成响应 Token 数
 * @returns 费用（USD）
 */
const calculateCost = (
  model: string,
  promptTokens: number,
  completionTokens: number,
): number => {
  const pricing: { [key: string]: { prompt: number; completion: number } } = {
    "gpt-4": { prompt: 0.03 / 1000, completion: 0.06 / 1000 },
    "gpt-3.5-turbo": { prompt: 0.001 / 1000, completion: 0.002 / 1000 },
    "claude-3-opus": { prompt: 0.015 / 1000, completion: 0.075 / 1000 },
    "claude-3-sonnet": { prompt: 0.003 / 1000, completion: 0.015 / 1000 },
    "gemini-pro": { prompt: 0.000125 / 1000, completion: 0.000375 / 1000 },
  };

  const modelPricing = pricing[model] || pricing["gpt-3.5-turbo"];
  return (
    promptTokens * modelPricing.prompt +
    completionTokens * modelPricing.completion
  );
};

/**
 * 聊天完成接口
 * 支持流式和非流式响应，包含工具调用循环
 */
router.post(
  "/completions",
  async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    let dbRequest: any;

    try {
      // 验证请求数据
      const validatedData = chatCompletionSchema.parse(req.body);
      const {
        model,
        messages,
        stream = false,
        tools: userTools,
        ...otherParams
      } = validatedData;

      // 生成请求ID
      const requestId = uuidv4();

      // 记录请求到数据库
      dbRequest = await dbService.createRequest({
        id: requestId,
        userId: validatedData.user,
        model,
        messages: JSON.stringify(messages),
        tools: userTools ? JSON.stringify(userTools) : undefined,
        stream,
      });

      logger.info("🚀 处理聊天完成请求", {
        requestId,
        model,
        messageCount: messages.length,
        stream,
        hasTools: !!userTools,
      });

      // 获取 UnifAI 工具（如果用户未提供工具）
      const finalTools = userTools || (await unifaiService.getTools());

      // 初始化 OpenAI 客户端
      const client = getOpenAIClient(model);

      // 准备对话消息和响应追踪
      let conversationMessages = [...messages];
      const allResponses: any[] = [];
      const toolNamesUsed: string[] = [];
      let totalTokens = { prompt: 0, completion: 0, total: 0 };

      // 处理流式 vs 非流式响应
      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("Access-Control-Allow-Origin", "*");

        // 发送初始数据块
        res.write(
          `data: ${JSON.stringify({
            id: requestId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                index: 0,
                delta: { role: "assistant", content: "" },
                finish_reason: null,
              },
            ],
          })}\n\n`,
        );
      }

      // 对话循环 - 继续直到没有工具调用
      while (true) {
        try {
          // 转换模型名称（如果直接调用 Anthropic API）
          let actualModel = model;
          const apiKey = process.env.OPENROUTER_API_KEY || 'sk-or-v1-dummy-key';
          if (apiKey.startsWith('sk-ant-') && model.startsWith('anthropic/')) {
            actualModel = model.replace('anthropic/', '');
            logger.info("🔄 转换模型名称", { original: model, actual: actualModel });
          }

          // 向大模型发送请求
          const response = await client.chat.completions.create({
            model: actualModel,
            messages: conversationMessages as any,
            tools: finalTools,
            stream: false,
            temperature: otherParams.temperature,
            max_tokens: otherParams.max_tokens,
            stop: otherParams.stop,
            presence_penalty: otherParams.presence_penalty,
            frequency_penalty: otherParams.frequency_penalty,
            top_p: otherParams.top_p,
            n: otherParams.n,
            user: otherParams.user,
          });

          logger.info("🤖 LLM 响应:", { response: response.choices[0] });

          const choice = response.choices[0];
          if (!choice) {
            const error = new Error("模型未返回响应") as AppError;
            error.statusCode = 500;
            error.code = "model_error";
            throw error;
          }

          const assistantMessage = choice.message;

          // 累计Token使用量
          if (response.usage) {
            totalTokens.prompt += response.usage.prompt_tokens || 0;
            totalTokens.completion += response.usage.completion_tokens || 0;
            totalTokens.total += response.usage.total_tokens || 0;
          }

          // 记录响应
          allResponses.push({
            content: assistantMessage.content,
            toolCalls: assistantMessage.tool_calls,
            finishReason: choice.finish_reason,
          });

          // 将助手消息添加到对话中
          conversationMessages.push(assistantMessage);

          // 如果存在工具调用，则处理工具
          if (
            assistantMessage.tool_calls &&
            assistantMessage.tool_calls.length > 0
          ) {
            logger.info("🔧 处理工具调用", {
              requestId,
              toolCallCount: assistantMessage.tool_calls.length,
            });

            // 提取工具名称
            const currentToolNames = assistantMessage.tool_calls.map(
              (tc) => tc.function.name,
            );
            toolNamesUsed.push(...currentToolNames);

            // 使用 UnifAI 调用工具
            const toolCallStart = Date.now();
            const toolResults = await unifaiService.callTools(
              assistantMessage.tool_calls,
            );
            const toolCallDuration = Date.now() - toolCallStart;

            // 将工具结果添加到对话中
            conversationMessages.push(...toolResults);

            // 记录工具调用到数据库
            for (const toolCall of assistantMessage.tool_calls) {
              await dbService.createToolCall({
                requestId,
                toolName: toolCall.function.name,
                toolId: toolCall.id,
                arguments: JSON.stringify(toolCall.function.arguments),
                result:
                  toolResults.find((r) => r.tool_call_id === toolCall.id)
                    ?.content || undefined,
                success: true,
                executionTime: toolCallDuration,
              });
            }

            if (stream) {
              // 在流中发送工具调用信息
              res.write(
                `data: ${JSON.stringify({
                  id: requestId,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: {
                        content: `\n[使用工具: ${currentToolNames.join(", ")}]\n`,
                      },
                      finish_reason: null,
                    },
                  ],
                })}\n\n`,
              );
            }

            // 继续对话循环
            continue;
          } else {
            // 没有工具调用，结束循环
            if (stream && assistantMessage.content) {
              // 发送最终内容
              res.write(
                `data: ${JSON.stringify({
                  id: requestId,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: { content: assistantMessage.content },
                      finish_reason: choice.finish_reason,
                    },
                  ],
                })}\n\n`,
              );
            }
            break;
          }
        } catch (apiError: any) {
          logger.error("🚨 API 调用失败", {
            requestId,
            error: apiError.message,
            status: apiError.status,
            model,
            apiKey: process.env.OPENROUTER_API_KEY ? 'configured' : 'missing'
          });

          // 如果是认证错误，返回更友好的错误信息
          if (apiError.status === 401) {
            const error = new Error("API 认证失败，请检查 OPENROUTER_API_KEY 配置") as AppError;
            error.statusCode = 401;
            error.code = "auth_error";
            throw error;
          }

          throw apiError;
        }
      }

      // 计算响应时间和费用
      const responseTime = Date.now() - startTime;
      const cost = calculateCost(
        model,
        totalTokens.prompt,
        totalTokens.completion,
      );

      // 构建最终响应
      const finalResponse = {
        id: requestId,
        object: "chat.completion",
        created: Math.floor(startTime / 1000),
        model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant" as const,
              content: allResponses
                .map((r) => r.content)
                .filter(Boolean)
                .join(""),
              tool_calls: allResponses.flatMap((r) => r.toolCalls || []),
            },
            finish_reason:
              allResponses[allResponses.length - 1]?.finishReason || "stop",
          },
        ],
        usage: {
          prompt_tokens: totalTokens.prompt,
          completion_tokens: totalTokens.completion,
          total_tokens: totalTokens.total,
        },
        tools_used: toolNamesUsed,
        response_time_ms: responseTime,
      };

      // 保存响应到数据库
      await dbService.createResponse({
        id: uuidv4(),
        requestId,
        content: JSON.stringify(finalResponse),
        toolCalls:
          toolNamesUsed.length > 0 ? JSON.stringify(toolNamesUsed) : undefined,
        finishReason: finalResponse.choices[0].finish_reason,
        responseTime,
      });

      // 保存Token使用记录
      await dbService.createTokenUsage({
        requestId,
        model,
        promptTokens: totalTokens.prompt,
        completionTokens: totalTokens.completion,
        totalTokens: totalTokens.total,
        cost,
      });

      logger.info("✅ 聊天完成请求处理成功", {
        requestId,
        responseTime,
        totalTokens: totalTokens.total,
        toolsUsed: toolNamesUsed.length,
        cost: cost.toFixed(6),
      });

      // 发送响应
      if (stream) {
        // 发送流结束标记
        res.write(
          `data: ${JSON.stringify({
            id: requestId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: finalResponse.choices[0].finish_reason,
              },
            ],
          })}\n\n`,
        );
        res.write("data: [DONE]\n\n");
        res.end();
      } else {
        res.json(finalResponse);
      }
    } catch (error) {
      logger.error("❌ 聊天完成请求处理失败", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        requestBody: req.body,
      });

      // 如果已经创建了请求记录，更新为失败状态
      if (dbRequest) {
        try {
          await dbService.createResponse({
            id: uuidv4(),
            requestId: dbRequest.id,
            content: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
            finishReason: "error",
            responseTime: Date.now() - startTime,
          });
        } catch (dbError) {
          logger.error("保存错误响应失败", dbError);
        }
      }

      next(error);
    }
  },
);

export { router as chatRouter };
