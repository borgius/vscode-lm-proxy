// Manager for server startup, shutdown, and state management

import type * as http from 'node:http'
import * as vscode from 'vscode'
import { statusBarManager } from '../ui/statusbar'
import { logger } from '../utils/logger'
import { createServer } from './server'

/** Maximum number of port attempts when finding an available port */
const MAX_PORT_ATTEMPTS = 10

/**
 * Server manager class
 * Manages Express.js server startup, shutdown, and state.
 */
class ServerManager {
  private server: http.Server | null = null
  private _isRunning = false
  private _currentPort: number | null = null

  /**
   * Get port number from settings
   * @returns Configured port number (default: 4000)
   */
  private getConfiguredPort(): number {
    const config = vscode.workspace.getConfiguration('vscode-lm-proxy')
    return config.get<number>('port', 4000)
  }

  /**
   * Get currently active port
   * @returns Current port or null if not running
   */
  public getCurrentPort(): number | null {
    return this._currentPort
  }

  /**
   * Try to start server on a specific port
   * @param port Port number to try
   * @returns Promise that resolves if successful, rejects if port is busy
   */
  private tryStartOnPort(port: number): Promise<void> {
    const app = createServer()

    return new Promise<void>((resolve, reject) => {
      const server = app.listen(port, () => {
        this.server = server
        this._isRunning = true
        this._currentPort = port
        vscode.commands.executeCommand(
          'setContext',
          'vscode-lm-proxy.serverRunning',
          true,
        )
        logger.info(`VSCode LM Proxy server started on port ${port}`)
        statusBarManager.updateStatus(true, undefined, port)
        resolve()
      })

      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use`))
        } else {
          reject(new Error(`Server startup error: ${err.message}`))
        }
      })
    })
  }

  /**
   * Start the server, finding an available port if needed
   * @returns Promise for server startup
   */
  public async start(): Promise<void> {
    if (this._isRunning) {
      return Promise.resolve()
    }

    const startPort = this.getConfiguredPort()
    let lastError: Error | null = null

    for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
      const port = startPort + attempt
      try {
        await this.tryStartOnPort(port)

        // If we had to use a different port, notify the user
        if (attempt > 0) {
          vscode.window.showInformationMessage(
            `Port ${startPort} was busy, server started on port ${port}`,
          )
        }
        return
      } catch (err) {
        lastError = err as Error
        if ((err as Error).message.includes('already in use')) {
          logger.warn(`Port ${port} is busy, trying port ${port + 1}`)
          continue
        }
        // For non-port-related errors, fail immediately
        throw err
      }
    }

    // All attempts failed
    this._isRunning = false
    this._currentPort = null
    vscode.commands.executeCommand(
      'setContext',
      'vscode-lm-proxy.serverRunning',
      false,
    )
    statusBarManager.updateStatus(
      false,
      `Could not find available port after ${MAX_PORT_ATTEMPTS} attempts`,
    )
    throw lastError || new Error('Failed to start server')
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
        this._currentPort = null
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
    if (!this._isRunning || !this._currentPort) {
      return null
    }
    return `http://localhost:${this._currentPort}`
  }
}

// Export singleton instance
export const serverManager = new ServerManager()
