import { type ITopic } from 'aws-cdk-lib/aws-sns'
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions'
import { Topic, type StackContext } from 'sst/constructs'

export const AlertingStack = ({ stack }: StackContext): Record<string, ITopic> => {
  const alertingTopic = new Topic(stack, 'AlertingTopic')

  if (process.env.ALERTING_EMAIL_ADDRESS !== '' && process.env.ALERTING_EMAIL_ADDRESS !== undefined) {
    alertingTopic.cdk.topic.addSubscription(new EmailSubscription(process.env.ALERTING_EMAIL_ADDRESS))
  }

  return {
    alertingTopic: alertingTopic.cdk.topic
  }
}
