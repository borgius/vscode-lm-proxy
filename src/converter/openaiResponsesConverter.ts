import * as vscode from 'vscode'
import { isTextPart, isToolCallPart } from '../server/handler'
import { generateRandomId } from '../utils'
import { logger } from '../utils/logger'

/**
 * OpenAI Responses API request parameters
 * Simplified version supporting the core functionality
 */
export interface ResponseCreateParams {
  model?: string
  input: string | ResponseInputItem[]
  instructions?: string
  max_output_tokens?: number
  temperature?: number
  top_p?: number
  stream?: boolean
  metadata?: Record<string, string>
  tool_choice?: string | { type: string; function?: { name: string } }
  tools?: ResponseTool[]
  parallel_tool_calls?: boolean
  store?: boolean
  truncation?: string
  reasoning?: { effort?: string; summary?: string }
}

/**
 * Input item types for Responses API
 */
export type ResponseInputItem =
  | ResponseInputMessageItem
  | ResponseOutputMessageItem

export interface ResponseInputMessageItem {
  type: 'message'
  role: 'user' | 'system' | 'developer'
  content: string | ResponseInputContentPart[]
}

export interface ResponseOutputMessageItem {
  type: 'message'
  id?: string
  role: 'assistant'
  status?: string
  content: ResponseOutputContentPart[]
}

export interface ResponseInputContentPart {
  type: 'input_text' | 'input_image' | 'input_file'
  text?: string
  image_url?: string
  file_url?: string
}

export interface ResponseOutputContentPart {
  type: 'output_text' | 'refusal'
  text?: string
  annotations?: unknown[]
}

export interface ResponseTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

/**
 * OpenAI Response object
 */
export interface ResponseObject {
  id: string
  object: 'response'
  created_at: number
  status: 'completed' | 'failed' | 'in_progress' | 'cancelled' | 'incomplete'
  completed_at?: number | null
  error: ResponseError | null
  incomplete_details: unknown | null
  instructions: string | null
  max_output_tokens: number | null
  model: string
  output: ResponseOutputItem[]
  parallel_tool_calls: boolean
  previous_response_id: string | null
  reasoning: { effort: string | null; summary: string | null }
  store: boolean
  temperature: number
  text: { format: { type: string } }
  tool_choice: string
  tools: ResponseTool[]
  top_p: number
  truncation: string
  usage: ResponseUsage | null
  user: string | null
  metadata: Record<string, string>
}

export interface ResponseError {
  code: string
  message: string
}

export interface ResponseOutputItem {
  type: 'message'
  id: string
  status: 'completed' | 'in_progress' | 'incomplete'
  role: 'assistant'
  content: ResponseOutputContentPart[]
}

export interface ResponseUsage {
  input_tokens: number
  input_tokens_details?: { cached_tokens: number }
  output_tokens: number
  output_tokens_details?: { reasoning_tokens: number }
  total_tokens: number
}

/**
 * Streaming event types for Responses API
 */
export type ResponseStreamEvent =
  | ResponseCreatedEvent
  | ResponseInProgressEvent
  | ResponseCompletedEvent
  | ResponseOutputItemAddedEvent
  | ResponseOutputItemDoneEvent
  | ResponseContentPartAddedEvent
  | ResponseContentPartDoneEvent
  | ResponseTextDeltaEvent
  | ResponseTextDoneEvent

export interface ResponseCreatedEvent {
  type: 'response.created'
  response: Partial<ResponseObject>
}

export interface ResponseInProgressEvent {
  type: 'response.in_progress'
  response: Partial<ResponseObject>
}

export interface ResponseCompletedEvent {
  type: 'response.completed'
  response: ResponseObject
}

export interface ResponseOutputItemAddedEvent {
  type: 'response.output_item.added'
  output_index: number
  item: ResponseOutputItem
}

export interface ResponseOutputItemDoneEvent {
  type: 'response.output_item.done'
  output_index: number
  item: ResponseOutputItem
}

export interface ResponseContentPartAddedEvent {
  type: 'response.content_part.added'
  item_id: string
  output_index: number
  content_index: number
  part: ResponseOutputContentPart
}

export interface ResponseContentPartDoneEvent {
  type: 'response.content_part.done'
  item_id: string
  output_index: number
  content_index: number
  part: ResponseOutputContentPart
}

export interface ResponseTextDeltaEvent {
  type: 'response.output_text.delta'
  item_id: string
  output_index: number
  content_index: number
  delta: string
}

export interface ResponseTextDoneEvent {
  type: 'response.output_text.done'
  item_id: string
  output_index: number
  content_index: number
  text: string
}

/**
 * Converts OpenAI Responses API request to VSCode LM API format.
 * Maps OpenAI's input, instructions, tools, etc. to VSCode's types,
 * absorbing API specification differences between the two.
 * @param {ResponseCreateParams} request OpenAI Responses API request parameters
 * @param {vscode.LanguageModelChat} vsCodeModel VSCode LanguageModelChat instance
 * @returns {{ messages: vscode.LanguageModelChatMessage[], options: vscode.LanguageModelChatRequestOptions, inputTokens: number }}
 *   VSCode extension API chat messages array and options
 */
export async function convertResponsesRequestToVSCodeRequest(
  request: ResponseCreateParams,
  vsCodeModel: vscode.LanguageModelChat,
): Promise<{
  messages: vscode.LanguageModelChatMessage[]
  options: vscode.LanguageModelChatRequestOptions
  inputTokens: number
}> {
  logger.debug('Converting Responses API request to VSCode request')

  const messages: vscode.LanguageModelChatMessage[] = []

  // Add instructions as system message if provided
  if (request.instructions) {
    messages.push(
      new vscode.LanguageModelChatMessage(
        vscode.LanguageModelChatMessageRole.Assistant,
        `[SYSTEM] ${request.instructions}`,
        'System',
      ),
    )
  }

  // Convert input to messages
  if (typeof request.input === 'string') {
    // Simple string input - treat as user message
    messages.push(
      new vscode.LanguageModelChatMessage(
        vscode.LanguageModelChatMessageRole.User,
        request.input,
        'User',
      ),
    )
  } else if (Array.isArray(request.input)) {
    // Array of input items
    for (const item of request.input) {
      if (item.type === 'message') {
        let role: vscode.LanguageModelChatMessageRole
        let prefix = ''
        let name = ''

        switch (item.role) {
          case 'user':
            role = vscode.LanguageModelChatMessageRole.User
            name = 'User'
            break
          case 'assistant':
            role = vscode.LanguageModelChatMessageRole.Assistant
            name = 'Assistant'
            break
          case 'system':
            role = vscode.LanguageModelChatMessageRole.Assistant
            prefix = '[SYSTEM] '
            name = 'System'
            break
          case 'developer':
            role = vscode.LanguageModelChatMessageRole.Assistant
            prefix = '[DEVELOPER] '
            name = 'Developer'
            break
          default:
            role = vscode.LanguageModelChatMessageRole.User
            name = 'User'
        }

        // Extract content
        let content: string | vscode.LanguageModelTextPart[]
        if (typeof item.content === 'string') {
          content = prefix + item.content
        } else if (Array.isArray(item.content)) {
          const parts: vscode.LanguageModelTextPart[] = []
          for (const part of item.content) {
            if (part.type === 'input_text' && part.text) {
              parts.push(new vscode.LanguageModelTextPart(prefix + part.text))
            } else if (part.type === 'output_text' && part.text) {
              parts.push(new vscode.LanguageModelTextPart(part.text))
            } else if (part.type === 'input_image' && part.image_url) {
              parts.push(
                new vscode.LanguageModelTextPart(
                  `[Image URL]: ${part.image_url}`,
                ),
              )
            } else if (part.type === 'input_file' && part.file_url) {
              parts.push(
                new vscode.LanguageModelTextPart(
                  `[File URL]: ${part.file_url}`,
                ),
              )
            }
          }
          content = parts.length > 0 ? parts : prefix
        } else {
          content = prefix
        }

        messages.push(new vscode.LanguageModelChatMessage(role, content, name))
      }
    }
  }

  // Calculate input tokens
  let inputTokens = 0
  for (const msg of messages) {
    inputTokens += await vsCodeModel.countTokens(msg)
  }

  // Build options
  const options: vscode.LanguageModelChatRequestOptions = {}

  // Convert tool_choice
  if (request.tool_choice !== undefined) {
    const tc = request.tool_choice
    if (typeof tc === 'string') {
      switch (tc) {
        case 'auto':
          options.toolMode = vscode.LanguageModelChatToolMode.Auto
          break
        case 'required':
          options.toolMode = vscode.LanguageModelChatToolMode.Required
          break
        case 'none':
          options.toolMode = vscode.LanguageModelChatToolMode.Auto
          break
      }
    } else {
      options.toolMode = vscode.LanguageModelChatToolMode.Auto
    }
  }

  // Convert tools
  if (Array.isArray(request.tools)) {
    options.tools = request.tools
      .filter(tool => tool.type === 'function')
      .map(tool => {
        const base = {
          name: tool.function.name,
          description: tool.function.description ?? '',
        }
        return tool.function.parameters !== undefined
          ? { ...base, inputSchema: tool.function.parameters }
          : base
      })
  }

  // Pass other parameters via modelOptions
  const modelOptions: Record<string, unknown> = {}
  if (request.temperature !== undefined) {
    modelOptions.temperature = request.temperature
  }
  if (request.top_p !== undefined) {
    modelOptions.top_p = request.top_p
  }
  if (request.max_output_tokens !== undefined) {
    modelOptions.max_tokens = request.max_output_tokens
  }
  if (request.parallel_tool_calls !== undefined) {
    modelOptions.parallel_tool_calls = request.parallel_tool_calls
  }
  if (Object.keys(modelOptions).length > 0) {
    options.modelOptions = modelOptions
  }

  logger.debug('Converted Responses API request to VSCode request', {
    messages,
    options,
    inputTokens,
  })

  return { messages, options, inputTokens }
}

/**
 * Converts VSCode LanguageModelChatResponse to OpenAI Responses API format.
 * For streaming, returns an AsyncIterable of ResponseStreamEvent.
 * For non-streaming, returns a Promise of ResponseObject.
 * @param vscodeResponse VSCode LanguageModelChatResponse
 * @param vsCodeModel VSCode LanguageModelChat instance
 * @param isStreaming Whether streaming is enabled
 * @param inputTokens Input token count
 * @param request Original request parameters
 * @returns ResponseObject or AsyncIterable<ResponseStreamEvent>
 */
export function convertVSCodeResponseToResponsesResponse(
  vscodeResponse: vscode.LanguageModelChatResponse,
  vsCodeModel: vscode.LanguageModelChat,
  isStreaming: boolean,
  inputTokens: number,
  request: ResponseCreateParams,
): Promise<ResponseObject> | AsyncIterable<ResponseStreamEvent> {
  if (isStreaming) {
    return convertVSCodeStreamToResponsesStream(
      vscodeResponse.stream,
      vsCodeModel,
      inputTokens,
      request,
    )
  }
  return convertVSCodeTextToResponsesObject(
    vscodeResponse,
    vsCodeModel,
    inputTokens,
    request,
  )
}

/**
 * Converts VSCode stream to OpenAI Responses API streaming events.
 * @param stream VSCode stream
 * @param vsCodeModel VSCode LanguageModelChat instance
 * @param inputTokens Input token count
 * @param request Original request parameters
 * @returns AsyncIterable<ResponseStreamEvent>
 */
async function* convertVSCodeStreamToResponsesStream(
  stream: AsyncIterable<
    vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart | unknown
  >,
  vsCodeModel: vscode.LanguageModelChat,
  inputTokens: number,
  request: ResponseCreateParams,
): AsyncIterable<ResponseStreamEvent> {
  const responseId = `resp_${generateRandomId()}`
  const messageId = `msg_${generateRandomId()}`
  const createdAt = Math.floor(Date.now() / 1000)

  let textBuffer = ''
  let outputTokens = 0

  // Emit response.created event
  yield {
    type: 'response.created',
    response: {
      id: responseId,
      object: 'response',
      created_at: createdAt,
      status: 'in_progress',
      model: vsCodeModel.id,
      output: [],
    },
  } as ResponseCreatedEvent

  // Emit response.in_progress event
  yield {
    type: 'response.in_progress',
    response: {
      id: responseId,
      object: 'response',
      created_at: createdAt,
      status: 'in_progress',
      model: vsCodeModel.id,
      output: [],
    },
  } as ResponseInProgressEvent

  // Emit output_item.added event
  yield {
    type: 'response.output_item.added',
    output_index: 0,
    item: {
      type: 'message',
      id: messageId,
      status: 'in_progress',
      role: 'assistant',
      content: [],
    },
  } as ResponseOutputItemAddedEvent

  // Emit content_part.added event
  yield {
    type: 'response.content_part.added',
    item_id: messageId,
    output_index: 0,
    content_index: 0,
    part: {
      type: 'output_text',
      text: '',
      annotations: [],
    },
  } as ResponseContentPartAddedEvent

  // Stream text deltas
  for await (const part of stream) {
    if (isTextPart(part)) {
      textBuffer += part.value
      outputTokens += await vsCodeModel.countTokens(part.value)

      yield {
        type: 'response.output_text.delta',
        item_id: messageId,
        output_index: 0,
        content_index: 0,
        delta: part.value,
      } as ResponseTextDeltaEvent
    } else if (isToolCallPart(part)) {
      outputTokens += await vsCodeModel.countTokens(JSON.stringify(part))
    }
  }

  // Emit text done event
  yield {
    type: 'response.output_text.done',
    item_id: messageId,
    output_index: 0,
    content_index: 0,
    text: textBuffer,
  } as ResponseTextDoneEvent

  // Emit content_part.done event
  yield {
    type: 'response.content_part.done',
    item_id: messageId,
    output_index: 0,
    content_index: 0,
    part: {
      type: 'output_text',
      text: textBuffer,
      annotations: [],
    },
  } as ResponseContentPartDoneEvent

  // Emit output_item.done event
  yield {
    type: 'response.output_item.done',
    output_index: 0,
    item: {
      type: 'message',
      id: messageId,
      status: 'completed',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: textBuffer,
          annotations: [],
        },
      ],
    },
  } as ResponseOutputItemDoneEvent

  // Emit response.completed event
  yield {
    type: 'response.completed',
    response: {
      id: responseId,
      object: 'response',
      created_at: createdAt,
      status: 'completed',
      completed_at: Math.floor(Date.now() / 1000),
      error: null,
      incomplete_details: null,
      instructions: request.instructions || null,
      max_output_tokens: request.max_output_tokens || null,
      model: vsCodeModel.id,
      output: [
        {
          type: 'message',
          id: messageId,
          status: 'completed',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: textBuffer,
              annotations: [],
            },
          ],
        },
      ],
      parallel_tool_calls: request.parallel_tool_calls ?? true,
      previous_response_id: null,
      reasoning: {
        effort: request.reasoning?.effort || null,
        summary: request.reasoning?.summary || null,
      },
      store: request.store ?? true,
      temperature: request.temperature ?? 1.0,
      text: { format: { type: 'text' } },
      tool_choice:
        typeof request.tool_choice === 'string' ? request.tool_choice : 'auto',
      tools: request.tools || [],
      top_p: request.top_p ?? 1.0,
      truncation: request.truncation || 'disabled',
      usage: {
        input_tokens: inputTokens,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: outputTokens,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: inputTokens + outputTokens,
      },
      user: null,
      metadata: request.metadata || {},
    },
  } as ResponseCompletedEvent
}

/**
 * Non-streaming: Converts VSCode LanguageModelChatResponse to OpenAI Responses API format.
 * @param vscodeResponse VSCode LanguageModelChatResponse
 * @param vsCodeModel VSCode LanguageModelChat instance
 * @param inputTokens Input token count
 * @param request Original request parameters
 * @returns Promise<ResponseObject>
 */
async function convertVSCodeTextToResponsesObject(
  vscodeResponse: vscode.LanguageModelChatResponse,
  vsCodeModel: vscode.LanguageModelChat,
  inputTokens: number,
  request: ResponseCreateParams,
): Promise<ResponseObject> {
  const responseId = `resp_${generateRandomId()}`
  const messageId = `msg_${generateRandomId()}`
  const createdAt = Math.floor(Date.now() / 1000)

  let textBuffer = ''
  let outputTokens = 0

  // Collect all text from stream
  for await (const part of vscodeResponse.stream) {
    if (isTextPart(part)) {
      textBuffer += part.value
      outputTokens += await vsCodeModel.countTokens(part.value)
    } else if (isToolCallPart(part)) {
      outputTokens += await vsCodeModel.countTokens(JSON.stringify(part))
    }
  }

  return {
    id: responseId,
    object: 'response',
    created_at: createdAt,
    status: 'completed',
    completed_at: Math.floor(Date.now() / 1000),
    error: null,
    incomplete_details: null,
    instructions: request.instructions || null,
    max_output_tokens: request.max_output_tokens || null,
    model: vsCodeModel.id,
    output: [
      {
        type: 'message',
        id: messageId,
        status: 'completed',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: textBuffer,
            annotations: [],
          },
        ],
      },
    ],
    parallel_tool_calls: request.parallel_tool_calls ?? true,
    previous_response_id: null,
    reasoning: {
      effort: request.reasoning?.effort || null,
      summary: request.reasoning?.summary || null,
    },
    store: request.store ?? true,
    temperature: request.temperature ?? 1.0,
    text: { format: { type: 'text' } },
    tool_choice:
      typeof request.tool_choice === 'string' ? request.tool_choice : 'auto',
    tools: request.tools || [],
    top_p: request.top_p ?? 1.0,
    truncation: request.truncation || 'disabled',
    usage: {
      input_tokens: inputTokens,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: outputTokens,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: inputTokens + outputTokens,
    },
    user: null,
    metadata: request.metadata || {},
  }
}
