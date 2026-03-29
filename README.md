# 🤖 MorphAI — Guia Completo de Instalação e Ganho de Dinheiro

## O que é o MorphAI?
Um app web de transformação com IA que permite: face swap, mudança de gênero, 
alteração corporal, melhoria de pele e transformação de voz. Com sistema de 
assinaturas integrado para gerar renda.

---

## 💰 COMO VOCÊ GANHA DINHEIRO

Quando um usuário assina um plano, o pagamento entra diretamente na sua conta:

| Plano       | Preço    | Lucro estimado (100 assinantes) |
|-------------|----------|---------------------------------|
| Semanal     | R$9,90   | R$990/semana                   |
| Mensal      | R$29,90  | R$2.990/mês                    |
| Trimestral  | R$69,90  | R$6.990/trimestre              |

**O dinheiro entra direto na sua conta do Mercado Pago.**
Sem intermediários. Sem complicação.

---

## 🔑 CADASTROS QUE VOCÊ PRECISA FAZER (TUDO GRATUITO)

### 1. Replicate (IA de imagem) — GRÁTIS inicialmente
- Acesse: https://replicate.com
- Clique em "Sign Up" com Google ou e-mail
- Vá em: Account → API Tokens → Copy Token
- Cole no .env: `REPLICATE_API_TOKEN=seu_token`
- **Custo:** ~$0.005 por imagem processada (cerca de R$0,025)

### 2. ElevenLabs (IA de voz) — GRÁTIS até 10.000 caracteres/mês
- Acesse: https://elevenlabs.io
- Cadastre-se gratuitamente
- Vá em: Profile → API Key → Copy
- Cole no .env: `ELEVENLABS_API_KEY=seu_token`

### 3. Mercado Pago (receber dinheiro no Brasil)
- Acesse: https://www.mercadopago.com.br/developers
- Cadastre-se com seu CPF
- Vá em: Suas integrações → Credenciais de produção
- Copie o "Access Token"
- Cole no .env: `MERCADO_PAGO_ACCESS_TOKEN=seu_token`
- **Taxa:** 4,99% por transação (o Mercado Pago fica com isso)

### 4. Vercel (publicar o site — 100% gratuito)
- Acesse: https://vercel.com
- Cadastre-se com GitHub
- Não precisa instalar nada

---

## 🚀 COMO PUBLICAR O SITE (PASSO A PASSO SEM TÉCNICO)

### Passo 1: Crie uma conta no GitHub
- Acesse: https://github.com
- Clique em "Sign Up"

### Passo 2: Faça upload dos arquivos
- No GitHub, clique em "New repository"
- Nome: `morphai`
- Clique em "uploading an existing file"
- Arraste todos os arquivos para lá
- Clique em "Commit changes"

### Passo 3: Publique no Vercel
- Acesse: https://vercel.com
- Clique em "Add New Project"
- Conecte com o GitHub
- Selecione o repositório `morphai`
- Em "Environment Variables", adicione suas chaves do .env
- Clique em "Deploy"
- **Pronto! Seu site estará online em 2 minutos.**

### Passo 4: Seu link ficará assim:
`https://morphai-seuusuario.vercel.app`

---

## 📱 PARA CRIAR UM APP ANDROID (APK)

Após o site estar no ar:
1. Acesse: https://www.pwabuilder.com
2. Cole o link do seu site
3. Clique em "Package for stores"
4. Selecione "Android"
5. Baixe o APK pronto para publicar na Play Store

---

## 💡 DICAS PARA GANHAR MAIS DINHEIRO

1. **Divulgue no TikTok/Instagram** — Faça vídeos mostrando transformações
2. **Ofereça o plano semanal** como isca para converter para mensal
3. **5 transformações grátis** — o usuário experimenta, fica viciado, assina
4. **Crie afiliados** — dê 20% de comissão para quem indicar
5. **Promoções** — "Primeiro mês por R$9,90" para aumentar conversão

---

## 🔧 ESTRUTURA DOS ARQUIVOS

```
morphai/
├── index.html      → Site completo (página principal)
├── server.js       → Backend com IA e pagamentos
├── package.json    → Dependências do Node.js
├── .env.example    → Modelo das configurações
└── README.md       → Este arquivo
```

---

## ❓ PERGUNTAS FREQUENTES

**Quanto custa manter o site?**
- Vercel (hospedagem): R$0 (gratuito)
- Replicate (IA): ~R$0,025 por imagem processada
- ElevenLabs (voz): gratuito até 10k caracteres/mês
- **Total para começar: R$0**

**Quando começo a receber?**
Logo no primeiro assinante. O dinheiro cai direto no Mercado Pago.

**Preciso saber programar?**
Não. Siga este guia passo a passo e tudo funciona.

**E se der algum erro?**
Me chame no Claude AI e eu corrijo para você.
