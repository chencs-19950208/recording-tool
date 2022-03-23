import CoolPatch from './recorder.patch';

class CoolRecorder {
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
      if (unloadCB) return unloadCB()
    };
  };

  static instance = new CoolRecorder();

  // 初始化
  async init(reinit) {
    if (this.inited && !reinit) return;
    this.inited = true;
    
    // 输出日志
    this.logEnv();

    // 初始化的时候，处理浏览器的兼容，以及停掉之前可能在处理音频任务，（存在reinit 的情况）
    CoolPatch();
    
    // 判断当前环境是否支持
    if (!this.support()) throw new Error('No Support!')

    // 获取音频流
    const NEW_MEDIASTREAM = await window.navigator.mediaDevices.getUserMedia({
      audio: {
        // sampleRate: 44100, // 采样率
        channelCount: 1, // 声道
        // echoCancellation: true,
        // noiseSuppression: true 
      }
    })

    if (!NEW_MEDIASTREAM) throw new Error('stream open fail!');
    this.mediaStream = NEW_MEDIASTREAM;
    return NEW_MEDIASTREAM;
  };

  // web worker 优化性能
  async initWorkers() {
    const { default: Worker } = await import('./recorder.worker');

    if (this.workToInt16) return;

    this.workerToInt16 = new Worker();
    this.workerToMP3 = new Worker();
    this.workerToWAV = new Worker();
  };

  // 销毁
  destory() {
    this.workerToInt16 && this.workerToInt16.terminate();
    this.workerToMP3 && this.workerToMP3.terminate();
    this.mediaStream && this.mediaStream.stop();
  };

  // 判断当前环境是否支持
  support() {
    const devices = navigator.mediaDevices || {};

    devices.getUserMedia = devices.getUserMedia || devices.webkitGetUserMedia || devices.mozGetUserMedia || devices.msGetUserMedia;

    return !!devices.getUserMedia && window.Worker;
  }

  // 日志输出
  logEnv() {
    console.log(`recording info: 
      AudioContext: ${!!window.AudioContext},
      webkitAudioContext: ${
        !!window.webkitAudioContext
      },
      mediaDevices: ${!!window.MediaDevices},
      mediaDevices.getUserMedia: ${!!(
        navigator.mediaDevices && navigator.mediaDevices.getUserMedia
      )},
      navigator.getUserMedia: ${
        !!navigator.getUserMedia
      },
      navigator.webkitGetUserMedia: ${
        !!navigator.webkitGetUserMedia
      },
    `)
  };

  async record() {
    await this.init();

    if (this.recording) return;

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
    if(!this.workerToWAV) await this.initWorkers();

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