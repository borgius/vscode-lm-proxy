// Common handler processing

import type express from 'express'
import * as vscode from 'vscode'
import { modelManager } from '../model/manager'
import { logger } from '../utils/logger'

// Manage globalState at module scope
let _globalState: vscode.Memento | undefined

/**
 * Initialize globalState
 * @param {vscode.Memento} state VSCode global state
 */
export function initializeLmApiHandler(state: vscode.Memento) {
  _globalState = state
}

/**
 * Set up status check endpoint for the server.
 * @param {express.Express} app Express.js application
 */
export function setupStatusEndpoint(app: express.Express): void {
  app.get('/', (_req: express.Request, res: express.Response) => {
    res.json({
      status: 'ok',
      message: 'VSCode LM API Proxy server is running',
    })
  })
}

/**
 * Get VSCode LM API model (converts 'vscode-lm-proxy' to selected OpenAI model)
 * @param {OpenAI.ChatCompletionCreateParams} body
 * @returns {Promise<{ model: any, modelId: string }>}
 * @throws Throws exception on error
 */
export async function getVSCodeModel(
  modelId: string,
  provider: 'openai' | 'anthropic' | 'claude',
): Promise<{ vsCodeModel: vscode.LanguageModelChat; vsCodeModelId: string }> {
  try {
    let selectedModelId: string | null = modelId

    // Convert 'vscode-lm-proxy' to selected model ID (branch by provider)
    if (modelId === 'vscode-lm-proxy') {
      if (provider === 'openai') {
        selectedModelId = modelManager.getOpenAIModelId()
      } else if (provider === 'anthropic') {
        selectedModelId = modelManager.getAnthropicModelId()
      }

      if (!selectedModelId) {
        throw new Error(`No valid ${provider} model selected`)
      }
    }

    // For 'claude' provider, branch model based on string in modelId
    if (provider === 'claude') {
      if (modelId.includes('haiku')) {
        selectedModelId = modelManager.getClaudeCodeBackgroundModelId()
      } else if (modelId.includes('sonnet') || modelId.includes('opus')) {
        selectedModelId = modelManager.getClaudeCodeThinkingModelId()
      }
    }

    logger.debug('Selected model ID:', selectedModelId)

    // Get model
    const [vsCodeModel] = await vscode.lm.selectChatModels({
      id: selectedModelId as string,
    })
    logger.debug('Retrieved VSCode model:', { vsCodeModel })

    if (!vsCodeModel) {
      throw new Error(`Model ${selectedModelId} not found`)
    }

    // Return model as-is if found
    return { vsCodeModel, vsCodeModelId: vsCodeModel.id }
  } catch (e: any) {
    // Wrap and throw as VSCode LanguageModelError format
    const error: vscode.LanguageModelError = {
      ...new Error(e?.message || 'Unknown error'),
      name: 'NotFound',
      code: 'model_not_found',
    }
    throw error
  }
}

/**
 * VSCode LanguageModelTextPart type guard
 * @param part Target to check
 * @returns {boolean} true if part is LanguageModelTextPart type
 */
export function isTextPart(
  part: unknown,
): part is vscode.LanguageModelTextPart {
  return part instanceof vscode.LanguageModelTextPart
}

/**
 * VSCode LanguageModelToolCallPart type guard
 * @param part Target to check
 * @returns {boolean} true if part is LanguageModelToolCallPart type
 */
export function isToolCallPart(
  part: unknown,
): part is vscode.LanguageModelToolCallPart {
  return part instanceof vscode.LanguageModelToolCallPart
}
