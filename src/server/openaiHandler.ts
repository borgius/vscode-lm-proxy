import type express from 'express'
import type { APIError } from 'openai'
import type { PageResponse } from 'openai/pagination'
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  Model,
} from 'openai/resources'
import * as vscode from 'vscode'
import {
  convertOpenAIRequestToVSCodeRequest,
  convertVSCodeResponseToOpenAIResponse,
} from '../converter/openaiConverter'
import { modelManager } from '../model/manager'
import { logger } from '../utils/logger'
import { getAgentById } from './agentsHandler'
import { getVSCodeModel } from './handler'

/**
 * Sets up OpenAI compatible Chat Completions API endpoints
 * @param {express.Express} app Express.js application
 * @returns {void}
 */
export function setupOpenAIChatCompletionsEndpoints(
  app: express.Express,
): void {
  // Register OpenAI API compatible endpoints
  app.post('/openai/chat/completions', handleOpenAIChatCompletions)
  app.post('/openai/v1/chat/completions', handleOpenAIChatCompletions)
}

/**
 * Sets up OpenAI compatible Models API endpoints
 * @param {express.Express} app Express.js application
 * @returns {void}
 */
export function setupOpenAIModelsEndpoints(app: express.Express): void {
  // Model list endpoint
  app.get('/openai/models', handleOpenAIModels)
  app.get('/openai/v1/models', handleOpenAIModels)

  // Specific model info endpoint
  app.get('/openai/models/:model', handleOpenAIModelInfo)
  app.get('/openai/v1/models/:model', handleOpenAIModelInfo)
}

/**
 * Extended request body with optional agent field
 */
type ExtendedChatCompletionBody = ChatCompletionCreateParams & {
  /** Optional agent identifier to route request to specific agent */
  agent?: string
}

/**
 * Main handler function for OpenAI compatible Chat Completions API requests.
 * - Request validation
 * - Model retrieval
 * - Sending request to LM API
 * - Streaming/non-streaming response processing
 * - Error handling
 * @param {express.Request} req Request
 * @param {express.Response} res Response
 * @returns {Promise<void>}
 */
async function handleOpenAIChatCompletions(
  req: express.Request,
  res: express.Response,
) {
  try {
    const body = req.body as ExtendedChatCompletionBody
    logger.debug('Received request', { body })

    // Validate required fields
    validateChatCompletionRequest(body)

    // Log agent if specified
    if (body.agent) {
      const agentInfo = await getAgentById(body.agent)
      if (agentInfo) {
        logger.info(`Using agent: ${agentInfo.name} (${agentInfo.id})`)
      } else {
        logger.warn(`Agent '${body.agent}' not found, proceeding without agent`)
      }
    }

    // Validate required fields
    validateChatCompletionRequest(body)

    // Get model
    const { vsCodeModel } = await getVSCodeModel(body.model, 'openai')

    // Determine streaming mode
    const isStreaming = body.stream === true

    // Convert OpenAI request to VSCode LM API format
    const { messages, options, inputTokens } =
      await convertOpenAIRequestToVSCodeRequest(body, vsCodeModel)

    // Create cancellation token
    const cancellationToken = new vscode.CancellationTokenSource().token

    // Send request to LM API
    const response = await vsCodeModel.sendRequest(
      messages,
      options,
      cancellationToken,
    )
    logger.debug('Received response from LM API')

    // Convert response to OpenAI format
    const openAIResponse = convertVSCodeResponseToOpenAIResponse(
      response,
      vsCodeModel,
      isStreaming,
      inputTokens,
    )
    logger.debug('openAIResponse', {
      openAIResponse,
      vsCodeModel,
      isStreaming,
    })

    // Handle streaming response
    if (isStreaming) {
      await handleStreamingResponse(
        res,
        openAIResponse as AsyncIterable<ChatCompletionChunk>,
        req.originalUrl || req.url,
      )
      return
    }

    // Handle non-streaming response
    const completion = await (openAIResponse as Promise<ChatCompletion>)
    logger.debug('completion', { completion })
    res.json(completion)
  } catch (error) {
    const { statusCode, apiError } = handleChatCompletionError(
      error as vscode.LanguageModelError,
    )
    res.status(statusCode).json({ error: apiError })
  }
}

/**
 * Validates required fields for Chat Completions API request
 * @param {ChatCompletionCreateParams} body
 * @throws Exception on error
 */
function validateChatCompletionRequest(body: ChatCompletionCreateParams) {
  // Check messages field presence and array type
  if (
    !body.messages ||
    !Array.isArray(body.messages) ||
    body.messages.length === 0
  ) {
    const error: vscode.LanguageModelError = {
      ...new Error('The messages field is required'),
      name: 'InvalidMessageRequest',
      code: 'invalid_message_format',
    }
    throw error
  }

  // Check model field presence
  if (!body.model) {
    const error: vscode.LanguageModelError = {
      ...new Error('The model field is required'),
      name: 'InvalidModelRequest',
      code: 'invalid_model',
    }
    throw error
  }
}

/**
 * Processes streaming response and sends to client
 * @param {express.Response} res
 * @param {AsyncIterable<ChatCompletionChunk>} stream
 * @param {string} reqPath
 * @returns {Promise<void>}
 */
async function handleStreamingResponse(
  res: express.Response,
  stream: AsyncIterable<ChatCompletionChunk>,
  reqPath: string,
) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  logger.debug('Streaming started', { stream: 'start', path: reqPath })
  let chunkIndex = 0

  try {
    // Send streaming responses sequentially
    for await (const chunk of stream) {
      const data = JSON.stringify(chunk)
      res.write(`data: ${data}\n\n`)
      logger.debug(
        `Streaming chunk: ${JSON.stringify({ stream: 'chunk', chunk, index: chunkIndex++ })}`,
      )
    }

    // Normal completion
    res.write('data: [DONE]\n\n')
    logger.debug('Streaming ended', {
      stream: 'end',
      path: reqPath,
      chunkCount: chunkIndex,
    })
  } catch (error) {
    // On error, send OpenAI compatible error and end stream
    const { apiError } = handleChatCompletionError(
      error as vscode.LanguageModelError,
    )
    res.write(`data: ${JSON.stringify({ error: apiError })}\n\n`)
    res.write('data: [DONE]\n\n')
    logger.error('Streaming error', { error, path: reqPath })
  } finally {
    // End stream
    res.end()
  }
}

/**
 * Converts VSCode LanguageModelError to OpenAI API compatible error format and logs
 * @param {vscode.LanguageModelError} error
 * @returns { statusCode: number, apiError: APIError }
 */
function handleChatCompletionError(error: vscode.LanguageModelError): {
  statusCode: number
  apiError: APIError
} {
  logger.error('VSCode LM API error', {
    cause: error.cause,
    code: error.code,
    message: error.message,
    name: error.name,
    stack: error.stack,
  })

  // Define variables
  let statusCode = 500
  let type = 'api_error'
  let code = error.code || 'internal_error'
  let param: string | null = null

  // Map based on LanguageModelError.name
  switch (error.name) {
    case 'InvalidMessageFormat':
    case 'InvalidModel':
      statusCode = 400
      type = 'invalid_request_error'
      code =
        error.name === 'InvalidMessageFormat'
          ? 'invalid_message_format'
          : 'invalid_model'
      break
    case 'NoPermissions':
      statusCode = 403
      type = 'access_terminated'
      code = 'access_terminated'
      break
    case 'Blocked':
      statusCode = 403
      type = 'blocked'
      code = 'blocked'
      break
    case 'NotFound':
      statusCode = 404
      type = 'not_found_error'
      code = 'model_not_found'
      param = 'model'
      break
    case 'ChatQuotaExceeded':
      statusCode = 429
      type = 'insufficient_quota'
      code = 'quota_exceeded'
      break
    case 'Unknown':
      statusCode = 500
      type = 'server_error'
      code = 'internal_server_error'
      break
  }

  // Return OpenAI compatible error format
  const apiError: APIError = {
    code,
    message: error.message || 'An unknown error has occurred',
    type,
    status: statusCode,
    headers: undefined,
    error: undefined,
    param,
    requestID: undefined,
    name: error.name || 'LanguageModelError',
  }
  logger.error(`OpenAI API error: ${apiError.message}`, apiError)

  return { statusCode, apiError }
}

/**
 * Handles OpenAI compatible model list requests
 * @param {express.Request} req Request
 * @param {express.Response} res Response
 * @returns {Promise<void>}
 */
async function handleOpenAIModels(
  _req: express.Request,
  res: express.Response,
) {
  try {
    // Get available models
    const availableModels = await modelManager.getAvailableModels()

    // Convert to OpenAI API format
    const now = Math.floor(Date.now() / 1000)
    const modelsData: Model[] = availableModels.map(model => ({
      id: model.id,
      object: 'model',
      created: now,
      owned_by: model.vendor || 'vscode',
    }))

    // Add proxy model ID
    modelsData.push({
      id: 'vscode-lm-proxy',
      object: 'model',
      created: now,
      owned_by: 'vscode-lm-proxy',
    })

    const openAIModelsResponse: PageResponse<Model> = {
      object: 'list',
      data: modelsData,
    }

    res.json(openAIModelsResponse)
  } catch (error: any) {
    logger.error(`OpenAI Models API error: ${error.message}`, error as Error)

    // Create error response
    const statusCode = error.statusCode || 500
    const errorResponse = {
      error: {
        message: error.message || 'An unknown error has occurred',
        type: error.type || 'api_error',
        code: error.code || 'internal_error',
      },
    }

    res.status(statusCode).json(errorResponse)
  }
}

/**
 * Handles OpenAI compatible single model info requests
 * @param {express.Request} req Request
 * @param {express.Response} res Response
 * @returns {Promise<void>}
 */
async function handleOpenAIModelInfo(
  req: express.Request,
  res: express.Response,
) {
  try {
    const modelId = req.params.model

    if (modelId === 'vscode-lm-proxy') {
      // Return fixed info for vscode-lm-proxy
      const now = Math.floor(Date.now() / 1000)
      const openAIModel: Model = {
        id: 'vscode-lm-proxy',
        object: 'model',
        created: now,
        owned_by: 'vscode-lm-proxy',
      }
      res.json(openAIModel)
      return
    }

    // Get model info from LM API
    const vsCodeModel = await modelManager.getModelInfo(modelId)

    // Throw error if model doesn't exist
    if (!vsCodeModel) {
      throw {
        ...new Error(`Model ${modelId} not found`),
        statusCode: 404,
        type: 'model_not_found_error',
      }
    }

    // Convert to OpenAI API format
    const openAIModel: Model = {
      id: vsCodeModel.id,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: vsCodeModel.vendor || 'vscode',
    }

    // Return response
    res.json(openAIModel)
  } catch (error: any) {
    logger.error(
      `OpenAI Model info API error: ${error.message}`,
      error as Error,
    )

    // Create error response
    const statusCode = error.statusCode || 500
    const errorResponse = {
      error: {
        message: error.message || 'An unknown error has occurred',
        type: error.type || 'api_error',
        code: error.code || 'internal_error',
      },
    }

    res.status(statusCode).json(errorResponse)
  }
}
