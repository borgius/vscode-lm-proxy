// Manager for server startup, shutdown, and state management

import type * as http from 'node:http'
import * as vscode from 'vscode'
import { statusBarManager } from '../ui/statusbar'
import { logger } from '../utils/logger'
import { createServer } from './server'

/**
 * Server manager class
 * Manages Express.js server startup, shutdown, and state.
 */
class ServerManager {
  private server: http.Server | null = null
  private _isRunning = false

  /**
   * Get port number from settings
   * @returns Configured port number (default: 4000)
   */
  private getPort(): number {
    const config = vscode.workspace.getConfiguration('vscode-lm-proxy')
    return config.get<number>('port', 4000)
  }

  /**
   * Start the server
   * @returns Promise for server startup
   */
  public async start(): Promise<void> {
    if (this._isRunning) {
      return Promise.resolve()
    }

    try {
      const app = createServer()
      const port = this.getPort()

      return new Promise<void>((resolve, reject) => {
        this.server = app.listen(port, () => {
          this._isRunning = true
          vscode.commands.executeCommand(
            'setContext',
            'vscode-lm-proxy.serverRunning',
            true,
          )
          logger.info(`VSCode LM Proxy server started on port ${port}`)
          statusBarManager.updateStatus(true)
          resolve()
        })

        this.server.on('error', err => {
          this._isRunning = false
          vscode.commands.executeCommand(
            'setContext',
            'vscode-lm-proxy.serverRunning',
            false,
          )
          logger.error(
            `Server startup error: ${(err as Error).message}`,
            err as Error,
          )
          statusBarManager.updateStatus(
            false,
            `Server startup error: ${(err as Error).message}`,
          )
          reject(new Error(`Server startup error: ${(err as Error).message}`))
        })
      })
    } catch (error) {
      this._isRunning = false
      vscode.commands.executeCommand(
        'setContext',
        'vscode-lm-proxy.serverRunning',
        false,
      )
      return Promise.reject(error)
    }
  }

  /**
   * Stop the server
   * @returns Promise for server shutdown
   */
  public stop(): Promise<void> {
    if (!this._isRunning || !this.server) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve, reject) => {
      this.server?.close(err => {
        if (err) {
          reject(new Error(`Server stop error: ${err.message}`))
          return
        }

        this.server = null
        this._isRunning = false
        vscode.commands.executeCommand(
          'setContext',
          'vscode-lm-proxy.serverRunning',
          false,
        )
        logger.info('VSCode LM Proxy server stopped')
        statusBarManager.updateStatus(false)
        resolve()
      })
    })
  }

  /**
   * Returns whether the server is running
   * @returns Server running state
   */
  public isRunning(): boolean {
    return this._isRunning
  }

  /**
   * Get the server URL
   * @returns Server URL (null if not running)
   */
  public getServerUrl(): string | null {
    if (!this._isRunning) {
      return null
    }
    return `http://localhost:${this.getPort()}`
  }
}

// Export singleton instance
export const serverManager = new ServerManager()
