import { Table, Entity } from 'dynamodb-toolbox'
import { DynamoDBDocumentClient, type TranslateConfig } from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'

const marshallOptions = {
  convertEmptyValues: false
}
const translateConfig: TranslateConfig = { marshallOptions }

export const DocumentClient = DynamoDBDocumentClient.from(new DynamoDBClient(), translateConfig)

const NewslettersTable = new Table({
  name: process.env.NEWSLETTERS_TABLE_NAME ?? '',
  partitionKey: 'id',
  indexes: {
    'slug-index': {
      partitionKey: 'slug'
    },
    'status-index': {
      partitionKey: 'status',
      sortKey: 'publishedAt'
    }
  },
  DocumentClient
})

export const NewslettersTableDefinition = new Entity({
  name: 'Newsletter',
  attributes: {
    id: { partitionKey: true },
    slug: { type: 'string', required: true },
    title: { type: 'string', required: true },
    description: { type: 'string', required: true },
    image: { type: 'string' },
    content: { type: 'string', required: true },
    contentMd: { type: 'string', required: true },
    seo: { type: 'map' },
    status: { type: 'string', required: true },
    authors: { type: 'list' },
    publishAt: { type: 'number' },
    publishedAt: { type: 'number' },
    sfExecutionArn: { type: 'string' },
    createdAt: { type: 'number', required: true },
    createdBy: { type: 'string', required: true },
    updatedAt: { type: 'number' },
    updatedBy: { type: 'string' },
    deletedAt: { type: 'number' },
    deletedBy: { type: 'string' }
  },
  table: NewslettersTable
} as const)
