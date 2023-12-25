export interface Subscription {
  email: string
  status: SubscriptionStatus
  id: string

  // Audit and metadata information
  createdAt: number
  updatedAt?: number
  deletedAt?: number
}

export enum SubscriptionStatus {
  ENABLED = 'Subscribed',
  DISABLED = 'Unsubscribed',
}

export default Subscription
