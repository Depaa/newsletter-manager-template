import { middyfySNS, type HandlerSNS } from '@core/libs/middyWrapper'
import { type SNSEvent } from 'aws-lambda'
import { type SNSMessage } from '../interface'
import { ClicksTableDefinition } from './dynamodb'

const main: HandlerSNS = async (event: SNSEvent) => {
  const records = event.Records

  for (const record of records) {
    if ((record.Sns?.Message) !== '') {
      const snsMessage = JSON.parse(record.Sns.Message) as SNSMessage

      if (snsMessage.eventType === 'Click') {
        const link = snsMessage.click?.link
        const timestamp = snsMessage.click?.timestamp

        const params = {
          link,
          timestamp,
          from: snsMessage.mail?.commonHeaders.from[0] ?? '',
          to: snsMessage.mail?.commonHeaders.to[0] ?? '',
          subject: snsMessage.mail?.commonHeaders.subject ?? '',
          messageId: snsMessage.mail?.commonHeaders.messageId ?? ''
        }
        console.debug(params)

        await ClicksTableDefinition.put(params)
        console.info('Successfully added click')
      }
    }
  }
}

export const handler = middyfySNS(main)
