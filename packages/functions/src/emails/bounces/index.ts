import { middyfySNS, type HandlerSNS } from '@core/libs/middyWrapper'
import { type SNSEvent } from 'aws-lambda'
import { SubscriptionsTableDefinition } from 'src/subscriptions/dynamodb'
import { SubscriptionStatus } from 'src/subscriptions/interface'
import { type SNSMessage } from '../interface'

const main: HandlerSNS = async (event: SNSEvent) => {
  const records = event.Records

  /**
   * Unsubscribe each email which was bounced
   */
  for (const record of records) {
    if ((record.Sns?.Message) !== '') {
      const snsMessage = JSON.parse(record.Sns.Message) as SNSMessage

      if (snsMessage.eventType === 'Bounce' && (snsMessage.bounce != null) && snsMessage.bounce.bounceType === 'Permanent') {
        const email = snsMessage.bounce.bouncedRecipients[0].emailAddress

        const params = {
          email,
          deletedAt: Date.now(),
          status: SubscriptionStatus.DISABLED
        }
        console.debug(params)

        await SubscriptionsTableDefinition.update(params, {
          returnValues: 'ALL_NEW'
        })
        console.info('Successfully unsubscribed')
      }
    }
  }

  /**
   * Your own logic
   */
}

export const handler = middyfySNS(main)
