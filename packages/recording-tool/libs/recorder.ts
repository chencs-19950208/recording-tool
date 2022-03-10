//@ts-nocheck
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
    // @ts-ignore
    this.workerToInt16 && this.workerToInt16.terminate();
    // @ts-ignore
    this.workerToMP3 && this.workerToMP3.terminate();
    // @ts-ignore
    this.mediaStream && this.mediaStream.stop();
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

  async record() {
    // @ts-ignore
    await this.init();

    // @ts-ignore
    if (this.recording) return;

    // @ts-ignore
    this.recording = true;

    // 重置存储
    this.audioBuffers = [];

    if(!this.mediaStream) {
      await this.init(true);
    };

    // 打开stream
    this.audioContext = new window.AudioContext();
    this.inputSampleRate = this.audioContext.sampleRate;
    this.mediaNode = this.audioContext.createMediaStreamSource(this.mediaStream);

    if (!this.audioContext.createScriptProcessor) {
      this.audioContext.createScriptProcessor = this.audioContext.createJavaScriptNode;
    };

    // 创建一个 jsNode
    this.jsNode = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.jsNode.connect(this.audioContext.destination);
    this.jsNode.onaudioprocess = this._onAudioProcess.bind(this);
    this.mediaNode.connect(this.jsNode);
  };

  // 停止
  stop() {
    if (this.recording) {
      this.jsNode.disconnect();
      this.mediaNode.disconnect();
      this.jsNode.onaudioprocess = null;
      this.jsNode = null;
      this.mediaNode = null;
      this.recording = false
    };

    return this.audioBuffers
  };

  // 处理WAV 格式音频
  async toWAV(sampleRate = 16000) {
    if(!this.workerToWAV) await this.workerWAV();

    return new Promise(resolve => {
      this.workerToWAV.postMessage({
        audioBuffers: this.audioBuffers,
        inputSampleRate: this.inputSampleRate,
        outputSampleRate: sampleRate,
        type: 'wav'
      });

      this.workerToWAV.onmessage = event => resolve(event.data);
    })
  };

  async toShortEnergy() {
    const { default: Worker } = await import('./recorder.worker');
    const worker = new Worker();

    return new Promise(resolve => {
      worker.postMessage({
        audioBuffers: this.audioBuffers,
        type: 'short-energy'
      });

      worker.onmessage = event => resolve(event.data)
    })
  };

  _onAudioProcess(e) {
    const audioBuffer = e.inputBuffer;
    
    this.audioBuffers.push(audioBuffer.getChannelData(0).slice(0));
    this.onAudioProcess && this.onAudioProcess(e);
  }
};

export default CoolRecorder;