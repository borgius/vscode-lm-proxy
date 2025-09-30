import type {
  ResponseCreateParams,
  ResponseInputContent,
} from 'openai/resources/responses/responses'
import * as vscode from 'vscode'
import { logger } from '@/utils/logger'

export async function convertOpenAIResponseRequestToVSCodeRequest(
  openaiRequest: ResponseCreateParams,
  vsCodeModel: vscode.LanguageModelChat,
) {
  logger.debug('Converting OpenAI chat response request to VSCode request')

  // OpenAIのinputをVSCodeのLanguageModelChatMessage[]に変換
  const messages: vscode.LanguageModelChatMessage[] = []

  // inputがundefinedの場合は何もしない(空配列を返す)
  if (!openaiRequest.input) {
  }

  // inputがstringの場合
  else if (typeof openaiRequest.input === 'string') {
    const role = vscode.LanguageModelChatMessageRole.User
    const content = openaiRequest.input
    const name = 'User'

    messages.push(new vscode.LanguageModelChatMessage(role, content, name))
  }

  // inputがResponseInput(配列)の場合
  else {
    openaiRequest.input.map(item => {
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

      // typeごとに処理を分岐
      switch (item.type) {
        // Input message, Output message の場合
        case 'message':
          // role変換
          switch (item.role) {
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
          }

          // content変換
          if (typeof item.content === 'string') {
            content = prefix + item.content
          } else {
            content = item.content.map(c => {
              switch (c.type) {
                case 'input_text':
                  return new vscode.LanguageModelTextPart(c.text)
                case 'input_image':
                  return new vscode.LanguageModelTextPart(
                    `[Input Image]: ${JSON.stringify(c)}`,
                  )
                case 'input_file':
                  return new vscode.LanguageModelTextPart(
                    `[Input File]: ${JSON.stringify(c)}`,
                  )
                case 'input_audio':
                  return new vscode.LanguageModelTextPart(
                    `[Input Audio]: ${JSON.stringify(c)}`,
                  )
                case 'output_text':
                  return new vscode.LanguageModelTextPart(
                    `[Output Text]: ${JSON.stringify(c)}`,
                  )
                case 'refusal':
                  return new vscode.LanguageModelTextPart(
                    `[Refusal]: ${c.refusal}`,
                  )
              }
            })
          }

          break
        // File search tool call の場合
        case 'file_search_call':
          role = vscode.LanguageModelChatMessageRole.Assistant
          name = 'Assistant'

          if (item.results) {
            content = item.results.map(r => {
              return new vscode.LanguageModelToolResultPart(item.id, [
                new vscode.LanguageModelTextPart(JSON.stringify(r)),
              ])
            })
          } else {
            content = [
              new vscode.LanguageModelToolCallPart(
                item.id,
                `[File Search Tool Call] ${item.status}`,
                item.queries,
              ),
            ]
          }

          break
        // Computer tool call の場合
        case 'computer_call':
          role = vscode.LanguageModelChatMessageRole.Assistant
          name = 'Assistant'
          content = [
            new vscode.LanguageModelToolCallPart(
              item.call_id,
              `[Computer Tool Call] ${item.status}`,
              item.action,
            ),
          ]
          break
        // Computer tool call output の場合
        case 'computer_call_output':
          role = vscode.LanguageModelChatMessageRole.Assistant
          name = 'Assistant'
          content = [
            new vscode.LanguageModelToolResultPart(item.call_id, [
              new vscode.LanguageModelTextPart(JSON.stringify(item.output)),
            ]),
          ]
          break
        // Web search tool call の場合
        // WIP: https://platform.openai.com/docs/api-reference/responses/create#responses-create-input
      }

      return new vscode.LanguageModelChatMessage(role, content, name)
    })
  }
}
