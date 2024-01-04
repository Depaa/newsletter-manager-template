import { type AttributeValue } from '@aws-sdk/client-dynamodb'
import { SESClient, SendEmailCommand, type SendEmailCommandInput } from '@aws-sdk/client-ses'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { middyfy, type Handler } from '@core/libs/middyWrapper'
import { type FromSchema } from 'json-schema-to-ts'
import { SubscriptionsTableDefinition } from 'src/subscriptions/dynamodb'
import type Subscription from 'src/subscriptions/interface'
import { SubscriptionStatus } from 'src/subscriptions/interface'
import { type bodySchema } from './schema'

const ses = new SESClient()
const SES_BATCH_SIZE = 50

/**
 * Groups email because SES sending limits
 */
const sendEmailsInBatches = async (emailParameters: { subject: string, body: string }, toAddresses: string[]): Promise<void> => {
  const totalEmails = toAddresses.length

  for (let i = 0; i < totalEmails; i += SES_BATCH_SIZE) {
    const batchEmails = toAddresses.slice(i, i + SES_BATCH_SIZE)
    await sendEmails(emailParameters, batchEmails)
  }
}

const sendEmails = async (emailParameters: { subject: string, body: string }, toAddresses: string[]): Promise<void> => {
  const input: SendEmailCommandInput = {
    Source: process.env.SOURCE_EMAIL_ADDRESS,
    Destination: {
      ToAddresses: toAddresses
    },
    Message: {
      Subject: {
        Data: emailParameters.subject
      },
      Body: {
        Text: {
          Data: emailParameters.body
        }
      }
    }
  }

  const sendEmailCommand = new SendEmailCommand(input)
  const sendOperation = await ses.send(sendEmailCommand)
  console.info('Successfully send email')
  console.debug(sendOperation)
}

const main: Handler<FromSchema<typeof bodySchema>, void, void> = async (event) => {
  console.debug(JSON.stringify(event))
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const sendTestEamil = new Date(event.waitTimestamp).getTime() > new Date().getTime()

  // const newsletter: {
  //   id?: string
  //   title?: string
  //   description?: string
  //   image?: string
  //   content?: string
  // } = unmarshall(event.body.Item as Record<string, AttributeValue>)

  // const emailParameters = {
  //   subject: newsletter.title ?? 'Welcome to my newsletter',
  //   body: newsletter.content ?? ''
  // }

  // if (sendTestEamil) {
  //   await sendEmails(emailParameters, [process.env.TEST_EMAIL_ADDRESS ?? ''])
  //   return {
  //     statusCode: 200,
  //     body: {}
  //   }
  // }

  // let items: Subscription[] | [] = []
  // const limit = 1000
  // let nextToken: Record<string, any> | undefined

  // let loop = true
  // while (loop) {
  //   const subscriptionItems = await SubscriptionsTableDefinition.query(
  //     {
  //       pk: '1',
  //       status: SubscriptionStatus.ENABLED
  //     },
  //     {
  //       limit,
  //       startKey: nextToken ?? undefined,
  //       index: 'status-index',
  //       reverse: false,
  //       attributes: ['id', 'status', 'email']
  //     }
  //   )
  //   console.info('Successfully query subscriptions')
  //   console.debug(subscriptionItems)

  //   nextToken = subscriptionItems.LastEvaluatedKey ?? undefined
  //   loop = !(nextToken === undefined)
  //   const subscriptions = subscriptionItems.Items as Subscription[]
  //   items = [...items, ...subscriptions]
  // }

  // /**
  //  * Send emails
  //  */
  // const emails: string[] = items.map(item => item.email)
  // await sendEmailsInBatches(emailParameters, emails)

  return {
    statusCode: 200,
    body: {}
  }
}

export const handler = middyfy(main)
