// Server control commands
import * as vscode from 'vscode'
import { serverManager } from '../server/manager'
import { statusBarManager } from '../ui/statusbar'

/**
 * Register server-related commands (start, stop, status) to VSCode.
 * @param {vscode.ExtensionContext} context Extension global context
 */
export function registerServerCommands(context: vscode.ExtensionContext): void {
  // Server start command
  const startServerCommand = vscode.commands.registerCommand(
    'vscode-lm-proxy.startServer',
    async () => {
      try {
        await serverManager.start()
        context.globalState.update('serverRunning', true)
        vscode.commands.executeCommand(
          'setContext',
          'vscode-lm-proxy.serverRunning',
          true,
        )
        // Update status bar
        statusBarManager.updateStatus(true)
        const serverUrl = serverManager.getServerUrl()
        vscode.window.showInformationMessage(
          `Language Model Proxy server started (${serverUrl})`,
        )
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to start server: ${(error as Error).message}`,
        )
      }
    },
  )

  // Server stop command
  const stopServerCommand = vscode.commands.registerCommand(
    'vscode-lm-proxy.stopServer',
    async () => {
      try {
        await serverManager.stop()
        context.globalState.update('serverRunning', false)
        vscode.commands.executeCommand(
          'setContext',
          'vscode-lm-proxy.serverRunning',
          false,
        )
        // Update status bar
        statusBarManager.updateStatus(false)
        vscode.window.showInformationMessage(
          'Language Model Proxy server stopped',
        )
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to stop server: ${(error as Error).message}`,
        )
      }
    },
  )

  // Register commands to context
  context.subscriptions.push(startServerCommand, stopServerCommand)
}
