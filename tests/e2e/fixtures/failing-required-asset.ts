import type { FleetSkinAssetLoader } from "../../../src/components/FleetSkinProvider.tsx"

export const FAILING_REQUIRED_ASSET_ID = "ink-sail.scene.backdrop" as const

interface FleetE2EAssetBridge {
  failRequiredAsset: boolean
  failureHits: string[]
}

function loadImage(url: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve()
    image.onerror = () => reject(new Error("Fleet E2E image could not be decoded"))
    image.src = url
  })
}

export function createAcceptanceAssetLoader(
  bridge: () => FleetE2EAssetBridge | null,
  failingUrl: string,
): FleetSkinAssetLoader {
  return async (url) => {
    const state = bridge()
    if (state?.failRequiredAsset === true && url === failingUrl) {
      state.failureHits.push(FAILING_REQUIRED_ASSET_ID)
      throw new Error("Injected required fleet asset failure")
    }
    await loadImage(url)
  }
}
