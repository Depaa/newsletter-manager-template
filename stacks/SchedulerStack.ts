import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
import { LogGroup } from 'aws-cdk-lib/aws-logs'
import { Chain, DefinitionBody, Fail, LogLevel, StateMachine, StateMachineType, Succeed, TaskInput, Wait, WaitTime } from 'aws-cdk-lib/aws-stepfunctions'
import { CallAwsService, LambdaInvoke, SnsPublish } from 'aws-cdk-lib/aws-stepfunctions-tasks'
import { Function, attachPermissionsToRole, use, type StackContext } from 'sst/constructs'
import { AlertingStack } from './AlertingStack'
import { DatabaseStack } from './DatabaseStack'

export const SchedulerStack = ({ stack, app }: StackContext): Record<string, StateMachine> => {
  const {
    newslettersTable,
    newsletterSubscribersTable
  } = use(DatabaseStack)
  const { alertingTopic } = use(AlertingStack)

  /**
   * Add default states:
   * Fail
   * Success
   * SnsPublish for Failure notification
   */
  const failState = new Fail(stack, 'FailState')
  const succeedState = new Succeed(stack, 'SucceedState')
  const publishErrorState = new SnsPublish(stack, 'PublishErrorState', {
    topic: alertingTopic,
    message: TaskInput.fromJsonPathAt('$')
  }).next(failState)

  /**
   * Lambda function proper role
   */
  const newslettersTableAccess = new PolicyStatement({
    actions: [
      'dynamodb:PutItem',
      'dynamodb:DeleteItem',
      'dynamodb:UpdateItem',
      'dynamodb:GetItem',
      'dynamodb:Scan',
      'dynamodb:Query'
    ],
    resources: [
      newslettersTable.tableArn,
      `${newslettersTable.tableArn}/*`
    ]
  })
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
  const emailRole = new Role(stack, 'SendEmailRole', {
    assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    managedPolicies: [
      {
        managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
      }
    ]
  })
  attachPermissionsToRole(emailRole, [
    newslettersTableAccess,
    newsletterSubscribersTableAccess
  ])

  /**
   * Lambda function sending emails
   */
  const sendEmailFunction = new Function(stack, 'SendEmailFunction', {
    handler: 'packages/functions/src/scheduler/send/index.handler',
    functionName: `${stack.stackName}-emails-send`,
    role: emailRole,
    environment: {
      NEWSLETTERS_TABLE_NAME: newslettersTable.tableName,
      NEWSLETTER_SUBSCRIBERS_TABLE_NAME: newsletterSubscribersTable.tableName
    },
    timeout: 29,
    bind: [newslettersTable, newsletterSubscribersTable]
  })

  /**
   * Send Test Email
   */
  const sendTestEmailState = new LambdaInvoke(stack, 'SendTestEmailState', {
    lambdaFunction: sendEmailFunction,
    resultPath: '$.sent'
  }).addCatch(publishErrorState)

  /**
   * Wait publishAt timestamp
   */
  const waitState = new Wait(stack, 'WaitState', {
    time: WaitTime.timestampPath('$.waitTimestamp')
  })

  /**
   * Update Newsletter Status
   */
  const updateNewsletterContentStateSDK = new CallAwsService(stack, 'UpdateNewsletterContentStateSDK', {
    service: 'dynamodb',
    action: 'updateItem',
    parameters: {
      TableName: newslettersTable.cdk.table.tableName,
      Key: {
        id: {
          'S.$': '$.id'
        }
      },
      ExpressionAttributeValues: {
        ':status': {
          S: 'PUBLIC'
        }
      },
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      UpdateExpression: 'SET #status = :status'
    },
    iamResources: [
      newslettersTable.cdk.table.tableArn,
      `${newslettersTable.cdk.table.tableArn}/*`
    ],
    resultPath: '$.updateResult'
  }).addCatch(publishErrorState)

  /**
   * Get Newsletter Content
   */
  const getNewsletterContentStateSDK = new CallAwsService(stack, 'GetNewsletterContentStateSDK', {
    service: 'dynamodb',
    action: 'getItem',
    parameters: {
      TableName: newslettersTable.cdk.table.tableName,
      Key: {
        id: {
          'S.$': '$.id'
        }
      }
    },
    iamResources: [
      newslettersTable.cdk.table.tableArn,
      `${newslettersTable.cdk.table.tableArn}/*`
    ]
  }).addCatch(publishErrorState)

  /**
   * Send Emails
   */
  const sendEmailState = new LambdaInvoke(stack, 'SendEmailState', {
    lambdaFunction: sendEmailFunction
  }).addCatch(publishErrorState)

  /**
   * Chaining all step toghether
   */
  const emailStateMachineDefinition = Chain.start(sendTestEmailState).next(waitState).next(updateNewsletterContentStateSDK).next(getNewsletterContentStateSDK).next(sendEmailState).next(succeedState)

  /**
   * Lambda function proper role
   */
  const sfnRole = new Role(stack, 'SendEmailSfnRole', {
    assumedBy: new ServicePrincipal(`states.${stack.region}.amazonaws.com`)
  })
  const publishToTopicPolicy = new PolicyStatement({
    actions: ['sns:Publish'],
    resources: [alertingTopic.topicArn]
  })
  const invokeFunctionPolicy = new PolicyStatement({
    actions: ['lambda:InvokeFunction'],
    resources: [
      sendEmailFunction.functionArn,
      `${sendEmailFunction.functionArn}:*`
    ]
  })
  const getItemPolicy = new PolicyStatement({
    actions: ['dynamodb:GetItem'],
    resources: [
      newslettersTable.tableArn,
          `${newslettersTable.tableArn}/*`
    ]
  })
  const updateItemPolicy = new PolicyStatement({
    actions: ['dynamodb:UpdateItem'],
    resources: [
      newslettersTable.tableArn,
          `${newslettersTable.tableArn}/*`
    ]
  })
  const logGroupPolicy = new PolicyStatement({
    actions: [
      'logs:CreateLogDelivery',
      'logs:GetLogDelivery',
      'logs:UpdateLogDelivery',
      'logs:DeleteLogDelivery',
      'logs:ListLogDeliveries',
      'logs:PutResourcePolicy',
      'logs:DescribeResourcePolicies',
      'logs:DescribeLogGroups'
    ],
    resources: [
      '*'
    ]
  })

  attachPermissionsToRole(sfnRole, [
    newslettersTableAccess,
    publishToTopicPolicy,
    invokeFunctionPolicy,
    getItemPolicy,
    updateItemPolicy,
    logGroupPolicy
  ])

  const emailStateMachine = new StateMachine(stack, 'EmailStateMachine', {
    definitionBody: DefinitionBody.fromChainable(emailStateMachineDefinition),
    stateMachineType: StateMachineType.STANDARD,
    role: sfnRole,
    logs: {
      includeExecutionData: true,
      level: LogLevel.ALL,
      destination: new LogGroup(stack, 'EmailStateMachineLogGroup')
    }
  })

  stack.addOutputs({
    EmailStateMachine: emailStateMachine.stateMachineName
  })

  return {
    emailStateMachine
  }
}
