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

      if (snsMessage.eventType === 'DeliveryDelay' && (snsMessage.deliveryDelay != null) && snsMessage.deliveryDelay.delayType === 'TransientCommunicationFailure') {
        const email = snsMessage.deliveryDelay.delayedRecipients[0].emailAddress

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
