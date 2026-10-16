export type DataStatus = 'fresh'|'delayed'|'stale'|'unavailable'|'not_configured'|'demo';
export interface Series { id:string;nameZh:string;providerId:string;providerSymbol:string;kind:string;frequency:string;unit:string;currency:string;market:string;priceDefinition:string;timezone:string;staleSeconds:number;sourceUrl:string;description:string;category:string;enabled:boolean }
export interface Point {time:string;value:string|null;open?:string;high?:string;low?:string;close?:string;volume?:string|null}
export interface Source {id:string;label:string;url:string}
export interface Quote {seriesId:string;value:string|null;previousValue:string|null;unit:string;currency:string;source:Source;asOf:string|null;fetchedAt:string|null;status:DataStatus;isDemo:boolean;message?:string;qualityFlags?:string[];sourceChanged?:boolean}
export interface SeriesData {series:Series;points:Point[];source:Source;asOf:string|null;fetchedAt:string|null;status:DataStatus;isDemo:boolean;unit:string;message?:string;sourceChanged?:boolean}
export interface Widget {id:string;type:string;title?:string;config:Record<string,unknown>;layout:{x:number;y:number;w:number;h:number}}
export interface Dashboard {id:string;name:string;layoutVersion:number;widgets:Widget[]}
export interface Watchlist {id:string;name:string;items:string[]}
export interface Alert {id:string;seriesId:string;conditionType:string;params:{threshold?:number;window?:number};enabled:boolean;cooldownSeconds:number;state:Record<string,unknown>;lastFiredAt?:string|null;lastEvaluatedAt?:string|null}
export interface AlertEvent {id:string;alertId:string;triggeredAt:string;observedValue:string|null;threshold:string|null;seriesAsOf:string|null;dedupKey:string;status:string}
export interface Note {id:string;title:string;markdown:string;tags:string[];seriesIds:string[];eventDate?:string|null;updatedAt:string}
export interface Workspace {dashboards:Dashboard[];watchlists:Watchlist[];alerts:Alert[];events:AlertEvent[];notes:Note[]}
export interface Route {providerId:string;providerSymbol:string;operation:string;interval:string;priority:number;enabled:boolean;constraints:{unit:string;currency:string;market:string;priceDefinition:string;frequency:string};mode:string}
export interface Health {providerId:string;status:'available'|'unauthorized'|'rate_limited'|'unavailable'|'not_configured';checkedAt:string;sampleDataAsOf?:string;message:string}
export interface Budget {ttlSeconds:number;perMinute:number;perHour:number;perDay:number}
export interface ProviderDefinition {id:string;displayName:string;category:string;capabilities:{assetClasses:string[];operations:string[];intervals:string[];authMode:string;latency:string;supportsBatch:boolean;termsUrl:string};configurationSchema:unknown;docsUrl:string;termsUrl:string;licenseNote:string;envVar?:string;enabled:boolean;config:Budget}
