import type { PmNode } from '@ops/shared';
import type { SeedArticle } from './articles';
import { AMERICAS_BANKS, type BankEntry, type BankField, type BankLanguage } from './bank-americas';
import { a, b, callout, collapsible, demo, h, p, pre, table, ul } from './pm';

/** Field labels in the provider's language for the copy-ready request (English uses the label as is). */
const LABELS: Record<string, Partial<Record<BankLanguage, string>>> = {
  'Beneficiary full name': { es: 'Nombre completo del beneficiario', pt: 'Nome completo do beneficiário', fr: 'Nom complet du bénéficiaire', nl: 'Volledige naam van de begunstigde', da: 'Modtagerens fulde navn' },
  'Beneficiary address': { es: 'Dirección del beneficiario', pt: 'Endereço do beneficiário', fr: 'Adresse du bénéficiaire', nl: 'Adres van de begunstigde', da: 'Modtagerens adresse' },
  'Beneficiary account number': { es: 'Número de cuenta del beneficiario', pt: 'Número da conta do beneficiário', fr: 'Numéro de compte du bénéficiaire', nl: 'Rekeningnummer van de begunstigde', da: 'Modtagerens kontonummer' },
  'Bank name': { es: 'Nombre del banco', pt: 'Nome do banco', fr: 'Nom de la banque', nl: 'Naam van de bank', da: 'Bankens navn' },
  'SWIFT/BIC': { es: 'Código SWIFT/BIC', pt: 'Código SWIFT/BIC', fr: 'Code SWIFT/BIC', nl: 'SWIFT/BIC-code', da: 'SWIFT/BIC-kode' },
  'Bank address': { es: 'Dirección del banco', pt: 'Endereço do banco', fr: 'Adresse de la banque', nl: 'Adres van de bank', da: 'Bankens adresse' },
  'Purpose of payment': { es: 'Concepto del pago', pt: 'Finalidade do pagamento', fr: 'Motif du paiement', nl: 'Doel van de betaling', da: 'Formål med betalingen' },
  'Detailed purpose of payment': { es: 'Concepto detallado del pago', pt: 'Finalidade detalhada do pagamento', fr: 'Motif détaillé du paiement', nl: 'Gedetailleerd doel van de betaling' },
  'IBAN': { es: 'IBAN', pt: 'IBAN', fr: 'IBAN', da: 'IBAN' },
  'Beneficiary tax ID': { es: 'Número de identificación fiscal del beneficiario', nl: 'Fiscaal nummer van de begunstigde' },
  'Beneficiary contact name, phone and email': { es: 'Nombre, teléfono y correo electrónico de contacto del beneficiario', pt: 'Nome, telefone e e-mail de contato do beneficiário' },
  'Branch (agencia) number': { pt: 'Número da agência' },
  'CPF / CNPJ (beneficiary tax ID)': { pt: 'CPF / CNPJ do beneficiário' },
  'SEPA option': { fr: 'Virement SEPA en EUR accepté (oui / non)' },
  'CBU (Clave Bancaria Uniforme)': { es: 'CBU (Clave Bancaria Uniforme)' },
  'CUIT / CUIL (beneficiary tax ID)': { es: 'CUIT / CUIL del beneficiario' },
  'Beneficiary contact name and phone': { es: 'Nombre y teléfono de contacto del beneficiario' },
  'Account type': { es: 'Tipo de cuenta (corriente o de ahorros)' },
  'CVU (virtual wallet account)': { es: 'CVU (cuenta virtual)' },
  'RUT / RUN (beneficiary tax ID)': { es: 'RUT / RUN del beneficiario' },
  'NIT / Cedula (beneficiary tax ID)': { es: 'NIT / cédula del beneficiario' },
  'Cedula juridica / taxpayer ID': { es: 'Cédula jurídica / número de contribuyente' },
  'Country-specific fields': { es: 'Otros datos que exija su banco' },
  'RNC / Cedula (beneficiary tax ID)': { es: 'RNC / cédula del beneficiario' },
  'Cedula / RUC (beneficiary ID)': { es: 'Cédula / RUC del beneficiario' },
  'Beneficiary tax ID (NIT)': { es: 'NIT del beneficiario' },
  'NIT (beneficiary tax ID)': { es: 'NIT del beneficiario' },
  'CLABE': { es: 'CLABE (18 dígitos)' },
  'RUC / Cedula (beneficiary ID)': { es: 'RUC / cédula del beneficiario' },
  'RUC / CI (beneficiary tax ID)': { es: 'RUC / CI del beneficiario' },
  'CCI (Codigo de Cuenta Interbancario)': { es: 'CCI (Código de Cuenta Interbancario)' },
  'RUC / DNI / Carne de Extranjeria': { es: 'RUC / DNI / carné de extranjería' },
  'ABA routing number': { es: 'Número de ruta ABA (Fedwire)' },
  'Beneficiary ID': { es: 'Documento de identidad del beneficiario (CI o RUT)' },
  'Account number format': { es: 'Número de cuenta completo (formato local)' },
  'RIF / Cedula (beneficiary tax ID)': { es: 'RIF / cédula del beneficiario' },
  'Beneficiary phone and email': { es: 'Teléfono y correo electrónico del beneficiario' },
};

/** One polite request per language: greeting, ask, the field list, thanks. */
const LETTER: Record<BankLanguage, { open: string; ask: string; close: string; optional: string }> = {
  en: { open: 'Dear Sir or Madam,', ask: 'To pay your invoice by international bank transfer, please send us the following bank details:', close: 'Thank you for your help.\n\nKind regards,', optional: 'if available' },
  es: { open: 'Estimados señores:', ask: 'Para pagar su factura por transferencia bancaria internacional, les rogamos que nos envíen los siguientes datos bancarios:', close: 'Muchas gracias por su ayuda.\n\nAtentamente,', optional: 'si lo tiene' },
  pt: { open: 'Prezados senhores,', ask: 'Para pagarmos a sua fatura por transferência bancária internacional, pedimos a gentileza de nos enviar os seguintes dados bancários:', close: 'Muito obrigado pela sua ajuda.\n\nAtenciosamente,', optional: 'se houver' },
  fr: { open: 'Madame, Monsieur,', ask: 'Afin de régler votre facture par virement bancaire international, merci de bien vouloir nous communiquer les coordonnées bancaires suivantes :', close: 'Nous vous remercions de votre aide.\n\nCordialement,', optional: 'si disponible' },
  nl: { open: 'Geachte heer, mevrouw,', ask: 'Om uw factuur per internationale bankoverschrijving te betalen, vragen wij u ons de volgende bankgegevens te sturen:', close: 'Hartelijk dank voor uw hulp.\n\nMet vriendelijke groet,', optional: 'indien beschikbaar' },
  da: { open: 'Kære modtager,', ask: 'For at kunne betale jeres faktura via international bankoverførsel beder vi jer venligst sende os følgende bankoplysninger:', close: 'Mange tak for hjælpen.\n\nMed venlig hilsen,', optional: 'hvis muligt' },
};

/** Controller ruling (D2): sources conflict on IBAN vs account number here, so ask the provider for both. */
const ASK_BOTH = new Set(['Costa Rica', 'Dominican Republic', 'Honduras', 'Nicaragua', 'Saint Lucia']);
const BOTH_NOTE = 'Sources conflict: ask for both the IBAN and the account number.';
const UNCONFIRMED = 'Unconfirmed — ask if available';
const REQUIRED = { required: 'Required', recommended: 'Recommended', 'if available': 'If available' } as const;

const isOptional = (f: BankField) => f.confidence === 'unconfirmed' || f.required !== 'required';
const label = (f: BankField, lang: BankLanguage) => {
  const t = lang === 'en' ? f.label : LABELS[f.label]?.[lang];
  if (!t) throw new Error(`no ${lang} label for bank field "${f.label}"`);
  return t;
};

function note(e: BankEntry, f: BankField) {
  const parts = [f.note];
  if (f.confidence === 'unconfirmed' && !f.note) parts.push('Not confirmed by a bank source.');
  if (ASK_BOTH.has(e.name) && (f.label === 'IBAN' || f.label === 'Beneficiary account number')) parts.push(BOTH_NOTE);
  return parts.filter(Boolean).join(' ');
}

function request(e: BankEntry) {
  const l = LETTER[e.language];
  const lines = e.fields.map((f) => `- ${label(f, e.language)}${isOptional(f) ? ` (${l.optional})` : ''}:`);
  return [l.open, '', l.ask, '', ...lines, '', l.close].join('\n');
}

const THE = new Set(['United States', 'United Kingdom', 'Netherlands']);
const title = (e: BankEntry) => (e.kind === 'territory' ? `${e.name} (territory of ${THE.has(e.sovereign!) ? 'the ' : ''}${e.sovereign})` : e.name);

function section(e: BankEntry): PmNode {
  const links = e.sources.flatMap((s, i) => [...(i ? [', '] : []), a(new URL(s).hostname, s)]);
  return collapsible(title(e),
    p(b('Language: '), e.languageName, '. ', b('Currency: '), e.currency, '.'),
    table(['Field', 'Format', 'Required', 'Notes'],
      ...e.fields.map((f) => [f.label, f.format || '—', f.confidence === 'unconfirmed' ? UNCONFIRMED : REQUIRED[f.required], note(e, f) || '—'])),
    h(4, 'Request to send the provider'),
    pre('text', request(e)),
    ...(e.notes.length ? [h(4, 'Notes and common rejection reasons'), ul(...e.notes)] : []),
    p(b('Sources: '), ...links),
  );
}

export const BANK_ARTICLES: SeedArticle[] = [
  {
    title: 'Bank details for international wires: Americas',
    type: 'standard',
    category: 'Finance & Payment Processing / Bank information',
    owner: 'editor',
    tags: ['bank details', 'wire transfer', 'SWIFT', 'IBAN', 'americas', 'payment'],
    reviewDate: '2027-05-04',
    fields: { summary: 'Which bank details a provider in each country or territory of the Americas must give us before we can pay by international wire, with a ready-to-send request in their language.' },
    content: [
      p('Pick the provider\'s country or territory below, copy the request into your e-mail to the provider, and when they reply check the details field by field against the table.'),
      callout('warning', null, p('Verify with our bank before the first payment to a new provider. Requirements change.'), p('Last checked: 2026-11-04')),
      ...[...AMERICAS_BANKS].sort((x, y) => x.name.localeCompare(y.name, 'en')).map(section),
      demo('Demo article for the Operations Hub. Requirements were researched from published bank guidance on 2026-11-04; confirm with our bank before relying on them.'),
    ],
  },
];
