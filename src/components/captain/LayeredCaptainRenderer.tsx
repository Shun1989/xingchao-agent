import type { CaptainRendererProps, CaptainState } from "@/captain/captain-types.ts"
import type { CaptainComposition } from "@/skins/fleet-skin-schema.ts"
import type { CSSProperties } from "react"

import { motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useRef } from "react"
import { fleetSkinAssetUrl } from "@/skins/fleet-skin-assets.ts"

type CaptainStyle = CSSProperties & {
  "--captain-focal-position": string
  "--captain-parallax-px": string
  "--captain-mouth-level": string
  "--captain-transition-ms": string
  "--captain-composition-size": string
  "--captain-composition-width": string
}

const UNIFORM_STATES: ReadonlySet<CaptainState> = new Set(["executing", "reporting", "warning", "success", "failure"])

function compositionForMode({ skin, mode }: Pick<CaptainRendererProps, "skin" | "mode">): CaptainComposition {
  return skin.captain[mode]
}

function compositionSize(composition: CaptainComposition): number {
  return composition.stageWidthPercent ?? composition.companionWidthPx ?? composition.compactSizePx ?? 0
}

function compositionWidth(mode: CaptainRendererProps["mode"], size: number): string {
  return mode === "stage" ? `${size}%` : `${size}px`
}

function presentationUrls(skin: CaptainRendererProps["skin"]): { base: string; uniform: string } {
  const base = skin.captain.layers.find((assetId) => assetId.endsWith(".captain.base"))
  const uniform = skin.captain.layers.find((assetId) => assetId.endsWith(".captain.uniform"))
  if (!base || !uniform) throw new Error("Captain presentation layers are incomplete")
  return { base: fleetSkinAssetUrl(base), uniform: fleetSkinAssetUrl(uniform) }
}

function decorativeImage(src: string, className: string) {
  return <img src={src} alt="" draggable={false} className={className} />
}

/** First-version deterministic layered renderer. It does not perform audio waveform analysis. */
export function LayeredCaptainRenderer({ snapshot, skin, mode, reducedMotion, onRendererEvent }: CaptainRendererProps) {
  const reportedReady = useRef(new Set<string>())
  const systemReducedMotion = useReducedMotion()
  const effectiveReducedMotion = reducedMotion || systemReducedMotion === true
  const composition = compositionForMode({ skin, mode })
  const size = compositionSize(composition)
  const parallax = effectiveReducedMotion ? 0 : skin.motion.parallaxPx
  const mouthLevel = snapshot.state === "reporting" ? Math.min(1, Math.max(0, snapshot.mouthLevel)) : 0
  const uniformVisible = UNIFORM_STATES.has(snapshot.state)
  const presentation = useMemo(() => presentationUrls(skin), [skin])
  const readySignature = `${skin.identity.crewId}:${snapshot.state}`

  useEffect(() => {
    if (reportedReady.current.has(readySignature)) return
    reportedReady.current.add(readySignature)
    onRendererEvent({
      type: "renderer.ready",
      renderer: "layered",
      skinId: skin.identity.crewId,
      state: snapshot.state,
    })
  }, [onRendererEvent, readySignature, skin.identity.crewId, snapshot.state])

  const style: CaptainStyle = {
    "--captain-focal-position": composition.focalPosition,
    "--captain-parallax-px": `${parallax}px`,
    "--captain-mouth-level": String(mouthLevel),
    "--captain-transition-ms": effectiveReducedMotion ? "0ms" : `${skin.motion.feedbackMs}ms`,
    "--captain-composition-size": String(size),
    "--captain-composition-width": compositionWidth(mode, size),
  }
  const presentationTransition = {
    opacity: { duration: skin.motion.feedbackMs / 1_000, ease: "easeOut" as const },
    x: { duration: 8, ease: "easeInOut" as const, repeat: Number.POSITIVE_INFINITY },
    y: { duration: 6, ease: "easeInOut" as const, repeat: Number.POSITIVE_INFINITY },
    scale: { duration: 6, ease: "easeInOut" as const, repeat: Number.POSITIVE_INFINITY },
  }

  return (
    <div
      className="captain-renderer"
      data-captain-renderer="layered"
      data-captain-mode={mode}
      data-captain-state={snapshot.state}
      data-captain-expression={snapshot.expression}
      data-skin-id={skin.identity.crewId}
      data-reduced-motion={String(effectiveReducedMotion)}
      data-composition-size={String(size)}
      data-focal-position={composition.focalPosition}
      data-alignment={composition.alignment}
      data-safe-caption-position={composition.safeCaptionPosition}
      style={style}
    >
      <motion.div
        className="captain-layer captain-layer--scene"
        data-captain-layer="scene"
        data-motion-enabled={String(!effectiveReducedMotion)}
        aria-hidden="true"
        {...(!effectiveReducedMotion
          ? {
              animate: { x: [-parallax / 2, parallax / 2, -parallax / 2] },
              transition: { duration: 16, ease: "easeInOut" as const, repeat: Number.POSITIVE_INFINITY },
            }
          : {})}
      >
        {decorativeImage(fleetSkinAssetUrl(skin.scene.backdrop), "captain-layer__image captain-layer__image--scene")}
      </motion.div>

      <motion.div
        className="captain-layer captain-layer--midground"
        data-captain-layer="midground"
        data-motion-enabled={String(!effectiveReducedMotion)}
        aria-hidden="true"
        {...(!effectiveReducedMotion
          ? {
              animate: { x: [-parallax / 4, parallax / 4, -parallax / 4] },
              transition: { duration: 14, ease: "easeInOut" as const, repeat: Number.POSITIVE_INFINITY },
            }
          : {})}
      >
        {decorativeImage(
          fleetSkinAssetUrl(skin.scene.midground),
          "captain-layer__image captain-layer__image--midground",
        )}
      </motion.div>

      <motion.div
        className="captain-layer captain-layer--presentation captain-layer--base"
        data-captain-layer="base"
        data-captain-presentation="base"
        data-visible={String(!uniformVisible)}
        data-motion-enabled={String(!effectiveReducedMotion)}
        aria-hidden="true"
        {...(!effectiveReducedMotion
          ? {
              animate: { opacity: uniformVisible ? 0 : 1, x: [0, 1, -1, 0], y: [0, -3, 0], scale: [1, 1.006, 1] },
              transition: presentationTransition,
            }
          : {})}
      >
        {decorativeImage(presentation.base, "captain-layer__image captain-layer__image--person")}
      </motion.div>

      <motion.div
        className="captain-layer captain-layer--presentation captain-layer--uniform"
        data-captain-layer="uniform"
        data-captain-presentation="uniform"
        data-visible={String(uniformVisible)}
        data-motion-enabled={String(!effectiveReducedMotion)}
        aria-hidden="true"
        {...(!effectiveReducedMotion
          ? {
              animate: { opacity: uniformVisible ? 1 : 0, x: [0, 1, -1, 0], y: [0, -3, 0], scale: [1, 1.006, 1] },
              transition: presentationTransition,
            }
          : {})}
      >
        {decorativeImage(presentation.uniform, "captain-layer__image captain-layer__image--person")}
      </motion.div>

      <motion.div
        className="captain-layer captain-layer--expression"
        data-captain-layer="expression-light"
        data-expression={snapshot.expression}
        data-motion-enabled={String(!effectiveReducedMotion)}
        aria-hidden="true"
        {...(!effectiveReducedMotion
          ? {
              animate: { opacity: [0.62, 0.82, 0.62], x: [-1, 1, -1], scaleY: [1, 0.94, 1] },
              transition: { duration: 4.8, ease: "easeInOut" as const, repeat: Number.POSITIVE_INFINITY },
            }
          : {})}
      >
        <span className="captain-expression-light" />
        <span
          className="captain-mouth"
          data-captain-mouth
          data-mouth-cadence={snapshot.state === "reporting" && !effectiveReducedMotion ? "clock" : "off"}
          style={{ "--captain-mouth-level": String(mouthLevel) } as CSSProperties}
        />
      </motion.div>

      <motion.div
        className="captain-layer captain-layer--scene-light"
        data-captain-layer="scene-light"
        data-motion-enabled={String(!effectiveReducedMotion)}
        aria-hidden="true"
        {...(!effectiveReducedMotion
          ? {
              animate: { opacity: [0.44, 0.62, 0.44], x: [parallax / 4, -parallax / 4, parallax / 4] },
              transition: { duration: 10, ease: "easeInOut" as const, repeat: Number.POSITIVE_INFINITY },
            }
          : {})}
      >
        {decorativeImage(fleetSkinAssetUrl(skin.scene.light), "captain-layer__image captain-layer__image--light")}
      </motion.div>

      <motion.div
        className="captain-layer captain-layer--foreground"
        data-captain-layer="foreground"
        data-motion-enabled={String(!effectiveReducedMotion)}
        aria-hidden="true"
        {...(!effectiveReducedMotion
          ? {
              animate: { x: [parallax / 2, -parallax / 2, parallax / 2] },
              transition: { duration: 12, ease: "easeInOut" as const, repeat: Number.POSITIVE_INFINITY },
            }
          : {})}
      >
        {decorativeImage(
          fleetSkinAssetUrl(skin.scene.foreground),
          "captain-layer__image captain-layer__image--foreground",
        )}
      </motion.div>
    </div>
  )
}
