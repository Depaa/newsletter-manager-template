import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
import { LogGroup } from 'aws-cdk-lib/aws-logs'
import { DefinitionBody, LogLevel, StateMachine, StateMachineType } from 'aws-cdk-lib/aws-stepfunctions'
import { Function, attachPermissionsToRole, use, type StackContext } from 'sst/constructs'
import { AlertingStack } from './AlertingStack'
import { DatabaseStack } from './DatabaseStack'
import { EmailStack } from './EmailStack'

export const SchedulerStack = ({ stack, app }: StackContext): Record<string, StateMachine> => {
  const {
    newslettersTable,
    newsletterSubscribersTable
  } = use(DatabaseStack)
  const { alertingTopic } = use(AlertingStack)
  const { sesTemplate, identityName } = use(EmailStack)

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
  const sendEmamilPolicy = new PolicyStatement({
    actions: [
      'ses:SendEmail',
      'ses:SendBulkEmail'
    ],
    resources: ['*']
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
    newsletterSubscribersTableAccess,
    sendEmamilPolicy
  ])
  /**
   * Lambda function sending emails
   */
  const sendEmailFunction = new Function(stack, 'SendEmailFunction', {
    handler: 'packages/functions/src/scheduler/send/index.handler',
    functionName: `${stack.stackName}-emails-send`,
    role: emailRole,
    timeout: '300 seconds',
    environment: {
      NEWSLETTERS_TABLE_NAME: newslettersTable.tableName,
      NEWSLETTER_SUBSCRIBERS_TABLE_NAME: newsletterSubscribersTable.tableName,
      TEST_EMAIL_ADDRESS: process.env.TEST_EMAIL_ADDRESS ?? '',
      SOURCE_EMAIL_ADDRESS: process.env.SOURCE_EMAIL_ADDRESS ?? ''
    }
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
                Next: 'Is Get Successful',
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
              'Is Get Successful': {
                Type: 'Choice',
                Choices: [
                  {
                    Variable: '$.body.Item',
                    IsPresent: true,
                    Next: 'Pass'
                  }
                ]
              },
              Pass: {
                Type: 'Pass',
                Next: 'SendBulkEmail',
                Parameters: {
                  'id.$': '$.id',
                  'waitTimestamp.$': '$.waitTimestamp',
                  templateData: {
                    'subject.$': '$.body.Item.title.S',
                    'htmlBody.$': '$.body.Item.content.S'
                  }
                }
              },
              SendBulkEmail: {
                Type: 'Task',
                Parameters: {
                  BulkEmailEntries: [
                    {
                      Destination: {
                        ToAddresses: [
                          process.env.TEST_EMAIL_ADDRESS
                        ]
                      }
                    }
                  ],
                  DefaultContent: {
                    Template: {
                      'TemplateData.$': 'States.JsonToString($.templateData)',
                      TemplateName: 'SESEmailTemplate-nW7vxKqp4dSk'
                    }
                  },
                  FromEmailAddress: process.env.SOURCE_EMAIL_ADDRESS,
                  FromEmailAddressIdentityArn: `${identityName}`,
                  ReplyToAddresses: [
                    process.env.REPLY_TO_ADDRESS
                  ]
                },
                Resource: 'arn:aws:states:::aws-sdk:sesv2:sendBulkEmail',
                Next: 'TestSuccessState'
              },
              TestSuccessState: {
                Type: 'Succeed'
              }
            }
          },
          {
            StartAt: 'Wait scheduled date',
            States: {
              'Wait scheduled date': {
                Type: 'Wait',
                Next: 'Parallel',
                TimestampPath: '$.waitTimestamp'
              },
              Parallel: {
                Type: 'Parallel',
                Next: 'Batching email list',
                Branches: [
                  {
                    StartAt: 'Change Newsletter Status',
                    States: {
                      'Change Newsletter Status': {
                        Type: 'Task',
                        Resource: 'arn:aws:states:::dynamodb:updateItem',
                        Parameters: {
                          TableName: `${newslettersTable.tableName}`,
                          Key: {
                            id: {
                              'S.$': '$.id'
                            }
                          },
                          UpdateExpression: 'SET #status = :status',
                          ExpressionAttributeValues: {
                            ':status': {
                              S: 'PUBLIC'
                            }
                          },
                          ExpressionAttributeNames: {
                            '#status': 'status'
                          },
                          ReturnValues: 'ALL_NEW'
                        },
                        OutputPath: '$.Attributes',
                        End: true
                      }
                    }
                  },
                  {
                    StartAt: 'Add initial page',
                    States: {
                      'Add initial page': {
                        Type: 'Pass',
                        Next: 'Query',
                        Result: {
                          LastEvaluatedKey: null,
                          items: null
                        },
                        ResultPath: '$.dynamodbConfig'
                      },
                      Query: {
                        Type: 'Task',
                        Parameters: {
                          TableName: `${newsletterSubscribersTable.tableName}`,
                          IndexName: 'status-index',
                          ProjectionExpression: 'email',
                          KeyConditionExpression: ':status = #status',
                          ExpressionAttributeNames: {
                            '#status': 'status'
                          },
                          ExpressionAttributeValues: {
                            ':status': {
                              S: 'Subscribed'
                            }
                          },
                          Limit: 3,
                          'ExclusiveStartKey.$': '$.dynamodbConfig.LastEvaluatedKey'
                        },
                        Resource: 'arn:aws:states:::aws-sdk:dynamodb:query',
                        Next: 'Filter dynamodb output',
                        ResultPath: '$.subscribers'
                      },
                      'Filter dynamodb output': {
                        Type: 'Pass',
                        Next: 'Flattening email list',
                        Parameters: {
                          'subscribers.$': '$.subscribers',
                          dynamodbConfig: {
                            'LastEvaluatedKey.$': '$.dynamodbConfig.LastEvaluatedKey',
                            'items.$': 'States.Array($.dynamodbConfig.items[*], $.subscribers.Items[*].email.S)'
                          }
                        }
                      },
                      'Flattening email list': {
                        Type: 'Pass',
                        Next: 'Are there more Items?',
                        Parameters: {
                          'subscribers.$': '$.subscribers',
                          dynamodbConfig: {
                            'LastEvaluatedKey.$': '$.dynamodbConfig.LastEvaluatedKey',
                            'items.$': '$.dynamodbConfig.items[*][*]'
                          }
                        }
                      },
                      'Are there more Items?': {
                        Type: 'Choice',
                        Choices: [
                          {
                            And: [
                              {
                                Variable: '$.subscribers.LastEvaluatedKey',
                                IsPresent: true
                              },
                              {
                                Not: {
                                  Variable: '$.subscribers.LastEvaluatedKey',
                                  StringEquals: 'null'
                                }
                              }
                            ],
                            Next: 'Add next page'
                          }
                        ],
                        Default: 'Filter output'
                      },
                      'Add next page': {
                        Type: 'Pass',
                        Next: 'Query',
                        Parameters: {
                          dynamodbConfig: {
                            'LastEvaluatedKey.$': '$.subscribers.LastEvaluatedKey',
                            'items.$': '$.dynamodbConfig.items'
                          }
                        }
                      },
                      'Filter output': {
                        Type: 'Pass',
                        End: true,
                        Parameters: {
                          'items.$': '$.dynamodbConfig.items'
                        },
                        OutputPath: '$.items'
                      }
                    }
                  }
                ],
                ResultPath: '$.items'
              },
              'Batching email list': {
                Type: 'Pass',
                Next: 'Map',
                Parameters: {
                  batchNumber: 0,
                  'toAddresses.$': 'States.ArrayPartition($.items[1], 3)',
                  'toAddressLength.$': 'States.ArrayLength(States.ArrayGetItem(States.ArrayPartition($.items[1], 3), 0))',
                  'emailBody.$': '$.items[0]'
                }
              },
              Map: {
                Type: 'Map',
                ItemProcessor: {
                  ProcessorConfig: {
                    Mode: 'INLINE'
                  },
                  StartAt: 'SendEmail',
                  States: {
                    SendEmail: {
                      Type: 'Task',
                      Parameters: {
                        Destination: {
                          'ToAddresses.$': '$.ContextValue'
                        },
                        FromEmailAddress: process.env.SOURCE_EMAIL_ADDRESS,
                        FromEmailAddressIdentityArn: `${identityName}`,
                        ReplyToAddresses: [
                          process.env.REPLY_TO_ADDRESS
                        ],
                        Content: {
                          Simple: {
                            Body: {
                              Html: {
                                Charset: 'utf-8',
                                'Data.$': '$.emailBody.content.S'
                              }
                            },
                            Subject: {
                              Charset: 'utf-8',
                              'Data.$': '$.emailBody.title.S'
                            }
                          }
                        }
                      },
                      Resource: 'arn:aws:states:::aws-sdk:sesv2:sendEmail',
                      End: true
                    }
                  }
                },
                ItemsPath: '$.toAddresses',
                ItemSelector: {
                  'ContextIndex.$': '$$.Map.Item.Index',
                  'ContextValue.$': '$$.Map.Item.Value',
                  'toAddresses.$': '$.toAddresses',
                  'emailBody.$': '$.emailBody'
                },
                End: true
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
      `${sendEmailFunction.functionArn}:*`,
      '*' // TODO
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
    newsletterSubscribersTableAccess,
    publishToTopicPolicy,
    invokeFunctionPolicy,
    getItemPolicy,
    updateItemPolicy,
    logGroupPolicy,
    sendEmamilPolicy
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
