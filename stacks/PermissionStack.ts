import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
import { attachPermissionsToRole, type StackContext, use } from 'sst/constructs'
import { DatabaseStack } from './DatabaseStack'

export function PermissionStack ({ stack }: StackContext): Record<string, Role> {
  // Create an IAM role
  const apiRole = new Role(stack, 'ApiRole', {
    assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    managedPolicies: [
      {
        managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
      }
    ]
  })
  const {
    newslettersTable,
    newsletterSubscribersTable

  } = use(DatabaseStack)

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

  attachPermissionsToRole(apiRole, [
    newslettersTableAccess,
    newsletterSubscribersTableAccess
  ])

  return {
    apiRole
  }
}
