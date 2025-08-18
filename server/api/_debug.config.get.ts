import { defineEventHandler } from 'h3';
import { useRuntimeConfig } from '#imports';
export default defineEventHandler(() => {
  const { public: { apiBase } } = useRuntimeConfig();
  return { apiBase, nodeEnv: process.env.NODE_ENV };
});