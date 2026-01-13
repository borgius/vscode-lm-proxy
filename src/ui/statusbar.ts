// Status bar management
import * as vscode from 'vscode'
import { modelManager } from '../model/manager'
import { serverManager } from '../server/manager'

/**
 * Status bar management class
 * Displays server status and model information in VS Code status bar.
 */
class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem | undefined

  /**
   * Initialize the status bar
   * @param context Extension context
   */
  public initialize(context: vscode.ExtensionContext): void {
    // Create status bar item
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    )

    this.statusBarItem.command = 'vscode-lm-proxy.showStatusMenu'
    this.statusBarItem.tooltip = 'Language Model Proxy'

    // Set initial state
    this.updateStatus(false)

    // Show status bar
    this.statusBarItem.show()

    // Listen for model change events
    context.subscriptions.push(
      modelManager.onDidChangeOpenAIModelId(() => {
        // Update status bar when OpenAI model changes
        this.updateStatus(serverManager.isRunning())
      }),
    )

    // Register status menu command
    const statusMenuCommand = vscode.commands.registerCommand(
      'vscode-lm-proxy.showStatusMenu',
      this.showStatusMenu.bind(this),
    )

    // Register to context
    context.subscriptions.push(this.statusBarItem, statusMenuCommand)
  }

  /**
   * Update status bar according to server state
   * @param isRunning Whether server is running
   * @param errorMessage Error message (optional)
   */
  public updateStatus(isRunning: boolean, errorMessage?: string): void {
    if (!this.statusBarItem) {
      return
    }

    if (errorMessage) {
      // Error state
      this.statusBarItem.text = '$(error) LM Proxy'
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.errorBackground',
      )
      this.statusBarItem.tooltip = `Server: Error - ${errorMessage}`
    } else if (isRunning) {
      // Running
      this.statusBarItem.text = '$(server) LM Proxy'
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground',
      )
      const url = serverManager.getServerUrl()
      this.statusBarItem.tooltip = `Server: Running (${url})`
    } else {
      // Stopped
      this.statusBarItem.text = '$(stop) LM Proxy'
      this.statusBarItem.backgroundColor = undefined
      this.statusBarItem.tooltip = 'Server: Stopped'
    }
  }

  /**
   * Show status menu
   */
  private async showStatusMenu(): Promise<void> {
    const isRunning = serverManager.isRunning()

    // Prepare menu items
    const items: Array<{
      label: string
      description: string
      command: string
    }> = []

    if (isRunning) {
      items.push({
        label: '$(debug-stop) Stop Server',
        description: 'Stop LM Proxy server',
        command: 'vscode-lm-proxy.stopServer',
      })
    } else {
      items.push({
        label: '$(play) Start Server',
        description: 'Start LM Proxy server',
        command: 'vscode-lm-proxy.startServer',
      })
    }

    // Add model selection menu items
    const currentOpenAIModelId = modelManager.getOpenAIModelId()
    items.push({
      label: '$(gear) OpenAI API Model',
      description: currentOpenAIModelId
        ? `${currentOpenAIModelId}`
        : 'No model selected',
      command: 'vscode-lm-proxy.selectOpenAIModel',
    })

    const currentAnthropicModelId = modelManager.getAnthropicModelId()
    items.push({
      label: '$(gear) Anthropic API Model',
      description: currentAnthropicModelId
        ? `${currentAnthropicModelId}`
        : 'No model selected',
      command: 'vscode-lm-proxy.selectAnthropicModel',
    })

    const currentClaudeCodeBackgroundModelId =
      modelManager.getClaudeCodeBackgroundModelId()
    items.push({
      label: '$(gear) Claude Code Background Model',
      description: currentClaudeCodeBackgroundModelId
        ? `${currentClaudeCodeBackgroundModelId}`
        : 'No model selected',
      command: 'vscode-lm-proxy.selectClaudeCodeBackgroundModel',
    })

    const currentClaudeCodeThinkingModelId =
      modelManager.getClaudeCodeThinkingModelId()
    items.push({
      label: '$(gear) Claude Code Thinking Model',
      description: currentClaudeCodeThinkingModelId
        ? `${currentClaudeCodeThinkingModelId}`
        : 'No model selected',
      command: 'vscode-lm-proxy.selectClaudeCodeThinkingModel',
    })

    // Show menu
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select LM Proxy Operation',
    })

    // Execute selected command
    if (selected) {
      await vscode.commands.executeCommand(selected.command)
    }
  }
}

// Export singleton instance
export const statusBarManager = new StatusBarManager()
