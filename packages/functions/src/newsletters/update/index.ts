import { middyfy, type Handler } from '@core/libs/middyWrapper'
import type { FromSchema } from 'json-schema-to-ts'
import { NewslettersTableDefinition } from '../dynamodb'
import { schema, type bodySchema, type pathParametersSchema } from './schema'

const main: Handler<FromSchema<typeof bodySchema>, FromSchema<typeof pathParametersSchema>, void> = async (event) => {
  const id = event.pathParameters.id

  const updateParams = {
    ...event.body,
    id,
    updatedAt: Date.now(),
    updatedBy: event.requestContext?.authorizer?.claims.sub
  }

  await NewslettersTableDefinition.update(updateParams, {
    returnValues: 'ALL_NEW'
  })

  return {
    statusCode: 204,
    body: {}
  }
}

export const handler = middyfy(main, schema)
