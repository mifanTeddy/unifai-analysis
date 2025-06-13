import { Tools } from "unifai-sdk";
import { logger } from "../utils/logger";

/**
 * UnifAI 工具服务
 */
export class UnifAIService {
  private tools: Tools;

  constructor(apiKey: string) {
    this.tools = new Tools({
      apiKey,
    });
  }

  /**
   * 获取所有可用工具
   * 按照 SDK 文档的参数名称
   */
  async getTools(options: {
    dynamicTools?: boolean;
    staticToolkits?: string[];
    staticActions?: string[];
  } = {}): Promise<any[]> {
    try {
      const { dynamicTools = true, staticToolkits, staticActions } = options;
      
      return await this.tools.getTools({
        dynamicTools,
        staticToolkits,
        staticActions,
      });
    } catch (error) {
      logger.error("获取 UnifAI 工具失败:", error);
      throw error;
    }
  }

  /**
   * 调用工具
   * 按照 SDK 文档实现
   */
  async callTools(toolCalls: any[]): Promise<any[]> {
    try {
      return await this.tools.callTools(toolCalls);
    } catch (error) {
      logger.error("调用 UnifAI 工具失败:", error);
      throw error;
    }
  }
}

// 导出单例实例
export const unifaiService = new UnifAIService(
  process.env.UNIFAI_AGENT_API_KEY || ""
);
