# noticias-hidra

Site estático da base **Leitura do Mercado** da Paulo Leads, alimentado por uma database do Notion e publicado via GitHub Pages.

## Variáveis

Copie `.env.example` para `.env` localmente ou configure os secrets no GitHub:

- `NOTION_TOKEN`
- `DATABASE_ID`
- `SITE_BASE_URL`
- `SITE_TITLE`

## Desenvolvimento

```bash
npm install
npm run build
```

## Publicação

O workflow em `.github/workflows/update-noticias.yml` consulta o Notion, gera os arquivos estáticos em `docs/` e faz commit automático.
