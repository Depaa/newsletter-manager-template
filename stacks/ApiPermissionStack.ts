import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
import { attachPermissionsToRole, use, type StackContext } from 'sst/constructs'
import { DatabaseStack } from './DatabaseStack'
import { SchedulerStack } from './SchedulerStack'
import { EmailStack } from './EmailStack'

export const ApiPermissionStack = ({ stack }: StackContext): Record<string, Role> => {
  const {
    newslettersTable,
    newsletterSubscribersTable
  } = use(DatabaseStack)

  const { emailStateMachine } = use(SchedulerStack)
  const { identityName, configurationSetName } = use(EmailStack)

  // Create an IAM role
  const apiRole = new Role(stack, 'ApiRole', {
    assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    managedPolicies: [
      {
        managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
      }
    ]
  })
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
  const newsletterSendWelcomeEmail = new PolicyStatement({
    actions: [
      'ses:SendEmail'
    ],
    resources: [
      `arn:aws:ses:${stack.region}:${stack.account}:identity/${identityName}`,
      `arn:aws:ses:${stack.region}:${stack.account}:configuration-set/${configurationSetName}`
    ]
  })

  attachPermissionsToRole(apiRole, [
    newslettersTableAccess,
    newsletterSubscribersTableAccess,
    emailStateMachineAccess,
    newsletterSendWelcomeEmail
  ])

  return {
    apiRole
  }
}
