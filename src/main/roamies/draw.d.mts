// Types for Roamies' draw.mjs (plain JavaScript, copied unchanged).
/* eslint-disable @typescript-eslint/no-explicit-any */
export const CARDS: string[]
export const LIMITS: Record<string, number>
export const DrawArgs: { parse(v: unknown): any }
export function checkDraw(args: any): string[]
export function createParts(): any
export function createPhotos(o?: any): any
export function describeParts(entries: any[]): string
export function faviconFor(url: string, o?: any): Promise<string | null>
export function resolveTargets(beats: any[], look: any): Promise<any[]>
export const DrawShape: Record<string, any>

export const photoCredits: Map<string, string>
