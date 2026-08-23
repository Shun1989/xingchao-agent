import type { BuiltinCrewId } from "../domain/xingchao/types.ts"
import type { FleetSkinAssetId, FleetSkinAssetRole } from "./fleet-skin-schema.ts"

import brocadeHarborCaptainBaseUrl from "../../resources/xingchao/skins/brocade-harbor/captain-base.webp"
import brocadeHarborCaptainStaticUrl from "../../resources/xingchao/skins/brocade-harbor/captain-static.webp"
import brocadeHarborCaptainUniformUrl from "../../resources/xingchao/skins/brocade-harbor/captain-uniform.webp"
import brocadeHarborCrestUrl from "../../resources/xingchao/skins/brocade-harbor/crest.svg?url&no-inline"
import brocadeHarborSceneBackdropUrl from "../../resources/xingchao/skins/brocade-harbor/scene-backdrop.webp"
import brocadeHarborSceneForegroundUrl from "../../resources/xingchao/skins/brocade-harbor/scene-foreground.webp"
import forgeVesselCaptainBaseUrl from "../../resources/xingchao/skins/forge-vessel/captain-base.webp"
import forgeVesselCaptainStaticUrl from "../../resources/xingchao/skins/forge-vessel/captain-static.webp"
import forgeVesselCaptainUniformUrl from "../../resources/xingchao/skins/forge-vessel/captain-uniform.webp"
import forgeVesselCrestUrl from "../../resources/xingchao/skins/forge-vessel/crest.svg?url&no-inline"
import forgeVesselSceneBackdropUrl from "../../resources/xingchao/skins/forge-vessel/scene-backdrop.webp"
import forgeVesselSceneForegroundUrl from "../../resources/xingchao/skins/forge-vessel/scene-foreground.webp"
import goldenScaleCaptainBaseUrl from "../../resources/xingchao/skins/golden-scale/captain-base.webp"
import goldenScaleCaptainStaticUrl from "../../resources/xingchao/skins/golden-scale/captain-static.webp"
import goldenScaleCaptainUniformUrl from "../../resources/xingchao/skins/golden-scale/captain-uniform.webp"
import goldenScaleCrestUrl from "../../resources/xingchao/skins/golden-scale/crest.svg?url&no-inline"
import goldenScaleSceneBackdropUrl from "../../resources/xingchao/skins/golden-scale/scene-backdrop.webp"
import goldenScaleSceneForegroundUrl from "../../resources/xingchao/skins/golden-scale/scene-foreground.webp"
import helmOrderCaptainBaseUrl from "../../resources/xingchao/skins/helm-order/captain-base.webp"
import helmOrderCaptainStaticUrl from "../../resources/xingchao/skins/helm-order/captain-static.webp"
import helmOrderCaptainUniformUrl from "../../resources/xingchao/skins/helm-order/captain-uniform.webp"
import helmOrderCrestUrl from "../../resources/xingchao/skins/helm-order/crest.svg?url&no-inline"
import helmOrderSceneBackdropUrl from "../../resources/xingchao/skins/helm-order/scene-backdrop.webp"
import helmOrderSceneForegroundUrl from "../../resources/xingchao/skins/helm-order/scene-foreground.webp"
import inkSailCaptainBaseUrl from "../../resources/xingchao/skins/ink-sail/captain-base.webp"
import inkSailCaptainStaticUrl from "../../resources/xingchao/skins/ink-sail/captain-static.webp"
import inkSailCaptainUniformUrl from "../../resources/xingchao/skins/ink-sail/captain-uniform.webp"
import inkSailCrestUrl from "../../resources/xingchao/skins/ink-sail/crest.svg?url&no-inline"
import inkSailSceneBackdropUrl from "../../resources/xingchao/skins/ink-sail/scene-backdrop.webp"
import inkSailSceneForegroundUrl from "../../resources/xingchao/skins/ink-sail/scene-foreground.webp"
import ironCodeCaptainBaseUrl from "../../resources/xingchao/skins/iron-code/captain-base.webp"
import ironCodeCaptainStaticUrl from "../../resources/xingchao/skins/iron-code/captain-static.webp"
import ironCodeCaptainUniformUrl from "../../resources/xingchao/skins/iron-code/captain-uniform.webp"
import ironCodeCrestUrl from "../../resources/xingchao/skins/iron-code/crest.svg?url&no-inline"
import ironCodeSceneBackdropUrl from "../../resources/xingchao/skins/iron-code/scene-backdrop.webp"
import ironCodeSceneForegroundUrl from "../../resources/xingchao/skins/iron-code/scene-foreground.webp"
import lighthouseCaptainBaseUrl from "../../resources/xingchao/skins/lighthouse/captain-base.webp"
import lighthouseCaptainStaticUrl from "../../resources/xingchao/skins/lighthouse/captain-static.webp"
import lighthouseCaptainUniformUrl from "../../resources/xingchao/skins/lighthouse/captain-uniform.webp"
import lighthouseCrestUrl from "../../resources/xingchao/skins/lighthouse/crest.svg?url&no-inline"
import lighthouseSceneBackdropUrl from "../../resources/xingchao/skins/lighthouse/scene-backdrop.webp"
import lighthouseSceneForegroundUrl from "../../resources/xingchao/skins/lighthouse/scene-foreground.webp"
import phantomWaveCaptainBaseUrl from "../../resources/xingchao/skins/phantom-wave/captain-base.webp"
import phantomWaveCaptainStaticUrl from "../../resources/xingchao/skins/phantom-wave/captain-static.webp"
import phantomWaveCaptainUniformUrl from "../../resources/xingchao/skins/phantom-wave/captain-uniform.webp"
import phantomWaveCrestUrl from "../../resources/xingchao/skins/phantom-wave/crest.svg?url&no-inline"
import phantomWaveSceneBackdropUrl from "../../resources/xingchao/skins/phantom-wave/scene-backdrop.webp"
import phantomWaveSceneForegroundUrl from "../../resources/xingchao/skins/phantom-wave/scene-foreground.webp"
import restHarborCaptainBaseUrl from "../../resources/xingchao/skins/rest-harbor/captain-base.webp"
import restHarborCaptainStaticUrl from "../../resources/xingchao/skins/rest-harbor/captain-static.webp"
import restHarborCaptainUniformUrl from "../../resources/xingchao/skins/rest-harbor/captain-uniform.webp"
import restHarborCrestUrl from "../../resources/xingchao/skins/rest-harbor/crest.svg?url&no-inline"
import restHarborSceneBackdropUrl from "../../resources/xingchao/skins/rest-harbor/scene-backdrop.webp"
import restHarborSceneForegroundUrl from "../../resources/xingchao/skins/rest-harbor/scene-foreground.webp"
import watchtideCaptainBaseUrl from "../../resources/xingchao/skins/watchtide/captain-base.webp"
import watchtideCaptainStaticUrl from "../../resources/xingchao/skins/watchtide/captain-static.webp"
import watchtideCaptainUniformUrl from "../../resources/xingchao/skins/watchtide/captain-uniform.webp"
import watchtideCrestUrl from "../../resources/xingchao/skins/watchtide/crest.svg?url&no-inline"
import watchtideSceneBackdropUrl from "../../resources/xingchao/skins/watchtide/scene-backdrop.webp"
import watchtideSceneForegroundUrl from "../../resources/xingchao/skins/watchtide/scene-foreground.webp"

function registerCrewAssets<const CrewId extends BuiltinCrewId>(
  crewId: CrewId,
  files: Record<FleetSkinAssetRole, string>,
): Record<`${CrewId}.${FleetSkinAssetRole}`, string> {
  return {
    [`${crewId}.scene.backdrop`]: files["scene.backdrop"],
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
    "scene.foreground": watchtideSceneForegroundUrl,
    "captain.base": watchtideCaptainBaseUrl,
    "captain.uniform": watchtideCaptainUniformUrl,
    "captain.static": watchtideCaptainStaticUrl,
    crest: watchtideCrestUrl,
  }),
  ...registerCrewAssets("ink-sail", {
    "scene.backdrop": inkSailSceneBackdropUrl,
    "scene.foreground": inkSailSceneForegroundUrl,
    "captain.base": inkSailCaptainBaseUrl,
    "captain.uniform": inkSailCaptainUniformUrl,
    "captain.static": inkSailCaptainStaticUrl,
    crest: inkSailCrestUrl,
  }),
  ...registerCrewAssets("brocade-harbor", {
    "scene.backdrop": brocadeHarborSceneBackdropUrl,
    "scene.foreground": brocadeHarborSceneForegroundUrl,
    "captain.base": brocadeHarborCaptainBaseUrl,
    "captain.uniform": brocadeHarborCaptainUniformUrl,
    "captain.static": brocadeHarborCaptainStaticUrl,
    crest: brocadeHarborCrestUrl,
  }),
  ...registerCrewAssets("forge-vessel", {
    "scene.backdrop": forgeVesselSceneBackdropUrl,
    "scene.foreground": forgeVesselSceneForegroundUrl,
    "captain.base": forgeVesselCaptainBaseUrl,
    "captain.uniform": forgeVesselCaptainUniformUrl,
    "captain.static": forgeVesselCaptainStaticUrl,
    crest: forgeVesselCrestUrl,
  }),
  ...registerCrewAssets("golden-scale", {
    "scene.backdrop": goldenScaleSceneBackdropUrl,
    "scene.foreground": goldenScaleSceneForegroundUrl,
    "captain.base": goldenScaleCaptainBaseUrl,
    "captain.uniform": goldenScaleCaptainUniformUrl,
    "captain.static": goldenScaleCaptainStaticUrl,
    crest: goldenScaleCrestUrl,
  }),
  ...registerCrewAssets("helm-order", {
    "scene.backdrop": helmOrderSceneBackdropUrl,
    "scene.foreground": helmOrderSceneForegroundUrl,
    "captain.base": helmOrderCaptainBaseUrl,
    "captain.uniform": helmOrderCaptainUniformUrl,
    "captain.static": helmOrderCaptainStaticUrl,
    crest: helmOrderCrestUrl,
  }),
  ...registerCrewAssets("iron-code", {
    "scene.backdrop": ironCodeSceneBackdropUrl,
    "scene.foreground": ironCodeSceneForegroundUrl,
    "captain.base": ironCodeCaptainBaseUrl,
    "captain.uniform": ironCodeCaptainUniformUrl,
    "captain.static": ironCodeCaptainStaticUrl,
    crest: ironCodeCrestUrl,
  }),
  ...registerCrewAssets("lighthouse", {
    "scene.backdrop": lighthouseSceneBackdropUrl,
    "scene.foreground": lighthouseSceneForegroundUrl,
    "captain.base": lighthouseCaptainBaseUrl,
    "captain.uniform": lighthouseCaptainUniformUrl,
    "captain.static": lighthouseCaptainStaticUrl,
    crest: lighthouseCrestUrl,
  }),
  ...registerCrewAssets("phantom-wave", {
    "scene.backdrop": phantomWaveSceneBackdropUrl,
    "scene.foreground": phantomWaveSceneForegroundUrl,
    "captain.base": phantomWaveCaptainBaseUrl,
    "captain.uniform": phantomWaveCaptainUniformUrl,
    "captain.static": phantomWaveCaptainStaticUrl,
    crest: phantomWaveCrestUrl,
  }),
  ...registerCrewAssets("rest-harbor", {
    "scene.backdrop": restHarborSceneBackdropUrl,
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
