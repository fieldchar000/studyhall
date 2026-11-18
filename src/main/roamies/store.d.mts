// Types for Roamies' store.mjs (plain JavaScript, copied unchanged).
/* eslint-disable @typescript-eslint/no-explicit-any */
export function listItems(now?: number): { today: any[]; later: any[] }
export function openCommitments(): any[]
export function getCommitment(id: string): any
export function updateCommitment(id: string, o: any): Promise<any>
export function addCommitment(text: string, dueMs: number | null, kind?: string, repeat?: string | null): Promise<any>
export function takeDueReminders(now?: number): Promise<any[]>
export function repeatLabel(spec: any): string
export function listFacts(): any[]
export function addFact(text: string): Promise<any>
export function pickFacts(context?: string, limit?: number): any[]
export function forgetFact(id: string): Promise<any>
export function flushWrites(): Promise<unknown>
