const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

async function test() {
  await execAsync('ffmpeg -y -f lavfi -i aevalsrc="sin(400*2*PI*t)" -t 5 chunk1.wav');
  await execAsync('ffmpeg -y -f lavfi -i anullsrc -t 2 chunk2.wav');
  await execAsync('ffmpeg -y -f lavfi -i aevalsrc="sin(400*2*PI*t)" -t 5 chunk3.wav');
  await execAsync('ffmpeg -y -i "concat:chunk1.wav|chunk2.wav|chunk3.wav" -c copy full.wav');
  
  try {
     const { stderr } = await execAsync('ffmpeg -i full.wav -af silencedetect=noise=-30dB:d=1 -f null -');
     console.log(stderr);
  } catch(e) {
     console.log(e.stderr); // silencedetect prints to stderr and might "fail" or just exit normally.
  }
}
test();
