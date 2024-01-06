import UnauthorizedError from '@core/libs/errors/UnauthorizedError'
import { middyfy, type Handler } from '@core/libs/middyWrapper'
import type { FromSchema } from 'json-schema-to-ts'
import { SubscriptionsTableDefinition } from '../dynamodb'
import { SubscriptionStatus } from '../interface'
import { schema, type bodySchema } from './schema'

const main: Handler<FromSchema<typeof bodySchema>, void, void> = async (event) => {
  const subscription = await SubscriptionsTableDefinition.get({
    email: event.body.email
  })

  if (subscription.Item == null) {
    throw new UnauthorizedError()
  }

  const params = {
    ...event.body,
    deletedAt: Date.now(),
    status: SubscriptionStatus.DISABLED
  }

  await SubscriptionsTableDefinition.update(params, {
    returnValues: 'ALL_NEW'
  })

  return {
    statusCode: 204,
    body: {}
  }
}

export const handler = middyfy(main, schema)
