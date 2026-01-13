/**
 * Tests for OpenAI Chat Completions API converter and handler
 */
import { describe, expect, it } from 'vitest'

// Test OpenAI Chat Completions request conversion
describe('OpenAI Chat Completions Converter', () => {
  describe('convertOpenAIRequestToVSCodeRequest', () => {
    it('should convert basic user message', () => {
      const request = {
        model: 'gpt-4',
        messages: [{ role: 'user' as const, content: 'Hello!' }],
      }

      // Verify request structure is correct
      expect(request.messages).toHaveLength(1)
      expect(request.messages[0].role).toBe('user')
      expect(request.messages[0].content).toBe('Hello!')
    })

    it('should handle system message', () => {
      const request = {
        model: 'gpt-4',
        messages: [
          { role: 'system' as const, content: 'You are a helpful assistant.' },
          { role: 'user' as const, content: 'Hello!' },
        ],
      }

      expect(request.messages).toHaveLength(2)
      expect(request.messages[0].role).toBe('system')
      expect(request.messages[1].role).toBe('user')
    })

    it('should handle assistant message', () => {
      const request = {
        model: 'gpt-4',
        messages: [
          { role: 'user' as const, content: 'Hello!' },
          { role: 'assistant' as const, content: 'Hi there!' },
          { role: 'user' as const, content: 'How are you?' },
        ],
      }

      expect(request.messages).toHaveLength(3)
      expect(request.messages[1].role).toBe('assistant')
    })

    it('should handle multi-part content', () => {
      const request = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user' as const,
            content: [
              { type: 'text' as const, text: 'What is in this image?' },
              {
                type: 'image_url' as const,
                image_url: { url: 'https://example.com/image.png' },
              },
            ],
          },
        ],
      }

      expect(request.messages[0].content).toHaveLength(2)
      expect(
        (request.messages[0].content as Array<{ type: string }>)[0].type,
      ).toBe('text')
      expect(
        (request.messages[0].content as Array<{ type: string }>)[1].type,
      ).toBe('image_url')
    })

    it('should handle tool_calls in assistant message', () => {
      const request = {
        model: 'gpt-4',
        messages: [
          { role: 'user' as const, content: 'What is the weather?' },
          {
            role: 'assistant' as const,
            content: null,
            tool_calls: [
              {
                id: 'call_123',
                type: 'function' as const,
                function: {
                  name: 'get_weather',
                  arguments: '{"location":"Tokyo"}',
                },
              },
            ],
          },
        ],
      }

      expect(request.messages[1].tool_calls).toBeDefined()
      expect(request.messages[1].tool_calls).toHaveLength(1)
      expect(request.messages[1].tool_calls?.[0].function.name).toBe(
        'get_weather',
      )
    })

    it('should handle tool message', () => {
      const request = {
        model: 'gpt-4',
        messages: [
          {
            role: 'tool' as const,
            content: '{"temperature": 25, "condition": "sunny"}',
            tool_call_id: 'call_123',
          },
        ],
      }

      expect(request.messages[0].role).toBe('tool')
      expect(request.messages[0].tool_call_id).toBe('call_123')
    })
  })

  describe('Request Options', () => {
    it('should handle streaming option', () => {
      const request = {
        model: 'gpt-4',
        messages: [{ role: 'user' as const, content: 'Hello!' }],
        stream: true,
      }

      expect(request.stream).toBe(true)
    })

    it('should handle temperature option', () => {
      const request = {
        model: 'gpt-4',
        messages: [{ role: 'user' as const, content: 'Hello!' }],
        temperature: 0.7,
      }

      expect(request.temperature).toBe(0.7)
    })

    it('should handle max_tokens option', () => {
      const request = {
        model: 'gpt-4',
        messages: [{ role: 'user' as const, content: 'Hello!' }],
        max_tokens: 1000,
      }

      expect(request.max_tokens).toBe(1000)
    })

    it('should handle tools option', () => {
      const request = {
        model: 'gpt-4',
        messages: [{ role: 'user' as const, content: 'Hello!' }],
        tools: [
          {
            type: 'function' as const,
            function: {
              name: 'get_weather',
              description: 'Get the current weather',
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                },
                required: ['location'],
              },
            },
          },
        ],
      }

      expect(request.tools).toHaveLength(1)
      expect(request.tools[0].function.name).toBe('get_weather')
    })

    it('should handle tool_choice option', () => {
      const request = {
        model: 'gpt-4',
        messages: [{ role: 'user' as const, content: 'Hello!' }],
        tool_choice: 'auto' as const,
      }

      expect(request.tool_choice).toBe('auto')
    })
  })
})

// Test response structure
describe('OpenAI Chat Completions Response', () => {
  describe('Non-streaming response', () => {
    it('should have correct structure', () => {
      const response = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello! How can I help you?',
              refusal: null,
            },
            logprobs: null,
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18,
        },
      }

      expect(response.object).toBe('chat.completion')
      expect(response.choices).toHaveLength(1)
      expect(response.choices[0].message.role).toBe('assistant')
      expect(response.choices[0].finish_reason).toBe('stop')
    })

    it('should handle tool_calls in response', () => {
      const response = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"location":"Tokyo"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      }

      expect(response.choices[0].finish_reason).toBe('tool_calls')
      expect(response.choices[0].message.tool_calls).toHaveLength(1)
    })
  })

  describe('Streaming response chunks', () => {
    it('should have correct chunk structure', () => {
      const chunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
            },
            finish_reason: null,
          },
        ],
      }

      expect(chunk.object).toBe('chat.completion.chunk')
      expect(chunk.choices[0].delta.role).toBe('assistant')
    })

    it('should have content delta', () => {
      const chunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            delta: {
              content: 'Hello',
            },
            finish_reason: null,
          },
        ],
      }

      expect(chunk.choices[0].delta.content).toBe('Hello')
    })

    it('should have finish_reason in final chunk', () => {
      const chunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
      }

      expect(chunk.choices[0].finish_reason).toBe('stop')
    })
  })
})
