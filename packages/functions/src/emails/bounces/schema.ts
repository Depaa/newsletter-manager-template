export const queryStringParametersSchema = {
  type: 'object',
  properties: {
    limit: { type: 'number' },
    nextToken: { type: 'string', maxLength: 100 }
  },
  additionalProperties: false
} as const

export const schema = {
  type: 'object',
  properties: {
    queryStringParameters: queryStringParametersSchema
  }
} as const
