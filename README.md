# Estacionamento Studio + Neon

Esta versão usa:

- React + Vite + Tailwind
- Neon Auth
- Neon Data API
- PostgreSQL Neon para os dados dos veículos
- IndexedDB local para as fotos
- Sincronização automática a cada 10 segundos enquanto o app está visível

## 1. Instale as dependências

```powershell
npm install @neondatabase/neon-js
npm install vite-plugin-pwa
```

Se o Tailwind ainda não estiver instalado:

```powershell
npm install tailwindcss @tailwindcss/vite
```

## 2. Crie a tabela

Abra o SQL Editor do Neon e execute `neon.sql`.

## 3. Configure o ambiente

Copie `.env.example` para `.env.local`.

Preencha `VITE_NEON_DATA_API_URL` com a URL exibida na página Data API do Neon.

Nunca coloque a DATABASE_URL/senha do PostgreSQL em uma variável VITE_.

## 4. Copie os arquivos

Substitua no projeto:

- `src/App.jsx`
- `src/db.js`
- `src/utils.js`
- `src/main.jsx`
- `src/index.css`
- `vite.config.js`

Adicione:

- `src/neon.js`
- `src/Login.jsx`
- `public/icon.svg`

## 5. Rode

```powershell
npm run dev
```

## Fotos

As fotos NÃO vão para o Neon. Elas ficam no IndexedDB do celular/navegador que tirou ou escolheu a foto.

Os campos placa, modelo, cor, entrada, saída e demais metadados ficam no Neon e são compartilhados entre usuários autenticados.

## Observação de segurança

Com as políticas atuais, qualquer usuário autenticado no mesmo projeto Neon consegue ler e modificar todos os veículos. Isso é adequado para um app pequeno compartilhado entre você e um ajudante, mas não é uma autorização restrita por convite.
