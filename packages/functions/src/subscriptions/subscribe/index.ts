import { middyfy, type Handler } from '@core/libs/middyWrapper'
import { randomUUID } from 'crypto'
import type { FromSchema } from 'json-schema-to-ts'
import { SubscriptionsTableDefinition } from '../dynamodb'
import type Subscription from '../interface'
import { SubscriptionStatus } from '../interface'
import { schema, type bodySchema } from './schema'
import { SendEmailCommand, type SendEmailCommandOutput, SESv2Client } from '@aws-sdk/client-sesv2'
import welcome from '../../../../core/src/libs/templates/welcome'

const sesClient = new SESv2Client()

const createSendEmailCommand = (toAddress: string): SendEmailCommand => {
  return new SendEmailCommand({
    Destination: {
      ToAddresses: [
        toAddress
      ]
    },
    Content: {
      Simple: {
        Body: {
          Html: {
            Charset: 'UTF-8',
            Data: welcome
          }
        },
        Subject: {
          Charset: 'UTF-8',
          Data: 'Welcome!👋 Thanks for joining CloudNature newsletter 🚀'
        }
      }
    },
    FromEmailAddress: process.env.SOURCE_EMAIL_ADDRESS,
    FromEmailAddressIdentityArn: process.env.IDENTITY_ARN,
    ConfigurationSetName: process.env.CONFIGURATION_SET_NAME
  })
}

const sendEmail = async (toAddress: string): Promise<SendEmailCommandOutput> => {
  const sendEmailCommand = createSendEmailCommand(
    toAddress
  )
  const response = await sesClient.send(sendEmailCommand)
  console.info('Successfully sent email')
  console.debug(response)
  return response
}

const main: Handler<FromSchema<typeof bodySchema>, void, void> = async (event) => {
  const params: Subscription = {
    ...event.body,
    id: randomUUID(),
    createdAt: Date.now(),
    status: SubscriptionStatus.ENABLED
  }
  console.debug(params)

  try {
    await SubscriptionsTableDefinition.put(params, {
      conditions: {
        attr: 'email',
        exists: false
      }
    })
    console.info('Successfully subcribed')

    await sendEmail(event.body.email)
    console.info('Successfully sent email')
  } catch (e: any) {
    console.error(e)
    if (e.name !== 'ConditionalCheckFailedException') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      throw new Error(e)
    }
    console.info('User already existing')

    const subscription = await SubscriptionsTableDefinition.get({
      email: event.body.email
    })
    console.info('Successfully get subscription')
    console.debug(subscription)

    if (subscription.Item?.status === SubscriptionStatus.DISABLED) {
      await SubscriptionsTableDefinition.put(params)
      console.info('Successfully subscribed a previous unsubscribed user')
      await sendEmail(event.body.email)
      console.info('Successfully sent email')
    }
  }

  return {
    statusCode: 204,
    body: {}
  }
}

export const handler = middyfy(main, schema)
