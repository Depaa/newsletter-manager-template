const dynamodbStringType = {
  type: 'object',
  properties: {
    S: { type: 'string' }
  },
  required: ['S'],
  additionalProperties: false
} as const

const newsletterSchema = {
  type: 'object',
  properties: {
    id: dynamodbStringType,
    title: dynamodbStringType,
    description: dynamodbStringType,
    image: dynamodbStringType,
    content: dynamodbStringType
  },
  required: ['id', 'title', 'description', 'content', 'image']
} as const

export const bodySchema = {
  type: 'object',
  properties: {
    Item: newsletterSchema
  },
  required: ['Item'],
  additionalProperties: false
} as const

export const schema = {
  type: 'object',
  properties: {
    body: bodySchema
  },
  required: ['body']
} as const
