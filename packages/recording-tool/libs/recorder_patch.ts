// @ts-nocheck
// 关于音频流浏览器兼容处理, 并且停掉之前音频任务
let patched = false
export default function CoolPatch() {
  if (patched) return
  patched = true
  if (
    typeof window.MediaStream === 'undefined' &&
    typeof window.webkitMediaStream !== 'undefined'
  ) {
    window.MediaStream = window.webkitMediaStream
  }

  if (
    typeof window.AudioContext === 'undefined' &&
    typeof window.webkitAudioContext !== 'undefined'
  ) {
    window.AudioContext = window.webkitAudioContext
  }

  if (
    typeof MediaStream !== 'undefined' &&
    !('stop' in MediaStream.prototype)
  ) {
    MediaStream.prototype.stop = function () {
      this.getTracks().forEach(function (track) {
        track.stop()
      })
    }
  }
}