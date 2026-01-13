import type express from 'express'
import {
  handleAnthropicCountTokens,
  handleAnthropicMessages,
  handleAnthropicModelInfo,
  handleAnthropicModels,
} from './anthropicHandler'

/**
 * Set up Claude Code-compatible Messages API endpoints
 * @param {express.Express} app Express.js application
 * @returns {void}
 */
export function setupClaudeCodeMessagesEndpoints(app: express.Express): void {
  app.post('/anthropic/claude/messages', (req, res) =>
    handleAnthropicMessages(req, res, 'claude'),
  )
  app.post('/anthropic/claude/v1/messages', (req, res) =>
    handleAnthropicMessages(req, res, 'claude'),
  )

  app.post('/anthropic/claude/messages/count_tokens', (req, res) =>
    handleAnthropicCountTokens(req, res, 'claude'),
  )
  app.post('/anthropic/claude/v1/messages/count_tokens', (req, res) =>
    handleAnthropicCountTokens(req, res, 'claude'),
  )
}

/**
 * Set up Claude Code-compatible Models API endpoints
 * @param {express.Express} app Express.js application
 * @returns {void}
 */
export function setupClaudeCodeModelsEndpoints(app: express.Express): void {
  // Model list endpoint
  app.get('/anthropic/claude/models', handleAnthropicModels)
  app.get('/anthropic/claude/v1/models', handleAnthropicModels)

  // Specific model info endpoint
  app.get('/anthropic/claude/models/:model', handleAnthropicModelInfo)
  app.get('/anthropic/claude/v1/models/:model', handleAnthropicModelInfo)
}
