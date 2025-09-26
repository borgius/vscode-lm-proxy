import type express from 'express'
import { handleAnthropicCountTokens } from '@/server/anthropicHandler/handleAnthropicCountTokens'
import { handleAnthropicMessages } from '@/server/anthropicHandler/handleAnthropicMessages'
import { handleAnthropicModelInfo } from '@/server/anthropicHandler/handleAnthropicModelInfo'
import { handleAnthropicModels } from '@/server/anthropicHandler/handleAnthropicModels'

/**
 * Anthropic互換のMessages APIエンドポイントを設定する
 * @param {express.Express} app Express.jsアプリケーション
 * @returns {void}
 */
export function setupAnthropicMessagesEndpoints(app: express.Express): void {
  // Anthropic API互換エンドポイントを登録
  app.post('/anthropic/messages', (req, res) =>
    handleAnthropicMessages(req, res, 'anthropic'),
  )
  app.post('/anthropic/v1/messages', (req, res) =>
    handleAnthropicMessages(req, res, 'anthropic'),
  )
  app.post('/anthropic/messages/count_tokens', (req, res) =>
    handleAnthropicCountTokens(req, res, 'anthropic'),
  )
  app.post('/anthropic/v1/messages/count_tokens', (req, res) =>
    handleAnthropicCountTokens(req, res, 'anthropic'),
  )
}

/**
 * Anthropic互換のModels APIエンドポイントを設定する
 * @param {express.Express} app Express.jsアプリケーション
 * @returns {void}
 */
export function setupAnthropicModelsEndpoints(app: express.Express): void {
  // モデル一覧エンドポイント
  app.get('/anthropic/models', handleAnthropicModels)
  app.get('/anthropic/v1/models', handleAnthropicModels)

  // 特定モデル情報エンドポイント
  app.get('/anthropic/models/:model', handleAnthropicModelInfo)
  app.get('/anthropic/v1/models/:model', handleAnthropicModelInfo)
}
