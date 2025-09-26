import type { Chat, ChatCompletion } from 'openai/resources'
import type * as vscode from 'vscode'
import { isTextPart, isToolCallPart } from '@/server/handler'
import { generateRandomId } from '@/utils'

/**
 * 非ストリーミング: VSCodeのLanguageModelChatResponseをOpenAIのChatCompletion形式に変換します。
 * @param vscodeResponse VSCodeのLanguageModelChatResponse
 * @param vsCodeModel VSCodeのLanguageModelChatインスタンス
 * @param inputTokens 入力トークン数
 * @returns Promise<ChatCompletion>
 */
export async function convertVSCodeTextToOpenAICompletion(
  vscodeResponse: vscode.LanguageModelChatResponse,
  vsCodeModel: vscode.LanguageModelChat,
  inputTokens: number,
): Promise<ChatCompletion> {
  // チャットIDとタイムスタンプ生成
  const id = `chatcmpl-${generateRandomId()}`
  const created = Math.floor(Date.now() / 1000)

  // contentとtoolCallsの初期化
  let textBuffer = ''
  const toolCalls: Chat.Completions.ChatCompletionMessageToolCall[] = []
  let isToolCalled = false

  let outputTokens = 0 // 出力トークン数

  // ストリームからパートを順次取得
  for await (const part of vscodeResponse.stream) {
    if (isTextPart(part)) {
      // テキストはバッファに連結
      textBuffer += part.value

      // 出力トークン数を加算
      outputTokens += await vsCodeModel.countTokens(part.value)
    } else if (isToolCallPart(part)) {
      // ツールはtoolCallsに追加
      toolCalls.push({
        id: part.callId,
        type: 'function',
        function: {
          name: part.name,
          arguments: JSON.stringify(part.input),
        },
      })

      // ツールコールもトークン数に加算
      outputTokens += await vsCodeModel.countTokens(JSON.stringify(part))

      isToolCalled = true
    }
  }

  // choiceオブジェクトの生成
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

  // ChatCompletionオブジェクトを返却
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
