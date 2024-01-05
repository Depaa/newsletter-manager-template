export interface NewsletterSeo {
  subject: string
  description: string
  tags?: string[]
}

export interface Newsletter {
  id: string
  subject: string
  content: string
  status: NewsletterStatus
  publishAt?: number
  publishedAt?: number
  sfExecutionArn?: string

  // Audit and metadata information
  createdAt: number
  createdBy: string
  updatedAt?: number
  updatedBy?: string
  deletedAt?: number
  deletedBy?: string
}

export enum NewsletterStatus {
  PRIVATE = 'PRIVATE',
  PUBLIC = 'PUBLIC',
}

export default Newsletter
