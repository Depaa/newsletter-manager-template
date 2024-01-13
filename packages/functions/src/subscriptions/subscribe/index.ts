import { middyfy, type Handler } from '@core/libs/middyWrapper'
import { randomUUID } from 'crypto'
import type { FromSchema } from 'json-schema-to-ts'
import { SubscriptionsTableDefinition } from '../dynamodb'
import type Subscription from '../interface'
import { SubscriptionStatus } from '../interface'
import { schema, type bodySchema } from './schema'
import { SendEmailCommand, type SendEmailCommandOutput, SESClient } from '@aws-sdk/client-ses'
import welcome from '../../../../core/src/libs/templates/welcome'

const sesClient = new SESClient()

const createSendEmailCommand = (toAddress: string): SendEmailCommand => {
  return new SendEmailCommand({
    Destination: {
      ToAddresses: [
        toAddress
      ]
    },
    Message: {
      Body: {
        Html: {
          Charset: 'UTF-8',
          Data: welcome
        }
      },
      Subject: {
        Charset: 'UTF-8',
        Data: '👋 Welcome! Thanks for joining CloudNature newsletter 🚀'
      }
    },
    Source: process.env.SOURCE_EMAIL_ADDRESS,
    ReplyToAddresses: [
      process.env.REPLY_TO_ADDRESS ?? ''
    ],
    ConfigurationSetName: process.env.CONFIGURATION_SET_NAME,
    SourceArn: process.env.IDENTITY_ARN
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

  try {
    await SubscriptionsTableDefinition.put(params, {
      conditions: {
        attr: 'email',
        exists: false
      }
    })
  } catch (e: any) {
    if (e.name !== 'ConditionalCheckFailedException') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      throw new Error(e)
    }
  }

  await sendEmail(event.body.email)

  return {
    statusCode: 204,
    body: {}
  }
}

export const handler = middyfy(main, schema)
