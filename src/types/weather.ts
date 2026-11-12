export interface WeatherResponse {
  weather: Array<{
    id: number;
    main: string;
    description: string;
    icon: string;
  }>;
  main: {
    temp: number;
    feels_like: number;
    humidity: number;
    temp_min: number;
    temp_max: number;
  };
  clouds?: {
    all: number;
  };
  wind?: {
    speed: number;
    deg: number;
  };
  name: string;
}
