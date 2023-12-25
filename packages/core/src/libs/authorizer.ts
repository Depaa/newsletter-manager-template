import { type APIGatewayEventRequestContext } from 'aws-lambda'

export const isAdmin = (
  requestContext: APIGatewayEventRequestContext
): boolean => {
  return requestContext.authorizer?.claims?.['cognito:groups']?.includes('admin') ?? false
}
