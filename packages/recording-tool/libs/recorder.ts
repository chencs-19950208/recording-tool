// @ts-nocheck
import CoolPatch from './recorder_patch';

// -----------------------------
// @ts-nocheck
const workerScriptWrapper = () => {
  self.addEventListener('message', event => {
    const { data: {
      type,
      audioBuffers,
      inputSampleRate,
      outputSampleRate,
    }} = event;

    // -------------------------------------------------------------------------------------
    // interpolator
    class Interpolator {
  
      /**
       * @param {number} scaleFrom the length of the original array.
       * @param {number} scaleTo The length of the new array.
       * @param {?Object} details The extra configuration, if needed.
       */
      constructor(scaleFrom, scaleTo, details) {
        /**
         * The length of the original array.
         * @type {number}
         */
        this.length_ = scaleFrom;
        /**
         * The scaling factor.
         * @type {number}
         */
        this.scaleFactor_ = (scaleFrom - 1) / scaleTo;
        /**
         * The interpolation function.
         * @type {Function}
         */
        this.interpolate = this.cubic;
        if (details.method === 'point') {
          this.interpolate = this.point;
        } else if(details.method === 'linear') {
          this.interpolate = this.linear;
        } else if(details.method === 'sinc') {
          this.interpolate = this.sinc;
        }
        /**
         * The tanget factor for cubic interpolation.
         * @type {number}
         */
        this.tangentFactor_ = 1 - Math.max(0, Math.min(1, details.tension || 0));
        // Configure the kernel for sinc
        /**
         * The sinc filter size.
         * @type {number}
         */
        this.sincFilterSize_ = details.sincFilterSize || 1;
        /**
         * The sinc kernel.
         * @type {Function}
         */
        this.kernel_ = sincKernel_(details.sincWindow || window_);
      }
    
      /**
       * @param {number} t The index to interpolate.
       * @param {Array|TypedArray} samples the original array.
       * @return {number} The interpolated value.
       */
      point(t, samples) {
        return this.getClippedInput_(Math.round(this.scaleFactor_ * t), samples);
      }
    
      /**
       * @param {number} t The index to interpolate.
       * @param {Array|TypedArray} samples the original array.
       * @return {number} The interpolated value.
       */
      linear(t, samples) {
        t = this.scaleFactor_ * t;
        let k = Math.floor(t);
        t -= k;
        return (1 - t) *
          this.getClippedInput_(k, samples) + t *
          this.getClippedInput_(k + 1, samples);
      }
    
      /**
       * @param {number} t The index to interpolate.
       * @param {Array|TypedArray} samples the original array.
       * @return {number} The interpolated value.
       */
      cubic(t, samples) {
        t = this.scaleFactor_ * t;
        let k = Math.floor(t);
        let m = [this.getTangent_(k, samples), this.getTangent_(k + 1, samples)];
        let p = [this.getClippedInput_(k, samples),
          this.getClippedInput_(k + 1, samples)];
        t -= k;
        let t2 = t * t;
        let t3 = t * t2;
        return (2 * t3 - 3 * t2 + 1) *
          p[0] + (t3 - 2 * t2 + t) *
          m[0] + (-2 * t3 + 3 * t2) *
          p[1] + (t3 - t2) * m[1];
      }
    
      /**
       * @param {number} t The index to interpolate.
       * @param {Array|TypedArray} samples the original array.
       * @return {number} The interpolated value.
       */
      sinc(t, samples) {
        t = this.scaleFactor_ * t;
        let k = Math.floor(t);
        let ref = k - this.sincFilterSize_ + 1;
        let ref1 = k + this.sincFilterSize_;
        let sum = 0;
        for (let n = ref; n <= ref1; n++) {
          sum += this.kernel_(t - n) * this.getClippedInput_(n, samples);
        }
        return sum;
      }
    
      /**
       * @param {number} k The scaled index to interpolate.
       * @param {Array|TypedArray} samples the original array.
       * @return {number} The tangent.
       * @private
       */
      getTangent_(k, samples) {
        return this.tangentFactor_ *
          (this.getClippedInput_(k + 1, samples) -
            this.getClippedInput_(k - 1, samples)) / 2;
      }
    
      /**
       * @param {number} t The scaled index to interpolate.
       * @param {Array|TypedArray} samples the original array.
       * @return {number} The interpolated value.
       * @private
       */
      getClippedInput_(t, samples) {
        if ((0 <= t && t < this.length_)) {
          return samples[t];
        }
        return 0;
      }
    }
    
    // Sinc functions
    
    /**
     * The default window function.
     * @param {number} x The sinc signal.
     * @return {number}
     * @private
     */
    const window_ = (x) => {
      return Math.exp(-x / 2 * x / 2);
    }
    
    /**
     * @param {Function} window The window function.
     * @return {Function}
     * @private
     */
    const sincKernel_ = (window) => {
      return function(x) { return sinc_(x) * window(x); };
    }
    
    /**
     * @param {number} x The sinc signal.
     * @return {number}
     * @private
     */
    const sinc_ = (x) => {
      if (x === 0) {
        return 1;
      }
      return Math.sin(Math.PI * x) / (Math.PI * x);
    }

    // ------------------------------------------------------------
    class FIRLPF {
  
      /**
       * @param {number} order The order of the filter.
       * @param {number} sampleRate The sample rate.
       * @param {number} cutOff The cut off frequency.
       */
      constructor(order, sampleRate, cutOff) {
        let omega = 2 * Math.PI * cutOff / sampleRate;
        let dc = 0;
        this.filters = [];
        for (let i = 0; i <= order; i++) {
          if (i - order / 2 === 0) {
            this.filters[i] = omega;
          } else {
            this.filters[i] = Math.sin(omega * (i - order / 2)) / (i - order / 2);
            // Hamming window
            this.filters[i] *= (0.54 - 0.46 * Math.cos(2 * Math.PI * i / order));
          }
          dc = dc + this.filters[i];
        }
        // normalize
        for (let i = 0; i <= order; i++) {
          this.filters[i] /= dc;
        }
        this.z = this.initZ_();
      }
    
      /**
       * @param {number} sample A sample of a sequence.
       * @return {number}
       */
      filter(sample) {
        this.z.buf[this.z.pointer] = sample;
        let out = 0;
        for (let i = 0, len = this.z.buf.length; i < len; i++) {
          out += (
            this.filters[i] * this.z.buf[(this.z.pointer + i) % this.z.buf.length]);
        }
        this.z.pointer = (this.z.pointer + 1) % (this.z.buf.length);
        return out;
      }
    
      /**
       * Reset the filter.
       */
      reset() {
        this.z = this.initZ_();
      }
    
      /**
       * Return the default value for z.
       * @private
       */
      initZ_() {
        let r = [];
        for (let i = 0; i < this.filters.length - 1; i++) {
          r.push(0);
        }
        return {
          buf: r,
          pointer: 0
        };
      }
    };
    // -----------------------------------------------------------------------------------------
    class ButterworthLPF {
  
      /**
       * @param {number} order The order of the filter.
       * @param {number} sampleRate The sample rate.
       * @param {number} cutOff The cut off frequency.
       */
      constructor(order, sampleRate, cutOff) {
        let filters = [];
        for (let i = 0; i < order; i++) {
          filters.push(this.getCoeffs_({
            Fs: sampleRate,
            Fc: cutOff,
            Q: 0.5 / (Math.sin((Math.PI / (order * 2)) * (i + 0.5)))
          }));
        }
        this.stages = [];
        for (let i = 0; i < filters.length; i++) {
          this.stages[i] = {
            b0 : filters[i].b[0],
            b1 : filters[i].b[1],
            b2 : filters[i].b[2],
            a1 : filters[i].a[0],
            a2 : filters[i].a[1],
            k : filters[i].k,
            z : [0, 0]
          };
        }
      }
    
      /**
       * @param {number} sample A sample of a sequence.
       * @return {number}
       */
      filter(sample) {
        let out = sample;
        for (let i = 0, len = this.stages.length; i < len; i++) {
          out = this.runStage_(i, out);
        }
        return out;
      }
    
      getCoeffs_(params) {
        let coeffs = {};
        coeffs.z = [0, 0];
        coeffs.a = [];
        coeffs.b = [];
        let p = this.preCalc_(params, coeffs);
        coeffs.k = 1;
        coeffs.b.push((1 - p.cw) / (2 * p.a0));
        coeffs.b.push(2 * coeffs.b[0]);
        coeffs.b.push(coeffs.b[0]);
        return coeffs;
      }
    
      preCalc_(params, coeffs) {
        let pre = {};
        let w = 2 * Math.PI * params.Fc / params.Fs;
        pre.alpha = Math.sin(w) / (2 * params.Q);
        pre.cw = Math.cos(w);
        pre.a0 = 1 + pre.alpha;
        coeffs.a0 = pre.a0;
        coeffs.a.push((-2 * pre.cw) / pre.a0);
        coeffs.k = 1;
        coeffs.a.push((1 - pre.alpha) / pre.a0);
        return pre;
      }
      
      runStage_(i, input) {
        let temp =
          input * this.stages[i].k - this.stages[i].a1 * this.stages[i].z[0] -
          this.stages[i].a2 * this.stages[i].z[1];
        let out =
          this.stages[i].b0 * temp + this.stages[i].b1 * this.stages[i].z[0] +
          this.stages[i].b2 * this.stages[i].z[1];
        this.stages[i].z[1] = this.stages[i].z[0];
        this.stages[i].z[0] = temp;
        return out;
      }
    
      /**
       * Reset the filter.
       */
      reset() {
        for (let i = 0; i < this.stages.length; i++) {
          this.stages[i].z = [0, 0];
        }
      }
    }


    /**
     * Configures wich resampling method uses LPF by default.
     * @private
     */
    const DEFAULT_LPF_USE = {
      'point': false,
      'linear': false,
      'cubic': true,
      'sinc': true
    };
    
    /**
     * The default orders for the LPF types.
     * @private
     */
    const DEFAULT_LPF_ORDER = {
      'IIR': 16,
      'FIR': 71
    };
    
    /**
     * The classes to use with each LPF type.
     * @private
     */
    const DEFAULT_LPF = {
      'IIR': ButterworthLPF,
      'FIR': FIRLPF
    };

    // 声波采样
    const resample = (samples, oldSampleRate, sampleRate, details={}) => {  
      // Make the new sample container
      let rate = ((sampleRate - oldSampleRate) / oldSampleRate) + 1;
      let newSamples = new Float64Array(samples.length * (rate));
      // Create the interpolator
      details.method = details.method || 'cubic';
      let interpolator = new Interpolator(
        samples.length,
        newSamples.length,
        {
          method: details.method,
          tension: details.tension || 0,
          sincFilterSize: details.sincFilterSize || 6,
          sincWindow: details.sincWindow || undefined
        });
      // Resample + LPF
      if (details.LPF === undefined) {
        details.LPF = DEFAULT_LPF_USE[details.method];
      } 
      if (details.LPF) {
        details.LPFType = details.LPFType || 'IIR';
        const LPF = DEFAULT_LPF[details.LPFType];
        // Upsampling
        if (sampleRate > oldSampleRate) {
          let filter = new LPF(
            details.LPFOrder || DEFAULT_LPF_ORDER[details.LPFType],
            sampleRate,
            (oldSampleRate / 2));
          upsample_(
            samples, newSamples, interpolator, filter);
        // Downsampling
        } else {
          let filter = new LPF(
            details.LPFOrder || DEFAULT_LPF_ORDER[details.LPFType],
            oldSampleRate,
            sampleRate / 2);
          downsample_(
            samples, newSamples, interpolator, filter);
        }
      // Resample, no LPF
      } else {
        resample_(samples, newSamples, interpolator);
      }
      return newSamples;
    }

    const shortTimeEnergy = (audioData) => {
      let sum = 0
      const energy = []
      const { length } = audioData
      for (let i = 0; i < length; i++) {
        sum += audioData[i] ** 2

        if ((i + 1) % 256 === 0) {
          energy.push(sum)
          sum = 0
        } else if (i === length - 1) {
          energy.push(sum)
        }
      }
      return energy
    };

    /**
     * Resample.
     * @param {!Array|!TypedArray} samples The original samples.
     * @param {!Float64Array} newSamples The container for the new samples.
     * @param {Object} interpolator The interpolator.
     * @private
     */
    const resample_ = (samples, newSamples, interpolator) => {
      // Resample
      for (let i = 0, len = newSamples.length; i < len; i++) {
        newSamples[i] = interpolator.interpolate(i, samples);
      }
    }

    /**
     * Upsample with LPF.
     * @param {!Array|!TypedArray} samples The original samples.
     * @param {!Float64Array} newSamples The container for the new samples.
     * @param {Object} interpolator The interpolator.
     * @param {Object} filter The LPF object.
     * @private
     */
    const upsample_ = (samples, newSamples, interpolator, filter) => {
      // Resample and filter
      for (let i = 0, len = newSamples.length; i < len; i++) {
        newSamples[i] = filter.filter(interpolator.interpolate(i, samples));
      }
      // Reverse filter
      filter.reset();
      for (let i = newSamples.length - 1; i >= 0; i--) {
        newSamples[i]  = filter.filter(newSamples[i]);
      }
    }

    /**
     * Downsample with LPF.
     * @param {!Array|!TypedArray} samples The original samples.
     * @param {!Float64Array} newSamples The container for the new samples.
     * @param {Object} interpolator The interpolator.
     * @param {Object} filter The LPF object.
     * @private
     */
    const downsample_ = (samples, newSamples, interpolator, filter) => {
      // Filter
      for (let i = 0, len = samples.length; i < len; i++) {
        samples[i]  = filter.filter(samples[i]);
      }
      // Reverse filter
      filter.reset();
      for (let i = samples.length - 1; i >= 0; i--) {
        samples[i]  = filter.filter(samples[i]);
      }
      // Resample
      resample_(samples, newSamples, interpolator);
    }


    // ----------------------------------------------------------------

    /**
     * 业务代码逻辑
     */
    // 合并数据
    const mergeArray = (list) => {
      const length = list.length * list[0].length
      const data = new Float32Array(length)
      let offset = 0
      for (let i = 0; i < list.length; i++) {
        data.set(list[i], offset)
        offset += list[i].length
      }
      return data
    }

    // 写入字节数据
    const writeUTFBytes = (view, offset, string) => {
      var lng = string.length
      for (let i = 0; i < lng; i++) {
        view.setUint8(offset + i, string.charCodeAt(i))
      }
    }

    // 创建 wav 的buffer
    const createWavBuffer = (audioData, sampleRate = 44100, channels = 1) => {
      // audioData = mergeArray(audioData)
      const WAV_HEAD_SIZE = 44
      const buffer = new ArrayBuffer(audioData.length * 2 + WAV_HEAD_SIZE)
      // 需要用一个view来操控buffer
      const view = new DataView(buffer)
      // 写入wav头部信息
      // RIFF chunk descriptor/identifier
      writeUTFBytes(view, 0, 'RIFF')
      // RIFF chunk length
      view.setUint32(4, 44 + audioData.length * 2, true)
      // RIFF type
      writeUTFBytes(view, 8, 'WAVE')
      // format chunk identifier
      // FMT sub-chunk
      writeUTFBytes(view, 12, 'fmt ')
      // format chunk length
      view.setUint32(16, 16, true)
      // sample format (raw)
      view.setUint16(20, 1, true)
      // stereo (2 channels)
      view.setUint16(22, channels, true)
      // sample rate
      view.setUint32(24, sampleRate, true)
      // byte rate (sample rate * block align)
      view.setUint32(28, sampleRate * 2, true)
      // block align (channel count * bytes per sample)
      view.setUint16(32, channels * 2, true)
      // bits per sample
      view.setUint16(34, 16, true)
      // data sub-chunk
      // data chunk identifier
      writeUTFBytes(view, 36, 'data')
      // data chunk length
      view.setUint32(40, audioData.length * 2, true)

      // 写入PCM数据
      let index = 44
      const volume = 1
      const { length } = audioData
      for (let i = 0; i < length; i++) {
        view.setInt16(index, audioData[i] * (0x7fff * volume), true)
        index += 2
      }
      return buffer
    };

  
    if (type === 'short-energy') {
      self.postMessage(shortTimeEnergy(mergeArray(audioBuffers)));
    };
  
    if (type === 'wav') {
      const smaples = resample(
        mergeArray(audioBuffers),
        inputSampleRate,
        outputSampleRate,
      );
  
      self.postMessage(createWavBuffer(smaples, outputSampleRate))
    }
  })
}

// 由于Web Worker 同源策略限制，需要 worker 代码转化为 二进制脚本
// 将 workerScriptWrapper
// 转字符串
const workerBlobUrl = () => {

  console.log(workerScriptWrapper)
  const workerScriptWrapperStr = workerScriptWrapper.toString();

  const workerCode = workerScriptWrapperStr.substring(workerScriptWrapperStr.indexOf("{") + 1, workerScriptWrapperStr.lastIndexOf("}"));

  // 将字符串转 blob url
  const blob = new Blob([workerCode], { type: "application/javascript" });

  console.log(blob)

  const blobUrl = URL.createObjectURL(blob);

  console.log(blobUrl);

  return blobUrl;
}


// -----------------------------

class CoolRecorder {
  constructor() {
    this.inited = false
    this.jsNode = null
    this.mediaNode = null
    this.mediaStream = null
    this.audioContext = null
    this.audioBuffers = null
    this.onAudioProcess = null
    this.inputSampleRate = null
    this.outputSampleRate = null

    const unloadCB = window.onbeforeunload

    window.onbeforeunload = () => {
      this.destory()
      if (unloadCB) return unloadCB()
    }
  }

  static instance = new CoolRecorder()

  async init(reinit) {
    if (this.inited && !reinit) return
    this.inited = true

    this.logEnv()
    CoolPatch();
    if (!this.support()) throw new Error('not_support')

    const mediaStream = await window.navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 44100, // 采样率
        channelCount: 1, // 声道
        echoCancellation: true,
        noiseSuppression: true,
      },
    })
    if (!mediaStream) throw new Error('stream open fail')
    this.mediaStream = mediaStream
    return mediaStream
  }

  async initWorkers() {
    const blobUrl = await workerBlobUrl()

    if (this.workerToInt16) return
    this.workerToInt16 = new Worker(blobUrl)
    this.workerToMP3 = new Worker(blobUrl)
    this.workerToWAV = new Worker(blobUrl)
    // 为了并行
  }

  destory() {
    this.workerToInt16 && this.workerToInt16.terminate()
    this.workerToMP3 && this.workerToMP3.terminate()
    this.mediaStream && this.mediaStream.stop()
  }

  support() {
    const devices = navigator.mediaDevices || {}

    devices.getUserMedia =
      devices.getUserMedia ||
      devices.webkitGetUserMedia ||
      devices.mozGetUserMedia ||
      devices.msGetUserMedia

    return !!devices.getUserMedia && window.Worker
  }

  logEnv() {
    console.log(`recorder info:
    AudioContext: ${!!window.AudioContext}
    webkitAudioContext: ${!!window.webkitAudioContext}
    mediaDevices: ${!!navigator.mediaDevices}
    mediaDevices.getUserMedia: ${!!(
      navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    )}
    navigator.getUserMedia: ${!!navigator.getUserMedia}
    navigator.webkitGetUserMedia: ${!!navigator.webkitGetUserMedia}`)
  }

  async record() {
    await this.init()

    if (this.recording) return
    this.recording = true

    // 重置存储
    this.audioBuffers = []

    if (!this.mediaStream) await this.init(true)

    // 打开stream
    this.audioContext = new window.AudioContext()
    this.inputSampleRate = this.audioContext.sampleRate
    this.mediaNode = this.audioContext.createMediaStreamSource(this.mediaStream)

    if (!this.audioContext.createScriptProcessor) {
      this.audioContext.createScriptProcessor = this.audioContext.createJavaScriptNode
    }
    // 创建一个jsNode
    this.jsNode = this.audioContext.createScriptProcessor(4096, 1, 1)
    this.jsNode.connect(this.audioContext.destination)
    this.jsNode.onaudioprocess = this._onAudioProcess.bind(this)
    this.mediaNode.connect(this.jsNode)
  }

  stop() {
    if (this.recording) {
      this.jsNode.disconnect()
      this.mediaNode.disconnect()
      this.jsNode.onaudioprocess = null
      this.jsNode = null
      this.mediaNode = null
      this.recording = false
    }
    return this.audioBuffers
  }

  // async toInt16(sampleRate = 16000, format = 'base64') {
  //   if (!this.workerToInt16) await this.initWorkers()

  //   return new Promise(resolve => {
  //     this.workerToInt16.postMessage({
  //       audioBuffers: this.audioBuffers,
  //       inputSampleRate: this.inputSampleRate,
  //       outputSampleRate: sampleRate,
  //       type: 'int16',
  //       format,
  //     })
  //     this.workerToInt16.onmessage = event => resolve(event.data)
  //   })
  // }

  // async toMP3(sampleRate = 16000) {
  //   if (!this.workerToMP3) await this.initWorkers()

  //   return new Promise(resolve => {
  //     this.workerToMP3.postMessage({
  //       audioBuffers: this.audioBuffers,
  //       inputSampleRate: this.inputSampleRate,
  //       outputSampleRate: sampleRate,
  //       type: 'mp3',
  //     })
  //     this.workerToMP3.onmessage = event => resolve(event.data)
  //   })
  // }

  async toWAV(sampleRate = 16000) {
    if (!this.workerToWAV) await this.initWorkers()

    return new Promise(resolve => {
      this.workerToWAV.postMessage({
        audioBuffers: this.audioBuffers,
        inputSampleRate: this.inputSampleRate,
        outputSampleRate: sampleRate,
        type: 'wav',
      })
      this.workerToWAV.onmessage = event => resolve(event.data)
    })
  }

  async toShortEnergy() {
    const blobUrl = await workerBlobUrl();
    const worker = new Worker(blobUrl)

    return new Promise(resolve => {
      worker.postMessage({
        audioBuffers: this.audioBuffers,
        type: 'short-energy',
      })
      worker.onmessage = event => resolve(event.data)
    })
  }

  _onAudioProcess(e) {
    const audioBuffer = e.inputBuffer
    this.audioBuffers.push(audioBuffer.getChannelData(0).slice(0))

    this.onAudioProcess && this.onAudioProcess(e)
  }
}

export default CoolRecorder