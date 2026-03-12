/**
 * Smoke Test Configuration
 * 
 * Loads test credentials from environment variables.
 * Copy .env.smoke to .env and configure your credentials.
 */

export interface TestCredentials {
  embeddings: {
    apiKey: string;
    endpoint: string;
    model: string;
  };
  provider: {
    type: 'deepseek';
    apiKey: string;
    model: string;
  };
  channel: {
    type: 'telegram';
    botToken: string;
  };
}

// Load credentials from environment variables
function loadCredentials(): TestCredentials {
  const embeddings = {
    apiKey: process.env.EMBEDDINGS_API_KEY || '',
    endpoint: process.env.EMBEDDINGS_ENDPOINT || 'https://api.maiarouter.ai/v1/embeddings',
    model: process.env.EMBEDDINGS_MODEL || 'openai/text-embedding-3-small',
  };

  const provider = {
    type: 'deepseek' as const,
    apiKey: process.env.PROVIDER_API_KEY || '',
    model: process.env.PROVIDER_MODEL || 'deepseek-chat',
  };

  const channel = {
    type: 'telegram' as const,
    botToken: process.env.CHANNEL_BOT_TOKEN || '',
  };

  // Validate that required credentials are present
  const missing: string[] = [];
  
  if (!embeddings.apiKey) missing.push('EMBEDDINGS_API_KEY');
  if (!provider.apiKey) missing.push('PROVIDER_API_KEY');
  if (!channel.botToken) missing.push('CHANNEL_BOT_TOKEN');

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\n   Copy .env.smoke to .env and configure your credentials.');
    console.error('   Or set the environment variables before running tests.\n');
    process.exit(1);
  }

  return { embeddings, provider, channel };
}

// Test credentials loaded from environment
export const testCredentials: TestCredentials = loadCredentials();

// Test configuration
export const testConfig = {
  timeout: 30000, // 30 seconds timeout for API calls
  retries: 2,
  chatId: process.env.TELEGRAM_CHAT_ID, // Optional: for testing chat actions
};
