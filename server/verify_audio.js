const { convertAudioNode } = require('./audioHandler');
const fs = require('fs');
const path = require('path');

// Create a dummy WAV file for testing
const wavHeader = Buffer.alloc(44);
wavHeader.write('RIFF', 0);
wavHeader.writeUInt32LE(36, 4);
wavHeader.write('WAVE', 8);
wavHeader.write('fmt ', 12);
wavHeader.writeUInt32LE(16, 16);
wavHeader.writeUInt16LE(1, 20); // PCM
wavHeader.writeUInt16LE(1, 22); // Mono
wavHeader.writeUInt32LE(44100, 24); // 44.1kHz
wavHeader.writeUInt32LE(44100 * 2, 28);
wavHeader.writeUInt16LE(2, 32);
wavHeader.writeUInt16LE(16, 34);
wavHeader.write('data', 36);
wavHeader.writeUInt32LE(0, 40);

const dummyAudio = Buffer.concat([wavHeader, Buffer.alloc(1000)]);

async function testConversion() {
    try {
        console.log('Starting audio conversion test...');
        const outputBuffer = await convertAudioNode(dummyAudio);
        console.log('Conversion successful!');
        console.log('Output buffer size:', outputBuffer.length);

        // Basic check for WAV header in output
        if (outputBuffer.slice(0, 4).toString() === 'RIFF' &&
            outputBuffer.slice(8, 12).toString() === 'WAVE') {
            console.log('SUCCESS: Output is a valid WAV file.');
            process.exit(0);
        } else {
            console.error('FAILURE: Output is not a valid WAV file.');
            process.exit(1);
        }
    } catch (error) {
        console.error('Conversion failed:', error);
        process.exit(1);
    }
}

testConversion();
