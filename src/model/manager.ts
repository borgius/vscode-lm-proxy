// Model management class
import * as vscode from 'vscode'
import { logger } from '../utils/logger'

/**
 * Model management class
 * Manages access to VSCode Language Model API and model selection.
 */
class ModelManager {
  // VSCode ExtensionContext (for global state)
  private extensionContext: vscode.ExtensionContext | null = null
  /**
   * Set ExtensionContext (for global state usage)
   */
  public setExtensionContext(context: vscode.ExtensionContext) {
    this.extensionContext = context
    // Restore saved model info on startup
    const savedOpenAIModelId = context.globalState.get<string>('openaiModelId')
    if (savedOpenAIModelId) {
      this.openaiModelId = savedOpenAIModelId
    }
    const savedAnthropicModelId =
      context.globalState.get<string>('anthropicModelId')
    if (savedAnthropicModelId) {
      this.anthropicModelId = savedAnthropicModelId
    }
    const savedClaudeCodeBackgroundModelId = context.globalState.get<string>(
      'claudeCodeBackgroundModelId',
    )
    if (savedClaudeCodeBackgroundModelId) {
      this.claudeCodeBackgroundModelId = savedClaudeCodeBackgroundModelId
    }
    const savedClaudeCodeThinkingModelId = context.globalState.get<string>(
      'claudeCodeThinkingModelId',
    )
    if (savedClaudeCodeThinkingModelId) {
      this.claudeCodeThinkingModelId = savedClaudeCodeThinkingModelId
    }
  }
  // Selected OpenAI model ID
  private openaiModelId: string | null = null

  // Selected Anthropic model ID
  private anthropicModelId: string | null = null

  // Claude Code Background Model
  private claudeCodeBackgroundModelId: string | null = null

  // Claude Code Thinking Model
  private claudeCodeThinkingModelId: string | null = null

  // Supported model families
  private supportedFamilies = [
    'gpt-4o',
    'gpt-4o-mini',
    'o1',
    'o1-mini',
    'claude-3.5-sonnet',
  ]

  // Event emitter for OpenAI model change
  private readonly _onDidChangeOpenAIModelId = new vscode.EventEmitter<void>()
  public readonly onDidChangeOpenAIModelId =
    this._onDidChangeOpenAIModelId.event

  // Event emitter for Anthropic model change
  private readonly _onDidChangeAnthropicModelId =
    new vscode.EventEmitter<void>()
  public readonly onDidChangeAnthropicModelId =
    this._onDidChangeAnthropicModelId.event

  // Event emitter for Claude Code Background Model change
  private readonly _onDidChangeClaudeCodeBackgroundModelId =
    new vscode.EventEmitter<void>()
  public readonly onDidChangeClaudeCodeBackgroundModelId =
    this._onDidChangeClaudeCodeBackgroundModelId.event

  // Event emitter for Claude Code Thinking Model change
  private readonly _onDidChangeClaudeCodeThinkingModelId =
    new vscode.EventEmitter<void>()
  public readonly onDidChangeClaudeCodeThinkingModelId =
    this._onDidChangeClaudeCodeThinkingModelId.event

  /**
   * Select a model from available models
   * @param provider API provider ('openAI' or 'anthropic')
   * @returns The selected model ID
   */
  public async selectModel(
    provider:
      | 'openAI'
      | 'anthropic'
      | 'claudeCodeBackground'
      | 'claudeCodeThinking',
  ): Promise<string | undefined> {
    try {
      // Try each supported model until one is found
      let allModels: vscode.LanguageModelChat[] = []

      // First, try to get all models without specifying
      const defaultModels = await vscode.lm.selectChatModels({})
      if (defaultModels && defaultModels.length > 0) {
        allModels = defaultModels
      } else {
        // If no models found, try each family
        for (const family of this.supportedFamilies) {
          const familyModels = await vscode.lm.selectChatModels({ family })
          if (familyModels && familyModels.length > 0) {
            allModels = [...allModels, ...familyModels]
          }
        }
      }

      if (allModels.length === 0) {
        vscode.window.showWarningMessage('No available models found')
        return undefined
      }

      // Create QuickPick items for model selection
      const quickPickItems = allModels.map(model => ({
        label: model.name,
        description: `${model.id} by ${model.vendor || 'Unknown vendor'}`,
        detail: `Max input tokens: ${model.maxInputTokens || 'Unknown'}, Version: ${model.version}`,
        model: model,
        // Add "Copy ID" button on the right
        buttons: [
          {
            iconPath: new vscode.ThemeIcon('copy'),
            tooltip: 'Copy model ID to clipboard',
          },
        ],
      }))

      // Let user select a model using QuickPick
      const quickPick = vscode.window.createQuickPick()
      quickPick.items = quickPickItems
      quickPick.placeholder = 'Select a model to use'
      quickPick.matchOnDescription = true
      quickPick.matchOnDetail = true

      // Set button click event handler
      quickPick.onDidTriggerItemButton(event => {
        const modelId = (event.item as any).model.id
        vscode.env.clipboard.writeText(modelId)
        vscode.window.showInformationMessage(
          `Model ID "${modelId}" copied to clipboard`,
        )
      })

      // Show QuickPick
      quickPick.show()

      // Promisify and return result
      return new Promise<string | undefined>(resolve => {
        // Handle model selection
        quickPick.onDidAccept(() => {
          const selectedItem = quickPick.selectedItems[0] as any
          if (selectedItem) {
            // Branch save destination by provider
            let providerLabel = ''
            if (provider === 'openAI') {
              this.setOpenAIModelId(selectedItem.model.id)
              logger.info(`Selected OpenAI model: ${this.openaiModelId}`)
              providerLabel = 'OpenAI'
            } else if (provider === 'anthropic') {
              this.setAnthropicModelId(selectedItem.model.id)
              logger.info(`Selected Anthropic model: ${this.anthropicModelId}`)
              providerLabel = 'Anthropic'
            } else if (provider === 'claudeCodeBackground') {
              this.setClaudeCodeBackgroundModelId(selectedItem.model.id)
              logger.info(
                `Selected Claude Code Background model: ${this.claudeCodeBackgroundModelId}`,
              )
              providerLabel = 'Claude Code Background'
            } else if (provider === 'claudeCodeThinking') {
              this.setClaudeCodeThinkingModelId(selectedItem.model.id)
              logger.info(
                `Selected Claude Code Thinking model: ${this.claudeCodeThinkingModelId}`,
              )
              providerLabel = 'Claude Code Thinking'
            }

            // Notify model change
            vscode.window.showInformationMessage(
              `${providerLabel} model has been changed to "${selectedItem.model.name}".`,
            )

            // Close QuickPick and return selection result
            quickPick.dispose()
            resolve(selectedItem.model.id as string)
          } else {
            quickPick.dispose()
            resolve(undefined)
          }
        })

        // Handle QuickPick cancel
        quickPick.onDidHide(() => {
          quickPick.dispose()
          resolve(undefined)
        })
      })
    } catch (error) {
      logger.error(
        `Model selection error: ${(error as Error).message}`,
        error as Error,
      )
      vscode.window.showErrorMessage(
        `Error selecting model: ${(error as Error).message}`,
      )
      return undefined
    }
  }

  /**
   * Get the currently selected model ID
   * @returns Model ID
   */
  public getOpenAIModelId(): string | null {
    return this.openaiModelId
  }

  public getAnthropicModelId(): string | null {
    return this.anthropicModelId
  }

  public getClaudeCodeBackgroundModelId(): string | null {
    return this.claudeCodeBackgroundModelId
  }

  public getClaudeCodeThinkingModelId(): string | null {
    return this.claudeCodeThinkingModelId
  }

  /**
   * Set the model ID directly
   * @param modelId Model ID to set
   */
  public setOpenAIModelId(modelId: string): void {
    this.openaiModelId = modelId
    // Persist
    if (this.extensionContext) {
      this.extensionContext.globalState.update(
        'openaiModelId',
        this.openaiModelId,
      )
    }
    // Fire OpenAI model change event
    this._onDidChangeOpenAIModelId.fire()
  }

  /**
   * Set and save the selected Anthropic model ID
   */
  public setAnthropicModelId(modelId: string): void {
    this.anthropicModelId = modelId
    // Persist
    if (this.extensionContext) {
      this.extensionContext.globalState.update(
        'anthropicModelId',
        this.anthropicModelId,
      )
    }
    // Fire event if needed
    this._onDidChangeAnthropicModelId.fire()
  }

  /**
   * Set and save Claude Code Background Model ID
   */
  public setClaudeCodeBackgroundModelId(modelId: string): void {
    this.claudeCodeBackgroundModelId = modelId
    if (this.extensionContext) {
      this.extensionContext.globalState.update(
        'claudeCodeBackgroundModelId',
        this.claudeCodeBackgroundModelId,
      )
    }
    this._onDidChangeClaudeCodeBackgroundModelId.fire()
  }

  /**
   * Set and save Claude Code Thinking Model ID
   */
  public setClaudeCodeThinkingModelId(modelId: string): void {
    this.claudeCodeThinkingModelId = modelId
    if (this.extensionContext) {
      this.extensionContext.globalState.update(
        'claudeCodeThinkingModelId',
        this.claudeCodeThinkingModelId,
      )
    }
    this._onDidChangeClaudeCodeThinkingModelId.fire()
  }

  /**
   * Get the default model
   * @returns Default model ID
   */
  public getDefaultModel(): string | null {
    return this.openaiModelId
  }

  /**
   * Get all available models
   * @returns Raw model list from VSCode LM API
   */
  public async getAvailableModels(): Promise<vscode.LanguageModelChat[]> {
    try {
      // Get supported models
      let allModels: vscode.LanguageModelChat[] = []

      // First, get all models without specifying
      const defaultModels = await vscode.lm.selectChatModels({})
      if (defaultModels && defaultModels.length > 0) {
        allModels = defaultModels
      } else {
        // If no models found, try each family
        for (const family of this.supportedFamilies) {
          const familyModels = await vscode.lm.selectChatModels({ family })
          if (familyModels && familyModels.length > 0) {
            allModels = [...allModels, ...familyModels]
          }
        }
      }

      return allModels
    } catch (error) {
      logger.error(
        `Get models error: ${(error as Error).message}`,
        error as Error,
      )
      throw error
    }
  }

  /**
   * Get information for a specific model
   * @param modelId Model ID
   * @returns VSCode LM model instance or null for proxy model
   */
  public async getModelInfo(
    modelId: string,
  ): Promise<vscode.LanguageModelChat | null> {
    try {
      // Special handling for vscode-lm-proxy
      if (modelId === 'vscode-lm-proxy') {
        return null // Proxy model has no VSCode LM model instance
      }

      // Get the model with the specified ID
      const [model] = await vscode.lm.selectChatModels({ id: modelId })

      if (!model) {
        const error: any = new Error(`Model ${modelId} not found`)
        error.statusCode = 404
        error.type = 'model_not_found_error'
        throw error
      }

      return model
    } catch (error) {
      if ((error as any).statusCode === 404) {
        throw error
      }

      logger.error(
        `Get model info error: ${(error as Error).message}`,
        error as Error,
      )
      throw error
    }
  }
}

// Export singleton instance
export const modelManager = new ModelManager()
