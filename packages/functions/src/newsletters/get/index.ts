import { type Handler, middyfy } from '@core/libs/middyWrapper'
import NotFoundError from '@core/libs/errors/NotFoundError'
import { schema, type pathParametersSchema } from './schema'
import type { FromSchema } from 'json-schema-to-ts'
import { NewslettersTableDefinition } from '../dynamodb'
import type Newsletter from '../interface'
import { isAdmin } from '@core/libs/authorizer'

const main: Handler<void, FromSchema<typeof pathParametersSchema>, void> = async (event) => {
  let newsletter: Newsletter | Record<string, unknown> = {}
  try {
    const result = await NewslettersTableDefinition.get({
      id: event.pathParameters.id
    })
    newsletter = result.Item as Newsletter
    console.info('Successfully get newsletters')
    console.info(newsletter)
  } catch (error) {
    console.error(error)
    const result = await NewslettersTableDefinition.query(event.pathParameters.id, {
      limit: 1,
      index: 'slug-index',
      attributes: ['status', 'title', 'image', 'publishedAt', 'slug', 'description', 'content', 'seo', 'authors']
    })
    console.info('Successfully get newsletters with query')
    console.info(result)
    newsletter = (result.Items != null) && result.Items.length > 0 ? result.Items[0] as Newsletter : {}
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
