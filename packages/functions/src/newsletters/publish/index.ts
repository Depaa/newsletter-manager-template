import { SFNClient, StartExecutionCommand, type StartExecutionCommandInput } from '@aws-sdk/client-sfn'
import { middyfy, type Handler } from '@core/libs/middyWrapper'
import { randomUUID } from 'crypto'
import type { FromSchema } from 'json-schema-to-ts'
import { NewslettersTableDefinition } from '../dynamodb'
import { schema, type bodySchema, type pathParametersSchema } from './schema'

const stepfunctionsClient = new SFNClient()

const main: Handler<FromSchema<typeof bodySchema>, FromSchema<typeof pathParametersSchema>, void> = async (event) => {
  const id = event.pathParameters.id
  const uuid = randomUUID()

  const updateParams = {
    ...event.body,
    id,
    sfExecutionArn: `${process.env.EMAIL_SCHEDULER_SFN_SM_ARN}:${uuid}`,
    updatedAt: Date.now(),
    updatedBy: event.requestContext?.authorizer?.claims.sub
  }

  await NewslettersTableDefinition.update(updateParams, {
    returnValues: 'ALL_NEW'
  })

  const startExecutionParams: StartExecutionCommandInput = {
    stateMachineArn: process.env.EMAIL_SCHEDULER_SF_ARN,
    name: uuid,
    input: JSON.stringify({
      id,
      waitTimestamp: (event.body.publishAt != null) ? new Date(event.body.publishAt).toISOString() : new Date().toISOString()
    })
  }
  const startExecutionCommand = new StartExecutionCommand(startExecutionParams)
  await stepfunctionsClient.send(startExecutionCommand)

  return {
    statusCode: 204,
    body: {}
  }
}

export const handler = middyfy(main, schema)
