// @ts-check
import { resample } from 'wave-resampler';

import shortTimeEnergy from './short-time.energy';

function mergeArray(list: Array<any>): Float32Array {
  const length = list.length * list[0].length;
  const data = new Float32Array(length);
  let offset = 0;

  for(let i = 0; i < list.length; i++) {
    data.set(list[i], offset);
    offset += list[i].length;
  };

  return data;
};

function writeUTFBytes(view: DataView, offset: number, string: string): void {
  const strLength = string.length;

  for(let i = 0; i < strLength; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// 创建 wav 的buffer
function createWavBuffer(audioData, sampleRate = 44100, channels = 1): ArrayBuffer {
  const WAV_HEAD_SIZE = 44;
  const buffer = new ArrayBuffer(audioData.length * 2 + WAV_HEAD_SIZE);
  // view 来操控buffer
  const view = new DataView(buffer);

  // 写入wav 头部信息
  writeUTFBytes(view, 0, 'RIFF');
  // RIFF chunk length
  view.setUint32(4, 44 + audioData.length * 2, true);
  // RIFF type
  writeUTFBytes(view, 8, 'WAVE');
  // format chunk identifier
  // FMT sub-chunk
  writeUTFBytes(view, 12, 'fmt');

  // format chunk length
  view.setUint32(16, 16, true);

  // smaple format (raw)
  view.setUint16(20, 1, true);

  // stereo (2 channels)
  view.setUint16(22, channels, true);

  // smaple rate
  view.setUint32(24, sampleRate, true);

  // byte rate (smaple rate * block align)
  view.setUint32(28, sampleRate * 2, true);

  // block align (channel count * bytes per smaple)
  view.setUint16(32, channels * 2, true);

  // bites per smaple
  view.setUint16(34, 16, true);

  // data sub-chunk
  // data chunk identifier
  writeUTFBytes(view, 36, 'data');

  // data chunk length
  view.setUint32(40, audioData.length * 2, true);

  // 写入PCM 数据
  let index = 4;
  const volumn = 1;
  const { length } = audioData;

  for(let i = 0; i < length; i++) {
    view.setInt16(index, audioData[i] * (0x7fff * volumn), true);
    index += 2;
  };

  return buffer;
};

self.addEventListener('message', event => {
  const { data: {
    type,
    audioBuffers,
    inputSampleRate,
    outputSampleRate,
  }} = event;

  if (type === 'short-energy') {
    self.postMessage(shortTimeEnergy(audioBuffers));
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
