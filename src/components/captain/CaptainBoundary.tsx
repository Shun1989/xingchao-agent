import type { CaptainRendererProps } from "@/captain/captain-types.ts"
import type { ErrorInfo, ReactNode } from "react"

import { useReducedMotion } from "motion/react"
import { Component } from "react"
import { classifyRendererError } from "@/lib/react-root-error-options.ts"
import { fleetSkinAssetUrl } from "@/skins/fleet-skin-assets.ts"

export interface CaptainBoundaryProps extends CaptainRendererProps {
  readonly children: ReactNode
  readonly recoveryKey?: string | number
}

interface CaptainBoundaryState {
  readonly failed: boolean
}

/** Visual-only error boundary. Captions and controls remain outside this component in CaptainHost. */
class CaptainBoundaryImpl extends Component<CaptainBoundaryProps, CaptainBoundaryState> {
  state: CaptainBoundaryState = { failed: false }

  static getDerivedStateFromError(): CaptainBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: unknown, _errorInfo: ErrorInfo): void {
    this.props.onRendererEvent({
      type: "renderer.error",
      renderer: "layered",
      skinId: this.props.skin.identity.crewId,
      state: this.props.snapshot.state,
      errorClass: classifyRendererError(error),
    })
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <div
        className="captain-static-fallback"
        data-captain-static-fallback
        data-renderer-kind="static"
        data-layered-ready="false"
        data-skin-id={this.props.skin.identity.crewId}
        data-captain-state={this.props.snapshot.state}
        data-captain-mode={this.props.mode}
        aria-hidden="true"
      >
        <img
          src={fleetSkinAssetUrl(this.props.skin.captain.staticFallback)}
          alt=""
          draggable={false}
          className="captain-static-fallback__image"
        />
      </div>
    )
  }
}

function boundaryIdentity(props: CaptainBoundaryProps, effectiveReducedMotion: boolean): string {
  return JSON.stringify([
    props.skin.identity.crewId,
    props.skin.identity.version,
    props.mode,
    props.snapshot.state,
    effectiveReducedMotion,
    props.recoveryKey ?? null,
  ])
}

export function CaptainBoundary(props: CaptainBoundaryProps) {
  const systemReducedMotion = useReducedMotion()
  const effectiveReducedMotion = props.reducedMotion || systemReducedMotion === true
  const identity = boundaryIdentity(props, effectiveReducedMotion)
  return <CaptainBoundaryImpl {...props} reducedMotion={effectiveReducedMotion} key={identity} />
}
