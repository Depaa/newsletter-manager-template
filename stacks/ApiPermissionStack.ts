import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
import { attachPermissionsToRole, use, type StackContext } from 'sst/constructs'
import { DatabaseStack } from './DatabaseStack'
import { SchedulerStack } from './SchedulerStack'

export const ApiPermissionStack = ({ stack }: StackContext): Record<string, Role> => {
  const {
    newslettersTable,
    newsletterSubscribersTable
  } = use(DatabaseStack)

  const { emailStateMachine } = use(SchedulerStack)

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

  attachPermissionsToRole(apiRole, [
    newslettersTableAccess,
    newsletterSubscribersTableAccess,
    emailStateMachineAccess
  ])

  return {
    apiRole
  }
}
