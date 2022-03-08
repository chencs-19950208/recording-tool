// 关于音频流浏览器兼容处理, 并且停掉之前音频任务
let patched = false;
export default function CoolPatch() {
  if (patched) return;

  patched = true;

  if (
    typeof window.MediaStream === 'undefined' &&
    // @ts-ignore
    typeof window.webkitMediaStream !== 'undefined'
  ) {
    //@ts-ignore
    window.MediaStream = window.webkitMediaStream;
  };

  if (
    typeof window.AudioContext === 'undefined' && 
    // @ts-ignore
    typeof window.webkitAudioContext !== 'undefined'
  ) {
    // @ts-ignore
    window.AudioContext = window.webkitAudioContext;
  };

  if (
    typeof MediaStream !== 'undefined' && 
    !('stop' in MediaStream.prototype)
  ) {
    // @ts-ignore
    MediaStream.prototype.stop = function () {
      this.getTracks().forEach((track) => {
        track.stop();
      });
    }
  }
};