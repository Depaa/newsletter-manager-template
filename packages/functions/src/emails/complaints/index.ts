import { middyfySNS, type HandlerSNS } from '@core/libs/middyWrapper'
import { type SNSEvent } from 'aws-lambda'

const main: HandlerSNS = async (event: SNSEvent) => {
  /**
   * Your own logic
   */
}

export const handler = middyfySNS(main)
