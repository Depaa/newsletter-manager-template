import { type Handler, middyfy } from '@core/libs/middyWrapper'
import { type bodySchema, schema } from './schema'
import type { FromSchema } from 'json-schema-to-ts'
import { randomUUID } from 'crypto'
import { NewsletterStatus, type Newsletter } from '../interface'
import { NewslettersTableDefinition } from '../dynamodb'

const main: Handler<FromSchema<typeof bodySchema>, void, void> = async (event) => {
  const slug = event.body.title
    .replace(/([^\w ]|_)/g, '')
    .replace(/ /g, '-')
    .toLowerCase()

  const id = randomUUID()

  const newsletter: Newsletter = {
    ...event.body,
    id,
    slug,
    status: NewsletterStatus.PRIVATE,
    image: `https://${process.env.CONTENT_CDN_URL}/images/${id}`,
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
