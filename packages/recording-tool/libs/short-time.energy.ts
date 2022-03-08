export default function shortTimeEnergy(audioData: unknown[]) {
  let sum = 0;
  const energy = [];
  const { length } = audioData;

  for(let i = 0; i < length; i++) {
    // @ts-ignore
    sum += audioData[i] ** 2;

    if ((i + 1) % 256 === 0) {
      energy.push(sum);
      sum = 0;
    } else if (i === length - 1) {
      energy.push(sum);
    }
  }

  return energy;
}