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
  private _currentPort: number | undefined

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
        this.updateStatus(
          serverManager.isRunning(),
          undefined,
          this._currentPort,
        )
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
   * @param port Current port number (optional)
   */
  public updateStatus(
    isRunning: boolean,
    errorMessage?: string,
    port?: number,
  ): void {
    if (!this.statusBarItem) {
      return
    }

    this._currentPort = port

    if (errorMessage) {
      // Error state
      this.statusBarItem.text = '$(error) LM Proxy'
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.errorBackground',
      )
      this.statusBarItem.tooltip = `Server: Error - ${errorMessage}`
    } else if (isRunning && port) {
      // Running with port number
      this.statusBarItem.text = `$(server) LM Proxy :${port}`
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground',
      )
      const url = serverManager.getServerUrl()
      this.statusBarItem.tooltip = `Server: Running (${url})\nClick to copy endpoint URLs`
    } else if (isRunning) {
      // Running (legacy fallback)
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
    const baseUrl = serverManager.getServerUrl()

    // Prepare menu items
    const items: Array<{
      label: string
      description: string
      command?: string
      action?: () => Promise<void>
    }> = []

    if (isRunning) {
      items.push({
        label: '$(debug-stop) Stop Server',
        description: 'Stop LM Proxy server',
        command: 'vscode-lm-proxy.stopServer',
      })

      // Add copy URL options when running
      if (baseUrl) {
        items.push({
          label: '$(copy) Copy OpenAI Base URL',
          description: `${baseUrl}/openai/v1`,
          action: async () => {
            const url = `${baseUrl}/openai/v1`
            await vscode.env.clipboard.writeText(url)
            vscode.window.showInformationMessage(`Copied OpenAI URL: ${url}`)
          },
        })
        items.push({
          label: '$(copy) Copy Anthropic Base URL',
          description: `${baseUrl}/anthropic/v1`,
          action: async () => {
            const url = `${baseUrl}/anthropic/v1`
            await vscode.env.clipboard.writeText(url)
            vscode.window.showInformationMessage(`Copied Anthropic URL: ${url}`)
          },
        })
        items.push({
          label: '$(copy) Copy Claude Code Base URL',
          description: `${baseUrl}/anthropic/claude/v1`,
          action: async () => {
            const url = `${baseUrl}/anthropic/claude/v1`
            await vscode.env.clipboard.writeText(url)
            vscode.window.showInformationMessage(
              `Copied Claude Code URL: ${url}`,
            )
          },
        })
      }
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

    // Execute selected command or action
    if (selected) {
      if (selected.action) {
        await selected.action()
      } else if (selected.command) {
        await vscode.commands.executeCommand(selected.command)
      }
    }
  }
}

// Export singleton instance
export const statusBarManager = new StatusBarManager()
