const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

async function test() {
  await execAsync('ffmpeg -y -f lavfi -i "aevalsrc=sin(400*2*PI*t):d=3,apad=pad_dur=2,aevalsrc=sin(400*2*PI*t):d=3" -t 8 full.wav');
  try {
     const { stderr } = await execAsync('ffmpeg -i full.wav -af silencedetect=noise=-30dB:d=1 -f null -');
     console.log(stderr);
  } catch(e) {
     console.log(e.stderr);
  }
}
test();
