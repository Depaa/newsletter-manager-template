import { SFNClient, StopExecutionCommand, type StopExecutionCommandInput } from '@aws-sdk/client-sfn'
import ValidationError from '@core/libs/errors/ValidationError'
import { middyfy, type Handler } from '@core/libs/middyWrapper'
import type { FromSchema } from 'json-schema-to-ts'
import { NewslettersTableDefinition } from '../dynamodb'
import type Newsletter from '../interface'
import { schema, type pathParametersSchema } from './schema'

const stepfunctionsClient = new SFNClient()

const main: Handler<void, FromSchema<typeof pathParametersSchema>, void> = async (event) => {
  const id = event.pathParameters.id

  const resultById = await NewslettersTableDefinition.get({
    id: event.pathParameters.id
  })
  const newsletter = resultById.Item as Newsletter
  console.info('Successfully get newsletters')
  console.debug(newsletter)

  if (newsletter.sfExecutionArn === undefined) {
    throw new ValidationError('Newsletter has not been published yet')
  }

  const updateParams = {
    id,
    updatedAt: Date.now(),
    updatedBy: event.requestContext?.authorizer?.claims.sub
  }
  console.debug(updateParams)

  await NewslettersTableDefinition.update(updateParams, {
    returnValues: 'ALL_NEW'
  }, {
    REMOVE: ['publishAt', 'sfExecutionArn']
  })
  console.info('Successfully unpublished newsletter')

  const stopExecutionParams: StopExecutionCommandInput = {
    executionArn: newsletter.sfExecutionArn,
    cause: 'Stopped by user'
  }
  const startExecutionCommand = new StopExecutionCommand(stopExecutionParams)
  await stepfunctionsClient.send(startExecutionCommand)
  console.info('Successfully stopped step function execultion')

  return {
    statusCode: 204,
    body: {}
  }
}

export const handler = middyfy(main, schema)
