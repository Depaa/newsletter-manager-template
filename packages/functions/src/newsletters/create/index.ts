import { middyfy, type Handler } from '@core/libs/middyWrapper'
import { randomUUID } from 'crypto'
import type { FromSchema } from 'json-schema-to-ts'
import { NewslettersTableDefinition } from '../dynamodb'
import { NewsletterStatus, type Newsletter } from '../interface'
import { schema, type bodySchema } from './schema'

const main: Handler<FromSchema<typeof bodySchema>, void, void> = async (event) => {
  const id = randomUUID()

  const newsletter: Newsletter = {
    ...event.body,
    id,
    status: NewsletterStatus.PRIVATE,
    createdAt: Date.now(),
    createdBy: event.requestContext?.authorizer?.claims.sub,
    updatedAt: Date.now(),
    updatedBy: event.requestContext?.authorizer?.claims.sub
  }
  await NewslettersTableDefinition.put(newsletter)

  return {
    statusCode: 201,
    body: { ...newsletter }
  }
}

export const handler = middyfy(main, schema)
