const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);
const { Readable } = require('stream');
const fs = require('fs');

/**
 * Node.js 端音频转换函数
 * @param {Buffer} inputBuffer - 原始音频 Buffer
 * @returns {Promise<Buffer>} - 转换后的 WAV Buffer
 */
function convertAudioNode(inputBuffer) {
    return new Promise((resolve, reject) => {
        // 创建一个可读流，将 Buffer 喂给 ffmpeg
        const inputStream = new Readable();
        inputStream.push(inputBuffer);
        inputStream.push(null); // 结束流

        // 用于收集转换后的数据
        const chunks = [];

        ffmpeg(inputStream)
            // .inputFormat('wav') // 让 ffmpeg 自动探测格式
            .audioChannels(1)           // 1. 单声道
            .audioFrequency(16000)      // 2. 16000Hz 采样率
            // ffmpeg 默认输出 wav pcm_s16le (16-bit) 
            .audioCodec('pcm_s16le')    // 3. 16-bit 深度
            .format('wav')
            .on('error', (err) => reject(err))
            .on('end', () => {
                // 合并所有数据块为一个 Buffer
                const outputBuffer = Buffer.concat(chunks);
                resolve(outputBuffer);
            })
            // 将处理后的流通过 pipe 导出来
            .stream(new (require('stream').PassThrough)(), { end: true })
            .on('data', (chunk) => {
                chunks.push(chunk);
            });
    });
}

module.exports = { convertAudioNode };