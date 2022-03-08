import { Readable } from 'stream';
import CoolPatch from './recorder.patch';
class CoolRecorder {
  protected inited: boolean;
  protected jsNode: string;
  protected mediaNode: string;
  protected mediaStream: Readable;
  protected audioContext: string;
  protected audioBuffers: unknown[];
  protected onAudioProcess: string;
  protected inputSampleRate: number;
  protected outputSampleRate: number;

  constructor() {
    this.inited = false;
    this.jsNode = null;
    this.mediaNode = null;
    this.mediaStream = null;
    this.audioContext = null;
    this.audioBuffers = null;
    this.onAudioProcess = null;
    this.inputSampleRate = null;
    this.outputSampleRate = null;

    const unloadCB = window.onbeforeunload;

    window.onbeforeunload = () => {
      this.destory();
      // @ts-ignore
      if (unloadCB) return unloadCB()
    };
  };

  static instance = new CoolRecorder();

  // 初始化
  async init(reinit: boolean): Promise<Readable> {
    if (this.inited && !reinit) return;
    this.inited = true;
    
    // 输出日志
    this.logEnv();

    // 初始化的时候，处理浏览器的兼容，以及停掉之前可能在处理音频任务，（存在reinit 的情况）
    CoolPatch();
    
    // 判断当前环境是否支持
    if (!this.support()) throw new Error('No Support!')

    // 获取音频流
    let NEW_MEDIASTREAM: Readable;
    //@ts-ignore
    NEW_MEDIASTREAM = await window.navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 44100, // 采样率
        channelCount: 1, // 声道
        echoCancellation: true,
        noiseSuppression: true 
      }
    })

    if (!NEW_MEDIASTREAM) throw new Error('stream open fail!');
    this.mediaStream = NEW_MEDIASTREAM;
    return NEW_MEDIASTREAM;
  };

  // web worker 优化性能
  async initWorkers() {
    // @ts-ignore
    const { default: Worker } = await import('./recorder.worker');

    // @ts-ignore
    if (this.workToInt16) return;

    // @ts-ignore
    this.workerToInt16 = new Worker();
    // @ts-ignore
    this.workerToMP3 = new Worker();
    //@ts-ignore
    this.workerToWAV = new Worker();
  };

  // 销毁
  destory() {

  };

  // 判断当前环境是否支持
  support() {
    const devices = navigator.mediaDevices || {};

    // @ts-ignore
    devices.getUserMedia = devices.getUserMedia || devices.webkitGetUserMedia || devices.mozGetUserMedia || devices.msGetUserMedia;

    // @ts-ignore
    return !!devices.getUserMedia && window.Worker;
  }

  // 日志输出
  logEnv() {
    console.log(`recording info: 
      AudioContext: ${!!window.AudioContext},
      webkitAudioContext: ${
        // @ts-ignore
        !!window.webkitAudioContext
      },
      mediaDevices: ${!!window.MediaDevices},
      mediaDevices.getUserMedia: ${!!(
        navigator.mediaDevices && navigator.mediaDevices.getUserMedia
      )},
      navigator.getUserMedia: ${
        //@ts-ignore
        !!navigator.getUserMedia
      },
      navigator.webkitGetUserMedia: ${
        // @ts-ignore
        !!navigator.webkitGetUserMedia
      },
    `)
  };


};

export default CoolRecorder;