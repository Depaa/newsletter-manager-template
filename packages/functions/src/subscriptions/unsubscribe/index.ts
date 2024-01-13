import NotFoundError from '@core/libs/errors/NotFoundError'
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
    throw new NotFoundError()
  }

  const params = {
    ...event.body,
    deletedAt: Date.now(),
    status: SubscriptionStatus.DISABLED
  }

  await SubscriptionsTableDefinition.update(params, {
    returnValues: 'ALL_NEW'
  })
  console.info('Successfully unsubscribed')

  return {
    statusCode: 204,
    body: {}
  }
}

export const handler = middyfy(main, schema)
