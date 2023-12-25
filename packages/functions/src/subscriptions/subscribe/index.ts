import { type Handler, middyfy } from '@core/libs/middyWrapper'
import { schema, type bodySchema } from './schema'
import type { FromSchema } from 'json-schema-to-ts'
import { SubscriptionsTableDefinition } from '../dynamodb'
import type Subscription from '../interface'
import { randomUUID } from 'crypto'
import { SubscriptionStatus } from '../interface'

const main: Handler<FromSchema<typeof bodySchema>, void, void> = async (event) => {
  const params: Subscription = {
    ...event.body,
    id: randomUUID(),
    createdAt: Date.now(),
    status: SubscriptionStatus.ENABLED
  }

  await SubscriptionsTableDefinition.put(params)

  return {
    statusCode: 204,
    body: {}
  }
}

export const handler = middyfy(main, schema)
