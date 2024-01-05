import UnauthorizedError from '@core/libs/errors/UnauthorizedError'
import { middyfy, type Handler } from '@core/libs/middyWrapper'
import type { FromSchema } from 'json-schema-to-ts'
import { SubscriptionsTableDefinition } from '../dynamodb'
import { SubscriptionStatus } from '../interface'
import { schema, type bodySchema, type pathParametersSchema } from './schema'

interface SubscriptionToken {
  id: string
  createdAt: number
}

const main: Handler<FromSchema<typeof bodySchema>, FromSchema<typeof pathParametersSchema>, void> = async (event) => {
  const object: SubscriptionToken = JSON.parse(Buffer.from(event.pathParameters.token, 'base64').toString('utf-8'))

  const subscription = await SubscriptionsTableDefinition.get({
    email: event.body.email
  })

  if (subscription.Item == null || subscription.Item.id !== object.id || subscription.Item.createdAt !== object.createdAt) {
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
