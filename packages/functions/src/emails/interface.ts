interface BounceEvent {
  feedbackId: string
  bounceType: string
  bounceSubType: string
  bouncedRecipients: BouncedRecipient[]
  timestamp: string
  reportingMTA: string
}

interface DeliveryDelayEvent {
  timestamp: string
  delayType: string
  expirationTime: string
  delayedRecipients: DelayedRecipient[]
}

interface BouncedRecipient {
  emailAddress: string
  action: string
  status: string
  diagnosticCode: string
}

interface DelayedRecipient {
  emailAddress: string
  status: string
  diagnosticCode: string
}

interface MailEvent {
  timestamp: string
  source: string
  sourceArn: string
  sendingAccountId: string
  messageId: string
  destination: string[]
  headersTruncated: boolean
  headers: Header[]
  commonHeaders: CommonHeaders
  tags: Record<string, string[]>
}

interface ClickEvent {
  ipAddress: string
  link: string
  timestamp: string
  userAgent: string
}

interface Header {
  name: string
  value: string
}

interface CommonHeaders {
  from: string[]
  to: string[]
  messageId: string
  subject: string
}

export interface SNSMessage {
  eventType: 'Bounce' | 'DeliveryDelay' | 'Click'
  bounce?: BounceEvent
  mail?: MailEvent
  deliveryDelay?: DeliveryDelayEvent
  click?: ClickEvent
}
