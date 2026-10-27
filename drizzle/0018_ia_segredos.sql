-- 0018_ia_segredos.sql: guarda preferências de IA e chaves criptografadas (AES-256-GCM)
-- para permitir uso híbrido (CLI local no Mac + OpenRouter/Cloud online) sem acessar painel da Vercel.

alter table user_setting
  add column if not exists ia_provedor text not null default 'openrouter',
  add column if not exists ia_chaves_encrypted text,
  add column if not exists ia_modo text not null default 'auto';
