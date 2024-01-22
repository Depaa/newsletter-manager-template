import { Policy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
import { LogGroup } from 'aws-cdk-lib/aws-logs'
import { DefinitionBody, LogLevel, StateMachine, StateMachineType } from 'aws-cdk-lib/aws-stepfunctions'
import { use, type StackContext } from 'sst/constructs'
import { AlertingStack } from './AlertingStack'
import { DatabaseStack } from './DatabaseStack'
import { EmailStack } from './EmailStack'

export const SchedulerStack = ({ stack }: StackContext): Record<string, StateMachine> => {
  const {
    newslettersTable,
    newsletterSubscribersTable
  } = use(DatabaseStack)
  const { alertingTopic } = use(AlertingStack)
  const { sesTemplateName, identityName, configurationSetName } = use(EmailStack)

  /**
   * Step Function definition
   */
  const sfnDefinition = {
    StartAt: 'Parallel state',
    States: {
      'Parallel state': {
        Type: 'Parallel',
        Next: 'Filter error messages',
        Catch: [
          {
            ErrorEquals: [
              'States.ALL'
            ],
            Next: 'Publish error state'
          }
        ],
        Branches: [
          {
            StartAt: 'Get newsletter content',
            States: {
              'Get newsletter content': {
                Next: 'Compute parameters for test',
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
              'Compute parameters for test': {
                Type: 'Pass',
                Next: 'Send test email',
                Parameters: {
                  'id.$': '$.id',
                  'waitTimestamp.$': '$.waitTimestamp',
                  templateData: {
                    'subject.$': '$.body.Item.subject.S',
                    'body.$': '$.body.Item.content.S'
                  }
                }
              },
              'Send test email': {
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
                      TemplateName: sesTemplateName
                    }
                  },
                  FromEmailAddress: process.env.SOURCE_EMAIL_ADDRESS,
                  FromEmailAddressIdentityArn: `arn:aws:ses:${stack.region}:${stack.account}:identity/${identityName}`,
                  ConfigurationSetName: configurationSetName
                },
                Resource: 'arn:aws:states:::aws-sdk:sesv2:sendBulkEmail',
                Next: 'Filter test error messages'
              },
              'Filter test error messages': {
                Type: 'Pass',
                Next: 'Are there any test errors?',
                Parameters: {
                  'statusesLength.$': 'States.ArrayLength($.BulkEmailEntryResults[*].Error)'
                }
              },
              'Are there any test errors?': {
                Type: 'Choice',
                Choices: [
                  {
                    Variable: '$.statusesLength',
                    NumericLessThanEquals: 0,
                    Next: 'Send test message complete'
                  }
                ],
                Default: 'Send test email failed'
              },
              'Send test message complete': {
                Type: 'Succeed'
              },
              'Send test email failed': {
                Type: 'Fail'
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
                Next: 'Map',
                Branches: [
                  {
                    StartAt: 'Change newsletter status',
                    States: {
                      'Change newsletter status': {
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
                        Next: 'Query subscribers',
                        Result: {
                          LastEvaluatedKey: null,
                          items: null
                        },
                        ResultPath: '$.dynamodbConfig'
                      },
                      'Query subscribers': {
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
                          Limit: 50,
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
                        Next: 'Query subscribers',
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
              Map: {
                Type: 'Map',
                ItemProcessor: {
                  ProcessorConfig: {
                    Mode: 'DISTRIBUTED',
                    ExecutionType: 'STANDARD'
                  },
                  StartAt: 'Compute to bulk destinations',
                  States: {
                    'Compute to bulk destinations': {
                      Type: 'Pass',
                      Parameters: {
                        Destination: {
                          'ToAddresses.$': 'States.Array($.ContextValue)'
                        }
                      },
                      End: true
                    }
                  }
                },
                Next: 'Batching email list',
                ItemsPath: '$.items[1]',
                Label: 'Map',
                MaxConcurrency: 1000,
                ResultPath: '$.toAddressDestinations',
                ItemSelector: {
                  'ContextIndex.$': '$$.Map.Item.Index',
                  'ContextValue.$': '$$.Map.Item.Value'
                }
              },
              'Batching email list': {
                Type: 'Pass',
                Next: 'Send emails map',
                Parameters: {
                  'toAddressDestinations.$': 'States.ArrayPartition($.toAddressDestinations, 50)',
                  templateData: {
                    'subject.$': '$.items[0].subject.S',
                    'body.$': '$.items[0].content.S'
                  }
                }
              },
              'Send emails map': {
                Type: 'Map',
                ItemProcessor: {
                  ProcessorConfig: {
                    Mode: 'INLINE'
                  },
                  StartAt: 'Send emails',
                  States: {
                    'Send emails': {
                      Type: 'Task',
                      Parameters: {
                        'BulkEmailEntries.$': '$.ContextValue',
                        DefaultContent: {
                          Template: {
                            'TemplateData.$': 'States.JsonToString($.templateData)',
                            TemplateName: `${sesTemplateName}`
                          }
                        },
                        FromEmailAddress: process.env.SOURCE_EMAIL_ADDRESS,
                        FromEmailAddressIdentityArn: `arn:aws:ses:${stack.region}:${stack.account}:identity/${identityName}`,
                        ConfigurationSetName: configurationSetName
                      },
                      Resource: 'arn:aws:states:::aws-sdk:sesv2:sendBulkEmail',
                      End: true
                    }
                  }
                },
                ItemsPath: '$.toAddressDestinations',
                ItemSelector: {
                  'ContextIndex.$': '$$.Map.Item.Index',
                  'ContextValue.$': '$$.Map.Item.Value',
                  'toAddressDestinations.$': '$.toAddressDestinations',
                  'templateData.$': '$.templateData'
                },
                End: true
              }
            }
          }
        ]
      },
      'Filter error messages': {
        Type: 'Pass',
        Next: 'Choice',
        Parameters: {
          'statusesLength.$': 'States.ArrayLength($[1][*].BulkEmailEntryResults[*].Error)'
        }
      },
      Choice: {
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.statusesLength',
            NumericLessThanEquals: 0,
            Next: 'SuccessState'
          }
        ],
        Default: 'Publish error state'
      },
      SuccessState: {
        Type: 'Succeed'
      },
      'Publish error state': {
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
   * Step Function proper role
   */
  const sfnRole = new Role(stack, 'SendEmailSfnRole', {
    assumedBy: new ServicePrincipal(`states.${stack.region}.amazonaws.com`)
  })
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

  /**
   * Step Function policies
   */
  const publishToTopicPolicy = new PolicyStatement({
    actions: ['sns:Publish'],
    resources: [alertingTopic.topicArn]
  })
  const getItemPolicy = new PolicyStatement({
    actions: ['dynamodb:GetItem'],
    resources: [
      newslettersTable.tableArn,
      `${newslettersTable.tableArn}/*`
    ]
  })
  const newslettersTableAccess = new PolicyStatement({
    actions: [
      'dynamodb:UpdateItem',
      'dynamodb:GetItem'
    ],
    resources: [
      newslettersTable.tableArn,
      `${newslettersTable.tableArn}/*`
    ]
  })
  const newsletterSubscribersTableAccess = new PolicyStatement({
    actions: [
      'dynamodb:Query'
    ],
    resources: [
      newsletterSubscribersTable.tableArn,
      `${newsletterSubscribersTable.tableArn}/*`
    ]
  })
  const sendEmailPolicy = new PolicyStatement({
    actions: [
      'ses:SendEmail',
      'ses:SendBulkEmail',
      'ses:SendBulkTemplatedEmail'
    ],
    resources: [
      `arn:aws:ses:${stack.region}:${stack.account}:identity/*`,
      `arn:aws:ses:${stack.region}:${stack.account}:template/${sesTemplateName}`,
      `arn:aws:ses:${stack.region}:${stack.account}:configuration-set/${configurationSetName}`
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
  const startSFExecutionPolicy = new PolicyStatement({
    actions: [
      'states:StartExecution'
    ],
    resources: [
      emailStateMachine.stateMachineArn
    ]
  })

  // eslint-disable-next-line no-new
  new Policy(stack, 'SFNPolicy', {
    statements: [
      newslettersTableAccess,
      newsletterSubscribersTableAccess,
      publishToTopicPolicy,
      getItemPolicy,
      logGroupPolicy,
      sendEmailPolicy,
      startSFExecutionPolicy
    ],
    roles: [
      sfnRole
    ]
  })

  stack.addOutputs({
    EmailStateMachine: emailStateMachine.stateMachineName
  })

  return {
    emailStateMachine
  }
}
