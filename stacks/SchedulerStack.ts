import { Policy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
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

  const emailStateMachineLogGroup = new LogGroup(stack, 'EmailStateMachineLogGroup')
  const emailStateMachine = new StateMachine(stack, 'EmailStateMachine', {
    definitionBody: DefinitionBody.fromChainable(emailStateMachineDefinition),
    stateMachineType: StateMachineType.STANDARD,
    logs: {
      includeExecutionData: true,
      level: LogLevel.ALL,
      destination: emailStateMachineLogGroup
    }
  })

  /**
   * Add proper permissions for state machine
   */
  emailStateMachine.role?.attachInlinePolicy(
    new Policy(stack, 'EmailStateMachinePermissions', {
      statements: [
        new PolicyStatement({
          actions: ['sns:Publish'],
          resources: [alertingTopic.topicArn]
        }),
        new PolicyStatement({
          actions: ['lambda:InvokeFunction'],
          resources: [sendEmailFunction.functionArn]
        }),
        new PolicyStatement({
          actions: ['dynamodb:GetItem'],
          resources: [
            newslettersTable.tableArn,
            `${newslettersTable.tableArn}/*`
          ]
        }),
        new PolicyStatement({
          actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: [
            emailStateMachineLogGroup.logGroupArn
          ]
        })
      ]
    })
  )

  /**
   * Add proper permissions for lambda
   */
  const emailStateMachineAccess = new PolicyStatement({
    actions: [
      'states:StartExecution',
      'states:StopExecution'
    ],
    resources: [
      emailStateMachine.stateMachineArn,
      `arn:aws:states:${stack.region}:${stack.account}:execution:${emailStateMachine.stateMachineName}:*`
    ]
  })
  attachPermissionsToRole(emailRole, [
    emailStateMachineAccess
  ])

  stack.addOutputs({
    EmailStateMachine: emailStateMachine.stateMachineName
  })

  return {
    emailStateMachine
  }
}
