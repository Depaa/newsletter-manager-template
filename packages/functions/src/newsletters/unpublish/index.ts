import { type Handler, middyfy } from '@core/libs/middyWrapper'
import { schema, type pathParametersSchema } from './schema'
import type { FromSchema } from 'json-schema-to-ts'
import { NewslettersTableDefinition } from '../dynamodb'
import { SFNClient, StopExecutionCommand, type StopExecutionCommandInput } from '@aws-sdk/client-sfn'
import type Newsletter from '../interface'

const stepfunctionsClient = new SFNClient()

const main: Handler<void, FromSchema<typeof pathParametersSchema>, void> = async (event) => {
  const id = event.pathParameters.id

  const resultById = await NewslettersTableDefinition.get({
    id: event.pathParameters.id
  })
  const newsletter = resultById.Item as Newsletter
  console.info('Successfully get newsletters')
  console.debug(newsletter)

  const updateParams = {
    id,
    updatedAt: Date.now(),
    updatedBy: event.requestContext?.authorizer?.claims.sub
  }

  await NewslettersTableDefinition.update(updateParams, {
    returnValues: 'ALL_NEW'
  }, {
    REMOVE: ['publishAt', 'sfExecutionArn']
  })

  const stopExecutionParams: StopExecutionCommandInput = {
    executionArn: newsletter.sfExecutionArn,
    cause: 'Stopped by user'
  }
  const startExecutionCommand = new StopExecutionCommand(stopExecutionParams)
  await stepfunctionsClient.send(startExecutionCommand)

  return {
    statusCode: 204,
    body: {}
  }
}

export const handler = middyfy(main, schema)
