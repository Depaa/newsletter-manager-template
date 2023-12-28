export interface NewsletterSeo {
  title: string
  description: string
  tags?: string[]
}

export interface Newsletter {
  id: string
  slug: string
  title: string
  description: string
  image?: string
  content: string
  contentMd: string
  seo?: NewsletterSeo
  status: NewsletterStatus
  authors?: string[]
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
