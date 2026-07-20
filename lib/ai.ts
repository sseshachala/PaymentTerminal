import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null

export function getAI() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}
