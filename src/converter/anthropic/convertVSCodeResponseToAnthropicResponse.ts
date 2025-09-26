import type {
  Message,
  RawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources'
import type * as vscode from 'vscode'
import { convertVSCodeStreamToAnthropicStream } from '@/converter/anthropic/convertVSCodeStreamToAnthropicStream'
import { convertVSCodeTextToAnthropicMessage } from '@/converter/anthropic/convertVSCodeTextToAnthropicMessage'

/**
 * VSCodeのLanguageModelChatResponseをAnthropicのMessageまたはAsyncIterable<RawMessageStreamEvent>形式に変換します。
 * ストリーミングの場合はRawMessageStreamEventのAsyncIterableを返し、
 * 非ストリーミングの場合は全文をMessage形式で返します。
 * @param vscodeResponse VSCodeのLanguageModelChatResponse
 * @param vsCodeModel VSCodeのLanguageModelChatインスタンス
 * @param isStreaming ストリーミングかどうか
 * @param inputTokens 入力トークン数
 * @returns Message または AsyncIterable<RawMessageStreamEvent>
 */
export function convertVSCodeResponseToAnthropicResponse(
  vscodeResponse: vscode.LanguageModelChatResponse,
  vsCodeModel: vscode.LanguageModelChat,
  isStreaming: boolean,
  inputTokens: number,
): Promise<Message> | AsyncIterable<RawMessageStreamEvent> {
  if (isStreaming) {
    // ストリーミング: VSCode stream → Anthropic RawMessageStreamEvent列に変換
    return convertVSCodeStreamToAnthropicStream(
      vscodeResponse.stream,
      vsCodeModel,
      inputTokens,
    )
  }

  // 非ストリーミング: VSCode text → Anthropic Message
  return convertVSCodeTextToAnthropicMessage(
    vscodeResponse,
    vsCodeModel,
    inputTokens,
  )
}
