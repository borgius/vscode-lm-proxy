// Agents endpoint handler
import type express from 'express'
import * as vscode from 'vscode'
import { logger } from '../utils/logger'

/**
 * Agent information interface
 */
export interface AgentInfo {
  /** Unique identifier for the agent */
  id: string
  /** Display name of the agent */
  name: string
  /** Description of what the agent does */
  description: string
  /** Source of the agent: 'builtin' or 'custom' */
  source: 'builtin' | 'custom'
  /** Optional file path for custom agents */
  filePath?: string
}

/**
 * Built-in agents available in GitHub Copilot
 */
const BUILTIN_AGENTS: AgentInfo[] = [
  {
    id: 'ask',
    name: 'Ask',
    description: 'General purpose assistant for asking questions',
    source: 'builtin',
  },
  {
    id: 'plan',
    name: 'Plan',
    description: 'Researches and outlines multi-step plans',
    source: 'builtin',
  },
  {
    id: 'agent',
    name: 'Agent',
    description:
      'Autonomous coding agent that can make changes to your codebase',
    source: 'builtin',
  },
]

/**
 * Get custom agents from .github/agents directory in workspace
 * @returns Array of custom agent information
 */
async function getCustomAgents(): Promise<AgentInfo[]> {
  const customAgents: AgentInfo[] = []

  try {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return customAgents
    }

    for (const folder of workspaceFolders) {
      const agentsPath = vscode.Uri.joinPath(folder.uri, '.github', 'agents')

      try {
        const agentsDir = await vscode.workspace.fs.readDirectory(agentsPath)

        for (const [fileName, fileType] of agentsDir) {
          if (fileType === vscode.FileType.File && fileName.endsWith('.md')) {
            const agentId = fileName.replace('.md', '')
            const filePath = vscode.Uri.joinPath(agentsPath, fileName)

            // Read the file to get description from first line or content
            let description = `Custom agent: ${agentId}`
            try {
              const content = await vscode.workspace.fs.readFile(filePath)
              const text = new TextDecoder().decode(content)
              const firstLine = text.split('\n')[0].trim()
              // Use first line as description if it starts with # (heading)
              if (firstLine.startsWith('#')) {
                description = firstLine.replace(/^#+\s*/, '')
              } else if (firstLine.length > 0 && firstLine.length < 200) {
                description = firstLine
              }
            } catch {
              // Ignore read errors, use default description
            }

            customAgents.push({
              id: agentId,
              name: agentId.charAt(0).toUpperCase() + agentId.slice(1),
              description,
              source: 'custom',
              filePath: filePath.fsPath,
            })
          }
        }
      } catch {
        // Directory doesn't exist or can't be read, continue to next folder
        logger.debug(
          `No .github/agents directory found in ${folder.uri.fsPath}`,
        )
      }
    }
  } catch (error) {
    logger.warn('Error reading custom agents:', error)
  }

  return customAgents
}

/**
 * Get all available agents (builtin + custom)
 * @returns Array of all agent information
 */
export async function getAllAgents(): Promise<AgentInfo[]> {
  const customAgents = await getCustomAgents()
  return [...BUILTIN_AGENTS, ...customAgents]
}

/**
 * Get agent by ID
 * @param agentId Agent identifier
 * @returns Agent info or undefined if not found
 */
export async function getAgentById(
  agentId: string,
): Promise<AgentInfo | undefined> {
  const agents = await getAllAgents()
  return agents.find(a => a.id.toLowerCase() === agentId.toLowerCase())
}

/**
 * Set up agents API endpoints
 * @param app Express.js application
 */
export function setupAgentsEndpoints(app: express.Express): void {
  // List all agents
  app.get('/agents', handleListAgents)
  app.get('/v1/agents', handleListAgents)

  // Get specific agent info
  app.get('/agents/:agentId', handleGetAgent)
  app.get('/v1/agents/:agentId', handleGetAgent)
}

/**
 * Handle request to list all agents
 */
async function handleListAgents(
  _req: express.Request,
  res: express.Response,
): Promise<void> {
  try {
    const agents = await getAllAgents()
    logger.debug('Listing agents', { count: agents.length })

    res.json({
      object: 'list',
      data: agents,
    })
  } catch (error) {
    logger.error('Error listing agents:', error)
    res.status(500).json({
      error: {
        message: 'Failed to list agents',
        type: 'server_error',
      },
    })
  }
}

/**
 * Handle request to get specific agent information
 */
async function handleGetAgent(
  req: express.Request,
  res: express.Response,
): Promise<void> {
  try {
    const { agentId } = req.params
    const agent = await getAgentById(agentId)

    if (!agent) {
      res.status(404).json({
        error: {
          message: `Agent '${agentId}' not found`,
          type: 'not_found_error',
        },
      })
      return
    }

    logger.debug('Getting agent', { agentId })
    res.json(agent)
  } catch (error) {
    logger.error('Error getting agent:', error)
    res.status(500).json({
      error: {
        message: 'Failed to get agent',
        type: 'server_error',
      },
    })
  }
}
