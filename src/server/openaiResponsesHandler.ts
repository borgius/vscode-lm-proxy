// OpenAI Responses API compatible endpoint handlers
import type express from 'express'
import type { APIError } from 'openai'
import * as vscode from 'vscode'
import {
  convertResponsesRequestToVSCodeRequest,
  convertVSCodeResponseToResponsesResponse,
  type ResponseCreateParams,
  type ResponseObject,
  type ResponseStreamEvent,
} from '../converter/openaiResponsesConverter'
import { logger } from '../utils/logger'
import { getVSCodeModel } from './handler'

/**
 * Sets up OpenAI Responses API compatible endpoints
 * @param {express.Express} app Express.js application
 * @returns {void}
 */
export function setupOpenAIResponsesEndpoints(app: express.Express): void {
  // Register OpenAI Responses API compatible endpoints
  app.post('/openai/responses', handleOpenAIResponses)
  app.post('/openai/v1/responses', handleOpenAIResponses)
}

/**
 * Main handler function for OpenAI Responses API compatible requests.
 * - Request validation
 * - Model retrieval
 * - Sending request to LM API
 * - Streaming/non-streaming response processing
 * - Error handling
 * @param {express.Request} req Request
 * @param {express.Response} res Response
 * @returns {Promise<void>}
 */
async function handleOpenAIResponses(
  req: express.Request,
  res: express.Response,
) {
  try {
    const body = req.body as ResponseCreateParams
    logger.debug('Received Responses API request', { body })

    // Validate required fields
    validateResponsesRequest(body)

    // Get model (use 'vscode-lm-proxy' as default if not specified)
    const modelId = body.model || 'vscode-lm-proxy'
    const { vsCodeModel } = await getVSCodeModel(modelId, 'openai')

    // Determine streaming mode
    const isStreaming = body.stream === true

    // Convert Responses API request to VSCode LM API format
    const { messages, options, inputTokens } =
      await convertResponsesRequestToVSCodeRequest(body, vsCodeModel)

    // Create cancellation token
    const cancellationToken = new vscode.CancellationTokenSource().token

    // Send request to LM API
    const response = await vsCodeModel.sendRequest(
      messages,
      options,
      cancellationToken,
    )
    logger.debug('Received response from LM API')

    // Convert response to Responses API format
    const responsesResponse = convertVSCodeResponseToResponsesResponse(
      response,
      vsCodeModel,
      isStreaming,
      inputTokens,
      body,
    )
    logger.debug('responsesResponse', {
      responsesResponse,
      vsCodeModel,
      isStreaming,
    })

    // Handle streaming response
    if (isStreaming) {
      await handleStreamingResponse(
        res,
        responsesResponse as AsyncIterable<ResponseStreamEvent>,
        req.originalUrl || req.url,
      )
      return
    }

    // Handle non-streaming response
    const responseObject = await (responsesResponse as Promise<ResponseObject>)
    logger.debug('responseObject', { responseObject })
    res.json(responseObject)
  } catch (error) {
    const { statusCode, apiError } = handleResponsesError(
      error as vscode.LanguageModelError,
    )
    res.status(statusCode).json({ error: apiError })
  }
}

/**
 * Validates required fields for Responses API request
 * @param {ResponseCreateParams} body
 * @throws Exception on error
 */
function validateResponsesRequest(body: ResponseCreateParams) {
  // Check input field presence
  if (body.input === undefined || body.input === null) {
    const error: vscode.LanguageModelError = {
      ...new Error('The input field is required'),
      name: 'InvalidInputRequest',
      code: 'invalid_request_error',
    }
    throw error
  }

  // Validate input content
  if (typeof body.input === 'string' && body.input.trim() === '') {
    const error: vscode.LanguageModelError = {
      ...new Error('The input field cannot be empty'),
      name: 'InvalidInputRequest',
      code: 'invalid_request_error',
    }
    throw error
  }

  if (Array.isArray(body.input) && body.input.length === 0) {
    const error: vscode.LanguageModelError = {
      ...new Error('The input array cannot be empty'),
      name: 'InvalidInputRequest',
      code: 'invalid_request_error',
    }
    throw error
  }
}

/**
 * Processes streaming response and sends to client
 * @param {express.Response} res
 * @param {AsyncIterable<ResponseStreamEvent>} stream
 * @param {string} reqPath
 * @returns {Promise<void>}
 */
async function handleStreamingResponse(
  res: express.Response,
  stream: AsyncIterable<ResponseStreamEvent>,
  reqPath: string,
) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  logger.debug('Responses API streaming started', {
    stream: 'start',
    path: reqPath,
  })
  let eventIndex = 0

  try {
    // Send streaming events sequentially
    for await (const event of stream) {
      const data = JSON.stringify(event)
      res.write(`event: ${event.type}\n`)
      res.write(`data: ${data}\n\n`)
      logger.debug(
        `Streaming event: ${JSON.stringify({ stream: 'event', event, index: eventIndex++ })}`,
      )
    }

    // Normal completion
    logger.debug('Responses API streaming ended', {
      stream: 'end',
      path: reqPath,
      eventCount: eventIndex,
    })
  } catch (error) {
    // On error, send OpenAI compatible error and end stream
    const { apiError } = handleResponsesError(
      error as vscode.LanguageModelError,
    )
    const errorEvent = {
      type: 'error',
      error: apiError,
    }
    res.write('event: error\n')
    res.write(`data: ${JSON.stringify(errorEvent)}\n\n`)
    logger.error('Responses API streaming error', { error, path: reqPath })
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
function handleResponsesError(error: vscode.LanguageModelError): {
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
    case 'InvalidInputRequest':
    case 'InvalidModel':
      statusCode = 400
      type = 'invalid_request_error'
      code =
        error.name === 'InvalidInputRequest'
          ? 'invalid_request_error'
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
  logger.error(`Responses API error: ${apiError.message}`, apiError)

  return { statusCode, apiError }
}
