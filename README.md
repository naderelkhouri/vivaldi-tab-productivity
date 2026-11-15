# OmniTab Productivity Tracker & Focus Suite 🚀

Extensão multi-navegador (Manifest V3) com suporte universal para **Vivaldi, Google Chrome, Brave, Microsoft Edge, Opera, Arc e Mozilla Firefox**.

Focada em monitoramento de tempo ativo por aba/domínio, descarte automático de abas ociosas (Memory Saver), limpeza de duplicadas, agrupamento inteligente em pilhas (*Tab Stacking*) e modo Pomodoro.

---

## 🌐 Compatibilidade Universal de Navegadores

| Navegador | Como Funciona | Painel Lateral | Agrupamento de Abas |
| :--- | :---: | :---: | :---: |
| **Vivaldi** | ✅ 100% Nativo | ✅ Botão `+` na barra lateral | ✅ *Tab Stacking* nativo do Vivaldi |
| **Google Chrome** | ✅ 100% Nativo | ✅ Chrome Side Panel nativo | ✅ *Chrome Tab Groups* |
| **Brave** | ✅ 100% Nativo | ✅ Painel Lateral do Brave | ✅ *Tab Groups* |
| **Microsoft Edge** | ✅ 100% Nativo | ✅ Barra Lateral do Edge (*Edge Sidebar*) | ✅ *Edge Tab Groups* |
| **Opera & Opera GX** | ✅ 100% Nativo | ✅ Barra de Ferramentas / Painel | ✅ *Tab Islands / Workspaces* |
| **Arc Browser** | ✅ 100% Nativo | ✅ Barra Lateral nativa do Arc | ✅ Espaços e pastas do Arc |
| **Mozilla Firefox / Floorp** | ✅ Edição Dedicada | ✅ *Sidebar Action* nativa do Firefox | ✅ Abas e Containers |

---

## ✨ Principais Funcionalidades

- **⏱️ Rastreamento Inteligente de Abas**: Monitora segundo a segundo a aba ativa sem consumo desnecessário de CPU.
- **💾 Auto-Hibernação de Abas (Memory Saver)**: Descarta da memória RAM abas inativas há mais de 20 minutos (configurável), com contador de MB liberados.
- **🧹 Limpador de Abas Duplicadas**: Fecha com 1 clique todas as abas que possuem a mesma URL na janela ativa.
- **🛑 Orçamento Diário de Distrações**: Barra de progresso visual de tempo e notificação automática ao atingir a meta diária.
- **📑 Agrupamento Inteligente de Abas**: Cria pilhas de abas (*Tab Stacks*) automaticamente por **Domínio** ou por **Categoria** (Produtivo, Neutro, Distração).
- **🎯 Modo Foco / Pomodoro**: Cronômetro de 25 min com alerta suave caso navegue para sites de distração durante o foco.
- **📈 Histórico & Exportação (MD & CSV)**: Gráfico dos últimos 7 dias e botões para exportar relatórios prontos para **Notion**, **Obsidian** e **Excel**.
- **🩺 Telemetria Local**: Registro de eventos operacionais com fuso horário local e exportação em JSON.

---

## 🛠️ Como Instalar

### 1. No Vivaldi, Chrome, Brave, Edge, Opera ou Arc:
1. Baixe o pacote [`dist/omnitab-productivity-chromium.zip`](dist/omnitab-productivity-chromium.zip) ou clone este repositório.
2. Acesse a página de extensões do seu navegador:
   - **Vivaldi**: `vivaldi://extensions`
   - **Chrome**: `chrome://extensions`
   - **Brave**: `brave://extensions`
   - **Edge**: `edge://extensions`
   - **Opera**: `opera://extensions`
3. Ative o **Modo do Desenvolvedor** (*Developer Mode*).
4. Clique em **Carregar sem compactação** (*Load unpacked*) e aponte para a pasta descompactada.

### 2. No Mozilla Firefox ou Floorp:
1. Baixe o pacote [`dist/omnitab-productivity-firefox.xpi`](dist/omnitab-productivity-firefox.xpi).
2. Acesse `about:debugging#/runtime/this-firefox`.
3. Clique em **Carregar extensão temporária** (*Load Temporary Add-on*) e selecione o arquivo `manifest.firefox.json` ou o arquivo `.xpi`.

---

## 📦 Gerar Pacotes de Distribuição

Execute o script de compilação automática:
```bash
./build.sh
```
Os arquivos gerados para cada plataforma estarão disponíveis na pasta `dist/`.

---

## 📄 Licença

MIT License. Desenvolvido para uso pessoal e comunidade open source.
