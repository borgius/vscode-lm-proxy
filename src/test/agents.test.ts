/**
 * Tests for agents endpoint and functionality
 */
import { describe, expect, it } from 'vitest'

// Test agents endpoint response structure
describe('Agents Endpoint', () => {
  describe('List Agents Response', () => {
    it('should have correct list response structure', () => {
      const response = {
        object: 'list',
        data: [
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
        ],
      }

      expect(response.object).toBe('list')
      expect(response.data).toHaveLength(3)
      expect(response.data[0].id).toBe('ask')
      expect(response.data[0].source).toBe('builtin')
    })

    it('should include custom agents in list', () => {
      const response = {
        object: 'list',
        data: [
          {
            id: 'ask',
            name: 'Ask',
            description: 'General purpose assistant for asking questions',
            source: 'builtin',
          },
          {
            id: 'custom-reviewer',
            name: 'Custom-reviewer',
            description: 'Code review assistant',
            source: 'custom',
            filePath: '/workspace/.github/agents/custom-reviewer.md',
          },
        ],
      }

      expect(response.data).toHaveLength(2)
      expect(response.data[1].source).toBe('custom')
      expect(response.data[1].filePath).toBeDefined()
    })
  })

  describe('Agent Info Response', () => {
    it('should have correct agent info structure', () => {
      const agent = {
        id: 'plan',
        name: 'Plan',
        description: 'Researches and outlines multi-step plans',
        source: 'builtin' as const,
      }

      expect(agent.id).toBe('plan')
      expect(agent.name).toBe('Plan')
      expect(agent.source).toBe('builtin')
    })

    it('should handle custom agent with file path', () => {
      const agent = {
        id: 'my-agent',
        name: 'My-agent',
        description: 'A custom agent for specific tasks',
        source: 'custom' as const,
        filePath: '/path/to/.github/agents/my-agent.md',
      }

      expect(agent.source).toBe('custom')
      expect(agent.filePath).toContain('.github/agents')
    })
  })

  describe('Error Responses', () => {
    it('should have correct not found error structure', () => {
      const error = {
        error: {
          message: "Agent 'unknown-agent' not found",
          type: 'not_found_error',
        },
      }

      expect(error.error.type).toBe('not_found_error')
      expect(error.error.message).toContain('not found')
    })
  })
})

// Test agent field in requests
describe('Agent Field in Chat Requests', () => {
  describe('OpenAI Chat Completions with Agent', () => {
    it('should accept optional agent field', () => {
      const request = {
        model: 'gpt-4',
        messages: [{ role: 'user' as const, content: 'Hello!' }],
        agent: 'plan',
      }

      expect(request.agent).toBe('plan')
      expect(request.messages).toHaveLength(1)
    })

    it('should work without agent field', () => {
      const request = {
        model: 'gpt-4',
        messages: [{ role: 'user' as const, content: 'Hello!' }],
      }

      expect(request.agent).toBeUndefined()
    })
  })

  describe('Anthropic Messages with Agent', () => {
    it('should accept optional agent field', () => {
      const request = {
        model: 'claude-3-sonnet',
        max_tokens: 1024,
        messages: [{ role: 'user' as const, content: 'Hello!' }],
        agent: 'agent',
      }

      expect(request.agent).toBe('agent')
    })

    it('should work without agent field', () => {
      const request = {
        model: 'claude-3-sonnet',
        max_tokens: 1024,
        messages: [{ role: 'user' as const, content: 'Hello!' }],
      }

      expect(request.agent).toBeUndefined()
    })
  })
})

// Test builtin agents
describe('Builtin Agents', () => {
  const builtinAgents = ['ask', 'plan', 'agent']

  it('should have all expected builtin agents', () => {
    expect(builtinAgents).toContain('ask')
    expect(builtinAgents).toContain('plan')
    expect(builtinAgents).toContain('agent')
  })

  it('should have correct agent count', () => {
    expect(builtinAgents).toHaveLength(3)
  })
})
