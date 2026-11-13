# WMK Screen Studio v1.0.4 — Beta 3 (correção experimental de inicialização Windows)

**Esta versão foi preparada porque a beta 2 podia instalar e permanecer apenas na bandeja do Windows, sem mostrar a janela principal.** A compilação foi aprovada pelo GitHub Actions, mas a correção **ainda depende de teste em um computador afetado**.

## Mudanças
- Criar a janela principal da Biblioteca diretamente no evento de inicialização nativa do Tauri.
- Utilizar barra de título nativa no Windows, evitando que a janela pareça escondida quando o conteúdo web falhar.
- Não forçar ANGLE/Direct3D 11 na janela principal; manter configurações de gravação especializadas separadas.
- Mostrar uma caixa de erro nativa se a criação da janela falhar, em vez de permanecer somente na bandeja.
- Manter botão **Nova gravação**, biblioteca visível na barra de tarefas, menu da bandeja em pt-BR e títulos WMK.

## Instalação e teste
1. Faça backup de projetos existentes e feche totalmente o aplicativo antigo pelo menu da bandeja, sem interromper gravações em andamento.
2. Baixe e instale **somente o instalador EXE ou o MSI**, não ambos.
3. Inicie pelo atalho WMK Screen Studio.
4. Verifique se a **janela WMK Screen Studio — Biblioteca** aparece.
5. Caso não abra, observe se há uma **janela nativa de erro** e registre exatamente a mensagem (sem divulgar informações pessoais). No menu da bandeja, use **Abrir diagnósticos**.

**Não presuma que o bug foi corrigido até concluir os testes reais.** O instalador continua experimental, sem assinatura digital. O logotipo no EXE/bandeja ainda é provisório e não representa necessariamente a arte oficial enviada pelo mantenedor. Os recursos experimentais de Jitsi Meeting e Classroom não estão incluídos no EXE.

**Fonte da compilação:** [GitHub Actions #43406239439](https://github.com/WalneyNF/WMK-Screen-Studio/actions/runs/43406239439), commit `9790eb1da8c96e4273242ba908951721e18d470b`.

Créditos WMK: **Walney Moreira Klein — walneyk@hotmail.com**. Projeto derivado do **Capptivo**, com créditos e licenças originais preservados.
