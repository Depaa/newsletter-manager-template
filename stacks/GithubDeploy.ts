import { Duration } from 'aws-cdk-lib'
import { Effect, OpenIdConnectPrincipal, OpenIdConnectProvider, PolicyDocument, PolicyStatement, Role } from 'aws-cdk-lib/aws-iam'
import { type StackContext } from 'sst/constructs'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const GithubDeploy = ({ app, stack }: StackContext) => {
  if (app.stage === 'dev' || app.stage === 'prod') {
    const provider = new OpenIdConnectProvider(stack, 'GitHub', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com']
    })

    const organization = 'Depaa' // Use your GitHub organization
    const repository = 'clip-contact-center-backend' // Use your GitHub repository

    return new Role(stack, 'GitHubActionsRole', {
      assumedBy: new OpenIdConnectPrincipal(provider).withConditions({
        StringLike: {
          'token.actions.githubusercontent.com:sub': `repo:${organization}/${repository}:*`
        }
      }),
      description: 'Role assumed for deploying from GitHub CI using AWS CDK',
      roleName: `${app.stage}-${app.name}-github`, // Change this to match the role name in the GitHub workflow file
      maxSessionDuration: Duration.hours(1),
      inlinePolicies: {
        SSTDeploymentPolicy: new PolicyDocument({
          assignSids: true,
          statements: [
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: [
                'cloudformation:DeleteStack',
                'cloudformation:DescribeStackEvents',
                'cloudformation:DescribeStackResources',
                'cloudformation:DescribeStacks',
                'cloudformation:GetTemplate',
                'cloudformation:ListImports',
                'ecr:CreateRepository',
                'iam:PassRole',
                'iot:Connect',
                'iot:DescribeEndpoint',
                'iot:Publish',
                'iot:Receive',
                'iot:Subscribe',
                'lambda:GetFunction',
                'lambda:GetFunctionConfiguration',
                'lambda:UpdateFunctionConfiguration',
                's3:ListBucket',
                's3:PutObjectAcl',
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:ListObjectsV2',
                's3:CreateBucket',
                's3:PutBucketPolicy',
                'ssm:DeleteParameter',
                'ssm:GetParameter',
                'ssm:GetParameters',
                'ssm:GetParametersByPath',
                'ssm:PutParameter',
                'sts:AssumeRole'
              ],
              resources: [
                '*'
              ]
            })
          ]
        })
      }
    })
  }
}
