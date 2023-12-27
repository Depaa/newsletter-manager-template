import { HostedZone } from 'aws-cdk-lib/aws-route53'
import { ConfigurationSet, ConfigurationSetTlsPolicy, EmailIdentity, EmailSendingEvent, EventDestination, Identity, VdmAttributes } from 'aws-cdk-lib/aws-ses'
import { Topic, type StackContext, use } from 'sst/constructs'
import { DatabaseStack } from './DatabaseStack'
import { PermissionStack } from './PermissionStack'
import { DnsValidatedDomainIdentity } from 'aws-cdk-ses-domain-identity'

export function EmailStack ({ stack, app }: StackContext): Record<string, ConfigurationSet> {
  const {
    newslettersTable,
    newsletterSubscribersTable
  } = use(DatabaseStack)
  const { emailRole } = use(PermissionStack)

  /**
   * Create Topics and Subscribers
   */
  const bouncesTopic = new Topic(stack, 'Bounces', {
    defaults: {
      function: {
        role: emailRole,
        environment: {
          NEWSLETTERS_TABLE_NAME: newslettersTable.tableName,
          NEWSLETTER_SUBSCRIBERS_TABLE_NAME: newsletterSubscribersTable.tableName
        },
        timeout: 29,
        bind: [newslettersTable, newsletterSubscribersTable]
      }
    }
  })
  bouncesTopic.addSubscribers(stack, {
    lambda: 'packages/functions/src/emails/bounces/index.handler'
  })

  const complaintsTopic = new Topic(stack, 'Complaints', {
    defaults: {
      function: {
        role: emailRole,
        environment: {
          NEWSLETTERS_TABLE_NAME: newslettersTable.tableName,
          NEWSLETTER_SUBSCRIBERS_TABLE_NAME: newsletterSubscribersTable.tableName
        },
        timeout: 29,
        bind: [newslettersTable, newsletterSubscribersTable]
      }
    }
  })
  complaintsTopic.addSubscribers(stack, {
    lambda: 'packages/functions/src/emails/complaints/index.handler'
  })

  const genericErrorsTopic = new Topic(stack, 'GenericErrors', {
    defaults: {
      function: {
        role: emailRole,
        environment: {
          NEWSLETTERS_TABLE_NAME: newslettersTable.tableName,
          NEWSLETTER_SUBSCRIBERS_TABLE_NAME: newsletterSubscribersTable.tableName
        },
        timeout: 29,
        bind: [newslettersTable, newsletterSubscribersTable]
      }
    }
  })
  genericErrorsTopic.addSubscribers(stack, {
    lambda: 'packages/functions/src/emails/generic-errors/index.handler'
  })

  /**
   * Create Configuration Set and Events
   */
  const configurationSet = new ConfigurationSet(stack, 'ConfigurationSet', {
    tlsPolicy: ConfigurationSetTlsPolicy.REQUIRE,
    reputationMetrics: true
  })
  configurationSet.addEventDestination('ComplaintsSns', {
    destination: EventDestination.snsTopic(complaintsTopic.cdk.topic),
    events: [EmailSendingEvent.COMPLAINT]
  })
  configurationSet.addEventDestination('BouncesSns', {
    destination: EventDestination.snsTopic(bouncesTopic.cdk.topic),
    events: [EmailSendingEvent.BOUNCE]
  })
  configurationSet.addEventDestination('GenericErrorsSns', {
    destination: EventDestination.snsTopic(genericErrorsTopic.cdk.topic),
    events: [EmailSendingEvent.REJECT, EmailSendingEvent.RENDERING_FAILURE, EmailSendingEvent.DELIVERY_DELAY]
  })

  if (process.env.DOMAIN_NAME !== '' && process.env.DOMAIN_NAME !== undefined) {
    const hostedZone = HostedZone.fromLookup(stack, 'HostedZone', {
      domainName: process.env.DOMAIN_NAME
    })

    // eslint-disable-next-line no-new
    new DnsValidatedDomainIdentity(stack, 'DomainIdentity', {
      domainName: process.env.DOMAIN_NAME,
      dkim: true,
      region: app.region,
      hostedZone
    })
  } else if (process.env.EMAIL_ADDRESS !== '' && process.env.EMAIL_ADDRESS !== undefined) {
    // eslint-disable-next-line no-new
    new EmailIdentity(stack, 'EmailIdentity', {
      identity: Identity.email(process.env.EMAIL_ADDRESS),
      configurationSet
    })
  }

  // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ses-readme.html#virtual-deliverability-manager-vdm
  // eslint-disable-next-line no-new
  new VdmAttributes(stack, 'VdmTracking')

  return {
    configurationSet
  }
}
