import { Cognito, type StackContext, use, ApiGatewayV1Api } from 'sst/constructs'
import { PermissionStack } from './PermissionStack'
import { DatabaseStack } from './DatabaseStack'

export function ApiStack ({ stack, app }: StackContext): void {
  const { apiRole } = use(PermissionStack)
  const {
    newslettersTable,
    newsletterSubscribersTable
  } = use(DatabaseStack)

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
          NEWSLETTER_SUBSCRIBERS_TABLE_NAME: newsletterSubscribersTable.tableName
        },
        timeout: 29,
        bind: [newslettersTable, newsletterSubscribersTable],
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
      'POST /subscriptions/{token}/unsubscribe': {
        authorizer: 'none',
        function: 'packages/functions/src/subscriptions/unsubscribe/index.handler'
      },
      'POST /subscriptions/subscribe': {
        authorizer: 'none',
        function: 'packages/functions/src/subscriptions/subscribe/index.handler'
      },
      /**
       * Newsletters
       */
      'POST /newsletters': {
        authorizer: 'jwt',
        function: 'packages/functions/src/newsletters/create/index.handler'
      },
      'PUT /newsletters/{id}': {
        authorizer: 'jwt',
        function: 'packages/functions/src/newsletters/update/index.handler'
      },
      'DELETE /newsletters/{id}': {
        authorizer: 'jwt',
        function: 'packages/functions/src/newsletters/delete/index.handler'
      },
      'GET /newsletters': {
        authorizer: 'none',
        function: 'packages/functions/src/newsletters/list/index.handler'
      },
      'GET /newsletters/{id}': {
        authorizer: 'none',
        function: 'packages/functions/src/newsletters/get/index.handler'
      },
      /**
       * Documentation
       */
      'GET /postman': {
        authorizer: 'jwt',
        function: 'packages/functions/src/postman/index.handler'
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
