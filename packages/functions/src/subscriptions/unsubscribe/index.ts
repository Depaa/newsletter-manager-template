import { type Handler, middyfy } from '@core/libs/middyWrapper'
import UnauthorizedError from '@core/libs/errors/UnauthorizedError'
import { schema, type bodySchema, type pathParametersSchema } from './schema'
import type { FromSchema } from 'json-schema-to-ts'
import { SubscriptionsTableDefinition } from '../dynamodb'
import { SubscriptionStatus } from '../interface'

interface SubscriptionToken {
  id: string
  expireAt: number
}

const main: Handler<FromSchema<typeof bodySchema>, FromSchema<typeof pathParametersSchema>, void> = async (event) => {
  const object: SubscriptionToken = JSON.parse(Buffer.from(event.pathParameters.token, 'base64').toString('utf-8'))

  const subscription = await SubscriptionsTableDefinition.get({
    email: event.body.email
  })

  if (subscription.Item == null || object.expireAt < Date.now() || subscription.Item.id !== object.id) {
    throw new UnauthorizedError()
  }

  const params = {
    ...event.body,
    deletedAt: Date.now(),
    subscription: SubscriptionStatus.DISABLED
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
