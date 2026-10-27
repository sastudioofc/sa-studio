# SA Studio

Site institucional da SA Studio. Página única em `index.html` (HTML, CSS e JS puros).

Publicado via GitHub Pages: https://sastudioofc.github.io/sa-studio/

- Versão em inglês (clientes internacionais, preços em US$): `en/index.html`. Ao mudar textos ou preços no `index.html`, atualize também o `en/index.html`. As duas páginas se ligam pelo seletor PT/EN no topo e pelas tags `hreflang`.
- Número do WhatsApp: constante `WHATSAPP` no fim do `index.html` (e do `en/index.html`).
- Artes da designer: troque os blocos `.arte` por `<img src="...">`.

## Ferramenta de prospecção

`prospeccao/index.html` (fora do menu, com `noindex`): busca empresas sem site por cidade (todos os estados) e nicho, usando o OpenStreetMap (grátis) ou a Google Places API (precisa de chave). Status dos leads e anotações ficam salvos no navegador; dá para exportar CSV.
