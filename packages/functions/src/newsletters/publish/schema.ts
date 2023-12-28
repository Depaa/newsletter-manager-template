export const bodySchema = {
  type: 'object',
  properties: {
    publishAt: { type: 'number' }
  },
  additionalProperties: false
} as const

export const pathParametersSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100, minLength: 1 }
  },
  required: ['id'],
  additionalProperties: false
} as const

export const schema = {
  type: 'object',
  properties: {
    pathParameters: pathParametersSchema,
    body: bodySchema
  }
} as const
