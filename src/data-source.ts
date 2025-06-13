import { logger } from './utils/logger';

/**
 * 内存数据存储
 * 避免原生数据库驱动的编译问题
 */
interface RequestRecord {
    id: string;
    userId?: string;
    model: string;
    messages: string;
    tools?: string;
    stream: boolean;
    createdAt: Date;
}

interface ResponseRecord {
    id: string;
    requestId: string;
    content: string;
    toolCalls?: string;
    finishReason?: string;
    responseTime: number;
    createdAt: Date;
}

interface TokenUsageRecord {
    id: number;
    requestId: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
    createdAt: Date;
}

interface ToolCallRecord {
    id: number;
    requestId: string;
    toolId: string;
    toolName: string;
    arguments: string;
    result?: string;
    success: boolean;
    executionTime: number;
    createdAt: Date;
}

// 内存存储
const memoryStore = {
    requests: [] as RequestRecord[],
    responses: [] as ResponseRecord[],
    tokenUsage: [] as TokenUsageRecord[],
    toolCalls: [] as ToolCallRecord[],
    idCounters: {
        tokenUsage: 1,
        toolCall: 1
    }
};

/**
 * 模拟数据库操作的内存存储服务
 */
export const AppDataSource = {
    isInitialized: false,
    
    async initialize() {
        this.isInitialized = true;
        logger.info('✅ 内存数据库已初始化');
    },
    
    async destroy() {
        // 清空所有数据
        memoryStore.requests = [];
        memoryStore.responses = [];
        memoryStore.tokenUsage = [];
        memoryStore.toolCalls = [];
        memoryStore.idCounters = { tokenUsage: 1, toolCall: 1 };
        this.isInitialized = false;
        logger.info('✅ 内存数据库已清理');
    },
    
    // 数据操作方法
    getRepository(entity: string) {
        const repository = {
            save: async (data: any): Promise<any> => {
                const now = new Date();
                switch (entity) {
                    case 'Request':
                        const request = { ...data, createdAt: data.createdAt || now };
                        memoryStore.requests.push(request);
                        return request;
                    case 'Response':
                        const response = { ...data, createdAt: data.createdAt || now };
                        memoryStore.responses.push(response);
                        return response;
                    case 'TokenUsage':
                        const tokenUsage = { 
                            ...data, 
                            id: data.id || memoryStore.idCounters.tokenUsage++,
                            createdAt: data.createdAt || now 
                        };
                        memoryStore.tokenUsage.push(tokenUsage);
                        return tokenUsage;
                    case 'ToolCall':
                        const toolCall = { 
                            ...data, 
                            id: data.id || memoryStore.idCounters.toolCall++,
                            createdAt: data.createdAt || now 
                        };
                        memoryStore.toolCalls.push(toolCall);
                        return toolCall;
                    default:
                        throw new Error(`Unknown entity: ${entity}`);
                }
            },
            
            find: async (options: any = {}): Promise<any[]> => {
                const { where = {} } = options;
                let data: any[];
                
                switch (entity) {
                    case 'Request':
                        data = memoryStore.requests;
                        break;
                    case 'Response':
                        data = memoryStore.responses;
                        break;
                    case 'TokenUsage':
                        data = memoryStore.tokenUsage;
                        break;
                    case 'ToolCall':
                        data = memoryStore.toolCalls;
                        break;
                    default:
                        return [];
                }
                
                // 简单的过滤逻辑
                if (Object.keys(where).length === 0) {
                    return data;
                }
                
                return data.filter(item => {
                    for (const [key, value] of Object.entries(where)) {
                        if (key === 'createdAt' && value && typeof value === 'object' && value !== null) {
                            const date = item[key];
                            const dateCondition = value as { gte?: Date; lte?: Date };
                            if (dateCondition.gte && date < dateCondition.gte) return false;
                            if (dateCondition.lte && date > dateCondition.lte) return false;
                        } else if (item[key] !== value) {
                            return false;
                        }
                    }
                    return true;
                });
            },
            
            findOne: async (options: any): Promise<any> => {
                const results = await repository.find(options);
                return results[0] || null;
            }
        };
        
        return repository;
    }
};

/**
 * 初始化数据库连接
 */
export async function initializeDatabase() {
    try {
        await AppDataSource.initialize();
        logger.info('✅ 内存数据库连接已建立');
    } catch (error) {
        logger.error('❌ 数据库连接失败:', error);
        throw error;
    }
}

/**
 * 关闭数据库连接
 */
export async function closeDatabase() {
    try {
        await AppDataSource.destroy();
        logger.info('✅ 数据库连接已关闭');
    } catch (error) {
        logger.error('❌ 关闭数据库连接时出错:', error);
    }
} 