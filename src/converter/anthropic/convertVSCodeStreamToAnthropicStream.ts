import type {
  RawMessageStreamEvent,
  StopReason,
} from '@anthropic-ai/sdk/resources'
import type * as vscode from 'vscode'
import { isTextPart, isToolCallPart } from '@/server/handler'
import { generateRandomId } from '@/utils'

/**
 * VSCodeのストリームをAnthropicのRawMessageStreamEvent列に変換する。
 * - テキストパートはcontent_block_start, content_block_delta, content_block_stopで表現
 * - ツールコールパートはtool_useブロックとして表現
 * - 最後にmessage_delta, message_stopを送信
 * @param stream VSCodeのストリーム
 * @param vsCodeModel VSCodeのLanguageModelChatインスタンス
 * @param inputTokens 入力トークン数
 * @returns Anthropic RawMessageStreamEventのAsyncIterable
 */
export async function* convertVSCodeStreamToAnthropicStream(
  stream: AsyncIterable<
    vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart | unknown
  >,
  vsCodeModel: vscode.LanguageModelChat,
  inputTokens: number,
): AsyncIterable<RawMessageStreamEvent> {
  const messageId = `msg_${generateRandomId()}`
  let stopReason: StopReason = 'end_turn'
  let outputTokens = 0

  // --- message_startイベント送信 ---
  yield {
    type: 'message_start',
    message: {
      id: messageId,
      type: 'message',
      role: 'assistant',
      content: [],
      model: vsCodeModel.id,
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: inputTokens,
        output_tokens: 0,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        server_tool_use: null,
        service_tier: null,
      },
    },
  }

  let contentIndex = 0
  let isInsideTextBlock = false

  // --- ストリームを順次処理 ---
  for await (const part of stream) {
    if (isTextPart(part)) {
      // テキストブロック開始
      if (!isInsideTextBlock) {
        yield {
          type: 'content_block_start',
          index: contentIndex,
          content_block: { type: 'text', text: '', citations: [] },
        }
        isInsideTextBlock = true
      }
      // テキスト差分を送信
      yield {
        type: 'content_block_delta',
        index: contentIndex,
        delta: { type: 'text_delta', text: part.value },
      }
      // 出力トークン数を加算
      outputTokens += await vsCodeModel.countTokens(part.value)
    } else if (isToolCallPart(part)) {
      // テキストブロック終了
      if (isInsideTextBlock) {
        yield { type: 'content_block_stop', index: contentIndex }
        isInsideTextBlock = false
        contentIndex++
      }
      // ツールコール時はstopReasonを変更
      stopReason = 'tool_use'

      // ツールコールブロック開始
      yield {
        type: 'content_block_start',
        index: contentIndex,
        content_block: {
          type: 'tool_use',
          id: part.callId,
          name: part.name,
          input: {},
        },
      }

      // input_json_deltaを送信
      yield {
        type: 'content_block_delta',
        index: contentIndex,
        delta: {
          type: 'input_json_delta',
          partial_json: JSON.stringify(part.input ?? {}),
        },
      }

      // ツールコールブロック終了
      yield { type: 'content_block_stop', index: contentIndex }
      contentIndex++

      // ツールコールもトークン数に加算
      outputTokens += await vsCodeModel.countTokens(JSON.stringify(part))
    }
  }

  // --- 最後のテキストブロックが未終了なら閉じる ---
  if (isInsideTextBlock) {
    yield { type: 'content_block_stop', index: contentIndex }
    contentIndex++
  }

  // --- message_deltaイベント送信 ---
  yield {
    type: 'message_delta',
    delta: {
      stop_reason: stopReason,
      stop_sequence: null,
    },
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
    },
  }

  // --- message_stopイベント送信 ---
  yield { type: 'message_stop' }
}
