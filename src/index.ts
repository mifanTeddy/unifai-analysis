import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from './utils/logger';
import { chatRouter } from './routes/chat';
import tokenAnalysisRouter from './routes/tokenAnalysis';
import { errorHandler } from './middleware/errorHandler';
import { initializeDatabase, closeDatabase } from './data-source';
import path from "path";

const app: express.Application = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '/public')));
app.use('/public', express.static(path.join(__dirname, '../public')));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.method !== 'GET' ? req.body : undefined
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API routes
app.use('/v1/chat', chatRouter);
app.use('/v1/tokenAnalysis', tokenAnalysisRouter);

// OpenAI-compatible endpoints
app.use('/chat/completions', chatRouter);

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: {
      message: 'Not Found',
      type: 'invalid_request_error',
      code: 'not_found'
    }
  });
});

// 初始化数据库并启动服务器
async function startServer() {
  try {
    // 初始化数据库连接
    await initializeDatabase();
    logger.info('✅ 数据库连接已建立');

    // 启动服务器
    const server = app.listen(port, () => {
      logger.info(`🚀 服务器运行在端口 ${port}`);
      logger.info(`环境: ${process.env.NODE_ENV || 'development'}`);
    });

    // 优雅关闭处理
    const gracefulShutdown = async () => {
      logger.info('收到关闭信号，正在优雅关闭服务器...');
      server.close(async () => {
        await closeDatabase();
        logger.info('✅ 服务器已关闭');
        process.exit(0);
      });
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    logger.error('❌ 启动服务器失败:', error);
    process.exit(1);
  }
}

// 启动应用
startServer();

export { app };
