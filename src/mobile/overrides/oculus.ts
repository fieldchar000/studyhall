// Oculus Dei needs a local server on a PC, so the phone only reports that.

import type { OculusState } from '@shared/types'

const state: OculusState = { phase: 'error', message: 'Oculus Dei runs on your laptop — open it in Studyhall there.' }
export const initOculus = async (): Promise<void> => {}
export const oculusState = (): OculusState => state
export const installOculus = async (): Promise<OculusState> => state
export const startOculus = async (): Promise<OculusState> => state
export const checkOculusUpdate = async (): Promise<OculusState> => state
export const updateOculus = async (): Promise<OculusState> => state
export const removeOculus = async (): Promise<OculusState> => state
export const stopOculus = (): void => {}
export const showOculus = (): void => {}
export const hideOculus = (): void => {}
export const openOculusInBrowser = (): void => {}
export const isOculusContents = (): boolean => false
