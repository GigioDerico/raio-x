/**
 * Extração de texto do PDF — roda NO NAVEGADOR, de propósito.
 *
 * O arquivo da fatura nunca sobe: só o texto vai para o servidor, e de lá para
 * o modelo. Isso mantém o PDF fora da infraestrutura e ainda foge do limite de
 * tamanho de requisição da Vercel.
 *
 * A biblioteca é importada dinamicamente para não entrar no bundle do servidor.
 */
import { ErroLocal } from './falha';

export class PdfComSenha extends Error {
  constructor() {
    super('o PDF está protegido por senha');
    this.name = 'PdfComSenha';
  }
}

export async function extrairTexto(arquivo: File, senha?: string): Promise<string> {
  try {
    return await ler(arquivo, senha);
  } catch (e) {
    if (e instanceof PdfComSenha || e instanceof ErroLocal) throw e;
    // página ilegível ou o pdf.js que não carregou: quem importa precisa saber
    // que o problema é o arquivo (ou a página), não "o servidor"
    console.error('falha ao ler o PDF', e);
    throw new ErroLocal('Não consegui ler este PDF. Recarregue a página e tente de novo; se repetir, confira o arquivo.');
  }
}

async function ler(arquivo: File, senha?: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const buf = await arquivo.arrayBuffer();

  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(buf),
      password: senha || undefined,
      isEvalSupported: false,
    }).promise;
  } catch (e) {
    const nome = (e as { name?: string })?.name ?? '';
    const msg = (e as { message?: string })?.message ?? '';
    if (nome === 'PasswordException' || /password/i.test(msg)) throw new PdfComSenha();
    // o texto do pdf.js é de máquina e em inglês: vai para o console, não para a tela
    console.error('pdf.js não abriu o arquivo', e);
    throw new ErroLocal('Não consegui abrir este PDF. Confira se o arquivo é a fatura em PDF e não está corrompido.');
  }

  let texto = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p);
    const conteudo = await pagina.getTextContent();

    // o PDF entrega fragmentos soltos; a coordenada Y é o que remonta as linhas
    let ultimoY: number | null = null;
    let linha = '';
    for (const item of conteudo.items) {
      if (!('str' in item)) continue;
      const y = Array.isArray(item.transform) ? Math.round(Number(item.transform[5])) : null;
      if (ultimoY !== null && y !== null && Math.abs(y - ultimoY) > 3) {
        texto += `${linha.replace(/\s+/g, ' ').trim()}\n`;
        linha = '';
      }
      linha += `${item.str} `;
      if (y !== null) ultimoY = y;
    }
    texto += `${linha.replace(/\s+/g, ' ').trim()}\n`;
  }

  await doc.destroy();
  return texto;
}
