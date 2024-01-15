import { middyfy, type Handler } from '@core/libs/middyWrapper'
import type { FromSchema } from 'json-schema-to-ts'
import { NewslettersTableDefinition } from '../dynamodb'
import { schema, type pathParametersSchema } from './schema'

const main: Handler<void, FromSchema<typeof pathParametersSchema>, void> = async (event) => {
  await NewslettersTableDefinition.delete({
    id: event.pathParameters.id
  })
  console.info('Successfully deleted newsletter')

  return {
    statusCode: 204,
    body: {}
  }
}

export const handler = middyfy(main, schema)
