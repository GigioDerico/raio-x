/**
 * Respostas do Pluggy no formato da documentação (docs.pluggy.ai), com os
 * campos que o app NÃO pode guardar preenchidos de propósito — o teste de
 * vazamento procura esses valores no que os mapeadores devolvem.
 */
import type { ContaPluggy, FaturaPluggy, TransacaoPluggy } from '../src/lib/pluggy/mapear';

export const NOME_TITULAR = 'FULANO DE TAL DA SILVA';
export const CPF_TITULAR = '123.456.789-00';
export const CNPJ_LOJA = '14.380.200/0001-21';

export const CONTA_CARTAO: ContaPluggy = {
  id: 'pa-cartao',
  type: 'CREDIT',
  subtype: 'CREDIT_CARD',
  number: '1111',
  name: 'ITAU UNICLASS',
  marketingName: 'Itaú Uniclass Visa',
  balance: 1234.5,
  owner: NOME_TITULAR,
  taxNumber: CPF_TITULAR,
  creditData: { creditLimit: 8000 },
};

export const CONTA_CORRENTE: ContaPluggy = {
  id: 'pa-corrente',
  type: 'BANK',
  subtype: 'CHECKING_ACCOUNT',
  number: '0001/12345-6',
  name: 'Conta Corrente',
  marketingName: null,
  balance: 9876.54,
  owner: NOME_TITULAR,
  taxNumber: CPF_TITULAR,
  creditData: null,
};

export const tx = (o: Partial<TransacaoPluggy> = {}): TransacaoPluggy => ({
  id: 'pt-1',
  description: 'IFOOD RESTAURANTE',
  descriptionRaw: 'IFOOD *RESTAURANTE',
  amount: 120,
  date: '2026-04-10T15:00:00.000Z',
  status: 'POSTED',
  type: 'DEBIT',
  operationType: null,
  creditCardMetadata: { billId: 'bill-05' },
  paymentData: { payer: { name: NOME_TITULAR, documentNumber: { value: CPF_TITULAR } } },
  merchant: { name: 'IFOOD', cnpj: CNPJ_LOJA },
  ...o,
});

export const BILL: FaturaPluggy = { id: 'bill-05', dueDate: '2026-05-10T00:00:00.000Z', totalAmount: 2345.67 };
