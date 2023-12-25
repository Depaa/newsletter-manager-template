import middy, { type MiddyfiedHandler } from '@middy/core'
import httpContentEncodingMiddleware from '@middy/http-content-encoding'
import httpErrorHandlerMiddleware from '@middy/http-error-handler'
import httpUrlencodePathParametersParserMiddleware from '@middy/http-urlencode-path-parser'
import httpSecurityHeadersMiddleware from '@middy/http-security-headers'
import httpHeaderNormalizerMiddleware from '@middy/http-header-normalizer'
import httpCorsMiddleware from '@middy/http-cors'
import httpEventNormalizerMiddleware from '@middy/http-event-normalizer'
import httpJsonBodyParserMiddleware from '@middy/http-json-body-parser'
import httpResponseSerializerMiddleware from '@middy/http-response-serializer'
import validatorMiddleware from '@middy/validator'
import { transpileSchema } from '@middy/validator/transpile'
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context, Handler as AWSHandler } from 'aws-lambda'
import { type Entity } from 'dynamodb-onetable'
import { type OneField, type Paged } from 'dynamodb-onetable/dist/mjs/Model'
import inputOutputLogger from '@middy/input-output-logger'

// Event is an APIGatewayProxyEvent with a typed body, pathParameters and queryStringParameters which depends on http-json-body-parser & json-schema-to-ts
// queryStringParameters and multiValueQueryStringParameters is non-nullable as we use http-event-normalizer
export interface Event<TBody, TPathParameters, TQueryStringParameters>
  extends Omit<APIGatewayProxyEvent, 'body' | 'pathParameters' | 'queryStringParameters'> {
  body: TBody
  pathParameters: TPathParameters
  queryStringParameters: TQueryStringParameters
  multiValueQueryStringParameters: NonNullable<APIGatewayProxyEvent['multiValueQueryStringParameters']>
}

// We are making use of http-response-serializer, so our body type can either be an Entity, an Array<Entity> or a string
interface Result extends Omit<APIGatewayProxyResult, 'body'> {
  body:
  | Entity<Record<string, OneField>>
  | Paged<Entity<Record<string, OneField>>>
  | string
  | Record<string, unknown>
}

// Handler type which gives us proper types on our event based on TBody and TPathParameters which are JSON schemas
export type Handler<TBody = void, TPathParameters = void, TQueryStringParameters = void> = AWSHandler<
Event<TBody, TPathParameters, TQueryStringParameters>,
Result
>

interface RequestSchema {
  properties?: {
    body?: Record<string, unknown> | null
    pathParameters?: Record<string, unknown> | null
    queryStringParameters?: Record<string, unknown> | null
  }
}

export const middyfy = (
  handler: Handler<never, never, never>,
  requestSchema: RequestSchema | null = null
): MiddyfiedHandler<Event<never, never, never>, Result, Error, Context> => {
  const wrapper = middy(handler)
    .use(inputOutputLogger({
      logger: (request) => {
        console.debug(JSON.stringify(request.event) ?? JSON.stringify(request.response))
      }
    }))

  /**
   * TODO
   * if body then use httpJsonBodyParserMiddleware
   */
  if (requestSchema?.properties?.body != null) {
    wrapper
      .use(httpJsonBodyParserMiddleware())
  }

  wrapper
    .use(httpEventNormalizerMiddleware())

  if (requestSchema != null) {
    wrapper.use(validatorMiddleware({ eventSchema: transpileSchema(requestSchema) }))
      .use({
        onError: (request) => {
          const response = request.response
          const error = request.error as any
          if (response.statusCode === 400) {
            response.headers['Content-Type'] = 'application/json'
            response.body = JSON.stringify({ message: response.body, validationErrors: error.cause })
          } else if (response.statusCode === 401) {
            response.headers['Content-Type'] = 'application/json'
            response.body = JSON.stringify({ message: 'Unauthorized' })
          } else if (response.statusCode === 404) {
            response.headers['Content-Type'] = 'application/json'
            response.body = JSON.stringify({ message: 'Not Found' })
          } else {
            console.error(JSON.stringify(request))
          }
        }
      })
  }

  // httpResponseSerializer should come last, and httpErrorHandler second last
  wrapper
    .use(httpHeaderNormalizerMiddleware())
    .use(httpUrlencodePathParametersParserMiddleware())
    .use(httpSecurityHeadersMiddleware())
    .use(httpCorsMiddleware())
    .use(httpContentEncodingMiddleware())
    .use(httpErrorHandlerMiddleware({}))
    .use(
      httpResponseSerializerMiddleware({
        serializers: [
          {
            regex: /^application\/json$/,
            serializer: ({ body }) => JSON.stringify(body)
          },
          {
            regex: /^text\/(html|plain)$/,
            serializer: ({ body }) => body
          }
        ],
        defaultContentType: 'application/json'
      })
    )

  return wrapper
}
