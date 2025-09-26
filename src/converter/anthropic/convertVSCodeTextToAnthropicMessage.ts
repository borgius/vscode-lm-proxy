import type { ContentBlock, Message } from '@anthropic-ai/sdk/resources'
import type * as vscode from 'vscode'
import { isTextPart, isToolCallPart } from '@/server/handler'
import { generateRandomId } from '@/utils'

/**
 * VSCodeのLanguageModelChatResponse（非ストリーミング）を
 * AnthropicのMessage形式に変換する。
 * - テキストパートはtextブロックとして連結
 * - ツールコールパートはtool_useブロックとして追加
 * @param vscodeResponse VSCodeのLanguageModelChatResponse
 * @param vsCodeModel VSCodeのLanguageModelChatインスタンス
 * @param inputTokens 入力トークン数
 * @returns Anthropic Message
 */
export async function convertVSCodeTextToAnthropicMessage(
  vscodeResponse: vscode.LanguageModelChatResponse,
  vsCodeModel: vscode.LanguageModelChat,
  inputTokens: number,
): Promise<Message> {
  const id = `msg_${generateRandomId()}`

  const content: ContentBlock[] = []
  let textBuffer = ''
  let isToolCalled = false
  let outputTokens = 0

  // --- ストリームを順次処理 ---
  for await (const part of vscodeResponse.stream) {
    if (isTextPart(part)) {
      // テキストはバッファに連結
      textBuffer += part.value

      // 出力トークン数を加算
      outputTokens += await vsCodeModel.countTokens(part.value)
    } else if (isToolCallPart(part)) {
      if (textBuffer) {
        // テキストバッファがあればtextブロックとして追加
        content.push({ type: 'text', text: textBuffer, citations: [] })
        textBuffer = ''
      }

      // tool_useブロック追加
      content.push({
        type: 'tool_use',
        id: part.callId,
        name: part.name,
        input: part.input,
      })

      // ツールコールもトークン数に加算
      outputTokens += await vsCodeModel.countTokens(JSON.stringify(part))

      // フラグを立てる
      isToolCalled = true
    }
  }

  // 残りのテキストバッファをtextブロックとして追加
  if (textBuffer) {
    content.push({ type: 'text', text: textBuffer, citations: [] })
  }

  // contentが空なら空textブロックを追加
  if (content.length === 0) {
    content.push({ type: 'text', text: '', citations: [] })
  }

  // --- Anthropic Messageオブジェクトを返す ---
  return {
    id,
    type: 'message',
    role: 'assistant',
    content,
    model: vsCodeModel.id,
    stop_reason: isToolCalled ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
    },
    // container: null
  }
}
