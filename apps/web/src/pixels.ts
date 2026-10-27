export function normalizePixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  channels: number
) {
  if (
    !Number.isInteger(width) || !Number.isInteger(height) ||
    width < 1 || height < 1 || width > 128 || height > 128 ||
    ![1,3].includes(channels) || rgba.length !== width*height*4
  ) {
    throw new Error("Dimensiones, canales o píxeles inválidos.");
  }

  const values = new Float32Array(width*height*channels);
  const preview = new Uint8ClampedArray(rgba.length);
  let minimum=1, maximum=0, sum=0;

  for(let pixel=0;pixel<width*height;pixel++) {
    const offset=pixel*4;
    const alpha=rgba[offset+3]/255;

    const red=rgba[offset]*alpha;
    const green=rgba[offset+1]*alpha;
    const blue=rgba[offset+2]*alpha;
    const grey=.299*red+.587*green+.114*blue;

    for(let channel=0;channel<channels;channel++) {
      const raw=channels===1 ? grey : channel===0 ? red : channel===1 ? green : blue;
      const index=pixel*channels+channel;
      values[index]=Math.min(1,Math.max(0,raw/255));
      minimum=Math.min(minimum,values[index]);
      maximum=Math.max(maximum,values[index]);
      sum+=values[index];
    }

    preview[offset]=channels===1 ? grey : red;
    preview[offset+1]=channels===1 ? grey : green;
    preview[offset+2]=channels===1 ? grey : blue;
    preview[offset+3]=255;
  }

  return {values,preview,minimum,maximum,mean:sum/values.length};
}
