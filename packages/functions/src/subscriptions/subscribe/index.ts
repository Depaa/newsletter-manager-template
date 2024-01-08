import { middyfy, type Handler } from '@core/libs/middyWrapper'
import { randomUUID } from 'crypto'
import type { FromSchema } from 'json-schema-to-ts'
import { SubscriptionsTableDefinition } from '../dynamodb'
import type Subscription from '../interface'
import { SubscriptionStatus } from '../interface'
import { schema, type bodySchema } from './schema'

const main: Handler<FromSchema<typeof bodySchema>, void, void> = async (event) => {
  const params: Subscription = {
    ...event.body,
    id: randomUUID(),
    createdAt: Date.now(),
    status: SubscriptionStatus.ENABLED
  }

  await SubscriptionsTableDefinition.put(params)

  /**
   * TODO
   * SES send email
   */

  return {
    statusCode: 204,
    body: {}
  }
}

export const handler = middyfy(main, schema)
