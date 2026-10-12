// Supported underlyings. No live prices: everything is expressed as % of initial level.
export interface Underlying {
  ticker: string
  name: string
  sector: string
  kind: 'Stock' | 'Index'
}

export const UNDERLYINGS: Underlying[] = [
  { ticker: 'NVDA', name: 'NVIDIA', sector: 'Technology', kind: 'Stock' },
  { ticker: 'AAPL', name: 'Apple', sector: 'Technology', kind: 'Stock' },
  { ticker: 'MSFT', name: 'Microsoft', sector: 'Technology', kind: 'Stock' },
  { ticker: 'TSLA', name: 'Tesla', sector: 'Automobiles', kind: 'Stock' },
  { ticker: 'RELIANCE', name: 'Reliance Industries', sector: 'Energy', kind: 'Stock' },
  { ticker: 'HDFCBANK', name: 'HDFC Bank', sector: 'Financials', kind: 'Stock' },
  { ticker: 'NIFTY50', name: 'NIFTY 50', sector: 'Diversified Index', kind: 'Index' },
  { ticker: 'SPX', name: 'S&P 500', sector: 'Diversified Index', kind: 'Index' },
]

export const PRODUCT_TYPES = [
  { id: 'Barrier Reverse Convertible', enabled: true },
  { id: 'Autocallable (coming soon)', enabled: false },
  { id: 'Capital Protected Note (coming soon)', enabled: false },
]

export const TENORS = [6, 12, 18, 24, 36]

export function getUnderlying(ticker: string): Underlying {
  return UNDERLYINGS.find((u) => u.ticker === ticker) ?? UNDERLYINGS[0]
}
