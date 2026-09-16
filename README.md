# Host Health Diagnostic Agent API

Agente local que consulta os equipamentos de rede e registra o histórico no Supabase. Ele deve rodar em uma máquina que alcance os IPs privados dos equipamentos.

## Executar

```sh
npm install
npx playwright install chromium
npm start
```

Crie `.env` a partir de `.env.example`. A interface publicada no Vercel está configurada para procurar o agente em `http://127.0.0.1:8002` no mesmo computador.

Para ativar o histórico, informe `SUPABASE_URL` e `SUPABASE_SECRET_KEY` no `.env`. A chave secreta é exclusiva do agente e nunca deve ser copiada para o frontend ou para o GitHub.

## Segurança

- Apenas IPv4 privado é aceito: `10.0.0.0/8`, `172.16.0.0/12` e `192.168.0.0/16`.
- O acesso à API é permitido localmente. Para expor o serviço em outra máquina, defina `API_KEY` e envie-a no cabeçalho `X-API-Key`.
- Ping e traceroute são limitados a 10 saltos e cinco segundos. A aplicação não coleta CPU, sinal, temperatura ou CCQ sem uma integração explícita via SNMP/API do fabricante.

## Coleta de rádio por interface web

O backend inclui conectores iniciais para `mikrotik`, `ubiquiti-ac` e `ubiquiti-m5`. Eles retornam um contrato único com uptime e clientes (sinal TX/RX; CCQ para MikroTik):

```json
POST /api/devices/collect
{
  "ip": "192.168.1.20",
  "vendor": "mikrotik",
  "credentials": { "username": "admin", "password": "senha" }
}
```

As credenciais são usadas somente durante a requisição e não são persistidas. Instale o navegador de automação no servidor antes da primeira coleta:

```sh
npx playwright install chromium
```

Para testes locais, é possível definir `TEST_DEVICE_USERNAME` e `TEST_DEVICE_PASSWORD` no arquivo `.env`. Esses valores são aplicados somente se a requisição não enviar `credentials`; o arquivo `.env` não deve ser versionado.

As telas WebFig e airOS variam por versão de firmware. Os conectores usam a tabela de clientes e rótulos presentes na interface; os valores são devolvidos como aparecem na tela, sem conversão ou normalização. A automação apenas navega, autentica e lê dados — não executa comandos de configuração no equipamento. Valide-os com um equipamento de cada versão usada em produção e ajuste os seletores se necessário.

## Estrutura

- `public/`: interface estática.
- `src/routes/`: rotas e validação da API.
- `src/services/`: composição da resposta de saúde.
- `src/utils/`: IPs e comandos de diagnóstico.
- `test/`: testes dos parsers e regras de IP.
