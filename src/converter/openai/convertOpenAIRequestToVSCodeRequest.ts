import type { ChatCompletionCreateParams } from 'openai/resources'
import * as vscode from 'vscode'
import { logger } from '@/utils/logger'

/**
 * OpenAI APIのChatCompletionCreateParamsリクエストをVSCode拡張APIのチャットリクエスト形式に変換します。
 * OpenAIのmessages, tools, tool_choice等をVSCodeの型にマッピングし、
 * VSCode APIがサポートしないパラメータはmodelOptionsに集約して将来の拡張性を確保します。
 * OpenAI独自のroleやtool指定など、API間の仕様差異を吸収するための変換ロジックを含みます。
 * @param {ChatCompletionCreateParams} openaiRequest OpenAIのチャットリクエストパラメータ
 * @param {vscode.LanguageModelChat} vsCodeModel VSCodeのLanguageModelChatインスタンス
 * @returns {{ messages: vscode.LanguageModelChatMessage[], options: vscode.LanguageModelChatRequestOptions }}
 *   VSCode拡張API用のチャットメッセージ配列とオプション
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

  // OpenAIのmessagesをVSCodeのLanguageModelChatMessage[]に変換
  const messages: vscode.LanguageModelChatMessage[] =
    openaiRequest.messages.map(msg => {
      let role: vscode.LanguageModelChatMessageRole =
        vscode.LanguageModelChatMessageRole.User
      let content:
        | string
        | Array<
            | vscode.LanguageModelTextPart
            | vscode.LanguageModelToolResultPart
            | vscode.LanguageModelToolCallPart
          > = ''
      let prefix = ''
      let name = 'Assistant'

      // ロール変換
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

      // contentの変換（string or array）
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

  // --- input tokens計算 ---
  let inputTokens = 0
  for (const msg of messages) {
    inputTokens += await vsCodeModel.countTokens(msg)
  }

  // --- options生成 ---
  const options: vscode.LanguageModelChatRequestOptions = {}

  // tool_choice変換
  if (
    'tool_choice' in openaiRequest &&
    openaiRequest.tool_choice !== undefined
  ) {
    const tc = openaiRequest.tool_choice
    if (typeof tc === 'string') {
      // 'auto' | 'required' | 'none' の場合
      switch (tc) {
        case 'auto':
          options.toolMode = vscode.LanguageModelChatToolMode.Auto
          break
        case 'required':
          options.toolMode = vscode.LanguageModelChatToolMode.Required
          break
        case 'none':
          // VSCode APIにOff/Noneは存在しないためAutoにフォールバック
          options.toolMode = vscode.LanguageModelChatToolMode.Auto
          break
      }
    } else {
      // 'function' の場合
      options.toolMode = vscode.LanguageModelChatToolMode.Auto
    }
  }

  // tools変換
  if ('tools' in openaiRequest && Array.isArray(openaiRequest.tools)) {
    options.tools = openaiRequest.tools.map(tool => {
      // ChatCompletionFunctionToolの場合
      if (tool.type === 'function') {
        return {
          name: tool.function.name,
          description: tool.function.description ?? '',
          inputSchema: tool.function.parameters,
        }
      }

      // ChatCompletionCustomToolの場合
      const base = {
        name: tool.custom.name,
        description: tool.custom.description ?? '',
      }

      if (tool.custom.format) {
        if (tool.custom.format.type === 'text') {
          // no parameters for text tools
        } else if (tool.custom.format.type === 'grammar') {
          return {
            ...base,
            inputSchema: {
              syntax: tool.custom.format.grammar.syntax,
              definition: tool.custom.format.grammar.definition,
            },
          }
        }
      }

      return base
    })
  }

  // その他のパラメータはmodelOptionsにまとめて渡す
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

  // --- その他のオプションをmodelOptionsに追加 ---
  for (const key of modelOptionKeys) {
    if (key in openaiRequest && (openaiRequest as any)[key] !== undefined) {
      modelOptions[key] = (openaiRequest as any)[key]
    }
  }
  if (Object.keys(modelOptions).length > 0) {
    options.modelOptions = modelOptions
  }

  // --- 変換結果をログ出力 ---
  logger.debug('Converted OpenAI request to VSCode request', {
    messages,
    options,
    inputTokens,
  })

  return { messages, options, inputTokens }
}
