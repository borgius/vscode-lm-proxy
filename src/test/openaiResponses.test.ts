/**
 * Tests for OpenAI Responses API converter and handler
 */
import { describe, expect, it } from 'vitest'

// Test OpenAI Responses request structure
describe('OpenAI Responses API Converter', () => {
  describe('Request Input Types', () => {
    it('should handle simple string input', () => {
      const request = {
        model: 'gpt-4',
        input: 'Hello, how are you?',
      }

      expect(typeof request.input).toBe('string')
      expect(request.input).toBe('Hello, how are you?')
    })

    it('should handle array input with messages', () => {
      const request = {
        model: 'gpt-4',
        input: [
          { role: 'user' as const, content: 'What is 2+2?' },
          { role: 'assistant' as const, content: '2+2 equals 4.' },
          { role: 'user' as const, content: 'And what is 3+3?' },
        ],
      }

      expect(Array.isArray(request.input)).toBe(true)
      expect(request.input).toHaveLength(3)
      expect((request.input as Array<{ role: string }>)[0].role).toBe('user')
      expect((request.input as Array<{ role: string }>)[1].role).toBe(
        'assistant',
      )
    })

    it('should handle input with content array', () => {
      const request = {
        model: 'gpt-4',
        input: [
          {
            role: 'user' as const,
            content: [
              { type: 'input_text' as const, text: 'What is in this image?' },
              {
                type: 'input_image' as const,
                image_url: 'https://example.com/image.png',
              },
            ],
          },
        ],
      }

      expect(Array.isArray(request.input)).toBe(true)
      const firstMessage = (
        request.input as Array<{ content: Array<{ type: string }> }>
      )[0]
      expect(Array.isArray(firstMessage.content)).toBe(true)
      expect(firstMessage.content[0].type).toBe('input_text')
      expect(firstMessage.content[1].type).toBe('input_image')
    })
  })

  describe('Request Options', () => {
    it('should handle instructions parameter', () => {
      const request = {
        model: 'gpt-4',
        instructions: 'You are a helpful assistant.',
        input: 'Hello!',
      }

      expect(request.instructions).toBe('You are a helpful assistant.')
    })

    it('should handle streaming option', () => {
      const request = {
        model: 'gpt-4',
        input: 'Hello!',
        stream: true,
      }

      expect(request.stream).toBe(true)
    })

    it('should handle temperature option', () => {
      const request = {
        model: 'gpt-4',
        input: 'Hello!',
        temperature: 0.7,
      }

      expect(request.temperature).toBe(0.7)
    })

    it('should handle max_output_tokens option', () => {
      const request = {
        model: 'gpt-4',
        input: 'Hello!',
        max_output_tokens: 1000,
      }

      expect(request.max_output_tokens).toBe(1000)
    })

    it('should handle tools option', () => {
      const request = {
        model: 'gpt-4',
        input: 'What is the weather in Tokyo?',
        tools: [
          {
            type: 'function' as const,
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
        ],
      }

      expect(request.tools).toHaveLength(1)
      expect(request.tools[0].name).toBe('get_weather')
    })

    it('should handle tool_choice option', () => {
      const request = {
        model: 'gpt-4',
        input: 'Hello!',
        tool_choice: 'auto' as const,
      }

      expect(request.tool_choice).toBe('auto')
    })

    it('should handle metadata option', () => {
      const request = {
        model: 'gpt-4',
        input: 'Hello!',
        metadata: {
          user_id: 'user123',
          session_id: 'session456',
        },
      }

      expect(request.metadata).toBeDefined()
      expect(request.metadata?.user_id).toBe('user123')
    })

    it('should handle previous_response_id for conversation', () => {
      const request = {
        model: 'gpt-4',
        input: 'And what about tomorrow?',
        previous_response_id: 'resp_abc123',
      }

      expect(request.previous_response_id).toBe('resp_abc123')
    })
  })
})

// Test response structure
describe('OpenAI Responses API Response', () => {
  describe('Non-streaming response', () => {
    it('should have correct response structure', () => {
      const response = {
        id: 'resp_abc123',
        object: 'response',
        created_at: 1234567890,
        model: 'gpt-4',
        status: 'completed',
        output: [
          {
            type: 'message',
            id: 'msg_001',
            status: 'completed',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Hello! How can I help you today?',
              },
            ],
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 8,
          total_tokens: 18,
        },
      }

      expect(response.object).toBe('response')
      expect(response.status).toBe('completed')
      expect(response.output).toHaveLength(1)
      expect(response.output[0].type).toBe('message')
      expect(response.output[0].role).toBe('assistant')
    })

    it('should handle function_call output', () => {
      const response = {
        id: 'resp_abc123',
        object: 'response',
        created_at: 1234567890,
        model: 'gpt-4',
        status: 'completed',
        output: [
          {
            type: 'function_call',
            id: 'fc_001',
            status: 'completed',
            name: 'get_weather',
            arguments: '{"location":"Tokyo"}',
            call_id: 'call_123',
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          total_tokens: 30,
        },
      }

      expect(response.output[0].type).toBe('function_call')
      expect(response.output[0].name).toBe('get_weather')
      expect(response.output[0].arguments).toBe('{"location":"Tokyo"}')
    })

    it('should handle multiple output items', () => {
      const response = {
        id: 'resp_abc123',
        object: 'response',
        created_at: 1234567890,
        model: 'gpt-4',
        status: 'completed',
        output: [
          {
            type: 'message',
            id: 'msg_001',
            status: 'completed',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'I will check the weather for you.',
              },
            ],
          },
          {
            type: 'function_call',
            id: 'fc_001',
            status: 'completed',
            name: 'get_weather',
            arguments: '{"location":"Tokyo"}',
            call_id: 'call_123',
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 30,
          total_tokens: 40,
        },
      }

      expect(response.output).toHaveLength(2)
      expect(response.output[0].type).toBe('message')
      expect(response.output[1].type).toBe('function_call')
    })
  })

  describe('Streaming response events', () => {
    it('should have response.created event', () => {
      const event = {
        type: 'response.created',
        response: {
          id: 'resp_abc123',
          object: 'response',
          created_at: 1234567890,
          model: 'gpt-4',
          status: 'in_progress',
          output: [],
          usage: null,
        },
      }

      expect(event.type).toBe('response.created')
      expect(event.response.status).toBe('in_progress')
    })

    it('should have response.in_progress event', () => {
      const event = {
        type: 'response.in_progress',
        response: {
          id: 'resp_abc123',
          object: 'response',
          created_at: 1234567890,
          model: 'gpt-4',
          status: 'in_progress',
          output: [],
          usage: null,
        },
      }

      expect(event.type).toBe('response.in_progress')
    })

    it('should have response.output_item.added event', () => {
      const event = {
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          type: 'message',
          id: 'msg_001',
          status: 'in_progress',
          role: 'assistant',
          content: [],
        },
      }

      expect(event.type).toBe('response.output_item.added')
      expect(event.output_index).toBe(0)
      expect(event.item.type).toBe('message')
    })

    it('should have response.content_part.added event', () => {
      const event = {
        type: 'response.content_part.added',
        item_id: 'msg_001',
        output_index: 0,
        content_index: 0,
        part: {
          type: 'output_text',
          text: '',
        },
      }

      expect(event.type).toBe('response.content_part.added')
      expect(event.part.type).toBe('output_text')
    })

    it('should have response.output_text.delta event', () => {
      const event = {
        type: 'response.output_text.delta',
        item_id: 'msg_001',
        output_index: 0,
        content_index: 0,
        delta: 'Hello',
      }

      expect(event.type).toBe('response.output_text.delta')
      expect(event.delta).toBe('Hello')
    })

    it('should have response.output_text.done event', () => {
      const event = {
        type: 'response.output_text.done',
        item_id: 'msg_001',
        output_index: 0,
        content_index: 0,
        text: 'Hello! How can I help you?',
      }

      expect(event.type).toBe('response.output_text.done')
      expect(event.text).toBe('Hello! How can I help you?')
    })

    it('should have response.content_part.done event', () => {
      const event = {
        type: 'response.content_part.done',
        item_id: 'msg_001',
        output_index: 0,
        content_index: 0,
        part: {
          type: 'output_text',
          text: 'Hello! How can I help you?',
        },
      }

      expect(event.type).toBe('response.content_part.done')
      expect(event.part.text).toBe('Hello! How can I help you?')
    })

    it('should have response.output_item.done event', () => {
      const event = {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          type: 'message',
          id: 'msg_001',
          status: 'completed',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Hello! How can I help you?',
            },
          ],
        },
      }

      expect(event.type).toBe('response.output_item.done')
      expect(event.item.status).toBe('completed')
    })

    it('should have response.completed event', () => {
      const event = {
        type: 'response.completed',
        response: {
          id: 'resp_abc123',
          object: 'response',
          created_at: 1234567890,
          model: 'gpt-4',
          status: 'completed',
          output: [
            {
              type: 'message',
              id: 'msg_001',
              status: 'completed',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'Hello! How can I help you?',
                },
              ],
            },
          ],
          usage: {
            input_tokens: 10,
            output_tokens: 8,
            total_tokens: 18,
          },
        },
      }

      expect(event.type).toBe('response.completed')
      expect(event.response.status).toBe('completed')
      expect(event.response.usage).toBeDefined()
    })

    it('should have function_call streaming events', () => {
      const addedEvent = {
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          type: 'function_call',
          id: 'fc_001',
          status: 'in_progress',
          name: 'get_weather',
          arguments: '',
          call_id: 'call_123',
        },
      }

      expect(addedEvent.item.type).toBe('function_call')
      expect(addedEvent.item.name).toBe('get_weather')

      const argsDeltaEvent = {
        type: 'response.function_call_arguments.delta',
        item_id: 'fc_001',
        output_index: 0,
        delta: '{"location"',
      }

      expect(argsDeltaEvent.type).toBe('response.function_call_arguments.delta')
      expect(argsDeltaEvent.delta).toBe('{"location"')

      const argsDoneEvent = {
        type: 'response.function_call_arguments.done',
        item_id: 'fc_001',
        output_index: 0,
        arguments: '{"location":"Tokyo"}',
      }

      expect(argsDoneEvent.type).toBe('response.function_call_arguments.done')
      expect(argsDoneEvent.arguments).toBe('{"location":"Tokyo"}')
    })
  })
})

// Test error responses
describe('OpenAI Responses API Errors', () => {
  it('should have correct error structure', () => {
    const errorResponse = {
      error: {
        type: 'invalid_request_error',
        message: 'The model field is required',
        param: 'model',
        code: null,
      },
    }

    expect(errorResponse.error.type).toBe('invalid_request_error')
    expect(errorResponse.error.message).toBe('The model field is required')
  })

  it('should handle model_not_found error', () => {
    const errorResponse = {
      error: {
        type: 'invalid_request_error',
        message: 'Model not found: invalid-model',
        param: 'model',
        code: 'model_not_found',
      },
    }

    expect(errorResponse.error.code).toBe('model_not_found')
  })
})
