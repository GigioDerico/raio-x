/**
 * Meu Pluggy: o portal gratuito do Pluggy para pessoa física. Os bancos são
 * conectados lá (Open Finance) e chegam ao app por um conector só, o
 * "MeuPluggy", aberto no mesmo widget — o item nasce com o `clientUserId` do
 * connect token, então a posse segue conferida como em qualquer outro banco.
 *
 * Puro, sem `server-only`: a tela e o teste importam direto.
 */
export const URL_MEU_PLUGGY = 'https://meu.pluggy.ai';

/** id fixo do conector MeuPluggy na API do Pluggy (conferido em `institution`, slug pluggy-200) */
export const CONECTOR_MEU_PLUGGY = 200;
