// Express.js server configuration and API endpoint implementation
import express from 'express'
import { logger } from '../utils/logger'
import { setupAgentsEndpoints } from './agentsHandler'
import {
  setupAnthropicMessagesEndpoints,
  setupAnthropicModelsEndpoints,
} from './anthropicHandler'
import {
  setupClaudeCodeMessagesEndpoints,
  setupClaudeCodeModelsEndpoints,
} from './claudeCodeHandler'
import { setupStatusEndpoint } from './handler'
import {
  setupOpenAIChatCompletionsEndpoints,
  setupOpenAIModelsEndpoints,
} from './openaiHandler'
import { setupOpenAIResponsesEndpoints } from './openaiResponsesHandler'

/**
 * Creates an Express.js server instance.
 * Sets up routing including OpenAI compatible APIs and status endpoints.
 * @returns {express.Express} Configured Express application
 */
export function createServer(): express.Express {
  const app = express()

  // JSON parsing configuration
  app.use(express.json({ limit: '100mb' }))

  // Request/response logging middleware
  app.use((req, res, next) => {
    const startTime = Date.now()
    const path = req.originalUrl || req.url

    res.on('finish', () => {
      const responseTime = Date.now() - startTime
      // Body is omitted as needed (not available in standard Express here)
      logger.debug('Response sent', {
        status: res.statusCode,
        path,
        responseTime,
      })
    })

    next()
  })

  // Setup server status endpoint
  setupStatusEndpoint(app)

  // Setup agents endpoint
  setupAgentsEndpoints(app)

  // Setup OpenAI compatible endpoints
  setupOpenAIChatCompletionsEndpoints(app)
  setupOpenAIResponsesEndpoints(app)
  setupOpenAIModelsEndpoints(app)

  // Setup Anthropic compatible API endpoints
  setupAnthropicMessagesEndpoints(app)
  setupAnthropicModelsEndpoints(app)

  // Setup Claude Code compatible API endpoints
  setupClaudeCodeMessagesEndpoints(app)
  setupClaudeCodeModelsEndpoints(app)

  // Error handler setup
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      logger.error('Server error:', err)
      res.status(500).json({
        error: {
          message: `Internal Server Error: ${err.message}`,
          type: 'server_error',
        },
      })
    },
  )

  return app
}
