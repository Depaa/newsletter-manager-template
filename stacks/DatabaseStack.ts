import { RemovalPolicy } from 'aws-cdk-lib/core'
import { Table, type StackContext } from 'sst/constructs'

export function DatabaseStack ({ stack, app }: StackContext): Record<string, Table> {
  const newsletterTable = new Table(stack, 'NewslettersTable', {
    fields: {
      id: 'string',
      state: 'string',
      publishedAt: 'string',
      slug: 'string'
    },
    primaryIndex: { partitionKey: 'id' },
    globalIndexes: {
      'status-index': { partitionKey: 'status', sortKey: 'publishedAt' },
      'slug-index': { partitionKey: 'slug' }
    },
    cdk: {
      table: {
        removalPolicy: app.stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY
      }
    }
  })

  const newsletterSubscribersTable = new Table(stack, 'NewsletterSubscribersTable', {
    fields: {
      email: 'string',
      pk: 'string',
      status: 'string'
    },
    primaryIndex: { partitionKey: 'email' },
    globalIndexes: {
      'status-index': { partitionKey: 'pk', sortKey: 'status' }
    },
    cdk: {
      table: {
        removalPolicy: app.stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY
      }
    }
  })

  return {
    newsletterTable,
    newsletterSubscribersTable
  }
}
