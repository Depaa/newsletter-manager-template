import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
import { LogGroup } from 'aws-cdk-lib/aws-logs'
import { DefinitionBody, LogLevel, StateMachine, StateMachineType } from 'aws-cdk-lib/aws-stepfunctions'
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
    timeout: '300 seconds',
    bind: [newslettersTable, newsletterSubscribersTable]
  })

  const sfnDefinition = {
    StartAt: 'ParallelState',
    States: {
      ParallelState: {
        Type: 'Parallel',
        Next: 'SucceedState',
        Catch: [
          {
            ErrorEquals: [
              'States.ALL'
            ],
            Next: 'PublishErrorState'
          }
        ],
        Branches: [
          {
            StartAt: 'GetNewsletterContentTestStateSDK',
            States: {
              GetNewsletterContentTestStateSDK: {
                Next: 'SendTestEmailState',
                Type: 'Task',
                ResultPath: '$.body',
                Resource: 'arn:aws:states:::aws-sdk:dynamodb:getItem',
                Parameters: {
                  TableName: `${newslettersTable.tableName}`,
                  Key: {
                    id: {
                      'S.$': '$.id'
                    }
                  }
                }
              },
              SendTestEmailState: {
                End: true,
                Retry: [
                  {
                    ErrorEquals: [
                      'Lambda.ClientExecutionTimeoutException',
                      'Lambda.ServiceException',
                      'Lambda.AWSLambdaException',
                      'Lambda.SdkClientException'
                    ],
                    IntervalSeconds: 2,
                    MaxAttempts: 6,
                    BackoffRate: 2
                  }
                ],
                Type: 'Task',
                ResultPath: '$.sent',
                Resource: 'arn:aws:states:::lambda:invoke',
                Parameters: {
                  FunctionName: `${sendEmailFunction.functionArn}`,
                  'Payload.$': '$'
                }
              }
            }
          },
          {
            StartAt: 'WaitState',
            States: {
              WaitState: {
                Type: 'Wait',
                TimestampPath: '$.waitTimestamp',
                Next: 'UpdateNewsletterContentStateSDK'
              },
              UpdateNewsletterContentStateSDK: {
                Next: 'GetNewsletterContentStateSDK',
                Type: 'Task',
                ResultPath: '$.updateResult',
                Resource: 'arn:aws:states:::aws-sdk:dynamodb:updateItem',
                Parameters: {
                  TableName: `${newslettersTable.tableName}`,
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
                }
              },
              GetNewsletterContentStateSDK: {
                Next: 'SendEmailState',
                Type: 'Task',
                ResultPath: '$.body',
                Resource: 'arn:aws:states:::aws-sdk:dynamodb:getItem',
                Parameters: {
                  TableName: `${newslettersTable.tableName}`,
                  Key: {
                    id: {
                      'S.$': '$.id'
                    }
                  }
                }
              },
              SendEmailState: {
                End: true,
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                Parameters: {
                  FunctionName: `${sendEmailFunction.functionArn}`,
                  'Payload.$': '$'
                }
              }
            }
          }
        ]
      },
      SucceedState: {
        Type: 'Succeed'
      },
      PublishErrorState: {
        Next: 'FailState',
        Type: 'Task',
        Resource: 'arn:aws:states:::sns:publish',
        Parameters: {
          TopicArn: `${alertingTopic.topicArn}`,
          'Message.$': '$'
        }
      },
      FailState: {
        Type: 'Fail'
      }
    }
  }

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
    definitionBody: DefinitionBody.fromString(JSON.stringify(sfnDefinition)),
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
