// The Android side of "Hey Bauer" (android/app/src/main/java/com/studyhall/app/BauerPlugin.java).

import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export interface PhoneVoiceStatus {
  modelReady: boolean
  downloading: boolean
  progress: number
  running: boolean
  state: string
  mic: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'
  recognizer: boolean // Android has a speech recogniser (Google / the maker's)
  xiaomi: boolean
}

interface BauerPlugin {
  status(): Promise<PhoneVoiceStatus>
  downloadModel(): Promise<void>
  start(opts: { sensitivity: number }): Promise<void>
  stop(): Promise<void>
  resume(): Promise<void>
  listen(): Promise<{ text: string }>
  stopListening(): Promise<void>
  cancelListening(): Promise<void>
  pending(): Promise<{ items: { text: string; at: number }[] }>
  openBatterySettings(): Promise<void>
  addListener(event: 'wake' | 'pending', cb: () => void): Promise<PluginListenerHandle>
  addListener(event: 'download', cb: (e: { progress: number }) => void): Promise<PluginListenerHandle>
  addListener(event: 'partial', cb: (e: { text: string }) => void): Promise<PluginListenerHandle>
  addListener(event: 'level', cb: (e: { level: number }) => void): Promise<PluginListenerHandle>
  addListener(event: 'state', cb: (e: { state: 'listening' | 'heard' | 'thinking' }) => void): Promise<PluginListenerHandle>
}

export const Bauer = registerPlugin<BauerPlugin>('Bauer')
