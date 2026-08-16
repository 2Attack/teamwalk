import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Next generates AI-agent instruction files on its own; the repo doesn't need
  // them — the project's source of truth is docs/CONTRACT.md.
  agentRules: false,

  // Avatars and sprites are immutable: file name = version, no reason to change them.
  async headers() {
    return [
      {
        source: '/:dir(avatars|sprites)/:file*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
