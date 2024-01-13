import { ApiGatewayV1Api, Cognito, use, type StackContext } from 'sst/constructs'
import { ApiPermissionStack } from './ApiPermissionStack'
import { DatabaseStack } from './DatabaseStack'
import { SchedulerStack } from './SchedulerStack'
import { EmailStack } from './EmailStack'

export const ApiStack = ({ stack, app }: StackContext): void => {
  const { apiRole } = use(ApiPermissionStack)
  const {
    newslettersTable,
    newsletterSubscribersTable
  } = use(DatabaseStack)
  const { emailStateMachine } = use(SchedulerStack)
  const { configurationSetName, identityName } = use(EmailStack)

  // https://docs.sst.dev/constructs/Cognito
  const auth = new Cognito(stack, 'Auth', {
    login: ['email'],
    cdk: {
      userPool: {
        standardAttributes: {
          email: { required: true, mutable: true }
        }
      },
      userPoolClient: {
        authFlows: {
          // for testing purposes only
          userPassword: app.stage !== 'prod'
        }
      }
    }
  })

  const api = new ApiGatewayV1Api(stack, 'api', {
    authorizers: {
      jwt: {
        type: 'user_pools',
        userPoolIds: [auth.userPoolId]
      }
    },
    defaults: {
      authorizer: 'jwt',
      function: {
        role: apiRole,
        environment: {
          NEWSLETTERS_TABLE_NAME: newslettersTable.tableName,
          NEWSLETTER_SUBSCRIBERS_TABLE_NAME: newsletterSubscribersTable.tableName,
          EMAIL_SCHEDULER_SFN_SM_ARN: `arn:aws:states:${stack.region}:${stack.account}:execution:${emailStateMachine.stateMachineName}`,
          EMAIL_SCHEDULER_SF_ARN: emailStateMachine.stateMachineArn
        },
        timeout: 29,
        architecture: 'arm_64'
      }
    },
    accessLog: {
      retention: 'two_weeks'
    },
    routes: {
      /**
       * Newsletter Subscribers
       */
      'POST /subscriptions/unsubscribe': {
        authorizer: 'none',
        function: {
          handler: 'packages/functions/src/subscriptions/unsubscribe/index.handler',
          functionName: `${stack.stackName}-post-unsubscribe`
        }
      },
      'POST /subscriptions/subscribe': {
        authorizer: 'none',
        function: {
          handler: 'packages/functions/src/subscriptions/subscribe/index.handler',
          functionName: `${stack.stackName}-post-subscribe`,
          environment: {
            DOMAIN_NAME: process.env.DOMAIN_NAME ?? '',
            SOURCE_EMAIL_ADDRESS: process.env.SOURCE_EMAIL_ADDRESS ?? '',
            REPLY_TO_ADDRESS: process.env.REPLY_TO_ADDRESS ?? '',
            CONFIGURATION_SET_NAME: configurationSetName,
            IDENTITY_ARN: `arn:aws:ses:${stack.region}:${stack.account}:identity/${identityName}`
          }
        }
      },
      /**
       * Newsletters
       */
      'POST /newsletters': {
        authorizer: 'jwt',
        function: {
          handler: 'packages/functions/src/newsletters/create/index.handler',
          functionName: `${stack.stackName}-post-newsletters`
        }
      },
      'PUT /newsletters/{id}': {
        authorizer: 'jwt',
        function: {
          handler: 'packages/functions/src/newsletters/update/index.handler',
          functionName: `${stack.stackName}-put-newsletters`
        }
      },
      'DELETE /newsletters/{id}': {
        authorizer: 'jwt',
        function: {
          handler: 'packages/functions/src/newsletters/delete/index.handler',
          functionName: `${stack.stackName}-delete-newsletters`
        }
      },
      'GET /newsletters': {
        authorizer: 'none',
        function: {
          handler: 'packages/functions/src/newsletters/list/index.handler',
          functionName: `${stack.stackName}-list-newsletters`
        }
      },
      'GET /newsletters/{id}': {
        authorizer: 'none',
        function: {
          handler: 'packages/functions/src/newsletters/get/index.handler',
          functionName: `${stack.stackName}-get-newsletters`
        }
      },
      'POST /newsletters/{id}/schedule/publish': {
        authorizer: 'jwt',
        function: {
          handler: 'packages/functions/src/newsletters/publish/index.handler',
          functionName: `${stack.stackName}-post-schedule-publish`
        }
      },
      'POST /newsletters/{id}/schedule/unpublish': {
        authorizer: 'jwt',
        function: {
          handler: 'packages/functions/src/newsletters/unpublish/index.handler',
          functionName: `${stack.stackName}-post-schedule-unpublish`
        }
      },
      /**
       * Documentation
       */
      'GET /postman': {
        authorizer: 'jwt',
        function: {
          handler: 'packages/functions/src/postman/index.handler',
          functionName: `${stack.stackName}-get-postman`
        }
      }
    }
  })

  // show the api endpoint in the output
  stack.addOutputs({
    apiendpoint: api.url
  })
  stack.addOutputs({
    cognitoClientId: auth.userPoolClientId
  })
}
