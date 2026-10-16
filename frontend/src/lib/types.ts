export type Goal = 'Regular Income' | 'Growth' | 'Preserve Capital' | 'Combination'
export type Horizon = '< 1 Year' | '1–3 Years' | '3–5 Years' | '5+ Years'
export type RiskAppetite = 'Conservative' | 'Moderate' | 'Aggressive'
export type Level = 'Low' | 'Medium' | 'High'
export type Experience = 'None' | 'Some' | 'Experienced'

export interface ExtractedFact {
  field: string
  label: string
  value: string | number
  displayValue?: string
  confidence?: 'high' | 'medium' | 'low'
  confirmed: boolean
  sourceText?: string
}

export interface MissingFieldInfo {
  field: string
  label: string
  reason: string
}

export interface ExtractionResult {
  facts: ExtractedFact[]
  missingFields: MissingFieldInfo[]
  summary: string
  source: 'grok' | 'demo'
}

export interface ClientProfile {
  goal: Goal
  investmentAmount: number
  horizon: Horizon
  riskAppetite: RiskAppetite
  maxLossPct: number
  liquidityNeed: Level
  experience: Experience
  preferredUnderlying: string // ticker
  sectorExposurePct: number // existing exposure to the preferred underlying's sector
  notes?: string
  extractedFacts?: ExtractedFact[]
}

export interface RM {
  id: string
  name: string
  email: string
  phone: string
  employee_id: string
  designation: string
  branch: string
  region: 'North' | 'South' | 'East' | 'West'
  joined_on: string
  status: 'Active' | 'Inactive' | 'On Leave'
  aum_cr: number
  certifications: string[]
  notes: string
  clientCount?: number
  analysisCount?: number
}

export type ReviewStatus = 'Pending' | 'Approved' | 'Flagged'

export interface Client {
  id: string
  rmId?: string
  name: string
  profile: ClientProfile
  notes?: string
  extractedFacts?: ExtractedFact[]
  interpretation: string
  createdAt: string
}

export interface ProductTerms {
  underlying: string // ticker
  productType: string
  notional: number
  tenorMonths: number
  couponPct: number // annualised
  barrierPct: number // % of initial level
  strikePct: number // % of initial level
}

export interface Analysis {
  id: string
  clientId: string
  rmId?: string
  product: ProductTerms
  createdAt: string
  reviewStatus?: ReviewStatus
  reviewNote?: string | null
  reviewedAt?: string | null
  concerns?: number
  suitability?: SuitabilityResult[]
}

export interface EngineResult {
  scenarios: ScenarioResult[]
  curve: { level: number; value: number }[]
  suitability: SuitabilityResult[]
  concerns: number
  engine: 'python' | 'browser'
}

export interface MarketData {
  ticker: string
  symbol: string
  name: string
  sector: string
  kind: 'Stock' | 'Index'
  currency: string
  lastPrice: number
  asOf: string
  periodChangePct: number
  periodHigh: number
  periodLow: number
  annualVolatilityPct: number | null
  period: string
  history: { date: string; close: number }[]
  source: string
  fetchedAt: string
}

export type SuitStatus = 'MATCH' | 'WARNING' | 'MISMATCH'

export interface SuitabilityResult {
  dimension: string
  status: SuitStatus
  reason: string
  action?: string
  source_rule?: string
}

export interface ScenarioResult {
  name: string
  movePct: number
  finalValue: number
  pnl: number
  returnPct: number
  barrierBreached: boolean
}

export interface Insight {
  title: string
  text: string
  why?: string
}
