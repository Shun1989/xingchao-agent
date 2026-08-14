import type { LanxiState } from "@/live2d/lanxi-state.ts"

import * as React from "react"
import lanxiKeyArtUrl from "../../resources/xingchao/lanxi-key-art.png"

export function LanxiStage({ state = "idle", overlayName }: { state?: LanxiState; overlayName: string }) {
  const speakSystemFallback = React.useCallback(() => {
    if (!("speechSynthesis" in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance("航海图已就绪，我会在你确认后带领团队开始执行。")
    utterance.lang = "zh-CN"
    utterance.rate = 0.96
    window.speechSynthesis.speak(utterance)
  }, [])
  return (
    <section className="relative min-h-80 overflow-hidden rounded-2xl bg-[#10263b] text-white" data-lanxi-state={state}>
      <img
        src={lanxiKeyArtUrl}
        alt="总助理澜汐原创静态回退立绘"
        className="absolute inset-0 size-full object-cover object-[50%_22%]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#091827] via-transparent to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5">
        <div>
          <p className="text-xs tracking-[.18em] text-cyan-100/70">{overlayName}</p>
          <h2 className="mt-1 text-xl font-semibold">澜汐</h2>
          <p className="text-xs text-white/70">状态：{state} · 静态安全回退</p>
        </div>
        <button
          type="button"
          onClick={speakSystemFallback}
          className="rounded-lg border border-white/30 bg-black/25 px-3 py-2 text-xs hover:bg-black/40"
        >
          试听系统语音
        </button>
      </div>
    </section>
  )
}
