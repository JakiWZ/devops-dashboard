import { Writable } from 'node:stream';
import { pino } from 'pino';
import { redact } from './logger.js';

function capture(entry: object): string {
  let output = '';
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  pino({ redact }, stream).info(entry, 'request');
  return output;
}

describe('logger redaction', () => {
  it('hides access tokens, refresh cookies and AI keys', () => {
    const output = capture({
      req: { headers: { authorization: 'Bearer secret-token', cookie: 'refresh_token=abc' } },
      res: { headers: { 'set-cookie': 'refresh_token=def' } },
      body: { apiKey: 'sk-secret' },
      request: { headers: { 'x-api-key': 'sk-ant-secret' } },
    });
    for (const secret of [
      'secret-token',
      'refresh_token=abc',
      'refresh_token=def',
      'sk-secret',
      'sk-ant-secret',
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain('[redacted]');
  });
});
