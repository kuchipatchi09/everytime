export interface MarketRow {
  datetime: string;
  value: number;
}

export interface MarketResponse {
  rows?: MarketRow[];
  prevClose?: number;
  error?: string;
}

export interface TickerConfigItem {
  name: string;
  code: string;
  unit: string;
  symbol: string;
}
