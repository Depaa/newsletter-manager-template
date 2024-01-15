import { Table, Entity } from 'dynamodb-toolbox'
import { DynamoDBDocumentClient, type TranslateConfig } from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'

const marshallOptions = {
  convertEmptyValues: false
}
const translateConfig: TranslateConfig = { marshallOptions }

export const DocumentClient = DynamoDBDocumentClient.from(new DynamoDBClient(), translateConfig)

const ClicksTable = new Table({
  name: process.env.NEWSLETTER_CLICKS_TABLE_NAME ?? '',
  partitionKey: 'link',
  sortKey: 'timestamp',
  DocumentClient
})

export const ClicksTableDefinition = new Entity({
  name: 'Newsletter',
  attributes: {
    link: { partitionKey: true },
    timestamp: { sortKey: true },
    from: { required: true, type: 'string' },
    to: { required: true, type: 'string' },
    subject: { required: true, type: 'string' },
    messageId: { required: true, type: 'string' }
  },
  table: ClicksTable
} as const)
