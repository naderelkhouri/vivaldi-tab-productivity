# Vivaldi Tab Productivity Tracker & Focus Suite 🚀

Extensão Manifest V3 para **Vivaldi** (e navegadores baseados em Chromium) focada em monitoramento de tempo ativo por aba/domínio, descarte de abas ociosas, modo Pomodoro e integração com painel lateral web.

---

## ✨ Funcionalidades

- **⏱️ Rastreamento Inteligente de Abas**: Monitora em tempo real o tempo que cada aba e domínio passam em foco, sem consumo excessivo de CPU.
- **📊 Cálculo de Produtividade em Tempo Real**:
  - 🟢 **Produtivo**: GitHub, StackOverflow, Notion, Google Docs, ChatGPT, Claude, Gemini, etc.
  - 🔵 **Neutro**: Domínios gerais de consulta e documentação.
  - 🔴 **Distração**: Redes sociais e streaming (YouTube, Reddit, X/Twitter, Instagram, etc.).
- **🏷️ Badge Dinâmica no Ícone**: Exibe a porcentagem do seu dia diretamente sobre o ícone na barra de ferramentas com código de cores dinâmico.
- **💤 Suspensão de Abas Ociosas**: Suspende da memória RAM (`chrome.tabs.discard`) as abas inativas para acelerar o navegador.
- **🚫 Fechamento Rápido de Distrações**: Fecha com um único clique todas as abas de distração abertas em segundo plano.
- **🎯 Modo Foco / Pomodoro**: Ciclos de 25 minutos de foco / 5 minutos de descanso com notificações de alerta se você navegar para sites de distração durante o foco.
- **📈 Gráficos dos Últimos 7 Dias**: Acompanhamento visual da evolução da produtividade na semana.
- **⚙️ Customizador de Regras**: Adicione ou remova domínios e defina categorias personalizadas diretamente pela interface.
- **🩺 Telemetria Local**: Registro de eventos operacionais, erros e histórico de ações para aprimoramento contínuo (com exportação em JSON).
- **📱 Otimizado para Painel Lateral (Side Panel / Web Panel)**: Interface 100% responsiva para ficar aberta na barra lateral do Vivaldi.

---

## 🛠️ Instalação no Vivaldi / Chrome

1. Clone ou baixe este repositório:
   ```bash
   git clone https://github.com/naderelkhouri/vivaldi-tab-productivity.git
   ```
2. Abra o Vivaldi e acesse:
   ```text
   vivaldi://extensions
   ```
3. Ative a opção **Modo do Desenvolvedor** no canto superior direito.
4. Clique em **Carregar sem compactação** (*Load unpacked*).
5. Selecione a pasta deste projeto.

---

## 📌 Como Fixar no Painel Lateral do Vivaldi

1. Obtenha o ID da extensão instalada em `vivaldi://extensions`.
2. Abra em uma aba:
   ```text
   chrome-extension://<SEU_ID_AQUI>/popup.html
   ```
3. Na barra lateral do Vivaldi, clique no botão **"+" (Adicionar Painel Web)** e salve.
4. O monitor de produtividade ficará fixo na lateral para você acompanhar enquanto navega!

---

## 📄 Licença

MIT License. Desenvolvido para uso pessoal e comunidade de usuários do Vivaldi.
