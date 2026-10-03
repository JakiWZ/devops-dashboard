import { parseEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('AI defaults from the environment', () => {
  it('has no server default without a key', () => {
    expect(parseEnv(base).aiDefault).toBeNull();
  });

  it('still accepts the phase 4 Anthropic variables', () => {
    expect(parseEnv({ ...base, ANTHROPIC_API_KEY: 'sk-ant-1' }).aiDefault).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      apiKey: 'sk-ant-1',
    });
  });

  it('uses any catalog provider with AI_PROVIDER, AI_MODEL and AI_API_KEY', () => {
    const env = parseEnv({
      ...base,
      AI_PROVIDER: 'deepseek',
      AI_MODEL: 'deepseek-v4-pro',
      AI_API_KEY: 'sk-1',
      ANTHROPIC_API_KEY: 'sk-ant-ignored',
    });
    expect(env.aiDefault).toEqual({
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      apiKey: 'sk-1',
    });
  });

  it('requires AI_MODEL for providers other than Anthropic', () => {
    expect(() => parseEnv({ ...base, AI_PROVIDER: 'openai', AI_API_KEY: 'sk-1' })).toThrow(
      /AI_MODEL/,
    );
  });

  it('accepts the old name of the encryption key', () => {
    const key = Buffer.alloc(32, 1).toString('base64');
    expect(parseEnv({ ...base, GITHUB_TOKEN_ENC_KEY: key }).secretsKey).toBe(key);
  });
});
