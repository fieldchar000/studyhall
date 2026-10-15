// The phone fetches files over Wi-Fi but doesn't share them.

export const applyLanShare = async (): Promise<void> => {}
export const lanShareStatus = (): { sharing: boolean; addresses: string[]; port: number | null } => ({ sharing: false, addresses: [], port: null })
export const stopLanShare = (): void => {}
export const lanAddresses = (): string[] => []
