export const bodySchema = {
  type: 'object',
  properties: {
    subject: { type: 'string', maxLength: 100 },
    content: { type: 'string', maxLength: 100 }
  },
  required: ['subject', 'content'],
  additionalProperties: false
} as const

export const schema = {
  type: 'object',
  properties: {
    body: bodySchema
  }
} as const
