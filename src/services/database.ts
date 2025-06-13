import { AppDataSource } from "../data-source";

/**
 * 数据库服务封装
 */
class DatabaseService {
  /**
   * 创建请求记录
   */
  async createRequest(data: {
    id: string;
    userId?: string;
    model: string;
    messages: string;
    tools?: string;
    stream: boolean;
  }) {
    const repository = AppDataSource.getRepository("Request");
    return await repository.save(data);
  }

  /**
   * 创建响应记录
   */
  async createResponse(data: {
    id: string;
    requestId: string;
    content: string;
    toolCalls?: string;
    finishReason?: string;
    responseTime: number;
  }) {
    const repository = AppDataSource.getRepository("Response");
    return await repository.save(data);
  }

  /**
   * 创建Token使用记录
   */
  async createTokenUsage(data: {
    requestId: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
  }) {
    const repository = AppDataSource.getRepository("TokenUsage");
    return await repository.save(data);
  }

  /**
   * 创建工具调用记录
   */
  async createToolCall(data: {
    requestId: string;
    toolId: string;
    toolName: string;
    arguments: string;
    result?: string;
    success: boolean;
    executionTime: number;
  }) {
    const repository = AppDataSource.getRepository("ToolCall");
    return await repository.save(data);
  }

  /**
   * 根据ID查找请求
   */
  async findRequestById(id: string) {
    const repository = AppDataSource.getRepository("Request");
    return await repository.findOne({ where: { id } });
  }

  /**
   * 根据ID查找响应
   */
  async findResponseById(id: string) {
    const repository = AppDataSource.getRepository("Response");
    return await repository.findOne({ where: { id } });
  }
}

// 导出单例实例
export const dbService = new DatabaseService();
