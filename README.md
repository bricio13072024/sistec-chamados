# SISTEC Chamados

Sistema de chamados internos de TI com chat interno e notificação por e-mail.
Estações SISTEC001 a SISTEC020 + supervisor de TI.

## Instalação rápida (recomendado)
Baixe o **SISTEC-Chamados.zip** na aba **Releases** deste repositório.
Ele já vem completo (inclui o Node.js) e funciona sem internet.
Descompacte e siga o arquivo `LEIA-ME.txt`.

## Instalação a partir do código
Requer Node.js 22.5 ou superior.
```
npm install
node server.js
```
Acesse `http://IP-DO-SERVIDOR:3000`.

- Supervisor: `fabricio` / senha inicial `admin@123`
- Estações: `sistec001` ... `sistec020` / senha inicial `sistec@123`