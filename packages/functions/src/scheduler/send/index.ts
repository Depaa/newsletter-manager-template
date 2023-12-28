import { type Handler, middyfy } from '@core/libs/middyWrapper'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
// let myItem = unmarshall(getFromSf())
const main: Handler<void, void, void> = async (event) => {
  console.debug(event)

  return {
    statusCode: 200,
    body: {}
  }
}

export const handler = middyfy(main)
