import { isAdmin } from '@core/libs/authorizer'
import NotFoundError from '@core/libs/errors/NotFoundError'
import { middyfy, type Handler } from '@core/libs/middyWrapper'
import type { FromSchema } from 'json-schema-to-ts'
import { NewslettersTableDefinition } from '../dynamodb'
import type Newsletter from '../interface'
import { schema, type pathParametersSchema } from './schema'

const main: Handler<void, FromSchema<typeof pathParametersSchema>, void> = async (event) => {
  let newsletter: Newsletter | Record<string, unknown> = {}

  const resultById = await NewslettersTableDefinition.get({
    id: event.pathParameters.id
  })
  newsletter = resultById.Item as Newsletter
  console.info('Successfully get newsletters')
  console.debug(newsletter)

  if (resultById.Item === undefined) {
    const resultBySlug = await NewslettersTableDefinition.query(event.pathParameters.id, {
      limit: 1,
      index: 'slug-index',
      attributes: ['status', 'subject', 'publishedAt', 'content']
    })
    console.info('Successfully get newsletters with query')
    console.debug(resultBySlug)
    newsletter = (resultBySlug.Items != null) && resultBySlug.Items.length > 0 ? resultBySlug.Items[0] as Newsletter : {}
  }

  if (!isAdmin(event.requestContext) && newsletter.status === 'PRIVATE') {
    throw new NotFoundError()
  }

  return {
    statusCode: 200,
    body: { ...newsletter }
  }
}

export const handler = middyfy(main, schema)
