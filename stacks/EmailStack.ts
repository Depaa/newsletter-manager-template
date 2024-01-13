import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
import { HostedZone } from 'aws-cdk-lib/aws-route53'
import { CfnTemplate, ConfigurationSet, ConfigurationSetTlsPolicy, EmailIdentity, EmailSendingEvent, EventDestination, Identity, VdmAttributes } from 'aws-cdk-lib/aws-ses'
import { DnsValidatedDomainIdentity } from 'aws-cdk-ses-domain-identity'
import { Topic, attachPermissionsToRole, use, type StackContext } from 'sst/constructs'
import { DatabaseStack } from './DatabaseStack'
import template from '../packages/core/src/libs/templates/newsletter'

export const EmailStack = ({ stack, app }: StackContext): Record<string, string> => {
  const {
    newslettersTable,
    newsletterSubscribersTable
  } = use(DatabaseStack)

  /**
   * Lambda function proper role
   */
  const newsletterSubscribersTableAccess = new PolicyStatement({
    actions: [
      'dynamodb:PutItem',
      'dynamodb:DeleteItem',
      'dynamodb:UpdateItem',
      'dynamodb:GetItem',
      'dynamodb:Scan',
      'dynamodb:Query'
    ],
    resources: [
      newsletterSubscribersTable.tableArn,
        `${newsletterSubscribersTable.tableArn}/*`
    ]
  })
  const emailRole = new Role(stack, 'EmailRole', {
    assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    managedPolicies: [
      {
        managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
      }
    ]
  })
  attachPermissionsToRole(emailRole, [
    newsletterSubscribersTableAccess
  ])

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
    lambda: {
      function: {
        handler: 'packages/functions/src/emails/bounces/index.handler',
        functionName: `${stack.stackName}-emails-bounces`
      }
    }
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
    lambda: {
      function: {
        handler: 'packages/functions/src/emails/complaints/index.handler',
        functionName: `${stack.stackName}-emails-complaints`
      }
    }
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
    lambda: {
      function: {
        handler: 'packages/functions/src/emails/generic-errors/index.handler',
        functionName: `${stack.stackName}-emails-generic-errors`
      }
    }
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

  let identityName = ''

  if (process.env.DOMAIN_NAME !== '' && process.env.DOMAIN_NAME !== undefined) {
    identityName = process.env.DOMAIN_NAME
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
    identityName = process.env.EMAIL_ADDRESS
    // eslint-disable-next-line no-new
    new EmailIdentity(stack, 'EmailIdentity', {
      identity: Identity.email(process.env.EMAIL_ADDRESS),
      configurationSet
    })
  }

  /**
   * SES Email Template
   */
  const sesTemplate = new CfnTemplate(stack, 'SESEmailTemplate', {
    template: {
      subjectPart: '{{subject}}',
      htmlPart: template
    }
  })

  // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ses-readme.html#virtual-deliverability-manager-vdm

  /**
   * Attention
   * Please be mindful "VDM" can only be activated one time
   * Consider adding a condition to enable it only for production
   */

  // eslint-disable-next-line no-new
  new VdmAttributes(stack, 'VdmTracking')

  return {
    identityName,
    sesTemplateName: sesTemplate.attrId,
    configurationSetName: configurationSet.configurationSetName
  }
}
