const { execSync } = require('child_process');
const fs = require('fs');
execSync('ffmpeg -y -f lavfi -i aevalsrc="sin(400*2*PI*t)" -t 20 test-20s.wav');
execSync('ffmpeg -y -i test-20s.wav -f segment -segment_time 7 -c copy test-20s_chunk_%03d.wav');
console.log(fs.readdirSync('.').filter(f => f.startsWith('test-20s')));
