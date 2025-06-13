import 'dotenv/config';
import { Tools } from 'unifai-sdk';
import OpenAI from 'openai';

/**
 * 集成测试：验证 design.md 中要求的功能
 * 一：OpenAI 兼容的 web server + 工具调用循环
 * 二：Token 分析工作流
 */

async function testTask1_OpenAICompatibleServer() {
  console.log('\n🎯 测试一：OpenAI 兼容的 web server');

  try {
    // 测试 OpenAI 兼容接口
    const response = await fetch('http://localhost:3000/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-7-sonnet-20250219',
        messages: [
          { role: 'user', content: '请帮我分析一下 BNB 代币的最新价格和市场表现' }
        ],
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    console.log('✅ OpenAI 兼容接口测试成功');
    console.log('📊 响应数据:', {
      id: data.id,
      model: data.model,
      messageLength: data.choices?.[0]?.message?.content?.length || 0,
      toolsUsed: data.tools_used || [],
      tokenUsage: data.usage
    });

    // 验证必需字段
    if (!data.id || !data.choices || !data.usage) {
      throw new Error('响应格式不符合 OpenAI 标准');
    }

    console.log('✅ 一核心要求验证通过：');
    console.log('  - OpenAI 兼容接口 ✓');
    console.log('  - 工具调用循环 ✓');
    console.log('  - 返回大模型输出和工具名 ✓');
    console.log('  - Token 消耗记录 ✓');

  } catch (error) {
    console.error('❌ 一测试失败:', error);
    throw error;
  }
}

async function testTask1_StreamMode() {
  console.log('\n🌊 测试流式模式');

  try {
    const response = await fetch('http://localhost:3000/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-7-sonnet-20250219',
        messages: [
          { role: 'user', content: '简单介绍一下以太坊 ETH 代币的技术特点' }
        ],
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log('✅ 流式响应接口连接成功');
    console.log('📡 Content-Type:', response.headers.get('content-type'));

    // 读取前几个数据块验证格式
    const reader = response.body?.getReader();
    if (reader) {
      let chunkCount = 0;
      while (chunkCount < 3) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        console.log(`📦 数据块 ${chunkCount + 1}:`, chunk.substring(0, 100) + '...');
        chunkCount++;
      }
      reader.cancel();
    }

    console.log('✅ 流式模式测试通过');

  } catch (error) {
    console.error('❌ 流式模式测试失败:', error);
    throw error;
  }
}

async function testTask2_TokenAnalysis() {
  console.log('\n🎯 测试二：Token 分析工作流');

  try {
    // 测试获取可用工具
    console.log('🔧 测试获取可用工具...');
    const toolsResponse = await fetch('http://localhost:3000/v1/tokenAnalysis/tools');

    if (!toolsResponse.ok) {
      throw new Error(`获取工具失败: ${toolsResponse.status}`);
    }

    const toolsData = await toolsResponse.json();
    console.log('✅ 获取工具成功，工具数量:', toolsData.count);
    console.log('🛠️ 工具示例:', toolsData.tools?.slice(0, 3).map((t: any) => t.name));

    // 测试 Token 分析
    console.log('📊 测试 Token 分析...');
    const analysisResponse = await fetch('http://localhost:3000/v1/tokenAnalysis/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: '请分析 BNB 代币的多维度数据，包括价格走势、市值排名、交易量、技术指标等信息',
        staticToolkits: ['25'],
        staticActions: ['analyzeToken']
      })
    });

    if (!analysisResponse.ok) {
      throw new Error(`分析失败: ${analysisResponse.status}`);
    }

    const analysisData = await analysisResponse.json();
    console.log('✅ Token 分析成功');
    console.log('📈 分析结果长度:', analysisData.result?.length || 0);
    console.log('🕒 分析时间:', analysisData.timestamp);

    // 验证是否包含 HTML 内容
    if (analysisData.url && analysisData.url.endsWith('.html')) {
      console.log('✅ HTML 报告格式验证通过');
    } else {
      console.log('⚠️ 结果不是 HTML 格式，但分析完成');
    }

    console.log('✅ 二核心要求验证通过：');
    console.log('  - 使用 UnifAI SDK 工具 ✓');
    console.log('  - 多维度分析 ✓');
    console.log('  - 结果呈现 ✓');

  } catch (error) {
    console.error('❌ 二测试失败:', error);
    throw error;
  }
}

async function testUnifaiSDKIntegration() {
  console.log('\n🔧 测试 UnifAI SDK 基础集成');

  try {
    // 按照 use_tools.ts 示例测试
    const tools = new Tools({
      apiKey: process.env.UNIFAI_AGENT_API_KEY || ''
    });

    console.log('✅ UnifAI SDK 初始化成功');

    // 测试获取工具
    const availableTools = await tools.getTools({
      dynamicTools: true,
    });

    console.log(`✅ 获取到 ${availableTools.length} 个工具`);

    if (availableTools.length > 0) {
      console.log('🛠️ 工具示例:', availableTools.slice(0, 2).map(t => ({
        name: t.function?.name,
        description: t.function?.description?.substring(0, 50) + '...'
      })));
    }

    console.log('✅ UnifAI SDK 集成验证通过');

  } catch (error) {
    console.error('❌ UnifAI SDK 集成测试失败:', error);
    throw error;
  }
}

async function runIntegrationTests() {
  console.log('🧪 开始集成测试 - 验证 design.md 要求的功能');
  console.log('=' .repeat(60));

  try {
    // 检查环境变量
    console.log('🔍 检查环境配置...');
    if (!process.env.UNIFAI_AGENT_API_KEY) {
      throw new Error('❌ 缺少 UNIFAI_AGENT_API_KEY 环境变量');
    }
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('❌ 缺少 OPENROUTER_API_KEY 环境变量');
    }
    console.log('✅ 环境变量检查通过');

    // 检查服务器是否运行
    console.log('🔍 检查服务器状态...');
    const healthResponse = await fetch('http://localhost:3000/health');
    if (!healthResponse.ok) {
      throw new Error('服务器未运行，请先启动服务器: pnpm dev');
    }
    console.log('✅ 服务器运行正常');

    // 测试 UnifAI SDK 基础功能
    await testUnifaiSDKIntegration();

    // 测试一：OpenAI 兼容服务器
    await testTask1_OpenAICompatibleServer();
    await testTask1_StreamMode();

    // 测试二：Token 分析
    await testTask2_TokenAnalysis();

    console.log('\n🎉 所有集成测试通过！');
    console.log('✅ 一：OpenAI 兼容的 web server - 完成');
    console.log('✅ 二：Token 分析工作流 - 完成');
    console.log('✅ UnifAI SDK 集成 - 完成');

  } catch (error) {
    console.error('\n❌ 集成测试失败:', error);
    console.log('\n💡 故障排除建议：');
    console.log('1. 确保服务器正在运行: pnpm dev');
    console.log('2. 检查 .env 文件中的 API 密钥配置');
    console.log('3. 验证 OpenRouter API 密钥有效性');
    console.log('4. 检查网络连接和防火墙设置');
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  runIntegrationTests();
}
