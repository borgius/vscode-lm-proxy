import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources'
import type * as vscode from 'vscode'
import { convertVSCodeStreamToOpenAIChunks } from '@/converter/openai/convertVSCodeStreamToOpenAIChunks'
import { convertVSCodeTextToOpenAICompletion } from '@/converter/openai/convertVSCodeTextToOpenAICompletion'

/**
 * VSCodeのLanguageModelChatResponseをOpenAIのChatCompletionまたはChatCompletionChunk形式に変換します。
 * ストリーミングの場合はChatCompletionChunkのAsyncIterableを返し、
 * 非ストリーミングの場合は全文をChatCompletion形式で返します。
 * @param vscodeResponse VSCodeのLanguageModelChatResponse
 * @param vsCodeModel VSCodeのLanguageModelChatインスタンス
 * @param isStreaming ストリーミングかどうか
 * @param inputTokens 入力トークン数
 * @returns ChatCompletion または AsyncIterable<ChatCompletionChunk>
 */
export function convertVSCodeResponseToOpenAIResponse(
  vscodeResponse: vscode.LanguageModelChatResponse,
  vsCodeModel: vscode.LanguageModelChat,
  isStreaming: boolean,
  inputTokens: number,
): Promise<ChatCompletion> | AsyncIterable<ChatCompletionChunk> {
  // ストリーミングの場合
  if (isStreaming) {
    // ChatCompletionChunkのAsyncIterableを返す
    return convertVSCodeStreamToOpenAIChunks(
      vscodeResponse.stream,
      vsCodeModel,
      inputTokens,
    )
  }
  // 非ストリーミングの場合
  // 全文をOpenAI ChatCompletionに変換
  return convertVSCodeTextToOpenAICompletion(
    vscodeResponse,
    vsCodeModel,
    inputTokens,
  )
}
