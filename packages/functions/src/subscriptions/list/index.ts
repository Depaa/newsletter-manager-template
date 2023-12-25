import { type Handler, middyfy } from '@core/libs/middyWrapper'
import { schema, type queryStringParametersSchema } from './schema'
import type { FromSchema } from 'json-schema-to-ts'
import { SubscriptionsTableDefinition } from '../dynamodb'
import type Subscription from '../interface'
import { SubscriptionStatus } from '../interface'

const main: Handler<void, void, FromSchema<typeof queryStringParametersSchema>> = async (event) => {
  const { limit } = event.queryStringParameters ?? 12
  let { nextToken } = event.queryStringParameters ?? undefined

  let items: Subscription[] | [] = []
  {
    const subscriptions = await SubscriptionsTableDefinition.query(
      {
        pk: '1',
        status: SubscriptionStatus.ENABLED
      },
      {
        limit,
        startKey: (nextToken !== undefined) ? JSON.parse(Buffer.from(nextToken, 'base64').toString('utf-8')) : undefined,
        index: 'status-index',
        reverse: false,
        attributes: ['id', 'status', 'email']
      })
    items = subscriptions.Items as Subscription[] ?? []
    if (subscriptions.LastEvaluatedKey != null) {
      nextToken = Buffer.from(JSON.stringify(subscriptions.LastEvaluatedKey), 'utf-8').toString('base64')
    }
  }

  return {
    statusCode: 200,
    body: { items, nextToken }
  }
}

export const handler = middyfy(main, schema)
