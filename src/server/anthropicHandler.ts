import type { PageResponse } from '@anthropic-ai/sdk/core/pagination'
import type {
  ErrorObject,
  Message,
  MessageCreateParams,
  MessageTokensCount,
  ModelInfo,
  RawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources'
import type express from 'express'
import * as vscode from 'vscode'
import {
  convertAnthropicRequestToVSCodeRequest,
  convertVSCodeResponseToAnthropicResponse,
} from '../converter/anthropicConverter'
import { modelManager } from '../model/manager'
import { logger } from '../utils/logger'
import { getVSCodeModel } from './handler'

/**
 * Set up Anthropic-compatible Messages API endpoints
 * @param {express.Express} app Express.js application
 * @returns {void}
 */
export function setupAnthropicMessagesEndpoints(app: express.Express): void {
  // Register Anthropic API-compatible endpoints
  app.post('/anthropic/messages', (req, res) =>
    handleAnthropicMessages(req, res, 'anthropic'),
  )
  app.post('/anthropic/v1/messages', (req, res) =>
    handleAnthropicMessages(req, res, 'anthropic'),
  )
  app.post('/anthropic/v1/messages/count_tokens', (req, res) =>
    handleAnthropicCountTokens(req, res, 'anthropic'),
  )
}

/**
 * Set up Anthropic-compatible Models API endpoints
 * @param {express.Express} app Express.js application
 * @returns {void}
 */
export function setupAnthropicModelsEndpoints(app: express.Express): void {
  // Model list endpoint
  app.get('/anthropic/models', handleAnthropicModels)
  app.get('/anthropic/v1/models', handleAnthropicModels)

  // Specific model info endpoint
  app.get('/anthropic/models/:model', handleAnthropicModelInfo)
  app.get('/anthropic/v1/models/:model', handleAnthropicModelInfo)
}

/**
 * Main function to handle Anthropic-compatible Messages API requests.
 * - Request validation
 * - Model retrieval
 * - Send request to LM API
 * - Streaming/non-streaming response handling
 * - Error handling
 * @param {express.Request} req Request
 * @param {express.Response} res Response
 * @returns {Promise<void>}
 */
export async function handleAnthropicMessages(
  req: express.Request,
  res: express.Response,
  provider: 'anthropic' | 'claude',
) {
  try {
    const body = req.body as MessageCreateParams
    logger.debug('Received request', { body })

    // Validate required fields
    validateMessagesRequest(body)

    // Get model
    const { vsCodeModel } = await getVSCodeModel(body.model, provider)

    // Determine streaming mode
    const isStreaming = body.stream === true

    // Convert Anthropic request to VSCode LM API format
    const { messages, options, inputTokens } =
      await convertAnthropicRequestToVSCodeRequest(body, vsCodeModel)

    // Create cancellation token
    const cancellationToken = new vscode.CancellationTokenSource().token

    // Send request to LM API
    const response = await vsCodeModel.sendRequest(
      messages,
      options,
      cancellationToken,
    )
    logger.debug('Received response from LM API')

    // Convert response to Anthropic format
    const anthropicResponse = convertVSCodeResponseToAnthropicResponse(
      response,
      vsCodeModel,
      isStreaming,
      inputTokens,
    )
    logger.debug('anthropicResponse', {
      anthropicResponse,
      vsCodeModel,
      isStreaming,
    })

    // Streaming response processing
    if (isStreaming) {
      await handleStreamingResponse(
        res,
        anthropicResponse as AsyncIterable<RawMessageStreamEvent>,
        req.originalUrl || req.url,
      )
      return
    }

    // Non-streaming response processing
    const message = await (anthropicResponse as Promise<Message>)
    logger.debug('message', { message })
    res.json(message)
  } catch (error) {
    const { statusCode, errorObject } = handleMessageError(
      error as vscode.LanguageModelError,
    )
    res.status(statusCode).json({ type: 'error', error: errorObject })
  }
}

/**
 * Validate required fields in Messages API request
 * @param {MessageCreateParams} body
 * @throws Throws exception on error
 */
function validateMessagesRequest(body: MessageCreateParams) {
  // Check messages field existence and array type
  if (
    !body.messages ||
    !Array.isArray(body.messages) ||
    body.messages.length === 0
  ) {
    const error: vscode.LanguageModelError = {
      ...new Error('The messages field is required'),
      name: 'InvalidMessageRequest',
      code: 'invalid_request_error',
    }
    throw error
  }

  // Check model field existence
  if (!body.model) {
    const error: vscode.LanguageModelError = {
      ...new Error('The model field is required'),
      name: 'InvalidModelRequest',
      code: 'not_found_error',
    }
    throw error
  }
}

/**
 * Process streaming response and send to client
 * @param {express.Response} res
 * @param {AsyncIterable<RawMessageStreamEvent>} stream
 * @param {string} reqPath
 * @returns {Promise<void>}
 */
async function handleStreamingResponse(
  res: express.Response,
  stream: AsyncIterable<RawMessageStreamEvent>,
  reqPath: string,
): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  logger.debug('Streaming started', { path: reqPath })
  let chunkIndex = 0

  try {
    // Send streaming response sequentially
    for await (const chunk of stream) {
      const data = JSON.stringify(chunk)
      res.write(`data: ${data}\n\n`)
      logger.debug(`Streaming chunk: ${data}`)
      chunkIndex++
    }

    // Normal completion
    logger.debug('Streaming ended', {
      path: reqPath,
      chunkCount: chunkIndex,
    })
  } catch (error) {
    // Send Anthropic-compatible error and end stream on error
    const { errorObject } = handleMessageError(
      error as vscode.LanguageModelError,
    )
    res.write(
      `data: ${JSON.stringify({ type: 'error', error: errorObject })}\n\n`,
    )
    logger.error('Streaming error', { error, path: reqPath })
  } finally {
    // End stream
    res.end()
  }
}

/**
 * Convert VSCode LanguageModelError to Anthropic-compatible error format and log
 * @param {vscode.LanguageModelError} error
 * @returns { statusCode: number, errorObject: ErrorObject }
 */
function handleMessageError(error: vscode.LanguageModelError): {
  statusCode: number
  errorObject: ErrorObject
} {
  logger.error('VSCode LM API error', error, {
    cause: error.cause,
    code: error.code,
    message: error.message,
    name: error.name,
    stack: error.stack,
  })

  // Define variables
  let statusCode = 500
  let type: ErrorObject['type'] = 'api_error'
  let message = error.message || 'An unknown error has occurred'

  // Map according to LanguageModelError.name
  switch (error.name) {
    case 'InvalidMessageFormat':
    case 'InvalidModel':
      statusCode = 400
      type = 'invalid_request_error'
      break
    case 'NoPermissions':
      statusCode = 403
      type = 'permission_error'
      break
    case 'Blocked':
      statusCode = 403
      type = 'permission_error'
      break
    case 'NotFound':
      statusCode = 404
      type = 'not_found_error'
      break
    case 'ChatQuotaExceeded':
      statusCode = 429
      type = 'rate_limit_error'
      break
    case 'Error': {
      // Extract error code (number) and JSON part, store in variables
      const match = error.message.match(/Request Failed: (\d+)\s+({.*})/)

      if (match) {
        const status = Number(match[1])
        const jsonString = match[2]
        const errorJson = JSON.parse(jsonString)
        console.log(status)
        console.log(errorJson)

        statusCode = status
        type = errorJson.error.type
        message = errorJson.error.message
      }

      break
    }
    case 'Unknown':
      statusCode = 500
      type = 'api_error'
      break
  }

  // Return in Anthropic-compatible error format
  const errorObject: ErrorObject = {
    type,
    message,
  }

  return { statusCode, errorObject }
}

/**
 * Handle Anthropic-compatible model list request
 * @param {express.Request} req Request
 * @param {express.Response} res Response
 * @returns {Promise<void>}
 */
export async function handleAnthropicModels(
  _req: express.Request,
  res: express.Response,
) {
  try {
    // Get available models
    const availableModels = await modelManager.getAvailableModels()

    // Convert to Anthropic API format
    const now = Math.floor(Date.now() / 1000)
    const modelsData: ModelInfo[] = availableModels.map(model => ({
      created_at: now.toString(),
      display_name: model.name,
      id: model.id,
      type: 'model',
    }))

    // Add proxy model ID
    modelsData.push({
      created_at: now.toString(),
      display_name: 'VSCode LM Proxy',
      id: 'vscode-lm-proxy',
      type: 'model',
    })

    const anthropicModelsResponse: PageResponse<ModelInfo> = {
      data: modelsData,
      first_id: modelsData[0].id,
      has_more: false,
      last_id: modelsData[modelsData.length - 1].id,
    }

    res.json(anthropicModelsResponse)
  } catch (error: any) {
    logger.error(`Anthropic Models API error: ${error.message}`, error as Error)

    // Create error response
    const statusCode = error.statusCode || 500
    const errorResponse = {
      type: 'error',
      error: {
        message: error.message || 'An unknown error has occurred',
        type: error.type || 'api_error',
      } as ErrorObject,
    }

    res.status(statusCode).json(errorResponse)
  }
}

/**
 * Handle Anthropic-compatible token count API request
 * @param {express.Request} req Request
 * @param {express.Response} res Response
 * @param {string} provider Provider ('anthropic' | 'claude')
 * @returns {Promise<void>}
 */
export async function handleAnthropicCountTokens(
  req: express.Request,
  res: express.Response,
  provider: 'anthropic' | 'claude',
) {
  try {
    const body = req.body as MessageCreateParams
    logger.debug('Received count_tokens request', { body })

    // Get VSCode model
    const { vsCodeModel } = await getVSCodeModel(body.model, provider)

    // Define target text
    let inputTokens = 0

    // messages
    for (const message of body.messages) {
      // role
      inputTokens += await vsCodeModel.countTokens(message.role)

      // content
      if (typeof message.content === 'string') {
        inputTokens += await vsCodeModel.countTokens(message.content)
      } else {
        const content = message.content
          .map(part => JSON.stringify(part))
          .join(' ')
        inputTokens += await vsCodeModel.countTokens(content)
      }
    }

    // system
    if (body.system) {
      if (typeof body.system === 'string') {
        inputTokens += await vsCodeModel.countTokens(body.system)
      } else {
        const text = body.system.map(part => part.text).join(' ')
        inputTokens += await vsCodeModel.countTokens(text)
      }
    }

    // tools
    if (body.tools) {
      for (const tool of body.tools) {
        // name
        inputTokens += await vsCodeModel.countTokens(tool.name)

        // description
        if ('description' in tool && tool.description) {
          inputTokens += await vsCodeModel.countTokens(tool.description)
        }

        // input_schema
        if ('input_schema' in tool) {
          const inputSchema = JSON.stringify(tool.input_schema)
          inputTokens += await vsCodeModel.countTokens(inputSchema)
        }
      }
    }

    // Create response object
    const messageTokenCount: MessageTokensCount = {
      input_tokens: inputTokens,
    }
    logger.debug({ messageTokenCount })

    // Return response
    res.json(messageTokenCount)
  } catch (error) {
    const { statusCode, errorObject } = handleMessageError(
      error as vscode.LanguageModelError,
    )
    res.status(statusCode).json({ type: 'error', error: errorObject })
  }
}

/**
 * Handle Anthropic-compatible single model info request
 * @param {express.Request} req Request
 * @param {express.Response} res Response
 * @returns {Promise<void>}
 */
export async function handleAnthropicModelInfo(
  req: express.Request,
  res: express.Response,
) {
  try {
    const modelId = req.params.model

    if (modelId === 'vscode-lm-proxy') {
      // Return fixed info for vscode-lm-proxy
      const anthropicModel: ModelInfo = {
        created_at: Math.floor(Date.now() / 1000).toString(),
        display_name: 'VSCode LM Proxy',
        id: 'vscode-lm-proxy',
        type: 'model',
      }
      res.json(anthropicModel)
      return
    }

    // Get model info from LM API
    const vsCodeModel = await modelManager.getModelInfo(modelId)

    // Throw error if model does not exist
    if (!vsCodeModel) {
      throw {
        ...new Error(`Model ${modelId} not found`),
        statusCode: 404,
        type: 'not_found_error',
      }
    }

    // Convert to Anthropic API format
    const anthropicModel: ModelInfo = {
      created_at: Math.floor(Date.now() / 1000).toString(),
      display_name: vsCodeModel.name,
      id: vsCodeModel.id,
      type: 'model',
    }

    // Return response
    res.json(anthropicModel)
  } catch (error: any) {
    logger.error(
      `Anthropic Model Info API error: ${error.message}`,
      error as Error,
    )

    // Create error response
    const statusCode = error.statusCode || 500
    const errorResponse = {
      type: 'error',
      error: {
        message: error.message || 'An unknown error has occurred',
        type: error.type || 'api_error',
      } as ErrorObject,
    }

    res.status(statusCode).json(errorResponse)
  }
}
