import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Файлы-инструкции для ИИ-агентов Next генерирует сам; в репозитории они не нужны —
  // источник истины по проекту это CitrusWalk_TZ.md и docs/CONTRACT.md.
  agentRules: false,

  // Аватары и спрайты неизменяемы: имя файла = версия, менять их незачем.
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
