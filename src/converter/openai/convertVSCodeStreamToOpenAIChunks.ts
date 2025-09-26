import type { ChatCompletionChunk } from 'openai/resources'
import type * as vscode from 'vscode'
import { isTextPart, isToolCallPart } from '@/server/handler'
import { generateRandomId } from '@/utils'

/**
 * VSCodeのストリームをOpenAIのChatCompletionChunkのAsyncIterableに変換します。
 * @param stream VSCodeのストリーム
 * @param vsCodeModel VSCodeのLanguageModelChatインスタンス
 * @param inputTokens 入力トークン数
 * @returns AsyncIterable<ChatCompletionChunk>
 */
export async function* convertVSCodeStreamToOpenAIChunks(
  stream: AsyncIterable<
    vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart | unknown
  >,
  vsCodeModel: vscode.LanguageModelChat,
  inputTokens: number,
): AsyncIterable<ChatCompletionChunk> {
  // チャンクIDとタイムスタンプ生成
  const randomId = `chatcmpl-${generateRandomId()}`
  const created = Math.floor(Date.now() / 1000)

  let isRoleSent = false
  let toolCallIndex = 0
  let isToolCalled = false // tool_callが出現したかどうか

  let outputTokens = 0 // 出力トークン数

  // ストリーミングチャンクを生成
  for await (const part of stream) {
    // チャンクの初期化
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

    // テキストパートの場合
    if (isTextPart(part)) {
      if (!isRoleSent) {
        chunk.choices[0].delta.role = 'assistant'
        isRoleSent = true
      }
      chunk.choices[0].delta.content = part.value

      // 出力トークン数を加算
      outputTokens += await vsCodeModel.countTokens(part.value)
    }
    // ツールコールパートの場合
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

      // ツールコールもトークン数に加算
      outputTokens += await vsCodeModel.countTokens(JSON.stringify(part))

      isToolCalled = true
    }

    yield chunk
  }

  // 終了チャンクを生成
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
