import type { BuiltinCrewId } from "../domain/xingchao/types.ts"
import type { FleetSkinAssetId, FleetSkinAssetRole } from "./fleet-skin-schema.ts"

import brocadeHarborCaptainBaseUrl from "../../resources/xingchao/skins/brocade-harbor/captain-base.webp"
import brocadeHarborCaptainStaticUrl from "../../resources/xingchao/skins/brocade-harbor/captain-static.webp"
import brocadeHarborCaptainUniformUrl from "../../resources/xingchao/skins/brocade-harbor/captain-uniform.webp"
import brocadeHarborCrestUrl from "../../resources/xingchao/skins/brocade-harbor/crest.svg?url&no-inline"
import brocadeHarborSceneBackdropUrl from "../../resources/xingchao/skins/brocade-harbor/scene-backdrop.webp"
import brocadeHarborSceneForegroundUrl from "../../resources/xingchao/skins/brocade-harbor/scene-foreground.webp"
import brocadeHarborSceneLightUrl from "../../resources/xingchao/skins/brocade-harbor/scene-light.webp"
import brocadeHarborSceneMidgroundUrl from "../../resources/xingchao/skins/brocade-harbor/scene-midground.webp"
import forgeVesselCaptainBaseUrl from "../../resources/xingchao/skins/forge-vessel/captain-base.webp"
import forgeVesselCaptainStaticUrl from "../../resources/xingchao/skins/forge-vessel/captain-static.webp"
import forgeVesselCaptainUniformUrl from "../../resources/xingchao/skins/forge-vessel/captain-uniform.webp"
import forgeVesselCrestUrl from "../../resources/xingchao/skins/forge-vessel/crest.svg?url&no-inline"
import forgeVesselSceneBackdropUrl from "../../resources/xingchao/skins/forge-vessel/scene-backdrop.webp"
import forgeVesselSceneForegroundUrl from "../../resources/xingchao/skins/forge-vessel/scene-foreground.webp"
import forgeVesselSceneLightUrl from "../../resources/xingchao/skins/forge-vessel/scene-light.webp"
import forgeVesselSceneMidgroundUrl from "../../resources/xingchao/skins/forge-vessel/scene-midground.webp"
import goldenScaleCaptainBaseUrl from "../../resources/xingchao/skins/golden-scale/captain-base.webp"
import goldenScaleCaptainStaticUrl from "../../resources/xingchao/skins/golden-scale/captain-static.webp"
import goldenScaleCaptainUniformUrl from "../../resources/xingchao/skins/golden-scale/captain-uniform.webp"
import goldenScaleCrestUrl from "../../resources/xingchao/skins/golden-scale/crest.svg?url&no-inline"
import goldenScaleSceneBackdropUrl from "../../resources/xingchao/skins/golden-scale/scene-backdrop.webp"
import goldenScaleSceneForegroundUrl from "../../resources/xingchao/skins/golden-scale/scene-foreground.webp"
import goldenScaleSceneLightUrl from "../../resources/xingchao/skins/golden-scale/scene-light.webp"
import goldenScaleSceneMidgroundUrl from "../../resources/xingchao/skins/golden-scale/scene-midground.webp"
import helmOrderCaptainBaseUrl from "../../resources/xingchao/skins/helm-order/captain-base.webp"
import helmOrderCaptainStaticUrl from "../../resources/xingchao/skins/helm-order/captain-static.webp"
import helmOrderCaptainUniformUrl from "../../resources/xingchao/skins/helm-order/captain-uniform.webp"
import helmOrderCrestUrl from "../../resources/xingchao/skins/helm-order/crest.svg?url&no-inline"
import helmOrderSceneBackdropUrl from "../../resources/xingchao/skins/helm-order/scene-backdrop.webp"
import helmOrderSceneForegroundUrl from "../../resources/xingchao/skins/helm-order/scene-foreground.webp"
import helmOrderSceneLightUrl from "../../resources/xingchao/skins/helm-order/scene-light.webp"
import helmOrderSceneMidgroundUrl from "../../resources/xingchao/skins/helm-order/scene-midground.webp"
import inkSailCaptainBaseUrl from "../../resources/xingchao/skins/ink-sail/captain-base.webp"
import inkSailCaptainStaticUrl from "../../resources/xingchao/skins/ink-sail/captain-static.webp"
import inkSailCaptainUniformUrl from "../../resources/xingchao/skins/ink-sail/captain-uniform.webp"
import inkSailCrestUrl from "../../resources/xingchao/skins/ink-sail/crest.svg?url&no-inline"
import inkSailSceneBackdropUrl from "../../resources/xingchao/skins/ink-sail/scene-backdrop.webp"
import inkSailSceneForegroundUrl from "../../resources/xingchao/skins/ink-sail/scene-foreground.webp"
import inkSailSceneLightUrl from "../../resources/xingchao/skins/ink-sail/scene-light.webp"
import inkSailSceneMidgroundUrl from "../../resources/xingchao/skins/ink-sail/scene-midground.webp"
import ironCodeCaptainBaseUrl from "../../resources/xingchao/skins/iron-code/captain-base.webp"
import ironCodeCaptainStaticUrl from "../../resources/xingchao/skins/iron-code/captain-static.webp"
import ironCodeCaptainUniformUrl from "../../resources/xingchao/skins/iron-code/captain-uniform.webp"
import ironCodeCrestUrl from "../../resources/xingchao/skins/iron-code/crest.svg?url&no-inline"
import ironCodeSceneBackdropUrl from "../../resources/xingchao/skins/iron-code/scene-backdrop.webp"
import ironCodeSceneForegroundUrl from "../../resources/xingchao/skins/iron-code/scene-foreground.webp"
import ironCodeSceneLightUrl from "../../resources/xingchao/skins/iron-code/scene-light.webp"
import ironCodeSceneMidgroundUrl from "../../resources/xingchao/skins/iron-code/scene-midground.webp"
import lighthouseCaptainBaseUrl from "../../resources/xingchao/skins/lighthouse/captain-base.webp"
import lighthouseCaptainStaticUrl from "../../resources/xingchao/skins/lighthouse/captain-static.webp"
import lighthouseCaptainUniformUrl from "../../resources/xingchao/skins/lighthouse/captain-uniform.webp"
import lighthouseCrestUrl from "../../resources/xingchao/skins/lighthouse/crest.svg?url&no-inline"
import lighthouseSceneBackdropUrl from "../../resources/xingchao/skins/lighthouse/scene-backdrop.webp"
import lighthouseSceneForegroundUrl from "../../resources/xingchao/skins/lighthouse/scene-foreground.webp"
import lighthouseSceneLightUrl from "../../resources/xingchao/skins/lighthouse/scene-light.webp"
import lighthouseSceneMidgroundUrl from "../../resources/xingchao/skins/lighthouse/scene-midground.webp"
import phantomWaveCaptainBaseUrl from "../../resources/xingchao/skins/phantom-wave/captain-base.webp"
import phantomWaveCaptainStaticUrl from "../../resources/xingchao/skins/phantom-wave/captain-static.webp"
import phantomWaveCaptainUniformUrl from "../../resources/xingchao/skins/phantom-wave/captain-uniform.webp"
import phantomWaveCrestUrl from "../../resources/xingchao/skins/phantom-wave/crest.svg?url&no-inline"
import phantomWaveSceneBackdropUrl from "../../resources/xingchao/skins/phantom-wave/scene-backdrop.webp"
import phantomWaveSceneForegroundUrl from "../../resources/xingchao/skins/phantom-wave/scene-foreground.webp"
import phantomWaveSceneLightUrl from "../../resources/xingchao/skins/phantom-wave/scene-light.webp"
import phantomWaveSceneMidgroundUrl from "../../resources/xingchao/skins/phantom-wave/scene-midground.webp"
import restHarborCaptainBaseUrl from "../../resources/xingchao/skins/rest-harbor/captain-base.webp"
import restHarborCaptainStaticUrl from "../../resources/xingchao/skins/rest-harbor/captain-static.webp"
import restHarborCaptainUniformUrl from "../../resources/xingchao/skins/rest-harbor/captain-uniform.webp"
import restHarborCrestUrl from "../../resources/xingchao/skins/rest-harbor/crest.svg?url&no-inline"
import restHarborSceneBackdropUrl from "../../resources/xingchao/skins/rest-harbor/scene-backdrop.webp"
import restHarborSceneForegroundUrl from "../../resources/xingchao/skins/rest-harbor/scene-foreground.webp"
import restHarborSceneLightUrl from "../../resources/xingchao/skins/rest-harbor/scene-light.webp"
import restHarborSceneMidgroundUrl from "../../resources/xingchao/skins/rest-harbor/scene-midground.webp"
import watchtideCaptainBaseUrl from "../../resources/xingchao/skins/watchtide/captain-base.webp"
import watchtideCaptainStaticUrl from "../../resources/xingchao/skins/watchtide/captain-static.webp"
import watchtideCaptainUniformUrl from "../../resources/xingchao/skins/watchtide/captain-uniform.webp"
import watchtideCrestUrl from "../../resources/xingchao/skins/watchtide/crest.svg?url&no-inline"
import watchtideSceneBackdropUrl from "../../resources/xingchao/skins/watchtide/scene-backdrop.webp"
import watchtideSceneForegroundUrl from "../../resources/xingchao/skins/watchtide/scene-foreground.webp"
import watchtideSceneLightUrl from "../../resources/xingchao/skins/watchtide/scene-light.webp"
import watchtideSceneMidgroundUrl from "../../resources/xingchao/skins/watchtide/scene-midground.webp"

function registerCrewAssets<const CrewId extends BuiltinCrewId>(
  crewId: CrewId,
  files: Record<FleetSkinAssetRole, string>,
): Record<`${CrewId}.${FleetSkinAssetRole}`, string> {
  return {
    [`${crewId}.scene.backdrop`]: files["scene.backdrop"],
    [`${crewId}.scene.midground`]: files["scene.midground"],
    [`${crewId}.scene.light`]: files["scene.light"],
    [`${crewId}.scene.foreground`]: files["scene.foreground"],
    [`${crewId}.captain.base`]: files["captain.base"],
    [`${crewId}.captain.uniform`]: files["captain.uniform"],
    [`${crewId}.captain.static`]: files["captain.static"],
    [`${crewId}.crest`]: files.crest,
  } as Record<`${CrewId}.${FleetSkinAssetRole}`, string>
}

const fleetSkinAssetEntries = {
  ...registerCrewAssets("watchtide", {
    "scene.backdrop": watchtideSceneBackdropUrl,
    "scene.midground": watchtideSceneMidgroundUrl,
    "scene.light": watchtideSceneLightUrl,
    "scene.foreground": watchtideSceneForegroundUrl,
    "captain.base": watchtideCaptainBaseUrl,
    "captain.uniform": watchtideCaptainUniformUrl,
    "captain.static": watchtideCaptainStaticUrl,
    crest: watchtideCrestUrl,
  }),
  ...registerCrewAssets("ink-sail", {
    "scene.backdrop": inkSailSceneBackdropUrl,
    "scene.midground": inkSailSceneMidgroundUrl,
    "scene.light": inkSailSceneLightUrl,
    "scene.foreground": inkSailSceneForegroundUrl,
    "captain.base": inkSailCaptainBaseUrl,
    "captain.uniform": inkSailCaptainUniformUrl,
    "captain.static": inkSailCaptainStaticUrl,
    crest: inkSailCrestUrl,
  }),
  ...registerCrewAssets("brocade-harbor", {
    "scene.backdrop": brocadeHarborSceneBackdropUrl,
    "scene.midground": brocadeHarborSceneMidgroundUrl,
    "scene.light": brocadeHarborSceneLightUrl,
    "scene.foreground": brocadeHarborSceneForegroundUrl,
    "captain.base": brocadeHarborCaptainBaseUrl,
    "captain.uniform": brocadeHarborCaptainUniformUrl,
    "captain.static": brocadeHarborCaptainStaticUrl,
    crest: brocadeHarborCrestUrl,
  }),
  ...registerCrewAssets("forge-vessel", {
    "scene.backdrop": forgeVesselSceneBackdropUrl,
    "scene.midground": forgeVesselSceneMidgroundUrl,
    "scene.light": forgeVesselSceneLightUrl,
    "scene.foreground": forgeVesselSceneForegroundUrl,
    "captain.base": forgeVesselCaptainBaseUrl,
    "captain.uniform": forgeVesselCaptainUniformUrl,
    "captain.static": forgeVesselCaptainStaticUrl,
    crest: forgeVesselCrestUrl,
  }),
  ...registerCrewAssets("golden-scale", {
    "scene.backdrop": goldenScaleSceneBackdropUrl,
    "scene.midground": goldenScaleSceneMidgroundUrl,
    "scene.light": goldenScaleSceneLightUrl,
    "scene.foreground": goldenScaleSceneForegroundUrl,
    "captain.base": goldenScaleCaptainBaseUrl,
    "captain.uniform": goldenScaleCaptainUniformUrl,
    "captain.static": goldenScaleCaptainStaticUrl,
    crest: goldenScaleCrestUrl,
  }),
  ...registerCrewAssets("helm-order", {
    "scene.backdrop": helmOrderSceneBackdropUrl,
    "scene.midground": helmOrderSceneMidgroundUrl,
    "scene.light": helmOrderSceneLightUrl,
    "scene.foreground": helmOrderSceneForegroundUrl,
    "captain.base": helmOrderCaptainBaseUrl,
    "captain.uniform": helmOrderCaptainUniformUrl,
    "captain.static": helmOrderCaptainStaticUrl,
    crest: helmOrderCrestUrl,
  }),
  ...registerCrewAssets("iron-code", {
    "scene.backdrop": ironCodeSceneBackdropUrl,
    "scene.midground": ironCodeSceneMidgroundUrl,
    "scene.light": ironCodeSceneLightUrl,
    "scene.foreground": ironCodeSceneForegroundUrl,
    "captain.base": ironCodeCaptainBaseUrl,
    "captain.uniform": ironCodeCaptainUniformUrl,
    "captain.static": ironCodeCaptainStaticUrl,
    crest: ironCodeCrestUrl,
  }),
  ...registerCrewAssets("lighthouse", {
    "scene.backdrop": lighthouseSceneBackdropUrl,
    "scene.midground": lighthouseSceneMidgroundUrl,
    "scene.light": lighthouseSceneLightUrl,
    "scene.foreground": lighthouseSceneForegroundUrl,
    "captain.base": lighthouseCaptainBaseUrl,
    "captain.uniform": lighthouseCaptainUniformUrl,
    "captain.static": lighthouseCaptainStaticUrl,
    crest: lighthouseCrestUrl,
  }),
  ...registerCrewAssets("phantom-wave", {
    "scene.backdrop": phantomWaveSceneBackdropUrl,
    "scene.midground": phantomWaveSceneMidgroundUrl,
    "scene.light": phantomWaveSceneLightUrl,
    "scene.foreground": phantomWaveSceneForegroundUrl,
    "captain.base": phantomWaveCaptainBaseUrl,
    "captain.uniform": phantomWaveCaptainUniformUrl,
    "captain.static": phantomWaveCaptainStaticUrl,
    crest: phantomWaveCrestUrl,
  }),
  ...registerCrewAssets("rest-harbor", {
    "scene.backdrop": restHarborSceneBackdropUrl,
    "scene.midground": restHarborSceneMidgroundUrl,
    "scene.light": restHarborSceneLightUrl,
    "scene.foreground": restHarborSceneForegroundUrl,
    "captain.base": restHarborCaptainBaseUrl,
    "captain.uniform": restHarborCaptainUniformUrl,
    "captain.static": restHarborCaptainStaticUrl,
    crest: restHarborCrestUrl,
  }),
} satisfies Record<FleetSkinAssetId, string>

export const fleetSkinAssetRegistry: Readonly<Record<FleetSkinAssetId, string>> = Object.freeze(fleetSkinAssetEntries)

export function fleetSkinAssetUrl(assetId: FleetSkinAssetId): string {
  return fleetSkinAssetRegistry[assetId]
}
