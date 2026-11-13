# WMK Screen Studio — Beta experimental para Windows

Primeiro pacote público de testes do **WMK Screen Studio**, um fork open source do [Capptivo](https://github.com/SECHAK-AG/capptivo) personalizado com a identidade WMK.

## O que testar

- Instalação e inicialização do aplicativo no Windows 10/11 x64.
- Gravação da tela, áudio do sistema e microfone.
- Editor de vídeo: cortes, cursor, zoom e sobreposição de webcam.
- Legendas, opções de estilo e importação/exportação SRT/VTT.
- Exportação MP4, WebM e GIF, conforme recursos disponíveis.
- Presets WMK de câmera e ferramentas experimentais de análise de audiência.

## Como instalar

1. Baixe o instalador **.exe** (NSIS) nos arquivos desta Release. O **.msi** é uma alternativa; não instale os dois.
2. Execute o instalador e abra o WMK Screen Studio.
3. Faça uma gravação curta e teste a exportação antes de trabalhar com conteúdo importante.

> **Atenção:** versão experimental, sem assinatura digital Authenticode. O Windows pode exibir avisos. Os módulos Meeting Studio/Jitsi e Classroom Studio são protótipos HTML/documentação independentes e **não** estão integrados a este executável. Não há atualização automática assinada WMK nesta versão.

## Transparência técnica

- Fonte: branch `main`, compilação bem-sucedida [WMK — Compilar Windows #22](https://github.com/WalneyNF/WMK-Screen-Studio/actions/runs/43392653558), commit `14efdba0c7f65b506d412696eb1515941b8995e7`.
- O código próprio é distribuído sob **MIT**, preservando os avisos do projeto original e as licenças das dependências. Consulte [THIRD_PARTY_NOTICES.md](https://github.com/WalneyNF/WMK-Screen-Studio/blob/main/THIRD_PARTY_NOTICES.md) para informações sobre FFmpeg e outros componentes.
- Encontrou um problema? Abra uma [Issue](https://github.com/WalneyNF/WMK-Screen-Studio/issues) com a versão do Windows e os passos para reproduzir.

**Identidade WMK:** Walney Moreira Klein — walneyk@hotmail.com.

**Créditos originais preservados:** Capptivo © 2026 idboussadel / SECHAK-AG.
