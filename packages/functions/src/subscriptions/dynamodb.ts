import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, type TranslateConfig } from '@aws-sdk/lib-dynamodb'
import { Entity, Table } from 'dynamodb-toolbox'
import { SubscriptionStatus } from './interface'

const marshallOptions = {
  convertEmptyValues: false
}
const translateConfig: TranslateConfig = { marshallOptions }

export const DocumentClient = DynamoDBDocumentClient.from(new DynamoDBClient(), translateConfig)

const SubscriptionsTable = new Table({
  name: process.env.NEWSLETTER_SUBSCRIBERS_TABLE_NAME ?? '',
  partitionKey: 'email',
  indexes: {
    'status-index': {
      partitionKey: 'pk',
      sortKey: 'status'
    }
  },
  DocumentClient
})

export const SubscriptionsTableDefinition = new Entity({
  name: 'Subscriptions',
  attributes: {
    email: { partitionKey: true },
    pk: { type: 'string', required: true, default: '1' },
    status: { type: 'string', required: true, default: SubscriptionStatus.ENABLED },
    id: { type: 'string', required: true },
    createdAt: { type: 'number', required: true },
    updatedAt: { type: 'number' },
    deletedAt: { type: 'number' }
  },
  table: SubscriptionsTable
} as const)
