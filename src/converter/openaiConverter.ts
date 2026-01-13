import type {
  Chat,
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
} from 'openai/resources'
import * as vscode from 'vscode'
import { isTextPart, isToolCallPart } from '../server/handler'
import { generateRandomId } from '../utils'
import { logger } from '../utils/logger'

/**
 * Converts OpenAI API ChatCompletionCreateParams request to VSCode extension API chat request format.
 * Maps OpenAI's messages, tools, tool_choice, etc. to VSCode's types,
 * aggregating unsupported parameters into modelOptions for future extensibility.
 * Contains conversion logic to absorb specification differences between APIs
 * such as OpenAI-specific roles and tool specifications.
 * @param {ChatCompletionCreateParams} openaiRequest OpenAI chat request parameters
 * @param {vscode.LanguageModelChat} vsCodeModel VSCode LanguageModelChat instance
 * @returns {{ messages: vscode.LanguageModelChatMessage[], options: vscode.LanguageModelChatRequestOptions }}
 *   VSCode extension API chat messages array and options
 */
export async function convertOpenAIRequestToVSCodeRequest(
  openaiRequest: ChatCompletionCreateParams,
  vsCodeModel: vscode.LanguageModelChat,
): Promise<{
  messages: vscode.LanguageModelChatMessage[]
  options: vscode.LanguageModelChatRequestOptions
  inputTokens: number
}> {
  logger.debug('Converting OpenAI request to VSCode request')

  // Convert OpenAI messages to VSCode LanguageModelChatMessage[]
  const messages: vscode.LanguageModelChatMessage[] =
    openaiRequest.messages.map(msg => {
      let role: vscode.LanguageModelChatMessageRole
      let content:
        | string
        | Array<
            | vscode.LanguageModelTextPart
            | vscode.LanguageModelToolResultPart
            | vscode.LanguageModelToolCallPart
          > = ''
      let prefix = ''
      let name = 'Assistant'

      // Role conversion
      switch (msg.role) {
        case 'user':
          role = vscode.LanguageModelChatMessageRole.User
          name = 'User'
          break
        case 'assistant':
          role = vscode.LanguageModelChatMessageRole.Assistant
          name = 'Assistant'
          break
        case 'developer':
          role = vscode.LanguageModelChatMessageRole.Assistant
          prefix = '[DEVELOPER] '
          name = 'Developer'
          break
        case 'system':
          role = vscode.LanguageModelChatMessageRole.Assistant
          prefix = '[SYSTEM] '
          name = 'System'
          break
        case 'tool':
          role = vscode.LanguageModelChatMessageRole.Assistant
          prefix = '[TOOL] '
          name = 'Tool'
          break
        case 'function':
          role = vscode.LanguageModelChatMessageRole.Assistant
          prefix = '[FUNCTION] '
          name = 'Function'
          break
      }

      // Content conversion (string or array)
      if (typeof msg.content === 'string') {
        content = prefix + msg.content
      } else if (Array.isArray(msg.content)) {
        content = msg.content.map(c => {
          switch (c.type) {
            case 'text':
              return new vscode.LanguageModelTextPart(c.text)
            case 'image_url':
              return new vscode.LanguageModelTextPart(
                `[Image URL]: ${JSON.stringify(c.image_url)}`,
              )
            case 'input_audio':
              return new vscode.LanguageModelTextPart(
                `[Input Audio]: ${JSON.stringify(c.input_audio)}`,
              )
            case 'file':
              return new vscode.LanguageModelTextPart(
                `[File]: ${JSON.stringify(c.file)}`,
              )
            case 'refusal':
              return new vscode.LanguageModelTextPart(`[Refusal]: ${c.refusal}`)
          }
        })
      }

      return new vscode.LanguageModelChatMessage(role, content, name)
    })

  // --- Calculate input tokens ---
  let inputTokens = 0
  for (const msg of messages) {
    inputTokens += await vsCodeModel.countTokens(msg)
  }

  // --- Generate options ---
  const options: vscode.LanguageModelChatRequestOptions = {}

  // Convert tool_choice
  if (
    'tool_choice' in openaiRequest &&
    openaiRequest.tool_choice !== undefined
  ) {
    const tc = openaiRequest.tool_choice
    if (typeof tc === 'string') {
      // 'auto' | 'required' | 'none' case
      switch (tc) {
        case 'auto':
          options.toolMode = vscode.LanguageModelChatToolMode.Auto
          break
        case 'required':
          options.toolMode = vscode.LanguageModelChatToolMode.Required
          break
        case 'none':
          // VSCode API doesn't have Off/None, fallback to Auto
          options.toolMode = vscode.LanguageModelChatToolMode.Auto
          break
      }
    } else {
      // 'function' case
      options.toolMode = vscode.LanguageModelChatToolMode.Auto
    }
  }

  // Convert tools
  if ('tools' in openaiRequest && Array.isArray(openaiRequest.tools)) {
    options.tools = openaiRequest.tools.map(tool => {
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
  const modelOptions: { [name: string]: any } = {}
  const modelOptionKeys = [
    'audio',
    'frequency_penalty',
    'function_call',
    'functions',
    'logit_bias',
    'logprobs',
    'max_completion_tokens',
    'max_tokens',
    'metadata',
    'modalities',
    'n',
    'parallel_tool_calls',
    'prediction',
    'presence_penalty',
    'reasoning_effort',
    'response_format',
    'seed',
    'service_tier',
    'stop',
    'store',
    'stream',
    'stream_options',
    'temperature',
    'top_logprobs',
    'top_p',
    'user',
    'web_search_options',
  ]

  // --- Add other options to modelOptions ---
  for (const key of modelOptionKeys) {
    if (key in openaiRequest && (openaiRequest as any)[key] !== undefined) {
      modelOptions[key] = (openaiRequest as any)[key]
    }
  }
  if (Object.keys(modelOptions).length > 0) {
    options.modelOptions = modelOptions
  }

  // --- Log conversion results ---
  logger.debug('Converted OpenAI request to VSCode request', {
    messages,
    options,
    inputTokens,
  })

  return { messages, options, inputTokens }
}

/**
 * Converts VSCode LanguageModelChatResponse to OpenAI ChatCompletion or ChatCompletionChunk format.
 * For streaming, returns an AsyncIterable of ChatCompletionChunk.
 * For non-streaming, returns the full text as a ChatCompletion.
 * @param vscodeResponse VSCode LanguageModelChatResponse
 * @param vsCodeModel VSCode LanguageModelChat instance
 * @param isStreaming Whether streaming is enabled
 * @param inputTokens Input token count
 * @returns ChatCompletion or AsyncIterable<ChatCompletionChunk>
 */
export function convertVSCodeResponseToOpenAIResponse(
  vscodeResponse: vscode.LanguageModelChatResponse,
  vsCodeModel: vscode.LanguageModelChat,
  isStreaming: boolean,
  inputTokens: number,
): Promise<ChatCompletion> | AsyncIterable<ChatCompletionChunk> {
  // Streaming case
  if (isStreaming) {
    // Return AsyncIterable of ChatCompletionChunk
    return convertVSCodeStreamToOpenAIChunks(
      vscodeResponse.stream,
      vsCodeModel,
      inputTokens,
    )
  }
  // Non-streaming case
  // Convert full text to OpenAI ChatCompletion
  return convertVSCodeTextToOpenAICompletion(
    vscodeResponse,
    vsCodeModel,
    inputTokens,
  )
}

/**
 * Converts VSCode stream to OpenAI ChatCompletionChunk AsyncIterable.
 * @param stream VSCode stream
 * @param vsCodeModel VSCode LanguageModelChat instance
 * @param inputTokens Input token count
 * @returns AsyncIterable<ChatCompletionChunk>
 */
async function* convertVSCodeStreamToOpenAIChunks(
  stream: AsyncIterable<
    vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart | unknown
  >,
  vsCodeModel: vscode.LanguageModelChat,
  inputTokens: number,
): AsyncIterable<ChatCompletionChunk> {
  // Generate chunk ID and timestamp
  const randomId = `chatcmpl-${generateRandomId()}`
  const created = Math.floor(Date.now() / 1000)

  let isRoleSent = false
  let toolCallIndex = 0
  let isToolCalled = false // Whether tool_call has occurred

  let outputTokens = 0 // Output token count

  // Generate streaming chunks
  for await (const part of stream) {
    // Initialize chunk
    const chunk: ChatCompletionChunk = {
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: null,
        },
      ],
      created,
      id: randomId,
      model: vsCodeModel.id,
      object: 'chat.completion.chunk',
      service_tier: undefined,
      system_fingerprint: undefined,
      usage: {
        completion_tokens: 0,
        prompt_tokens: 0,
        total_tokens: 0,
        completion_tokens_details: {
          accepted_prediction_tokens: 0,
          audio_tokens: 0,
          reasoning_tokens: 0,
          rejected_prediction_tokens: 0,
        },
        prompt_tokens_details: {
          audio_tokens: 0,
          cached_tokens: 0,
        },
      },
    }

    // Text part case
    if (isTextPart(part)) {
      if (!isRoleSent) {
        chunk.choices[0].delta.role = 'assistant'
        isRoleSent = true
      }
      chunk.choices[0].delta.content = part.value

      // Add to output token count
      outputTokens += await vsCodeModel.countTokens(part.value)
    }
    // Tool call part case
    else if (isToolCallPart(part)) {
      chunk.choices[0].delta.tool_calls = [
        {
          index: toolCallIndex++,
          id: part.callId,
          type: 'function',
          function: {
            name: part.name,
            arguments: JSON.stringify(part.input),
          },
        },
      ]

      // Add tool call to token count
      outputTokens += await vsCodeModel.countTokens(JSON.stringify(part))

      isToolCalled = true
    }

    yield chunk
  }

  // Generate end chunk
  yield {
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: isToolCalled ? 'tool_calls' : 'stop',
      },
    ],
    created,
    id: randomId,
    model: vsCodeModel.id,
    object: 'chat.completion.chunk',
    service_tier: undefined,
    system_fingerprint: undefined,
    usage: {
      completion_tokens: outputTokens,
      prompt_tokens: inputTokens,
      total_tokens: inputTokens + outputTokens,
      // completion_tokens_details: {
      //   accepted_prediction_tokens: 0,
      //   audio_tokens: 0,
      //   reasoning_tokens: 0,
      //   rejected_prediction_tokens: 0,
      // },
      // prompt_tokens_details: {
      //   audio_tokens: 0,
      //   cached_tokens: 0,
      // },
    },
  }
}

/**
 * Non-streaming: Converts VSCode LanguageModelChatResponse to OpenAI ChatCompletion format.
 * @param vscodeResponse VSCode LanguageModelChatResponse
 * @param vsCodeModel VSCode LanguageModelChat instance
 * @param inputTokens Input token count
 * @returns Promise<ChatCompletion>
 */
async function convertVSCodeTextToOpenAICompletion(
  vscodeResponse: vscode.LanguageModelChatResponse,
  vsCodeModel: vscode.LanguageModelChat,
  inputTokens: number,
): Promise<ChatCompletion> {
  // Generate chat ID and timestamp
  const id = `chatcmpl-${generateRandomId()}`
  const created = Math.floor(Date.now() / 1000)

  // Initialize content and toolCalls
  let textBuffer = ''
  const toolCalls: Chat.Completions.ChatCompletionMessageToolCall[] = []
  let isToolCalled = false

  let outputTokens = 0 // Output token count

  // Sequentially get parts from stream
  for await (const part of vscodeResponse.stream) {
    if (isTextPart(part)) {
      // Concatenate text to buffer
      textBuffer += part.value

      // Add to output token count
      outputTokens += await vsCodeModel.countTokens(part.value)
    } else if (isToolCallPart(part)) {
      // Add tool to toolCalls
      toolCalls.push({
        id: part.callId,
        type: 'function',
        function: {
          name: part.name,
          arguments: JSON.stringify(part.input),
        },
      })

      // Add tool call to token count
      outputTokens += await vsCodeModel.countTokens(JSON.stringify(part))

      isToolCalled = true
    }
  }

  // Generate choice object
  const choice: Chat.Completions.ChatCompletion.Choice = {
    index: 0,
    message: {
      role: 'assistant',
      content: textBuffer,
      refusal: null,
      tool_calls: isToolCalled ? toolCalls : undefined,
    },
    logprobs: null,
    finish_reason: isToolCalled ? 'tool_calls' : 'stop',
  }

  // Return ChatCompletion object
  return {
    choices: [choice],
    created,
    id,
    model: vsCodeModel.id,
    object: 'chat.completion',
    service_tier: undefined,
    system_fingerprint: undefined,
    usage: {
      completion_tokens: outputTokens,
      prompt_tokens: inputTokens,
      total_tokens: inputTokens + outputTokens,
      // completion_tokens_details: {
      //   accepted_prediction_tokens: 0,
      //   audio_tokens: 0,
      //   reasoning_tokens: 0,
      //   rejected_prediction_tokens: 0,
      // },
      // prompt_tokens_details: {
      //   audio_tokens: 0,
      //   cached_tokens: 0,
      // },
    },
  }
}
