// Model selection commands
import * as vscode from 'vscode'
import { modelManager } from '../model/manager'
import { serverManager } from '../server/manager'
import { statusBarManager } from '../ui/statusbar'

/**
 * Register model selection-related commands (select, restart) to VSCode.
 * @param {vscode.ExtensionContext} context Extension global context
 */
export function registerModelCommands(context: vscode.ExtensionContext): void {
  // OpenAI API model selection command
  const selectOpenAIModelCommand = vscode.commands.registerCommand(
    'vscode-lm-proxy.selectOpenAIModel',
    async () => {
      try {
        // Show model selection dialog
        const openaiModelId = await modelManager.selectModel('openAI')

        if (openaiModelId) {
          // Set model ID
          context.globalState.update('openaiModelId', openaiModelId)
          vscode.window.showInformationMessage(
            `OpenAI Model selected: ${openaiModelId}`,
          )
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error selecting model: ${(error as Error).message}`,
        )
      }
    },
  )

  // Anthropic model selection command
  const selectAnthropicModelCommand = vscode.commands.registerCommand(
    'vscode-lm-proxy.selectAnthropicModel',
    async () => {
      try {
        // Show model selection dialog
        const anthropicModelId = await modelManager.selectModel('anthropic')

        if (anthropicModelId) {
          // Set model ID
          context.globalState.update('anthropicModelId', anthropicModelId)
          vscode.window.showInformationMessage(
            `Anthropic Model selected: ${anthropicModelId}`,
          )
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error selecting Anthropic model: ${(error as Error).message}`,
        )
      }
    },
  )

  // Claude Code Background model selection command
  const selectClaudeCodeBackgroundModelCommand =
    vscode.commands.registerCommand(
      'vscode-lm-proxy.selectClaudeCodeBackgroundModel',
      async () => {
        try {
          const backgroundModelId = await modelManager.selectModel(
            'claudeCodeBackground',
          )
          if (backgroundModelId) {
            context.globalState.update(
              'claudeCodeBackgroundModelId',
              backgroundModelId,
            )
            vscode.window.showInformationMessage(
              `Claude Code Background Model selected: ${backgroundModelId}`,
            )
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Error selecting Claude Code Background model: ${(error as Error).message}`,
          )
        }
      },
    )

  // Claude Code Thinking model selection command
  const selectClaudeCodeThinkingModelCommand = vscode.commands.registerCommand(
    'vscode-lm-proxy.selectClaudeCodeThinkingModel',
    async () => {
      try {
        const thinkingModelId =
          await modelManager.selectModel('claudeCodeThinking')
        if (thinkingModelId) {
          context.globalState.update(
            'claudeCodeThinkingModelId',
            thinkingModelId,
          )
          vscode.window.showInformationMessage(
            `Claude Code Thinking Model selected: ${thinkingModelId}`,
          )
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error selecting Claude Code Thinking model: ${(error as Error).message}`,
        )
      }
    },
  )

  // Register commands to context
  context.subscriptions.push(
    selectOpenAIModelCommand,
    selectAnthropicModelCommand,
    selectClaudeCodeBackgroundModelCommand,
    selectClaudeCodeThinkingModelCommand,
  )

  // Restore previously selected OpenAI model
  const previouslySelectedOpenAIModelId =
    context.globalState.get<string>('openaiModelId')
  if (previouslySelectedOpenAIModelId) {
    modelManager.setOpenAIModelId(previouslySelectedOpenAIModelId)
  }

  // Restore previously selected Anthropic model
  const previouslySelectedAnthropicModelId =
    context.globalState.get<string>('anthropicModelId')
  if (previouslySelectedAnthropicModelId) {
    modelManager.setAnthropicModelId(previouslySelectedAnthropicModelId)
  }

  // Restore previously selected Claude Code Background model
  const previouslySelectedClaudeCodeBackgroundModelId =
    context.globalState.get<string>('claudeCodeBackgroundModelId')
  if (previouslySelectedClaudeCodeBackgroundModelId) {
    modelManager.setClaudeCodeBackgroundModelId(
      previouslySelectedClaudeCodeBackgroundModelId,
    )
  }

  // Restore previously selected Claude Code Thinking model
  const previouslySelectedClaudeCodeThinkingModelId =
    context.globalState.get<string>('claudeCodeThinkingModelId')
  if (previouslySelectedClaudeCodeThinkingModelId) {
    modelManager.setClaudeCodeThinkingModelId(
      previouslySelectedClaudeCodeThinkingModelId,
    )
  }

  // Update status bar
  statusBarManager.updateStatus(serverManager.isRunning())
}
