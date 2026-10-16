import raw from '../../../config/indicators.json';
import type { Series } from './types';
import { AppError } from './errors';
export const catalog:Series[]=raw;
export function seriesById(id:string):Series {const s=catalog.find(s=>s.id===id);if(!s) throw new AppError('INVALID_SERIES','未知指标',404);return s;}
