// Logger class for VSCode output panel
import * as vscode from 'vscode'

/**
 * Log level definition
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Class to manage log output to VSCode output panel
 */
export class Logger {
  private outputChannel: vscode.OutputChannel
  private currentLogLevel: LogLevel

  constructor() {
    // Create output channel
    this.outputChannel = vscode.window.createOutputChannel('LM Proxy')

    // Get log level from settings (default: DEBUG)
    const config = vscode.workspace.getConfiguration('vscode-lm-proxy')
    this.currentLogLevel = config.get<LogLevel>('logLevel') ?? LogLevel.DEBUG

    // Display current log level
    this.outputChannel.appendLine(
      this.formatMessage(
        'INFO',
        `Logger initialized with log level: ${LogLevel[this.currentLogLevel]}`,
      ),
    )
    if (this.currentLogLevel > LogLevel.DEBUG) {
      this.outputChannel.appendLine(
        this.formatMessage(
          'INFO',
          `For detailed request/response logs, set "vscode-lm-proxy.logLevel": 0 in settings.json`,
        ),
      )
    }

    // Watch for configuration changes
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('vscode-lm-proxy.logLevel')) {
        const config = vscode.workspace.getConfiguration('vscode-lm-proxy')
        this.currentLogLevel = config.get<LogLevel>('logLevel') ?? LogLevel.INFO

        this.outputChannel.appendLine(
          this.formatMessage(
            'INFO',
            `Log level changed to ${LogLevel[this.currentLogLevel]}`,
          ),
        )
      }
    })
  }

  /**
   * Get current timestamp
   * @returns Formatted timestamp
   */
  private getTimestamp(): string {
    const now = new Date()
    return now.toISOString()
  }

  /**
   * Format a message
   * @param level Log level
   * @param message Message
   * @returns Formatted message
   */
  private formatMessage(level: string, message: string): string {
    // Remove date brackets (e.g., 2025-06-25T06:00:00.000Z [INFO] ...)
    return `${this.getTimestamp()} [${level}] ${message}`
  }

  /**
   * Show the output channel
   * @param preserveFocus Whether to preserve focus on current editor
   */
  public show(preserveFocus = true): void {
    this.outputChannel.show(preserveFocus)
  }

  /**
   * Output DEBUG level log
   * @param message Log message or object
   */
  public debug(...args: any[]): void {
    if (this.currentLogLevel <= LogLevel.DEBUG) {
      const msg = args
        .map(arg =>
          typeof arg === 'string' ? arg : this.formatJSONForLog(arg),
        )
        .join(' ')
      this.outputChannel.appendLine(this.formatMessage('DEBUG', msg))
    }
  }

  /**
   * Output INFO level log
   * @param message Log message or object
   */
  public info(...args: any[]): void {
    if (this.currentLogLevel <= LogLevel.INFO) {
      const msg = args
        .map(arg =>
          typeof arg === 'string' ? arg : this.formatJSONForLog(arg),
        )
        .join(' ')
      this.outputChannel.appendLine(this.formatMessage('INFO', msg))
    }
  }

  /**
   * Output WARN level log
   * @param message Log message or object
   */
  public warn(...args: any[]): void {
    if (this.currentLogLevel <= LogLevel.WARN) {
      const msg = args
        .map(arg =>
          typeof arg === 'string' ? arg : this.formatJSONForLog(arg),
        )
        .join(' ')
      this.outputChannel.appendLine(this.formatMessage('WARN', msg))
    }
  }

  /**
   * Output ERROR level log
   * @param message Log message or object
   * @param error Error object (optional)
   */
  public error(...args: any[]): void {
    let errorObj: Error | undefined
    if (args.length > 0 && args[args.length - 1] instanceof Error) {
      errorObj = args.pop()
    }
    if (this.currentLogLevel <= LogLevel.ERROR) {
      const msg = args
        .map(arg =>
          typeof arg === 'string' ? arg : this.formatJSONForLog(arg),
        )
        .join(' ')
      this.outputChannel.appendLine(this.formatMessage('ERROR', msg))
      if (errorObj && errorObj.stack) {
        this.outputChannel.appendLine(
          this.formatMessage('ERROR', `Stack: ${errorObj.stack}`),
        )
      }
    }
  }

  /**
   * Clear output channel
   */
  public clear(): void {
    this.outputChannel.clear()
  }

  /**
   * Format JSON data for logging
   * @param data JSON data to display
   * @param indent Whether to add indentation
   * @returns Formatted JSON string
   */
  private formatJSONForLog(data: any, indent = true): string {
    try {
      // Create an editable copy
      const dataCopy = this.sanitizeForLog(JSON.parse(JSON.stringify(data)))

      // Format with indentation (for readability)
      const jsonStr = indent
        ? JSON.stringify(dataCopy, null, 2)
        : JSON.stringify(dataCopy)

      return jsonStr
    } catch (e) {
      return String(data)
    }
  }

  /**
   * Format object for log output (mask sensitive info, etc.)
   * @param obj Object to format
   * @returns Formatted object
   */
  private sanitizeForLog(obj: any): any {
    // Return as is if not an object
    if (typeof obj !== 'object' || obj === null) {
      return obj
    }

    // Recursively process each element if array
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeForLog(item))
    }

    // Mask sensitive information like API key values
    const sensitiveKeys = [
      'api_key',
      'apiKey',
      'authorization',
      'password',
      'secret',
      'token',
    ]
    const result: any = {}

    // Process object properties
    for (const key in obj) {
      if (Object.hasOwn(obj, key)) {
        // Mask value for sensitive keys
        if (sensitiveKeys.includes(key.toLowerCase())) {
          result[key] = '*****'
        }
        // Show message array contents
        else if (
          key === 'messages' &&
          Array.isArray(obj[key]) &&
          obj[key].length > 0
        ) {
          // Keep message details but truncate long content
          result[key] = obj[key].map((msg: any) => {
            if (msg && typeof msg === 'object') {
              const msgCopy = { ...msg }
              // Truncate if content is long
              if (
                msgCopy.content &&
                typeof msgCopy.content === 'string' &&
                msgCopy.content.length > 100
              ) {
                msgCopy.content = `${msgCopy.content.substring(0, 100)}...`
              }
              return msgCopy
            }
            return msg
          })
        }
        // Truncate deeply nested objects
        else if (typeof obj[key] === 'object' && obj[key] !== null) {
          result[key] = this.sanitizeForLog(obj[key])
        }
        // Otherwise keep as is
        else {
          result[key] = obj[key]
        }
      }
    }

    return result
  }
}

// Export singleton instance
export const logger = new Logger()
