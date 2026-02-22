/**
 * ID generation utilities
 */

import { createHash } from 'crypto';

export function generateId(type: string, label: string): string {
  const normalized = label.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const hash = createHash('md5')
    .update(`${type}:${normalized}`)
    .digest('hex')
    .substring(0, 8);
  return `${type}_${hash}`;
}

export function generateEdgeId(sourceId: string, type: string, targetId: string): string {
  const hash = createHash('md5')
    .update(`${sourceId}:${type}:${targetId}`)
    .digest('hex')
    .substring(0, 8);
  return `edge_${hash}`;
}
