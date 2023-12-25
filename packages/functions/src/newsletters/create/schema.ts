export const bodySchema = {
  type: 'object',
  properties: {
    title: { type: 'string', maxLength: 100 },
    description: { type: 'string', maxLength: 512 },
    image: { type: 'string', maxLength: 100 },
    content: { type: 'string', maxLength: 100 },
    contentMd: { type: 'string', maxLength: 100 },
    seo: {
      type: 'object',
      properties: {
        title: { type: 'string', maxLength: 100 },
        description: { type: 'string', maxLength: 512 },
        tags: { type: 'array', items: { type: 'string', maxLength: 100 } }
      },
      required: ['title', 'description'],
      additionalProperties: false
    }
  },
  required: ['title', 'description', 'content', 'contentMd'],
  additionalProperties: false
} as const

export const schema = {
  type: 'object',
  properties: {
    body: bodySchema
  }
} as const
