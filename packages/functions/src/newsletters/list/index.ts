import { isAdmin } from '@core/libs/authorizer'
import { middyfy, type Handler } from '@core/libs/middyWrapper'
import type { FromSchema } from 'json-schema-to-ts'
import { NewslettersTableDefinition } from '../dynamodb'
import type Newsletter from '../interface'
import { NewsletterStatus } from '../interface'
import { schema, type queryStringParametersSchema } from './schema'

const sortItems = (items: Newsletter[]): Newsletter[] => {
  return items.sort((a, b) => {
    if (
      (a.publishedAt !== undefined && b.publishedAt !== undefined) ||
      (a.publishedAt === undefined && b.publishedAt === undefined)
    ) {
      return (b.publishedAt ?? b.createdAt) - (a.publishedAt ?? a.createdAt)
    }
    if (a.publishedAt !== undefined) {
      return -1
    }
    return 1
  })
}

const main: Handler<void, void, FromSchema<typeof queryStringParametersSchema>> = async (event) => {
  const { limit } = event.queryStringParameters ?? 12
  let { nextToken } = event.queryStringParameters ?? undefined

  let items: Newsletter[] | [] = []
  if (isAdmin(event.requestContext)) {
    if (Object.keys(event.queryStringParameters ?? {}).length === 0) {
      const newsletters = await NewslettersTableDefinition.scan({
        limit,
        startKey: (nextToken !== undefined) ? JSON.parse(Buffer.from(nextToken, 'base64').toString('utf-8')) : undefined
      })
      items = newsletters.Items as Newsletter[] ?? []
      if (newsletters.LastEvaluatedKey != null) {
        nextToken = Buffer.from(JSON.stringify(newsletters.LastEvaluatedKey), 'utf-8').toString('base64')
      }
    }
    sortItems(items)
  } else {
    const newsletters = await NewslettersTableDefinition.query(NewsletterStatus.PUBLIC, {
      limit,
      startKey: (nextToken !== undefined) ? JSON.parse(Buffer.from(nextToken, 'base64').toString('utf-8')) : undefined,
      index: 'status-index',
      reverse: false,
      attributes: ['status', 'subject', 'publishedAt', 'content']
    })
    console.info('Successfully listed newsletters')
    console.debug(newsletters)
    items = newsletters.Items as Newsletter[] ?? []
    if (newsletters.LastEvaluatedKey != null) {
      nextToken = Buffer.from(JSON.stringify(newsletters.LastEvaluatedKey), 'utf-8').toString('base64')
    }
  }

  return {
    statusCode: 200,
    body: { items, nextToken }
  }
}

export const handler = middyfy(main, schema)
