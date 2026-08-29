export interface MarketRow {
  datetime: string;
  value: number;
}

export type MarketState = "OPEN" | "CLOSED" | "PRE" | "POST";

export interface MarketResponse {
  rows?: MarketRow[];
  prevClose?: number;
  marketState?: MarketState;
  marketStatusText?: string;
  tradingPeriod?: any;
  error?: string;
}

export interface TickerConfigItem {
  name: string;
  code: string;
  unit: string;
  symbol: string;
}
