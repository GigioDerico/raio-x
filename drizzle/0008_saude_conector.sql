-- Saúde do conector do Pluggy ('ONLINE' | 'UNSTABLE' | 'OFFLINE'), gravada sempre
-- que o app fala com o Pluggy: separa "o banco está fora" de "sua conexão quebrou"
-- sem a tela precisar chamar a API a cada visita.
alter table connection add column if not exists saude_conector text;
