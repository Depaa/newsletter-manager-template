export const bodySchema = {
  type: 'object',
  properties: {
    email: {
      type: 'string',
      pattern: '[a-z0-9._%+!$&*=^|~#%{}/-]+@([a-z0-9-]+.){1,}([a-z]{2,22})'
    }
  },
  required: ['email'],
  additionalProperties: false
} as const

export const pathParametersSchema = {
  type: 'object',
  properties: {
    token: { type: 'string', maxLength: 512, minLength: 1 }
  },
  required: ['token'],
  additionalProperties: false
} as const

export const schema = {
  type: 'object',
  properties: {
    body: bodySchema,
    pathParameters: pathParametersSchema
  }
} as const
