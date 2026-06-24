import { Client } from "@notionhq/client";
import { writeFileSync, mkdirSync } from "fs";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.DATABASE_ID;
const siteBaseUrl = process.env.SITE_BASE_URL || "https://paulo-leads.github.io/noticias-hidra";
const siteTitle = process.env.SITE_TITLE || "Leitura do Mercado | Paulo Leads";

// Debug: Check environment variables
console.log("=== DEBUG INFO ===");
console.log("NOTION_TOKEN:", process.env.NOTION_TOKEN ? "✓ Set" : "✗ Missing");
console.log("DATABASE_ID:", process.env.DATABASE_ID ? "✓ Set" : "✗ Missing");
console.log("SITE_BASE_URL:", siteBaseUrl);
console.log("SITE_TITLE:", siteTitle);
console.log("==================");

if (!process.env.NOTION_TOKEN || !process.env.DATABASE_ID) {
  console.error("❌ ERROR: NOTION_TOKEN or DATABASE_ID not set!");
  process.exit(1);
}

function plainTextFromTitle(prop) {
  return (prop?.title || []).map(t => t.plain_text).join("").trim();
}

function plainTextFromRichText(prop) {
  return (prop?.rich_text || []).map(t => t.plain_text).join("").trim();
}

function urlFromUrl(prop) {
  return prop?.url || "";
}

function getProp(props, possibleNames) {
  for (const name of possibleNames) {
    if (props[name]) return props[name];
  }
  return null;
}

function slugify(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function splitPipeText(value) {
  if (!value) return [];
  return value.split("|").map(s => s.trim()).filter(Boolean);
}

async function queryAllPages() {
  let results = [];
  let cursor = undefined;
  let pageCount = 0;
  
  console.log("🔄 Querying Notion database:", databaseId);
  
  while (true) {
    try {
      const res = await notion.databases.query({
        database_id: databaseId,
        start_cursor: cursor
      });
      pageCount += res.results.length;
      console.log(`📄 Retrieved ${res.results.length} pages (total: ${pageCount})`);
      
      results = results.concat(res.results);
      if (!res.has_more) break;
      cursor = res.next_cursor;
    } catch (error) {
      console.error("❌ ERROR querying Notion:", error.message);
      throw error;
    }
  }
  
  console.log(`✅ Total pages retrieved: ${pageCount}`);
  return results;
}

const pages = await queryAllPages();

if (pages.length) {
  console.log("=== COLUNAS ENCONTRADAS ===");
  console.log(Object.keys(pages[0].properties));
  console.log("===========================");
} else {
  console.warn("⚠️  WARNING: No pages found in database!");
}

const items = pages.map((p) => {
  const props = p.properties || {};

  const id = plainTextFromRichText(getProp(props, ["id", "ID"])) || slugify(plainTextFromTitle(getProp(props, ["titulo", "Título"]))) || p.id;
  const data = plainTextFromRichText(getProp(props, ["data", "Data"]));
  const titulo = plainTextFromTitle(getProp(props, ["titulo", "Título"])) || plainTextFromRichText(getProp(props, ["titulo", "Título"]));
  const url = urlFromUrl(getProp(props, ["url", "URL", "Link"]));
  const tema_principal = getProp(props, ["tema_principal", "Tema Principal"])?.select?.name || plainTextFromRichText(getProp(props, ["tema_principal", "Tema Principal"]));
  const resumo_noticia = plainTextFromRichText(getProp(props, ["resumo_noticia", "Resumo Notícia", "Resumo da Notícia"]));
  const comentario_paulo = plainTextFromRichText(getProp(props, ["comentario_paulo", "Comentário Paulo", "Comentario Paulo"]));
  const entidades = splitPipeText(plainTextFromRichText(getProp(props, ["entidades", "Entidades"])));
  const conceitos = splitPipeText(plainTextFromRichText(getProp(props, ["conceitos", "Conceitos"])));
  const tese_hidra = splitPipeText(plainTextFromRichText(getProp(props, ["tese_hidra", "Tese Hidra", "Tese Hidra Acionada"])));
  const framework_hidra = plainTextFromRichText(getProp(props, ["framework_hidra", "Framework Hidra"]));
  const relacoes_grafo = splitPipeText((plainTextFromRichText(getProp(props, ["relacoes_grafo", "Relações Grafo", "Relacoes Grafo"])) || "").replace(/\|\|/g, "|"));
  const tags_hidra = (getProp(props, ["tags_hidra", "Tags Hidra", "Tags"])?.multi_select || []).map((t) => t.name).length
    ? (getProp(props, ["tags_hidra", "Tags Hidra", "Tags"])?.multi_select || []).map((t) => t.name)
    : splitPipeText(plainTextFromRichText(getProp(props, ["tags_hidra", "Tags Hidra", "Tags"])));
  const nivel_impacto = getProp(props, ["nivel_impacto", "Nível Impacto", "Nivel Impacto"])?.select?.name || plainTextFromRichText(getProp(props, ["nivel_impacto", "Nível Impacto", "Nivel Impact"]));

  return {
    id,
    data,
    titulo,
    url,
    tema_principal,
    resumo_noticia,
    comentario_paulo,
    entidades,
    conceitos,
    tese_hidra,
    framework_hidra,
    relacoes_grafo,
    tags_hidra,
    nivel_impacto,
    slug: slugify(`${data}-${titulo}`),
    updated: p.last_edited_time
  };
}).filter((i) => i.titulo);

console.log(`📊 Parsed ${items.length} valid items`);

items.sort((a, b) => String(b.data).localeCompare(String(a.data)) || a.titulo.localeCompare(b.titulo));

const dateModified = items.length
  ? items.reduce((max, i) => (i.updated > max ? i.updated : max), items[0].updated)
  : new Date().toISOString();

mkdirSync("docs", { recursive: true });

const json = {
  site: siteTitle,
  inLanguage: "pt-BR",
  dateModified,
  total: items.length,
  items: items.map((i) => ({
    ...i,
    page_url: `${siteBaseUrl}#${i.slug}`
  }))
};
writeFileSync("docs/noticias.json", JSON.stringify(json, null, 2), "utf8");

const llms = [
  `Canonical-Source: ${siteBaseUrl}`,
  `Last-Modified: ${dateModified}`,
  `Language: pt-BR`,
  `Type: Market Intelligence Reading`,
  `Total: ${items.length}`,
  ``,
  `Entradas:`,
  ...items.map((i) => `- [${i.data}] ${i.titulo}: ${i.resumo_noticia}`)
].join("\n");
writeFileSync("docs/llms.txt", llms + "\n", "utf8");

const lastmodDate = dateModified.split("T")[0];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteBaseUrl}</loc>
    <lastmod>${lastmodDate}</lastmod>
  </url>
</urlset>`;
writeFileSync("docs/sitemap.xml", sitemap, "utf8");

const cardsJson = JSON.stringify(items).replace(/</g, "\\u003c");
const indexHtml = `<!DOCTYPE html>
<html lang="pt-BR" class="scroll-smooth">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${siteTitle}</title>
  <meta name="description" content="Leitura do Mercado da Paulo Leads: análises estratégicas de notícias conectadas ao Protocolo Hidra.">
  <link rel="canonical" href="${siteBaseUrl}" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { 'sans': ['Montserrat', 'system-ui', 'sans-serif'], 'mono': ['JetBrains Mono', 'monospace'] },
          colors: {
            'brand': { DEFAULT: '#ea580c', dark: '#c2410c', light: '#f97316' },
            'navy': { '900': '#0a1628', '800': '#0d1d35', '700': '#102540' },
            'burned': { '500': '#f59e0b', '600': '#d97706', '700': '#b45309' }
          }
        }
      }
    }
  <\/script>
  <style>
    body { background: #0a1628; color: #e5e5e5; }
    .entry:target { border-color: #f59e0b; box-shadow: 0 0 0 1px #f59e0b; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: #0a1628; }
    ::-webkit-scrollbar-thumb { background: #d97706; border-radius: 3px; }
  </style>
</head>
<body class="font-sans antialiased">
  <nav class="fixed top-0 left-0 right-0 z-50 bg-navy-900/80 backdrop-blur-md border-b border-white/5">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16 gap-4">
        <a href="https://www.pauloleads.com.br" class="flex items-center gap-2 min-w-0">
          <span class="text-2xl font-black tracking-tight text-white">Paulo<span class="text-burned-600">Leads<\/span><\/span>
          <span class="hidden sm:inline-block text-[10px] uppercase tracking-[0.2em] text-gray-500 border border-gray-700 rounded px-2 py-0.5">Leitura do Mercado<\/span>
        <\/a>
        <a href="https://wa.me/5519982642481?text=Olá, vi a Leitura do Mercado e quero implementar o Protocolo Hidra" target="_blank" rel="noopener noreferrer" class="px-4 py-2 bg-brand hover:bg-brand-dark text-white font-semibold rounded-lg transition-colors">Fale conosco<\/a>
      <\/div>
    <\/div>
  <\/nav>
  <main class="pt-28 pb-16">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-12">
        <div class="inline-flex items-center gap-2 bg-burned-600/10 border border-burned-600/25 rounded-full px-4 py-1.5 text-xs font-semibold text-burned-500 uppercase tracking-wider mb-6">
          <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"><\/span> Inteligência de Mercado • Atualizado ${lastmodDate}
        <\/div>
        <h1 class="text-4xl sm:text-5xl font-black text-white leading-tight mb-4">Leitura do <span class="text-burned-500">Mercado<\/span><\/h1>
        <p class="text-lg text-gray-400 max-w-3xl mx-auto">Análises estratégicas de notícias transformadas em ativos semânticos proprietários, conectadas ao Protocolo Hidra e à infraestrutura comercial.<\/p>
      <\/div>
      <div class="mb-8">
        <input type="text" id="search" placeholder="Buscar por título, tese, framework, entidades, conceitos ou tags…" class="w-full px-5 py-4 bg-navy-800 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-burned-600/50">
      <\/div>
      <div class="flex items-center justify-between text-xs text-gray-500 mb-8 pb-4 border-b border-white/5 flex-wrap gap-2">
        <span>Total de análises: ${items.length}<\/span>
        <div class="flex gap-4">
          <a href="./llms.txt" class="hover:text-burned-500 transition-colors">llms.txt<\/a>
          <a href="./noticias.json" class="hover:text-burned-500 transition-colors">API JSON<\/a>
          <a href="./sitemap.xml" class="hover:text-burned-500 transition-colors">Sitemap<\/a>
        <\/div>
      <\/div>
      <div id="entries" class="space-y-5"><\/div>
    <\/div>
  <\/main>
  <footer class="border-t border-white/5 py-8 text-center text-xs text-gray-600">
    <p>Protocolo Hidra © 2026 • Paulo Leads - Inteligência Comercial<\/p>
    <p class="mt-2">Base editorial publicada via Notion + GitHub Actions<\/p>
  <\/footer>
  <script>
    const entries = ${cardsJson};
    const entriesEl = document.getElementById('entries');
    const searchEl = document.getElementById('search');

    function badge(text, extra = '') {
      return '<span class="text-[10px] bg-navy-700 px-2 py-1 rounded-full text-gray-300 border border-white/5 ' + extra + '">' + text + '<\/span>';
    }

    function render(filter = '') {
      const f = filter.toLowerCase();
      const filtered = entries.filter(e => {
        const blob = [
          e.titulo,
          e.tema_principal,
          e.resumo_noticia,
          e.comentario_paulo,
          ...(e.entidades || []),
          ...(e.conceitos || []),
          ...(e.tese_hidra || []),
          e.framework_hidra,
          ...(e.tags_hidra || []),
          e.nivel_impacto
        ].join(' ').toLowerCase();
        return blob.includes(f);
      });

      entriesEl.innerHTML = filtered.map(e =>
        '<article class="entry bg-navy-800/40 border border-white/5 rounded-xl p-6 hover:border-burned-600/30 transition-all" id="' + e.slug + '">' +
          '<div class="flex items-start justify-between gap-3 flex-wrap mb-3">' +
            '<div>' +
              '<div class="text-xs uppercase tracking-wider text-gray-500 mb-2">' + (e.data || "Sem data") + ' • ' + (e.tema_principal || "Sem tema") + '<\/div>' +
              '<h2 class="text-2xl font-bold text-white leading-tight">' + e.titulo + '<\/h2>' +
            '<\/div>' +
            (e.nivel_impacto ? '<span class="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-burned-600/15 border border-burned-600/30 text-burned-500">' + e.nivel_impacto + '<\/span>' : '') +
          '<\/div>' +
          (e.resumo_noticia ? '<p class="text-gray-300 mb-4 leading-relaxed">' + e.resumo_noticia + '<\/p>' : '') +
          '<div class="grid md:grid-cols-2 gap-4 mb-4 text-sm">' +
            '<div>' +
              '<div class="text-xs uppercase tracking-wider text-gray-500 mb-2">Teses Hidra<\/div>' +
              '<div class="flex flex-wrap gap-2">' + ((e.tese_hidra || []).map(t => badge(t)).join("") || badge("Não informado")) + '<\/div>' +
            '<\/div>' +
            '<div>' +
              '<div class="text-xs uppercase tracking-wider text-gray-500 mb-2">Framework<\/div>' +
              '<div class="flex flex-wrap gap-2">' + (e.framework_hidra ? badge(e.framework_hidra) : badge("Não informado")) + '<\/div>' +
            '<\/div>' +
          '<\/div>' +
          (e.comentario_paulo ? '<div class="mb-4"><div class="text-xs uppercase tracking-wider text-gray-500 mb-2">Comentário Paulo<\/div><p class="text-gray-300 leading-relaxed">' + e.comentario_paulo + '<\/p><\/div>' : '') +
          '<div class="grid md:grid-cols-2 gap-4 mb-4 text-sm">' +
            '<div>' +
              '<div class="text-xs uppercase tracking-wider text-gray-500 mb-2">Entidades<\/div>' +
              '<div class="flex flex-wrap gap-2">' + ((e.entidades || []).map(x => badge(x)).join("") || badge("—")) + '<\/div>' +
            '<\/div>' +
            '<div>' +
              '<div class="text-xs uppercase tracking-wider text-gray-500 mb-2">Conceitos<\/div>' +
              '<div class="flex flex-wrap gap-2">' + ((e.conceitos || []).map(x => badge(x)).join("") || badge("—")) + '<\/div>' +
            '<\/div>' +
          '<\/div>' +
          '<div class="grid md:grid-cols-2 gap-4 mb-4 text-sm">' +
            '<div>' +
              '<div class="text-xs uppercase tracking-wider text-gray-500 mb-2">Tags Hidra<\/div>' +
              '<div class="flex flex-wrap gap-2">' + ((e.tags_hidra || []).map(x => badge(x)).join("") || badge("—")) + '<\/div>' +
            '<\/div>' +
            '<div>' +
              '<div class="text-xs uppercase tracking-wider text-gray-500 mb-2">Relações de Grafo<\/div>' +
              '<div class="space-y-2">' + ((e.relacoes_grafo || []).map(r => '<div class="font-mono text-xs text-gray-400 break-all bg-navy-900/40 border border-white/5 rounded px-3 py-2">' + r + '<\/div>').join("") || '<div class="text-gray-500">—<\/div>') + '<\/div>' +
            '<\/div>' +
          '<\/div>' +
          '<div class="flex items-center justify-between gap-4 flex-wrap pt-4 border-t border-white/5">' +
            '<div class="text-xs text-gray-500">ID: <span class="font-mono">' + e.id + '<\/span><\/div>' +
            '<div class="flex items-center gap-4">' +
              '<a href="#' + e.slug + '" class="text-sm text-burned-500 hover:text-burned-400">Link direto<\/a>' +
              (e.url ? '<a href="' + e.url + '" target="_blank" rel="noopener noreferrer" class="text-sm text-white hover:text-burned-400">Fonte original<\/a>' : '') +
            '<\/div>' +
          '<\/div>' +
        '<\/article>'
      ).join('');
    }

    searchEl.addEventListener('input', e => render(e.target.value));
    render();
    if (window.location.hash) {
      setTimeout(() => document.querySelector(window.location.hash)?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  <\/script>
</body>
</html>`;

writeFileSync("docs/index.html", indexHtml, "utf8");

console.log(`✅ Notícias atualizadas com ${items.length} entradas. Data: ${dateModified}`);
