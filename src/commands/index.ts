// Commands definition index file
import type * as vscode from 'vscode'
import { registerModelCommands } from './model'
import { registerOutputCommands } from './output'
import { registerServerCommands } from './server'

/**
 * Register all commands used by the extension.
 * @param {vscode.ExtensionContext} context Extension global context
 */
export function registerCommands(context: vscode.ExtensionContext): void {
  // Register server-related commands
  registerServerCommands(context)

  // Register model selection-related commands
  registerModelCommands(context)

  // Register output panel-related commands
  registerOutputCommands(context)
}
