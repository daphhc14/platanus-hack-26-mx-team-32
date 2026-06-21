import { apiPost } from '../../lib/http'
import type { CuerpoQuery, PreviewResult } from './types'

export const matchPreview = (q: CuerpoQuery) =>
  apiPost<PreviewResult>('/match/preview', q)
